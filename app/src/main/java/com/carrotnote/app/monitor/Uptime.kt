package com.carrotnote.app.monitor

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.carrotnote.app.CarrotApp
import com.carrotnote.app.Graph
import com.carrotnote.app.MainActivity
import com.carrotnote.app.R
import com.carrotnote.app.data.AppJson
import com.carrotnote.app.data.Rental
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URL
import java.util.concurrent.TimeUnit

/** Result of the last check of one rental. */
@Serializable
data class UptimeResult(val up: Boolean, val at: Long, val ms: Long = 0, val error: String = "", val since: Long = 0)

/**
 * Checks that rented servers and sites are online every 15 minutes, and notifies when one goes
 * down or comes back. A target is an http(s) address (any answer below 500 counts as up) or
 * host[:port], which must accept a connection (port 22 by default).
 */
object Uptime {
    private const val WORK = "uptime"
    private val mapSerializer = MapSerializer(String.serializer(), UptimeResult.serializer())

    private fun prefs(context: Context) = context.getSharedPreferences("uptime", Context.MODE_PRIVATE)

    fun results(context: Context): Map<String, UptimeResult> =
        prefs(context).getString("results", null)?.let { runCatching { AppJson.decodeFromString(mapSerializer, it) }.getOrNull() }.orEmpty()

    private fun save(context: Context, map: Map<String, UptimeResult>) {
        prefs(context).edit().putString("results", AppJson.encodeToString(mapSerializer, map)).apply()
    }

    private fun watched(): List<Rental> =
        Graph.repoOrNull?.rentals?.value.orEmpty().filter { it.monitor && it.status == "active" && it.monitorUrl.isNotBlank() }

    /** Starts or stops the periodic check depending on whether any rental is monitored. */
    fun reschedule(context: Context) {
        val wm = WorkManager.getInstance(context)
        if (watched().isEmpty()) {
            wm.cancelUniqueWork(WORK)
            return
        }
        val req = PeriodicWorkRequestBuilder<UptimeWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        wm.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, req)
    }

    /** Checks one target now (blocking; call off the main thread). */
    fun probe(target: String): UptimeResult {
        val t = target.trim()
        val start = System.currentTimeMillis()
        return try {
            if (t.startsWith("http://", true) || t.startsWith("https://", true)) {
                val conn = (URL(t).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 10_000
                    readTimeout = 10_000
                    instanceFollowRedirects = true
                    requestMethod = "GET"
                    setRequestProperty("User-Agent", "CarrotNote-Uptime")
                }
                try {
                    val code = conn.responseCode
                    val ms = System.currentTimeMillis() - start
                    if (code < 500) UptimeResult(true, System.currentTimeMillis(), ms) else UptimeResult(false, System.currentTimeMillis(), ms, "Server error $code")
                } finally {
                    conn.disconnect()
                }
            } else {
                val host = t.substringBeforeLast(':').takeIf { t.contains(':') && t.substringAfterLast(':').all { it.isDigit() } } ?: t
                val port = if (host != t) t.substringAfterLast(':').toInt() else 22
                Socket().use { it.connect(InetSocketAddress(host.trim('[', ']'), port), 10_000) }
                UptimeResult(true, System.currentTimeMillis(), System.currentTimeMillis() - start)
            }
        } catch (e: Exception) {
            UptimeResult(false, System.currentTimeMillis(), System.currentTimeMillis() - start, e.message?.take(120) ?: e.javaClass.simpleName)
        }
    }

    /** Checks [rental] now, stores the result and notifies on a change. */
    fun check(context: Context, rental: Rental): UptimeResult {
        val old = results(context)[rental.id]
        val r0 = probe(rental.monitorUrl)
        val r = r0.copy(since = if (old != null && old.up == r0.up) old.since else r0.at)
        save(context, results(context) + (rental.id to r))
        if (old != null && old.up != r.up) notifyChange(context, rental, r)
        return r
    }

    fun checkAll(context: Context) {
        watched().forEach { check(context, it) }
    }

    private fun notifyChange(context: Context, rental: Rental, r: UptimeResult) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val name = rental.name.ifBlank { rental.monitorUrl }
        val open = PendingIntent.getActivity(
            context, rental.id.hashCode(),
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val client = rental.clientName.ifBlank { null }?.let { " ($it)" }.orEmpty()
        val n = NotificationCompat.Builder(context, CarrotApp.CHANNEL_REMINDERS)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(if (r.up) 0xFF1E9E5A.toInt() else 0xFFD9452B.toInt())
            .setContentTitle(if (r.up) "$name is back online" else "$name is down")
            .setContentText(if (r.up) "It answered again$client." else "It isn't answering$client: ${r.error.ifBlank { "no response" }}")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(("uptime_" + rental.id).hashCode(), n)
    }
}

class UptimeWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        Uptime.checkAll(applicationContext)
        return Result.success()
    }
}
