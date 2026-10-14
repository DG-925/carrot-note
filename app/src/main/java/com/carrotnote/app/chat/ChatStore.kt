package com.carrotnote.app.chat

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.util.Base64
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.carrotnote.app.CarrotApp
import com.carrotnote.app.Graph
import com.carrotnote.app.MainActivity
import com.carrotnote.app.R
import com.carrotnote.app.data.ApiException
import com.carrotnote.app.data.AppJson
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import java.io.File
import java.security.SecureRandom

@Serializable
data class ChatPerson(val id: String, val name: String = "", val username: String = "", val avatarRev: Int = 0)

@Serializable
data class ChatMsg(
    val id: String,
    val convo: String,
    val from: ChatPerson,
    val text: String = "",
    /** The voice clip is a separate file, loaded only when it's played. */
    val voice: Boolean = false,
    val dur: Double = 0.0,
    val mentions: List<String> = emptyList(),
    val at: Long = 0,
    val mine: Boolean = false,
    /** "sending", "sent" or "failed" for my messages. */
    val status: String = "sent",
)

@Serializable
data class ChatConvo(
    val id: String,
    val title: String = "",
    val last: String = "",
    val lastAt: Long = 0,
    val unread: Int = 0,
    val mentioned: Int = 0,
    val people: List<ChatPerson> = emptyList(),
)

/**
 * Chats are kept on this phone only (in the app's private files). The server just passes messages
 * along and forgets them once delivered. Holding a message and choosing "Save to notes" is how
 * something from a chat becomes synced data.
 */
object ChatStore {
    private val lock = Any()
    private val inboxMutex = Mutex()
    private val outboxMutex = Mutex()
    private val random = SecureRandom()

    /** The chat open on screen right now: no notifications for it, and it's marked read. */
    @Volatile var viewing: String? = null

    /** Told when a chat changes (new message, sent, failed), so the page can reload it. */
    @Volatile var listener: ((String) -> Unit)? = null

    private val convoList = ListSerializer(ChatConvo.serializer())
    private val msgList = ListSerializer(ChatMsg.serializer())

    private fun dir(context: Context): File? {
        val me = Graph.session.user.value?.id ?: return null
        return File(context.filesDir, "chat/" + me.filter { it.isLetterOrDigit() }).apply { mkdirs() }
    }

    private fun safe(name: String) = name.replace(Regex("[^A-Za-z0-9_-]"), "_")

    private fun <T> read(file: File, ser: kotlinx.serialization.KSerializer<T>, empty: T): T =
        if (!file.exists()) empty else runCatching { AppJson.decodeFromString(ser, file.readText()) }.getOrDefault(empty)

    private fun <T> write(file: File, ser: kotlinx.serialization.KSerializer<T>, value: T) {
        val tmp = File(file.path + ".tmp")
        tmp.writeText(AppJson.encodeToString(ser, value))
        tmp.renameTo(file)
    }

    fun convos(context: Context): List<ChatConvo> = synchronized(lock) {
        val d = dir(context) ?: return emptyList()
        read(File(d, "convos.json"), convoList, emptyList()).sortedByDescending { it.lastAt }
    }

    fun messages(context: Context, convo: String): List<ChatMsg> = synchronized(lock) {
        val d = dir(context) ?: return emptyList()
        read(File(d, "m_${safe(convo)}.json"), msgList, emptyList()).takeLast(500)
    }

    private fun saveMessage(d: File, msg: ChatMsg, title: String, people: List<ChatPerson>, unread: Boolean, mentioned: Boolean) {
        val file = File(d, "m_${safe(msg.convo)}.json")
        val list = read(file, msgList, emptyList())
        val i = list.indexOfFirst { it.id == msg.id }
        if (i >= 0 && !msg.mine) return // already have it
        write(file, msgList, if (i >= 0) list.toMutableList().also { it[i] = msg } else (list + msg).takeLast(2000))
        val cf = File(d, "convos.json")
        val convos = read(cf, convoList, emptyList()).toMutableList()
        val j = convos.indexOfFirst { it.id == msg.convo }
        val old = convos.getOrNull(j)
        val preview = msg.text.ifBlank { if (msg.voice) "🎤 Voice message" else "" }
        val c = ChatConvo(
            id = msg.convo,
            title = title.ifBlank { old?.title.orEmpty() },
            last = preview,
            lastAt = maxOf(msg.at, old?.lastAt ?: 0),
            unread = (old?.unread ?: 0) + if (unread) 1 else 0,
            mentioned = (old?.mentioned ?: 0) + if (mentioned) 1 else 0,
            people = (old?.people.orEmpty() + people).distinctBy { it.id },
        )
        if (j >= 0) convos[j] = c else convos += c
        write(cf, convoList, convos)
    }

    private fun updateStatus(context: Context, convo: String, id: String, status: String): Unit = synchronized(lock) {
        val d = dir(context) ?: return
        val file = File(d, "m_${safe(convo)}.json")
        val list = read(file, msgList, emptyList())
        write(file, msgList, list.map { if (it.id == id) it.copy(status = status) else it })
    }

    fun markRead(context: Context, convo: String): Unit = synchronized(lock) {
        val d = dir(context) ?: return
        val cf = File(d, "convos.json")
        val convos = read(cf, convoList, emptyList())
        if (convos.none { it.id == convo && (it.unread > 0 || it.mentioned > 0) }) return
        write(cf, convoList, convos.map { if (it.id == convo) it.copy(unread = 0, mentioned = 0) else it })
        NotificationManagerCompat.from(context).cancel(notifId(convo))
    }

    fun deleteMessage(context: Context, convo: String, id: String): Unit = synchronized(lock) {
        val d = dir(context) ?: return
        val file = File(d, "m_${safe(convo)}.json")
        write(file, msgList, read(file, msgList, emptyList()).filter { it.id != id })
        voiceFile(d, id)?.delete()
        Unit
    }

    /** Deletes a whole chat from this phone. */
    fun clear(context: Context, convo: String): Unit = synchronized(lock) {
        val d = dir(context) ?: return
        val file = File(d, "m_${safe(convo)}.json")
        read(file, msgList, emptyList()).filter { it.voice }.forEach { voiceFile(d, it.id)?.delete() }
        file.delete()
        val cf = File(d, "convos.json")
        write(cf, convoList, read(cf, convoList, emptyList()).filter { it.id != convo })
    }

    /** Makes sure a chat shows in the list (e.g. a new chat with someone, or a project's chat). */
    fun open(context: Context, convo: String, title: String, people: List<ChatPerson>): Unit = synchronized(lock) {
        val d = dir(context) ?: return
        val cf = File(d, "convos.json")
        val convos = read(cf, convoList, emptyList())
        if (convos.any { it.id == convo }) {
            write(cf, convoList, convos.map { if (it.id == convo && title.isNotBlank()) it.copy(title = title, people = (it.people + people).distinctBy { p -> p.id }) else it })
        } else {
            write(cf, convoList, convos + ChatConvo(convo, title, "", System.currentTimeMillis(), 0, 0, people))
        }
    }

    // ---- voice clips

    private fun voiceFile(d: File, id: String): File? =
        File(d, "voice").listFiles()?.firstOrNull { it.name.substringBeforeLast('.') == safe(id) }

    private fun saveVoice(d: File, id: String, dataUrl: String) {
        val comma = dataUrl.indexOf(',')
        if (!dataUrl.startsWith("data:audio/") || comma < 0) return
        val mime = dataUrl.substring(5, dataUrl.indexOf(';').takeIf { it in 5 until comma } ?: comma)
        val ext = mime.substringAfter('/').substringBefore(';').ifBlank { "audio" }
        File(d, "voice").mkdirs()
        File(d, "voice/${safe(id)}.$ext").writeBytes(Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT))
    }

    /** A saved voice clip as a data URL for the page's audio player. */
    fun voiceData(context: Context, id: String): String? = synchronized(lock) {
        val d = dir(context) ?: return null
        val f = voiceFile(d, id) ?: return null
        val ext = f.name.substringAfterLast('.')
        "data:audio/$ext;base64," + Base64.encodeToString(f.readBytes(), Base64.NO_WRAP)
    }

    // ---- sending

    @Serializable
    private data class Out(val convo: String, val id: String)

    private val outList = ListSerializer(Out.serializer())

    fun newId(): String {
        val b = ByteArray(12).also { random.nextBytes(it) }
        return "c" + Base64.encodeToString(b, Base64.NO_WRAP or Base64.URL_SAFE or Base64.NO_PADDING)
    }

    /** Saves my message here and queues it for the server; it goes out right away when online. */
    fun send(context: Context, convo: String, title: String, people: List<ChatPerson>, text: String, voice: String?, dur: Double, mentions: List<String>): ChatMsg? {
        val me = Graph.session.user.value ?: return null
        val msg = ChatMsg(
            id = newId(), convo = convo, from = ChatPerson(me.id, me.name, me.username, me.avatarRev),
            text = text.take(4000), voice = !voice.isNullOrBlank(), dur = dur, mentions = mentions,
            at = System.currentTimeMillis(), mine = true, status = "sending",
        )
        synchronized(lock) {
            val d = dir(context) ?: return null
            if (!voice.isNullOrBlank()) saveVoice(d, msg.id, voice)
            saveMessage(d, msg, title, people, unread = false, mentioned = false)
            val of = File(d, "outbox.json")
            write(of, outList, read(of, outList, emptyList()) + Out(convo, msg.id))
        }
        Graph.scope.launch { flush(context) }
        return msg
    }

    /** Tries again to send a message that failed. */
    fun retry(context: Context, convo: String, id: String) {
        synchronized(lock) {
            val d = dir(context) ?: return
            val of = File(d, "outbox.json")
            val list = read(of, outList, emptyList())
            if (list.none { it.id == id }) write(of, outList, list + Out(convo, id))
        }
        updateStatus(context, convo, id, "sending")
        listener?.invoke(convo)
        Graph.scope.launch { flush(context) }
    }

    /** Sends whatever is waiting in the outbox. */
    suspend fun flush(context: Context) = outboxMutex.withLock {
        val token = Graph.session.token ?: return@withLock
        val d = dir(context) ?: return@withLock
        val of = File(d, "outbox.json")
        val queue = synchronized(lock) { read(of, outList, emptyList()) }
        for (o in queue) {
            val msg = synchronized(lock) { read(File(d, "m_${safe(o.convo)}.json"), msgList, emptyList()).firstOrNull { it.id == o.id } }
            var keep = false
            if (msg != null) {
                val body = buildJsonObject {
                    put("convo", o.convo)
                    putJsonObject("msg") {
                        put("id", msg.id); put("text", msg.text); put("dur", msg.dur); put("at", msg.at)
                        if (msg.voice) voiceData(context, msg.id)?.let { put("voice", it) }
                        putJsonArray("mentions") { msg.mentions.forEach { add(JsonPrimitive(it)) } }
                    }
                }
                try {
                    Graph.api.raw("POST", "/api/chat/send", body.toString(), token)
                    updateStatus(context, o.convo, o.id, "sent")
                } catch (e: ApiException) {
                    // No connection or a busy server: try again later. Anything else won't work on retry.
                    if (e.status == 0 || e.status == 429 || e.status >= 500) keep = true else updateStatus(context, o.convo, o.id, "failed")
                }
                listener?.invoke(o.convo)
            }
            if (!keep) synchronized(lock) { write(of, outList, read(of, outList, emptyList()).filter { it.id != o.id }) }
        }
    }

    // ---- receiving

    /** Downloads waiting messages, saves them here, tells the server it has them, and notifies. */
    suspend fun fetch(context: Context) = inboxMutex.withLock {
        val token = Graph.session.token ?: return@withLock
        val me = Graph.session.user.value?.id ?: return@withLock
        val d = dir(context) ?: return@withLock
        var ack: List<String> = emptyList()
        val fresh = ArrayList<ChatMsg>()
        val ackBody = { ids: List<String> -> buildJsonObject { putJsonArray("ack") { ids.forEach { add(JsonPrimitive(it)) } } }.toString() }
        var rounds = 0
        while (rounds++ < 20) {
            val resp = runCatching { AppJson.parseToJsonElement(Graph.api.raw("POST", "/api/chat/inbox", ackBody(ack), token)).jsonObject }
                .getOrNull() ?: break
            val list = resp["messages"]?.jsonArray.orEmpty().mapNotNull { it as? JsonObject }
            for (o in list) {
                val m = parse(o) ?: continue
                synchronized(lock) {
                    o["voice"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }?.let { saveVoice(d, m.id, it) }
                    val reading = viewing == m.convo
                    saveMessage(d, m, titleFor(m), listOf(m.from), unread = !reading, mentioned = !reading && me in m.mentions)
                }
                fresh += m
            }
            ack = list.mapNotNull { it["id"]?.jsonPrimitive?.contentOrNull }
            if (resp["more"]?.jsonPrimitive?.contentOrNull != "true") {
                // One more call only to tell the server we have this page, so it deletes its copy.
                if (ack.isNotEmpty()) runCatching { Graph.api.raw("POST", "/api/chat/inbox", ackBody(ack), token) }
                break
            }
        }
        if (fresh.isEmpty()) return@withLock
        fresh.map { it.convo }.distinct().forEach { listener?.invoke(it) }
        notify(context, me, fresh)
    }

    private fun parse(o: JsonObject): ChatMsg? {
        val id = o["id"]?.jsonPrimitive?.contentOrNull ?: return null
        val convo = o["convo"]?.jsonPrimitive?.contentOrNull ?: return null
        val f = o["from"] as? JsonObject ?: return null
        return ChatMsg(
            id = id, convo = convo,
            from = ChatPerson(
                f["id"]?.jsonPrimitive?.contentOrNull.orEmpty(), f["name"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                f["username"]?.jsonPrimitive?.contentOrNull.orEmpty(), f["avatarRev"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: 0,
            ),
            text = o["text"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            voice = !o["voice"]?.jsonPrimitive?.contentOrNull.isNullOrBlank(),
            dur = o["dur"]?.jsonPrimitive?.doubleOrNull ?: 0.0,
            mentions = (o["mentions"] as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull }.orEmpty(),
            at = o["at"]?.jsonPrimitive?.longOrNull ?: System.currentTimeMillis(),
        )
    }

    /** A direct chat is named after the other person; a project chat after the project. */
    private fun titleFor(m: ChatMsg): String =
        if (m.convo.startsWith("p_")) Graph.repoOrNull?.projects?.get(m.convo.removePrefix("p_"))?.name ?: "Project"
        else m.from.name.ifBlank { m.from.username }

    private fun notifId(convo: String) = ("chat:$convo").hashCode()

    /** Direct messages always notify; in a project chat only when someone @mentions you. */
    private fun notify(context: Context, me: String, fresh: List<ChatMsg>) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        for ((convo, msgs) in fresh.groupBy { it.convo }) {
            if (convo == viewing) continue
            val shown = if (convo.startsWith("p_")) msgs.filter { me in it.mentions } else msgs
            if (shown.isEmpty()) continue
            val last = shown.last()
            val title = if (convo.startsWith("p_")) "${last.from.name} · ${titleFor(last)}" else last.from.name.ifBlank { last.from.username }
            val voiceWord = if (Graph.settings.language == "ar") "🎤 رسالة صوتية" else "🎤 Voice message"
            val line = { m: ChatMsg -> m.text.ifBlank { if (m.voice) voiceWord else "" } }
            val body = shown.takeLast(5).joinToString("\n") { line(it) }
            val open = PendingIntent.getActivity(
                context, notifId(convo),
                Intent(context, MainActivity::class.java)
                    .setAction(Intent.ACTION_VIEW)
                    .setData(Uri.parse("carrot-chat://open/" + Uri.encode(convo)))
                    .putExtra(MainActivity.EXTRA_SHORTCUT, "chat-open:$convo")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val n = NotificationCompat.Builder(context, CarrotApp.CHANNEL_CHAT)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(0xFFFF7A1A.toInt())
                .setContentTitle(title)
                .setContentText(line(last))
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(open)
                .setAutoCancel(true)
                .build()
            NotificationManagerCompat.from(context).notify(notifId(convo), n)
        }
    }

    /** The page's view of a chat list or message list. */
    fun convosJson(context: Context): String = AppJson.encodeToString(convoList, convos(context))
    fun messagesJson(context: Context, convo: String): String = AppJson.encodeToString(msgList, messages(context, convo))
}
