package com.carrotnote.app.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.carrotnote.app.Graph
import com.carrotnote.app.R
import java.time.LocalDate
import kotlin.math.roundToInt

/** "Savings goal": the unfinished goal closest to its deadline (or the newest one). */
class GoalWidget : CarrotWidget() {

    override fun build(context: Context, manager: AppWidgetManager, widgetId: Int): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.widget_goal)
        v.setOnClickPendingIntent(R.id.g_root, Widgets.openApp(context, "goals", 9900))
        v.setTextViewText(R.id.g_head, Widgets.t("Savings goal"))
        val goals = Graph.repoOrNull?.goals?.value.orEmpty()
        val goal = goals.filter { it.saved < it.target }.minWithOrNull(compareBy({ it.deadline ?: Long.MAX_VALUE }, { -it.createdAt }))
            ?: goals.maxByOrNull { it.createdAt }
        val parts = intArrayOf(R.id.g_saved, R.id.g_of, R.id.g_bar, R.id.g_foot)
        if (goal == null) {
            parts.forEach { v.setViewVisibility(it, View.GONE) }
            v.setTextViewText(R.id.g_name, Widgets.t(if (Graph.repoOrNull == null) "Open Carrot Note to sign in" else "No goals yet. Add one in Money → Goals"))
            return v
        }
        parts.forEach { v.setViewVisibility(it, View.VISIBLE) }
        val pct = if (goal.target > 0) ((goal.saved / goal.target) * 100).roundToInt() else 0
        v.setTextViewText(R.id.g_name, goal.name)
        v.setTextViewText(R.id.g_saved, Widgets.money(goal.saved, goal.currency))
        v.setTextViewText(R.id.g_of, Widgets.t("of") + " " + Widgets.money(goal.target, goal.currency))
        v.setProgressBar(R.id.g_bar, 100, pct.coerceIn(0, 100), false)
        val daysLeft = goal.deadline?.let { it - LocalDate.now().toEpochDay() }
        v.setTextViewText(R.id.g_foot, when {
            pct >= 100 -> Widgets.t("Reached 🎉")
            daysLeft != null && daysLeft >= 0 -> "$pct% · $daysLeft " + Widgets.t("days left")
            else -> "$pct%"
        })
        return v
    }
}
