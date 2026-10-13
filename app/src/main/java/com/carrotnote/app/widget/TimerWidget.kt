package com.carrotnote.app.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import com.carrotnote.app.Graph
import com.carrotnote.app.R
import com.carrotnote.app.time.TimeTracker
import java.time.LocalDate

/** "Timer": start and stop with one tap; a live clock on orange while it runs. */
class TimerWidget : CarrotWidget() {

    override fun build(context: Context, manager: AppWidgetManager, widgetId: Int): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.widget_timer)
        v.setOnClickPendingIntent(R.id.t_root, Widgets.openApp(context, "time", 9600))
        v.setOnClickPendingIntent(R.id.t_btn, Widgets.toggleTimer(context, 9601))
        v.setTextViewText(R.id.t_title, Widgets.t("Timer"))
        v.setViewVisibility(R.id.t_today, View.GONE)
        val repo = Graph.repoOrNull
        val running = TimeTracker.running()
        if (repo == null) {
            v.setTextViewText(R.id.t_idle_big, "0:00")
            v.setTextViewText(R.id.t_idle_sub, Widgets.t("Open Carrot Note to sign in"))
            v.setViewVisibility(R.id.t_btn, View.GONE)
            return v
        }
        v.setViewVisibility(R.id.t_btn, View.VISIBLE)
        if (running == null) {
            val today = LocalDate.now().toEpochDay()
            val tracked = repo.time.value.filter { Widgets.dayOf(it.start) == today }.sumOf { it.durationMs() }
            v.setInt(R.id.t_root, "setBackgroundResource", R.drawable.widget_bg)
            v.setViewVisibility(R.id.t_idle, View.VISIBLE)
            v.setViewVisibility(R.id.t_run, View.GONE)
            v.setTextViewText(R.id.t_idle_big, Widgets.hm(tracked))
            v.setTextViewText(R.id.t_idle_sub, Widgets.t("tracked today"))
            v.setChronometer(R.id.t_clock, SystemClock.elapsedRealtime(), null, false)
            v.setInt(R.id.t_btn, "setBackgroundResource", R.drawable.widget_button)
            v.setImageViewResource(R.id.t_btn_icon, R.drawable.ic_w_play_white)
            v.setTextViewText(R.id.t_btn_label, Widgets.t("Start"))
        } else {
            v.setInt(R.id.t_root, "setBackgroundResource", R.drawable.widget_hero_full)
            v.setViewVisibility(R.id.t_idle, View.GONE)
            v.setViewVisibility(R.id.t_run, View.VISIBLE)
            v.setTextViewText(R.id.t_run_title, Widgets.t("Tracking"))
            v.setChronometer(R.id.t_clock, SystemClock.elapsedRealtime() - (System.currentTimeMillis() - running.start), null, true)
            v.setTextViewText(R.id.t_project, repo.projects.get(running.projectId)?.name ?: running.note.ifBlank { " " })
            v.setInt(R.id.t_btn, "setBackgroundResource", R.drawable.widget_hero_chip)
            v.setImageViewResource(R.id.t_btn_icon, R.drawable.ic_w_stop)
            v.setTextViewText(R.id.t_btn_label, Widgets.t("Stop"))
        }
        return v
    }
}
