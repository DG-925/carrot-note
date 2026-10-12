package com.carrotnote.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import com.carrotnote.app.Graph
import com.carrotnote.app.MainActivity
import com.carrotnote.app.R
import com.carrotnote.app.time.TimeTracker
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/** Home-screen widget: what's due today, a timer button, and rentals to renew. */
class TodayWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        refresh(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_TOGGLE) {
            if (Graph.repoOrNull == null) return
            if (TimeTracker.running() != null) TimeTracker.stop(context) else TimeTracker.start(context, null)
            refresh(context)
        }
    }

    companion object {
        const val ACTION_TOGGLE = "com.carrotnote.app.WIDGET_TOGGLE_TIMER"
        private val taskLines = intArrayOf(R.id.w_task1, R.id.w_task2, R.id.w_task3)

        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context) ?: return
            val ids = manager.getAppWidgetIds(ComponentName(context, TodayWidget::class.java))
            if (ids.isEmpty()) return
            manager.updateAppWidget(ids, build(context))
        }

        private fun build(context: Context): RemoteViews {
            val v = RemoteViews(context.packageName, R.layout.widget_today)
            val open = PendingIntent.getActivity(
                context, 9100, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            v.setOnClickPendingIntent(R.id.w_root, open)
            val today = LocalDate.now()
            v.setTextViewText(R.id.w_date, today.format(DateTimeFormatter.ofPattern("EEE, d MMM")))

            val repo = Graph.repoOrNull
            if (repo == null) {
                taskLines.forEach { v.setViewVisibility(it, View.GONE) }
                v.setViewVisibility(R.id.w_empty, View.VISIBLE)
                v.setTextViewText(R.id.w_empty, "Open Carrot Note to sign in")
                v.setViewVisibility(R.id.w_timer_row, View.GONE)
                v.setViewVisibility(R.id.w_rentals, View.GONE)
                return v
            }
            val day = today.toEpochDay()
            val due = repo.tasks.value.filter { !it.done && it.dueDate != null && it.dueDate <= day }
                .sortedWith(compareBy({ it.dueDate }, { it.dueTime ?: 9999 }))
            val events = repo.events.value.count { it.date == day && !it.done }
            taskLines.forEachIndexed { i, id ->
                val t = due.getOrNull(i)
                v.setViewVisibility(id, if (t == null) View.GONE else View.VISIBLE)
                if (t != null) v.setTextViewText(id, (if (t.dueDate!! < day) "⚠ " else "○ ") + t.title)
            }
            val extra = listOfNotNull(
                (due.size - 3).takeIf { it > 0 }?.let { "+$it more" },
                events.takeIf { it > 0 }?.let { "$it event${if (it == 1) "" else "s"} today" },
            ).joinToString(" · ")
            v.setViewVisibility(R.id.w_empty, if (due.isEmpty() || extra.isNotEmpty()) View.VISIBLE else View.GONE)
            v.setTextViewText(R.id.w_empty, if (due.isEmpty()) listOf("Nothing due today 🥕", extra).filter { it.isNotBlank() }.joinToString(" · ") else extra)

            v.setViewVisibility(R.id.w_timer_row, View.VISIBLE)
            val running = TimeTracker.running()
            if (running != null) {
                val project = repo.projects.get(running.projectId)?.name ?: running.note.ifBlank { "Tracking" }
                v.setTextViewText(R.id.w_timer_label, project)
                v.setViewVisibility(R.id.w_timer_clock, View.VISIBLE)
                v.setChronometer(R.id.w_timer_clock, SystemClock.elapsedRealtime() - (System.currentTimeMillis() - running.start), null, true)
                v.setTextViewText(R.id.w_timer_button, "■  Stop")
            } else {
                v.setTextViewText(R.id.w_timer_label, "Timer")
                v.setViewVisibility(R.id.w_timer_clock, View.GONE)
                v.setChronometer(R.id.w_timer_clock, SystemClock.elapsedRealtime(), null, false)
                v.setTextViewText(R.id.w_timer_button, "▶  Start")
            }
            val toggle = PendingIntent.getBroadcast(
                context, 9101, Intent(context, TodayWidget::class.java).setAction(ACTION_TOGGLE),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            v.setOnClickPendingIntent(R.id.w_timer_button, toggle)

            val renew = repo.rentals.value.count { r ->
                r.status == "active" && r.expiryDate != null && r.expiryDate <= day + maxOf(7, r.remindDays)
            }
            v.setViewVisibility(R.id.w_rentals, if (renew > 0) View.VISIBLE else View.GONE)
            v.setTextViewText(R.id.w_rentals, "↻ $renew rental${if (renew == 1) "" else "s"} to renew")
            return v
        }
    }
}
