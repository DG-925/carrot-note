package com.carrotnote.app.reminders

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.carrotnote.app.CarrotApp
import com.carrotnote.app.MainActivity
import com.carrotnote.app.R
import com.carrotnote.app.data.CalEvent
import com.carrotnote.app.data.Rental
import com.carrotnote.app.data.Repository
import com.carrotnote.app.data.TaskItem
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.doubleOrNull
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.util.concurrent.TimeUnit

/** Schedules local notifications for tasks and calendar events that have a reminder. */
object Reminders {
    private const val TAG = "carrot_reminder"
    private const val DEFAULT_MINUTES = 9 * 60

    private fun triggerAt(date: Long?, time: Int?): Long? {
        if (date == null) return null
        val t = time ?: DEFAULT_MINUTES
        return LocalDate.ofEpochDay(date).atTime(LocalTime.of(t / 60, t % 60))
            .atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
    }

    fun schedule(context: Context, task: TaskItem) {
        val at = if (task.reminder && !task.done) triggerAt(task.dueDate, task.dueTime) else null
        enqueue(context, "task_${task.id}", at, task.title, task.notes.ifBlank { "Task due" })
    }

    fun schedule(context: Context, event: CalEvent) {
        val at = if (event.reminder && !event.done) triggerAt(event.date, event.time) else null
        enqueue(context, "event_${event.id}", at, event.title, event.note.ifBlank { "Calendar event" })
    }

    /** A heads-up [Rental.remindDays] before a rental expires, and another on the day. */
    fun schedule(context: Context, rental: Rental) {
        val on = rental.reminder && rental.status == "active" && rental.expiryDate != null
        val what = rental.name.ifBlank { rental.kind.uppercase() }
        val who = rental.clientName.ifBlank { null }?.let { " for $it" }.orEmpty()
        val before = if (on && rental.remindDays > 0) triggerAt(rental.expiryDate!! - rental.remindDays, null) else null
        enqueue(context, "rental_${rental.id}_before", before, "$what expires in ${rental.remindDays} day${if (rental.remindDays == 1) "" else "s"}",
            "Renew it$who before it runs out.")
        val day = if (on) triggerAt(rental.expiryDate, rental.expiryTime?.let { (it - 60).coerceAtLeast(0) }) else null
        enqueue(context, "rental_${rental.id}_day", day, "$what expires today", "Renew it$who or it will stop.")
    }

    /** On an invoice's due date at 9:00, unless it is a draft or already paid. */
    fun scheduleInvoice(context: Context, invoice: JsonObject) {
        fun s(k: String) = invoice[k]?.jsonPrimitive?.contentOrNull
        val id = s("id") ?: return
        val status = s("status") ?: "draft"
        val due = invoice["dueDate"]?.jsonPrimitive?.longOrNull
        val total = invoice["total"]?.jsonPrimitive?.doubleOrNull ?: 0.0
        val paid = (invoice["payments"] as? kotlinx.serialization.json.JsonArray)?.sumOf {
            (it as? JsonObject)?.get("amount")?.jsonPrimitive?.doubleOrNull ?: 0.0
        } ?: 0.0
        val open = status != "draft" && status != "cancelled" && paid + 0.0001 < total
        val number = s("number").orEmpty()
        val client = s("clientName").orEmpty()
        enqueue(context, "invoice_$id", if (open) triggerAt(due, null) else null,
            "Invoice $number is due today", if (client.isNotBlank()) "Check if $client has paid, or send a reminder." else "Check if it has been paid.")
    }

    fun cancelRental(context: Context, id: String) {
        cancel(context, "rental_${id}_before")
        cancel(context, "rental_${id}_day")
    }

    fun cancel(context: Context, key: String) {
        WorkManager.getInstance(context).cancelUniqueWork(key)
    }

    fun cancelAll(context: Context) {
        WorkManager.getInstance(context).cancelAllWorkByTag(TAG)
    }

    fun rescheduleAll(context: Context, repo: Repository) {
        cancelAll(context)
        repo.tasks.value.forEach { schedule(context, it) }
        repo.events.value.forEach { schedule(context, it) }
        repo.rentals.value.forEach { schedule(context, it) }
        repo.invoices.value.forEach { scheduleInvoice(context, it) }
    }

    private fun enqueue(context: Context, key: String, at: Long?, title: String, text: String) {
        val wm = WorkManager.getInstance(context)
        val delay = at?.minus(System.currentTimeMillis())
        if (delay == null || delay <= 0) {
            wm.cancelUniqueWork(key)
            return
        }
        val req = OneTimeWorkRequestBuilder<ReminderWorker>()
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .setInputData(workDataOf("title" to title, "text" to text, "key" to key))
            .addTag(TAG)
            .build()
        wm.enqueueUniqueWork(key, ExistingWorkPolicy.REPLACE, req)
    }
}

class ReminderWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val ctx = applicationContext
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            android.os.Build.VERSION.SDK_INT >= 33
        ) return Result.success()
        val key = inputData.getString("key") ?: "reminder"
        val open = PendingIntent.getActivity(
            ctx, key.hashCode(),
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(ctx, CarrotApp.CHANNEL_REMINDERS)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFFFF7A1A.toInt())
            .setContentTitle(inputData.getString("title") ?: "Reminder")
            .setContentText(inputData.getString("text") ?: "")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(ctx).notify(key.hashCode(), n)
        return Result.success()
    }
}
