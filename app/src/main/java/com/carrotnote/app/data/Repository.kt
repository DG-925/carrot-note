package com.carrotnote.app.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

private fun JsonObject.id(): String = this["id"]?.jsonPrimitive?.contentOrNull ?: error("Record without an id")

val AppJson = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    explicitNulls = false
}

@Serializable
data class SyncRecord(
    val type: String,
    val id: String,
    val data: String? = null,
    val updatedAt: Long,
    val deleted: Boolean = false,
    val space: String? = null,
)

/**
 * Offline-first store for one signed-in user. Every change is written to a local SQLite
 * database immediately and marked dirty; [SyncManager] pushes dirty rows to the server.
 */
class Repository(context: Context, val userId: String) {

    private val db = LocalDb(context.applicationContext, "carrot_${userId.filter { it.isLetterOrDigit() }}.db")

    /** Called after any local change, so the app can schedule a sync. */
    var onLocalChange: (() -> Unit)? = null

    inner class Collection<T>(
        val type: String,
        private val serializer: KSerializer<T>,
        private val idOf: (T) -> String,
    ) {
        private val items = LinkedHashMap<String, T>()
        private val state = MutableStateFlow<List<T>>(emptyList())
        val flow: StateFlow<List<T>> = state.asStateFlow()
        val value: List<T> get() = state.value

        fun get(id: String?): T? = if (id == null) null else synchronized(items) { items[id] }

        fun save(item: T) {
            val id = idOf(item)
            val json = AppJson.encodeToString(serializer, item)
            db.put(LocalRow(type, id, json, nextTimestamp(), deleted = false, dirty = true, space = spaceHint(type, id, json)))
            setLocal(id, item)
            onLocalChange?.invoke()
        }

        fun delete(id: String) {
            val existing = db.get(type, id)
            db.put(LocalRow(type, id, null, nextTimestamp(), deleted = true, dirty = true, space = existing?.space))
            setLocal(id, null)
            onLocalChange?.invoke()
        }

        /** All items as a JSON array (for the web UI). */
        fun listJson(): String = AppJson.encodeToString(ListSerializer(serializer), value)

        /** Saves an item sent from the web UI as JSON and returns it decoded. */
        fun saveJson(json: String): T = AppJson.decodeFromString(serializer, json).also { save(it) }

        internal fun applyRow(row: LocalRow) {
            val item = if (row.deleted || row.data == null) null else runCatching {
                AppJson.decodeFromString(serializer, row.data)
            }.getOrNull()
            setLocal(row.id, item)
        }

        private fun setLocal(id: String, item: T?) {
            synchronized(items) {
                if (item == null) items.remove(id) else items[id] = item
                state.value = items.values.toList()
            }
        }
    }

    val projects = Collection("project", Project.serializer()) { it.id }
    val tasks = Collection("task", TaskItem.serializer()) { it.id }
    val notes = Collection("note", Note.serializer()) { it.id }
    val txns = Collection("txn", Txn.serializer()) { it.id }
    val goals = Collection("goal", Goal.serializer()) { it.id }
    val customers = Collection("customer", Customer.serializer()) { it.id }
    val debts = Collection("debt", Debt.serializer()) { it.id }
    val events = Collection("event", CalEvent.serializer()) { it.id }
    val time = Collection("time", TimeEntry.serializer()) { it.id }
    val budgets = Collection("budget", Budget.serializer()) { it.id }
    val rentals = Collection("rental", Rental.serializer()) { it.id }
    // Records the app only stores and syncs; the web UI owns their shape.
    val invoices = Collection("invoice", JsonObject.serializer()) { it.id() }
    val recurring = Collection("recurring", JsonObject.serializer()) { it.id() }
    val receipts = Collection("receipt", JsonObject.serializer()) { it.id() }
    val secrets = Collection("secret", JsonObject.serializer()) { it.id() }
    val vault = Collection("vault", JsonObject.serializer()) { it.id() }
    val items = Collection("item", JsonObject.serializer()) { it.id() }

    private val collections = listOf(
        projects, tasks, notes, txns, goals, customers, debts, events, time, budgets, rentals,
        invoices, recurring, receipts, secrets, vault, items,
    )
        .associateBy { it.type }

    private val spaceList = ListSerializer(SpaceInfo.serializer())
    private val _spaces = MutableStateFlow<List<SpaceInfo>>(emptyList())
    /** Shared projects this user belongs to (plus the personal space). */
    val spaces: StateFlow<List<SpaceInfo>> = _spaces.asStateFlow()

    init {
        db.all().forEach { row -> collections[row.type]?.applyRow(row) }
        _spaces.value = db.getMeta("spaces")?.let { runCatching { AppJson.decodeFromString(spaceList, it) }.getOrNull() }.orEmpty()
    }

    /** Collection by its sync type ("task", "note", ...), or null. */
    fun collection(type: String): Collection<out Any>? = collections[type]

    /** Every collection, keyed by type. */
    val allCollections: Map<String, Collection<out Any>> get() = collections

    fun spacesJson(): String = AppJson.encodeToString(spaceList, _spaces.value)

    fun spaceForProject(projectId: String?): SpaceInfo? =
        if (projectId == null) null else _spaces.value.firstOrNull { it.kind == "project" && it.projectId == projectId }

    /** Where the server will most likely store this record (used to route deletes). */
    private fun spaceHint(type: String, id: String, json: String): String {
        val projectId = when (type) {
            "project" -> id
            "task", "note", "event" -> runCatching {
                (AppJson.parseToJsonElement(json) as JsonObject)["projectId"]?.jsonPrimitive?.contentOrNull
            }.getOrNull()
            else -> null
        }
        return spaceForProject(projectId)?.id ?: userId
    }

    private var lastTs = 0L

    /** Strictly increasing timestamps so quick successive edits are ordered correctly. */
    @Synchronized
    private fun nextTimestamp(): Long {
        val now = nowMs()
        lastTs = if (now > lastTs) now else lastTs + 1
        return lastTs
    }

    // ---- sync support ----

    private val cursorMap = MapSerializer(String.serializer(), Long.serializer())

    /** Per-space sync cursors. Migrates the single v1 cursor into the personal space. */
    var cursors: Map<String, Long>
        get() = db.getMeta("cursors")?.let { runCatching { AppJson.decodeFromString(cursorMap, it) }.getOrNull() }
            ?: db.getMeta("cursor")?.toLongOrNull()?.let { mapOf(userId to it) }
            ?: emptyMap()
        set(value) = db.setMeta("cursors", AppJson.encodeToString(cursorMap, value))

    var lastSyncAt: Long
        get() = db.getMeta("last_sync")?.toLongOrNull() ?: 0L
        set(value) = db.setMeta("last_sync", value.toString())

    fun dirtyRecords(): List<SyncRecord> =
        db.dirty().map { SyncRecord(it.type, it.id, it.data, it.updatedAt, it.deleted, it.space) }

    fun hasUnsynced(): Boolean = db.dirty().isNotEmpty()

    fun markClean(records: List<SyncRecord>) {
        db.transaction { records.forEach { db.markClean(it.type, it.id, it.updatedAt) } }
    }

    /** Applies server changes using last-write-wins; newer unsynced local edits are kept. */
    fun applyRemote(records: List<SyncRecord>) {
        if (records.isEmpty()) return
        val applied = ArrayList<LocalRow>()
        db.transaction {
            for (r in records) {
                if (r.type !in collections) continue
                val local = db.get(r.type, r.id)
                if (local != null && local.updatedAt > r.updatedAt) continue
                // A tombstone left behind when a record moved to another space is not a delete.
                if (r.deleted && local != null && !local.deleted && local.space != null && r.space != null && local.space != r.space) continue
                val row = LocalRow(r.type, r.id, r.data, r.updatedAt, r.deleted, dirty = false, space = r.space)
                db.put(row)
                applied += row
            }
        }
        applied.forEach { collections[it.type]?.applyRow(it) }
    }

    /** Stores the latest space list; forgets data from shared projects the user has left. */
    fun setSpaces(list: List<SpaceInfo>) {
        val ids = list.map { it.id }.toSet() + userId
        val gone = db.all().filter { it.space != null && it.space !in ids && !it.dirty }
        if (gone.isNotEmpty()) {
            db.transaction { gone.forEach { db.remove(it.type, it.id) } }
            gone.forEach { collections[it.type]?.applyRow(it.copy(deleted = true, data = null)) }
            // Cursors of removed spaces are dropped so a re-invite starts fresh.
            cursors = cursors.filterKeys { it in ids }
        }
        db.setMeta("spaces", AppJson.encodeToString(spaceList, list))
        _spaces.value = list
    }

    fun close() = db.close()

    companion object {
        fun deleteData(context: Context, userId: String) {
            context.deleteDatabase("carrot_${userId.filter { it.isLetterOrDigit() }}.db")
        }
    }
}
