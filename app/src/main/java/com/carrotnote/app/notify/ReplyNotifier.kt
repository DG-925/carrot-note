package com.carrotnote.app.notify

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
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
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/** A notification when a client answers through a client link: accepted a quote, or says they paid. */
object ReplyNotifier {
    fun onSync(context: Context, changes: List<SyncRecord>) {
        val prefs = context.getSharedPreferences("replies", Context.MODE_PRIVATE)
        val seen = prefs.getLong("seen", 0L)
        val fresh = changes.asSequence()
            .filter { it.type == "reply" && !it.deleted && it.data != null }
            .mapNotNull { r -> runCatching { AppJson.parseToJsonElement(r.data!!) as JsonObject }.getOrNull() }
            .filter { it["handled"]?.jsonPrimitive?.booleanOrNull != true }
            .filter { (it["at"]?.jsonPrimitive?.longOrNull ?: 0) > seen }
            .sortedBy { it["at"]?.jsonPrimitive?.longOrNull ?: 0 }
            .toList()
        if (fresh.isEmpty()) return
        prefs.edit().putLong("seen", fresh.last()["at"]?.jsonPrimitive?.longOrNull ?: System.currentTimeMillis()).apply()
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val ar = Graph.settings.language == "ar"
        for (r in fresh) {
            val who = r.str("name").ifBlank { r.str("clientName") }.ifBlank { if (ar) "عميلك" else "Your client" }
            val number = r.str("number")
            val amount = r["amount"]?.jsonPrimitive?.doubleOrNull
            val money = amount?.let { " ${"%,.0f".format(java.util.Locale.US, it)} ${r.str("currency")}" } ?: ""
            val method = r.str("method").takeIf { it.isNotBlank() }?.let { " · $it" }.orEmpty()
            val text = when (r.str("kind")) {
                "accept" -> if (ar) "$who قبل $number 🎉" else "$who accepted $number 🎉"
                "decline" -> if (ar) "$who رفض $number" else "$who declined $number"
                else -> if (ar) "$who يقول إنه دفع$money لـ $number$method" else "$who says they paid$money for $number$method"
            }
            val open2 = if (ar) "افتح كاروت نوت للتصرف" else "Open Carrot Note to act on it"
            val note = r.str("note")
            val target = "${r.str("targetType")}-open:${r.str("targetId")}"
            val open = PendingIntent.getActivity(
                context, target.hashCode(),
                Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW)
                    .setData(Uri.parse("carrot-reply://open/" + Uri.encode(target)))
                    .putExtra(MainActivity.EXTRA_SHORTCUT, target)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val n = NotificationCompat.Builder(context, CarrotApp.CHANNEL_CHAT)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(0xFFFF7A1A.toInt())
                .setContentTitle(text)
                .setContentText(note.ifBlank { open2 })
                .setStyle(NotificationCompat.BigTextStyle().bigText(note.ifBlank { open2 }))
                .setContentIntent(open)
                .setAutoCancel(true)
                .build()
            NotificationManagerCompat.from(context).notify(("reply:" + r.str("id")).hashCode(), n)
        }
    }

    /** "Karim followed you": new followers since the last sync on this phone. */
    fun onFollowers(context: Context, f: com.carrotnote.app.data.FollowSummary) {
        val prefs = context.getSharedPreferences("replies", Context.MODE_PRIVATE)
        val seen = prefs.getLong("follow_seen", -1L)
        val newest = f.latest.maxOfOrNull { it.at } ?: return
        prefs.edit().putLong("follow_seen", maxOf(seen, newest)).apply()
        if (seen < 0) return // first sync on this phone: nothing is new
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val ar = Graph.settings.language == "ar"
        for (p in f.latest.filter { it.at > seen }) {
            val who = p.name.ifBlank { "@" + p.username }
            val open = PendingIntent.getActivity(
                context, ("people").hashCode(),
                Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW)
                    .setData(Uri.parse("carrot-people://open"))
                    .putExtra(MainActivity.EXTRA_SHORTCUT, "people")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val n = NotificationCompat.Builder(context, CarrotApp.CHANNEL_CHAT)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(0xFFFF7A1A.toInt())
                .setContentTitle(if (ar) "$who بدأ متابعتك" else "$who followed you")
                .setContentText(if (ar) "تابعه أنت أيضًا لتتراسلا" else "Follow them back to chat")
                .setContentIntent(open)
                .setAutoCancel(true)
                .build()
            NotificationManagerCompat.from(context).notify(("follow:" + p.id).hashCode(), n)
        }
    }

    private fun JsonObject.str(k: String) = this[k]?.jsonPrimitive?.contentOrNull.orEmpty()
}
