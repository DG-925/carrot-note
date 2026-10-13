package com.carrotnote.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.text.format.DateFormat
import android.view.View
import android.widget.RemoteViews
import com.carrotnote.app.Graph
import com.carrotnote.app.R
import com.carrotnote.app.data.TaskItem
import com.carrotnote.app.data.newId
import com.carrotnote.app.data.nowMs
import com.carrotnote.app.reminders.Reminders
import com.carrotnote.app.time.TimeTracker
import java.time.LocalDate
import java.util.Calendar

/**
 * The "Today" home-screen widget: this month's money, tasks due (tick them off right there), the
 * timer and quick add. It shows more or less depending on how big it is on the home screen.
 */
class TodayWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { manager.updateAppWidget(it, build(context, manager, it)) }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
        manager.updateAppWidget(id, build(context, manager, id))
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            ACTION_TOGGLE -> {
                if (Graph.repoOrNull == null) return
                if (TimeTracker.running() != null) TimeTracker.stop(context) else TimeTracker.start(context, null)
                Widgets.refresh(context)
            }
            ACTION_DONE -> {
                val id = intent.data?.lastPathSegment ?: return
                complete(context, id)
                Widgets.refresh(context)
            }
        }
    }

    companion object {
        const val ACTION_TOGGLE = "com.carrotnote.app.WIDGET_TOGGLE_TIMER"
        const val ACTION_DONE = "com.carrotnote.app.WIDGET_TASK_DONE"

        private val rows = intArrayOf(R.id.w_row1, R.id.w_row2, R.id.w_row3, R.id.w_row4, R.id.w_row5)
        private val checks = intArrayOf(R.id.w_check1, R.id.w_check2, R.id.w_check3, R.id.w_check4, R.id.w_check5)
        private val titles = intArrayOf(R.id.w_title1, R.id.w_title2, R.id.w_title3, R.id.w_title4, R.id.w_title5)
        private val whens = intArrayOf(R.id.w_when1, R.id.w_when2, R.id.w_when3, R.id.w_when4, R.id.w_when5)
        private val lates = intArrayOf(R.id.w_late1, R.id.w_late2, R.id.w_late3, R.id.w_late4, R.id.w_late5)

        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context) ?: return
            val ids = manager.getAppWidgetIds(ComponentName(context, TodayWidget::class.java))
            ids.forEach { manager.updateAppWidget(it, build(context, manager, it)) }
        }

        /** Ticks a task off; a repeating task gets its next copy, like in the app. */
        private fun complete(context: Context, id: String) {
            val repo = Graph.repoOrNull ?: return
            val task = repo.tasks.get(id) ?: return
            if (task.done) return
            val done = task.copy(done = true, doing = false)
            repo.tasks.save(done)
            runCatching { Reminders.schedule(context, done) }
            val due = task.dueDate
            if (task.repeat.isNotBlank() && due != null) {
                val today = LocalDate.now().toEpochDay()
                var next = nextRepeat(due, task.repeat)
                while (next < today) next = nextRepeat(next, task.repeat)
                val copy = task.copy(id = newId(), done = false, doing = false, dueDate = next, createdAt = nowMs())
                repo.tasks.save(copy)
                runCatching { Reminders.schedule(context, copy) }
            }
        }

        private fun nextRepeat(day: Long, repeat: String): Long = when (repeat) {
            "daily" -> day + 1
            "weekly" -> day + 7
            "monthly" -> LocalDate.ofEpochDay(day).plusMonths(1).toEpochDay()
            else -> day + 1
        }

        private fun build(context: Context, manager: AppWidgetManager, widgetId: Int): RemoteViews {
            val v = RemoteViews(context.packageName, R.layout.widget_today)
            val (width, height) = Widgets.sizeOf(manager, widgetId, 300, 260)
            val narrow = width < 250
            val today = LocalDate.now()
            val day = today.toEpochDay()

            v.setOnClickPendingIntent(R.id.w_root, Widgets.openApp(context, "home", 9100))
            v.setOnClickPendingIntent(R.id.w_hero, Widgets.openApp(context, "money", 9102))
            v.setOnClickPendingIntent(R.id.w_add_expense, Widgets.openApp(context, "expense", 9103))
            v.setOnClickPendingIntent(R.id.w_add_income, Widgets.openApp(context, "income", 9104))
            v.setOnClickPendingIntent(R.id.w_add_task, Widgets.openApp(context, "task", 9105))
            v.setTextViewText(R.id.w_add_expense_label, Widgets.t("Expense"))
            v.setTextViewText(R.id.w_add_income_label, Widgets.t("Income"))
            v.setTextViewText(R.id.w_add_task_label, Widgets.t("Task"))
            // Narrow widgets keep the icons and drop the words.
            val labels = if (width < 300) View.GONE else View.VISIBLE
            intArrayOf(R.id.w_add_expense_label, R.id.w_add_income_label, R.id.w_add_task_label).forEach { v.setViewVisibility(it, labels) }
            v.setViewVisibility(R.id.w_inout, if (narrow) View.GONE else View.VISIBLE)

            val repo = Graph.repoOrNull
            if (repo == null) {
                v.setTextViewText(R.id.w_date, Widgets.shortDate(today))
                v.setTextViewText(R.id.w_net, "Carrot Note")
                v.setViewVisibility(R.id.w_inout, View.GONE)
                v.setViewVisibility(R.id.w_tasks, View.VISIBLE)
                rows.forEach { v.setViewVisibility(it, View.GONE) }
                v.setTextViewText(R.id.w_more, Widgets.t("Open Carrot Note to sign in"))
                v.setViewVisibility(R.id.w_footer, View.GONE)
                v.setViewVisibility(R.id.w_actions, View.GONE)
                return v
            }
            v.setViewVisibility(R.id.w_actions, View.VISIBLE)

            // Header: date and this month's money.
            val m = Widgets.monthMoney(repo)
            v.setTextViewText(R.id.w_date, Widgets.shortDate(today) + if (narrow) "" else " · " + Widgets.monthName(today) + " " + Widgets.t("so far"))
            v.setTextViewText(R.id.w_net, Widgets.money(m.net, m.currency, sign = true))
            v.setTextViewText(R.id.w_in, "↓ " + Widgets.short(m.income) + " " + Widgets.t("in"))
            v.setTextViewText(R.id.w_out, "↑ " + Widgets.short(m.spent) + " " + Widgets.t("out"))

            // Timer.
            val running = TimeTracker.running()
            if (running != null) {
                v.setInt(R.id.w_timer, "setBackgroundResource", R.drawable.widget_button)
                v.setImageViewResource(R.id.w_timer_icon, R.drawable.ic_w_stop)
                v.setViewVisibility(R.id.w_timer_label, View.GONE)
                v.setViewVisibility(R.id.w_timer_clock, View.VISIBLE)
                v.setChronometer(R.id.w_timer_clock, SystemClock.elapsedRealtime() - (System.currentTimeMillis() - running.start), null, true)
            } else {
                v.setInt(R.id.w_timer, "setBackgroundResource", R.drawable.widget_chip)
                v.setImageViewResource(R.id.w_timer_icon, R.drawable.ic_w_play)
                v.setViewVisibility(R.id.w_timer_label, if (width < 300) View.GONE else View.VISIBLE)
                v.setTextViewText(R.id.w_timer_label, Widgets.t("Timer"))
                v.setViewVisibility(R.id.w_timer_clock, View.GONE)
                v.setChronometer(R.id.w_timer_clock, SystemClock.elapsedRealtime(), null, false)
            }
            val toggle = PendingIntent.getBroadcast(
                context, 9101, Intent(context, TodayWidget::class.java).setAction(ACTION_TOGGLE),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            v.setOnClickPendingIntent(R.id.w_timer, toggle)

            // Footer: what's being tracked, rentals to renew, or the next event.
            val renew = repo.rentals.value.count { r -> r.status == "active" && r.expiryDate != null && r.expiryDate <= day + maxOf(7, r.remindDays) }
            val eventsToday = repo.events.value.filter { it.date == day && !it.done }.sortedBy { it.time ?: -1 }
            val footer: Pair<Int, String>? = when {
                running != null -> Pair(R.drawable.ic_w_play, Widgets.t("Tracking") + " · " + (repo.projects.get(running.projectId)?.name ?: running.note.ifBlank { Widgets.t("Timer") }))
                renew > 0 -> Pair(R.drawable.ic_w_renew, "$renew " + Widgets.t(if (renew == 1) "rental to renew" else "rentals to renew"))
                eventsToday.isNotEmpty() -> eventsToday.first().let { e -> Pair(R.drawable.ic_w_cal, listOfNotNull(e.time?.let { clock(context, it) }, e.title).joinToString(" · ")) }
                else -> null
            }

            // How much room is left for tasks (rough heights in dp, matching widget_today.xml).
            var room = height - 16 - 68 - 38 - 8
            val showFooter = footer != null && room >= 24 + 30
            if (showFooter) room -= 24
            v.setViewVisibility(R.id.w_footer, if (showFooter) View.VISIBLE else View.GONE)
            if (showFooter && footer != null) {
                v.setTextViewText(R.id.w_footer, footer.second)
                v.setTextViewCompoundDrawablesRelative(R.id.w_footer, footer.first, 0, 0, 0)
            }

            // Tasks due today or late (task rows are 30dp, the "+ N more" line about 18dp).
            val due = repo.tasks.value.filter { !it.done && it.dueDate != null && it.dueDate <= day }
                .sortedWith(compareBy<TaskItem>({ it.dueDate }, { it.dueTime ?: 9999 }, { -it.priority }))
            if (room < 18) {
                v.setViewVisibility(R.id.w_tasks, View.GONE)
                return v
            }
            v.setViewVisibility(R.id.w_tasks, View.VISIBLE)
            val shown = if (due.size <= room / 30) due.size else ((room - 18) / 30).coerceIn(0, rows.size)
            rows.forEachIndexed { i, row ->
                val t = due.getOrNull(i)?.takeIf { i < shown }
                v.setViewVisibility(row, if (t == null) View.GONE else View.VISIBLE)
                if (t == null) return@forEachIndexed
                val dueDay = t.dueDate ?: day
                v.setTextViewText(titles[i], t.title)
                val late = dueDay < day
                v.setViewVisibility(lates[i], if (late) View.VISIBLE else View.GONE)
                v.setViewVisibility(whens[i], if (late) View.GONE else View.VISIBLE)
                v.setTextViewText(lates[i], if (dueDay == day - 1) Widgets.t("Yesterday") else "${day - dueDay}d " + Widgets.t("late"))
                v.setTextViewText(whens[i], t.dueTime?.let { clock(context, it) } ?: "")
                v.setContentDescription(checks[i], Widgets.t("Mark done") + ": " + t.title)
                val doneIntent = Intent(context, TodayWidget::class.java).setAction(ACTION_DONE).setData(Uri.parse("carrot-widget://done/" + Uri.encode(t.id)))
                v.setOnClickPendingIntent(checks[i], PendingIntent.getBroadcast(context, 9200 + i, doneIntent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
                v.setOnClickPendingIntent(row, Widgets.openApp(context, "task-open:" + t.id, 9300 + i))
            }
            val events = eventsToday.size.takeIf { it > 0 && !(showFooter && footer?.first == R.drawable.ic_w_cal && it == 1) }
            val extra = listOfNotNull(
                (due.size - shown).takeIf { it > 0 }?.let { (if (shown == 0) "$it " + Widgets.t(if (it == 1) "task due" else "tasks due") else "+ $it " + Widgets.t("more")) },
                events?.let { "$it " + Widgets.t(if (it == 1) "event today" else "events today") },
            ).joinToString(" · ")
            val text = if (due.isEmpty()) listOf(Widgets.t("Nothing due today. Enjoy it 🥕"), extra).filter { it.isNotBlank() }.joinToString(" · ") else extra
            v.setViewVisibility(R.id.w_more, if (text.isBlank()) View.GONE else View.VISIBLE)
            v.setTextViewText(R.id.w_more, text)
            v.setOnClickPendingIntent(R.id.w_tasks, Widgets.openApp(context, "home", 9106))
            return v
        }

        /** Minutes after midnight as the phone shows times ("6:00 PM" or "18:00"). */
        private fun clock(context: Context, minutes: Int): String {
            val c = Calendar.getInstance().apply { set(Calendar.HOUR_OF_DAY, minutes / 60); set(Calendar.MINUTE, minutes % 60) }
            return DateFormat.getTimeFormat(context).format(c.time)
        }
    }
}
