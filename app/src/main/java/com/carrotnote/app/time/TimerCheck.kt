package com.carrotnote.app.time

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.carrotnote.app.CarrotApp
import com.carrotnote.app.Graph
import com.carrotnote.app.MainActivity
import com.carrotnote.app.R
import java.util.concurrent.TimeUnit

/** Asks "still working?" when the timer has been running for hours, in case it was forgotten. */
object TimerCheck {
    private const val WORK = "timer_check"
    const val NOTIFICATION_ID = 7003
    const val FIRST_HOURS = 4L
    const val AGAIN_HOURS = 2L

    fun schedule(context: Context, hours: Long = FIRST_HOURS) {
        val req = OneTimeWorkRequestBuilder<TimerCheckWorker>().setInitialDelay(hours, TimeUnit.HOURS).build()
        WorkManager.getInstance(context).enqueueUniqueWork(WORK, ExistingWorkPolicy.REPLACE, req)
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK)
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }

    fun notify(context: Context) {
        val entry = TimeTracker.running() ?: return
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val project = Graph.repoOrNull?.projects?.get(entry.projectId)?.name
        fun action(a: String, code: Int) = PendingIntent.getBroadcast(
            context, NOTIFICATION_ID + code, Intent(context, TimerReceiver::class.java).setAction(a),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val open = PendingIntent.getActivity(
            context, NOTIFICATION_ID,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(context, CarrotApp.CHANNEL_REMINDERS)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFFFF6B1F.toInt())
            .setContentTitle("Still working?")
            .setContentText("The timer${project?.let { " for $it" }.orEmpty()} has been running for ${TimeTracker.format(entry.durationMs())}.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(open)
            .setAutoCancel(true)
            .addAction(0, "Stop timer", action(TimeTracker.ACTION_STOP, 1))
            .addAction(0, "Keep going", action(TimeTracker.ACTION_KEEP, 2))
            .build()
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, n)
    }
}

class TimerCheckWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val entry = TimeTracker.running() ?: return Result.success()
        if (entry.durationMs() >= TimerCheck.FIRST_HOURS * 3_600_000 - 60_000) TimerCheck.notify(applicationContext)
        // Ask again later if it keeps running.
        TimerCheck.schedule(applicationContext, TimerCheck.AGAIN_HOURS)
        return Result.success()
    }
}
