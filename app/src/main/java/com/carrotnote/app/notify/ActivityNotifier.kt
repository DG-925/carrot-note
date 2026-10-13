package com.carrotnote.app.notify

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.carrotnote.app.CarrotApp
import com.carrotnote.app.Graph
import com.carrotnote.app.MainActivity
import com.carrotnote.app.R
import com.carrotnote.app.data.AppJson
import com.carrotnote.app.data.SyncRecord
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/** Shows a notification when a teammate adds or changes something in a shared project. */
object ActivityNotifier {
    private val words = mapOf(
        "created" to "added", "updated" to "changed", "deleted" to "deleted", "completed" to "finished",
        "paid" to "recorded a payment on", "split" to "split earnings in",
    )
    private val types = mapOf(
        "project" to "the project", "task" to "task", "note" to "note", "event" to "event", "rental" to "renter",
        "invoice" to "invoice", "quote" to "quote", "doc" to "file",
    )

    private data class Line(val projectId: String, val name: String, val action: String, val type: String, val title: String, val at: Long)

    fun onSync(context: Context, changes: List<SyncRecord>) {
        val me = Graph.session.user.value?.id ?: return
        val prefs = context.getSharedPreferences("activity", Context.MODE_PRIVATE)
        val seen = prefs.getLong("seen", 0L)
        val now = System.currentTimeMillis()
        val fresh = changes.asSequence()
            .filter { it.type == "activity" && !it.deleted && it.data != null }
            .mapNotNull { r -> runCatching { AppJson.parseToJsonElement(r.data!!) as JsonObject }.getOrNull() }
            .filter { it.str("userId") != me }
            .mapNotNull { o ->
                val at = o["at"]?.jsonPrimitive?.longOrNull ?: return@mapNotNull null
                Line(o.str("projectId"), o.str("name"), o.str("action"), o.str("type"), o.str("title"), at)
            }
            .filter { it.at > seen && it.at > now - 6 * 3_600_000L }
            .sortedBy { it.at }
            .toList()
        if (fresh.isEmpty()) return
        prefs.edit().putLong("seen", fresh.last().at).apply()
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val project = Graph.repoOrNull?.projects?.value?.firstOrNull { it.id == fresh.first().projectId }?.name ?: "Shared project"
        fun text(l: Line) = "${l.name} ${words[l.action] ?: l.action} ${types[l.type] ?: l.type}" +
            if (l.title.isNotBlank() && l.type != "project") " “${l.title}”" else ""
        val body = if (fresh.size == 1) text(fresh.first()) else "${text(fresh.last())} and ${fresh.size - 1} more"
        val open = PendingIntent.getActivity(
            context, 7300,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(context, CarrotApp.CHANNEL_REMINDERS)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFFFF7A1A.toInt())
            .setContentTitle(project)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify("activity:${fresh.first().projectId}".hashCode(), n)
    }

    private fun JsonObject.str(k: String) = this[k]?.jsonPrimitive?.contentOrNull.orEmpty()
}
