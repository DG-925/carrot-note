package com.carrotnote.app.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

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
            db.put(LocalRow(type, id, AppJson.encodeToString(serializer, item), nextTimestamp(), deleted = false, dirty = true))
            setLocal(id, item)
            onLocalChange?.invoke()
        }

        fun delete(id: String) {
            db.put(LocalRow(type, id, null, nextTimestamp(), deleted = true, dirty = true))
            setLocal(id, null)
            onLocalChange?.invoke()
        }

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

    private val collections = listOf(projects, tasks, notes, txns, goals, customers, debts, events)
        .associateBy { it.type }

    init {
        db.all().forEach { row -> collections[row.type]?.applyRow(row) }
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

    var syncCursor: Long
        get() = db.getMeta("cursor")?.toLongOrNull() ?: 0L
        set(value) = db.setMeta("cursor", value.toString())

    var lastSyncAt: Long
        get() = db.getMeta("last_sync")?.toLongOrNull() ?: 0L
        set(value) = db.setMeta("last_sync", value.toString())

    fun dirtyRecords(): List<SyncRecord> =
        db.dirty().map { SyncRecord(it.type, it.id, it.data, it.updatedAt, it.deleted) }

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
                val row = LocalRow(r.type, r.id, r.data, r.updatedAt, r.deleted, dirty = false)
                db.put(row)
                applied += row
            }
        }
        applied.forEach { collections[it.type]?.applyRow(it) }
    }

    fun close() = db.close()

    companion object {
        fun deleteData(context: Context, userId: String) {
            context.deleteDatabase("carrot_${userId.filter { it.isLetterOrDigit() }}.db")
        }
    }
}
