package com.carrotnote.app.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.carrotnote.app.Graph
import com.carrotnote.app.R
import java.time.LocalDate

/** "Agenda": today's and tomorrow's events and tasks, in time order. */
class AgendaWidget : CarrotWidget() {

    private class Entry(val day: Long, val time: Int?, val title: String, val event: Boolean, val late: Boolean, val open: String)

    private val days = intArrayOf(R.id.a_day1, R.id.a_day2, R.id.a_day3, R.id.a_day4, R.id.a_day5, R.id.a_day6, R.id.a_day7)
    private val items = intArrayOf(R.id.a_item1, R.id.a_item2, R.id.a_item3, R.id.a_item4, R.id.a_item5, R.id.a_item6, R.id.a_item7)
    private val dots = intArrayOf(R.id.a_dot1, R.id.a_dot2, R.id.a_dot3, R.id.a_dot4, R.id.a_dot5, R.id.a_dot6, R.id.a_dot7)
    private val times = intArrayOf(R.id.a_time1, R.id.a_time2, R.id.a_time3, R.id.a_time4, R.id.a_time5, R.id.a_time6, R.id.a_time7)
    private val titles = intArrayOf(R.id.a_title1, R.id.a_title2, R.id.a_title3, R.id.a_title4, R.id.a_title5, R.id.a_title6, R.id.a_title7)
    private val slots = intArrayOf(R.id.a_slot1, R.id.a_slot2, R.id.a_slot3, R.id.a_slot4, R.id.a_slot5, R.id.a_slot6, R.id.a_slot7)

    override fun build(context: Context, manager: AppWidgetManager, widgetId: Int): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.widget_agenda)
        val (_, height) = Widgets.sizeOf(manager, widgetId, 300, 260)
        val todayDate = LocalDate.now()
        val today = todayDate.toEpochDay()
        v.setOnClickPendingIntent(R.id.a_root, Widgets.openApp(context, "calendar", 9700))
        v.setTextViewText(R.id.a_title, Widgets.t("Agenda"))
        v.setTextViewText(R.id.a_date, Widgets.shortDate(todayDate))
        val repo = Graph.repoOrNull
        val list = ArrayList<Entry>()
        if (repo != null) {
            repo.events.value.filter { !it.done && (it.date == today || it.date == today + 1) }
                .forEach { list += Entry(it.date, it.time, it.title, true, false, "calendar") }
            repo.tasks.value.filter { !it.done && it.dueDate != null && it.dueDate <= today + 1 }.forEach {
                val d = it.dueDate ?: today
                list += Entry(maxOf(d, today), it.dueTime, it.title, false, d < today, "task-open:" + it.id)
            }
        }
        // Late first, then by time; things without a time come last in their day.
        list.sortWith(compareBy<Entry>({ it.day }, { !it.late }, { it.time ?: 24 * 60 }))

        // Each item is 26dp; the first of a day also has a ~20dp "Today"/"Tomorrow" label.
        var room = height - 24 - 24
        var shown = 0
        var lastDay = -1L
        for (e in list) {
            val need = 26 + if (e.day != lastDay) 20 else 0
            if (room < need || shown == slots.size) break
            room -= need; lastDay = e.day; shown++
        }
        lastDay = -1L
        slots.forEachIndexed { i, slot ->
            val e = list.getOrNull(i)?.takeIf { i < shown }
            v.setViewVisibility(slot, if (e == null) View.GONE else View.VISIBLE)
            if (e == null) return@forEachIndexed
            v.setViewVisibility(items[i], View.VISIBLE)
            v.setViewVisibility(days[i], if (e.day != lastDay) View.VISIBLE else View.GONE)
            v.setTextViewText(days[i], Widgets.t(if (e.day == today) "Today" else "Tomorrow"))
            lastDay = e.day
            v.setImageViewResource(dots[i], if (e.event) R.drawable.ic_w_dot_event else R.drawable.ic_w_dot_task)
            v.setTextViewText(times[i], when {
                e.late -> Widgets.t("Late")
                e.time != null -> TodayWidget.clock(context, e.time)
                else -> ""
            })
            v.setTextViewText(titles[i], e.title)
            v.setOnClickPendingIntent(items[i], Widgets.openApp(context, e.open, 9710 + i))
        }
        v.setViewVisibility(R.id.a_empty, if (shown == 0) View.VISIBLE else View.GONE)
        v.setTextViewText(R.id.a_empty, Widgets.t(if (repo == null) "Open Carrot Note to sign in" else "Nothing planned for today or tomorrow 🥕"))
        return v
    }
}
