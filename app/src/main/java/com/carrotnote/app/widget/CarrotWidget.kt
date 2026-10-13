package com.carrotnote.app.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.widget.RemoteViews

/** A Carrot Note home-screen widget: [build] draws one placed widget at its current size. */
abstract class CarrotWidget : AppWidgetProvider() {

    abstract fun build(context: Context, manager: AppWidgetManager, widgetId: Int): RemoteViews

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { draw(context, manager, it) }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
        draw(context, manager, id)
    }

    /** Redraws every placed copy of this widget. */
    fun refreshAll(context: Context) {
        val manager = AppWidgetManager.getInstance(context) ?: return
        manager.getAppWidgetIds(ComponentName(context, javaClass)).forEach { draw(context, manager, it) }
    }

    private fun draw(context: Context, manager: AppWidgetManager, id: Int) {
        // One widget failing to draw must not stop the others.
        runCatching { manager.updateAppWidget(id, build(context, manager, id)) }
    }
}
