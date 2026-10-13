package com.carrotnote.app.time

import android.Manifest
import android.app.PendingIntent
import android.content.BroadcastReceiver
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
import com.carrotnote.app.data.TimeEntry
import com.carrotnote.app.data.nowMs

/** Work timer: at most one running [TimeEntry]; shown as an ongoing notification while it runs. */
object TimeTracker {
    private const val NOTIFICATION_ID = 7001
    const val ACTION_STOP = "com.carrotnote.app.STOP_TIMER"
    const val ACTION_KEEP = "com.carrotnote.app.KEEP_TIMER"

    fun running(): TimeEntry? = Graph.repoOrNull?.time?.value?.filter { it.running }?.maxByOrNull { it.start }

    fun start(context: Context, projectId: String?, note: String = "") {
        val repo = Graph.repoOrNull ?: return
        stop(context, notify = false)
        repo.time.save(TimeEntry(projectId = projectId, start = nowMs(), note = note))
        refreshNotification(context)
        TimerCheck.schedule(context)
        com.carrotnote.app.widget.Widgets.refresh(context)
    }

    fun stop(context: Context, notify: Boolean = true) {
        val repo = Graph.repoOrNull ?: return
        val now = nowMs()
        repo.time.value.filter { it.running }.forEach { repo.time.save(it.copy(end = now)) }
        TimerCheck.cancel(context)
        if (notify) refreshNotification(context)
        com.carrotnote.app.widget.Widgets.refresh(context)
    }

    fun format(ms: Long): String {
        val s = ms / 1000
        return "%d:%02d:%02d".format(s / 3600, (s % 3600) / 60, s % 60)
    }

    fun hours(ms: Long): Double = ms / 3_600_000.0

    fun cancelNotification(context: Context) = NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)

    fun refreshNotification(context: Context) {
        val entry = running()
        if (entry == null) {
            cancelNotification(context)
            return
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val project = Graph.repoOrNull?.projects?.get(entry.projectId)?.name
        val open = PendingIntent.getActivity(
            context, NOTIFICATION_ID,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stop = PendingIntent.getBroadcast(
            context, NOTIFICATION_ID + 1,
            Intent(context, TimerReceiver::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(context, CarrotApp.CHANNEL_TIMER)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFFFF8C1A.toInt())
            .setContentTitle(project ?: "Timer running")
            .setContentText(entry.note.ifBlank { "Tracking your work time" })
            .setUsesChronometer(true)
            .setWhen(entry.start)
            .setShowWhen(true)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .addAction(0, "Stop", stop)
            .build()
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, n)
    }
}

class TimerReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            TimeTracker.ACTION_STOP -> TimeTracker.stop(context)
            TimeTracker.ACTION_KEEP -> {
                androidx.core.app.NotificationManagerCompat.from(context).cancel(TimerCheck.NOTIFICATION_ID)
                TimerCheck.schedule(context, TimerCheck.AGAIN_HOURS)
            }
        }
    }
}
