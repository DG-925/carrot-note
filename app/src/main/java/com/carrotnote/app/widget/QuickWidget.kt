package com.carrotnote.app.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.carrotnote.app.R
import com.carrotnote.app.time.TimeTracker

/** "Quick add": a strip of buttons for a new expense, income, task or note, and the timer. */
class QuickWidget : CarrotWidget() {

    override fun build(context: Context, manager: AppWidgetManager, widgetId: Int): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.widget_quick)
        val (_, height) = Widgets.sizeOf(manager, widgetId, 300, 80)
        v.setOnClickPendingIntent(R.id.q_expense, Widgets.openApp(context, "expense", 9500))
        v.setOnClickPendingIntent(R.id.q_income, Widgets.openApp(context, "income", 9501))
        v.setOnClickPendingIntent(R.id.q_task, Widgets.openApp(context, "task", 9502))
        v.setOnClickPendingIntent(R.id.q_note, Widgets.openApp(context, "note", 9503))
        v.setOnClickPendingIntent(R.id.q_timer, Widgets.toggleTimer(context, 9504))
        val running = TimeTracker.running() != null
        v.setImageViewResource(R.id.q_timer_icon, if (running) R.drawable.ic_w_stop_sky else R.drawable.ic_w_play_sky)
        val labels = mapOf(
            R.id.q_expense_label to "Expense", R.id.q_income_label to "Income", R.id.q_task_label to "Task",
            R.id.q_note_label to "Note", R.id.q_timer_label to if (running) "Stop" else "Timer",
        )
        // A one-row widget only has room for the icons.
        val show = if (height < 64) View.GONE else View.VISIBLE
        labels.forEach { (id, word) -> v.setTextViewText(id, Widgets.t(word)); v.setViewVisibility(id, show) }
        return v
    }
}
