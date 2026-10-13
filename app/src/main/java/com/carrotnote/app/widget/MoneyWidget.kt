package com.carrotnote.app.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import com.carrotnote.app.Graph
import com.carrotnote.app.R
import java.time.LocalDate
import kotlin.math.roundToInt

/** The small "Money" home-screen widget: this month's money, the income target and quick add. */
class MoneyWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { manager.updateAppWidget(it, build(context, manager, it)) }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
        manager.updateAppWidget(id, build(context, manager, id))
    }

    companion object {
        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context) ?: return
            val ids = manager.getAppWidgetIds(ComponentName(context, MoneyWidget::class.java))
            ids.forEach { manager.updateAppWidget(it, build(context, manager, it)) }
        }

        private fun build(context: Context, manager: AppWidgetManager, widgetId: Int): RemoteViews {
            val v = RemoteViews(context.packageName, R.layout.widget_money)
            val (width, height) = Widgets.sizeOf(manager, widgetId, 160, 170)
            val today = LocalDate.now()
            v.setOnClickPendingIntent(R.id.m_root, Widgets.openApp(context, "money", 9400))
            v.setOnClickPendingIntent(R.id.m_add_expense, Widgets.openApp(context, "expense", 9401))
            v.setOnClickPendingIntent(R.id.m_add_income, Widgets.openApp(context, "income", 9402))
            v.setTextViewText(R.id.m_add_expense_label, Widgets.t("Expense"))
            v.setTextViewText(R.id.m_add_income_label, Widgets.t("Income"))
            val labels = if (width < 150) View.GONE else View.VISIBLE
            v.setViewVisibility(R.id.m_add_expense_label, labels)
            v.setViewVisibility(R.id.m_add_income_label, labels)
            v.setTextViewText(R.id.m_month, Widgets.monthName(today) + " " + Widgets.t("so far"))

            val repo = Graph.repoOrNull
            if (repo == null) {
                v.setTextViewText(R.id.m_net, "Carrot Note")
                v.setTextViewText(R.id.m_inout, Widgets.t("Open Carrot Note to sign in"))
                v.setViewVisibility(R.id.m_target, View.GONE)
                return v
            }
            val m = Widgets.monthMoney(repo)
            v.setTextViewText(R.id.m_net, Widgets.money(m.net, m.currency, sign = true))
            v.setTextViewText(R.id.m_inout, "↓ " + Widgets.short(m.income) + "   ↑ " + Widgets.short(m.spent))

            // Progress towards this month's income (or profit) target, when there's room for it.
            val target = Widgets.incomeTarget(repo)
            if (target == null || height < 150) {
                v.setViewVisibility(R.id.m_target, View.GONE)
            } else {
                val (amount, metric) = target
                val value = if (metric == "profit") m.net else m.income
                val pct = ((value / amount) * 100).roundToInt().coerceAtLeast(0)
                v.setViewVisibility(R.id.m_target, View.VISIBLE)
                v.setProgressBar(R.id.m_target_bar, 100, pct.coerceAtMost(100), false)
                v.setTextViewText(R.id.m_target_text, if (pct >= 100) "🎉 $pct% · " + Widgets.short(amount) else "$pct% " + Widgets.t("of") + " " + Widgets.short(amount) + " " + Widgets.t("target"))
            }
            return v
        }
    }
}
