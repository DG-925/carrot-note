package com.carrotnote.app.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.carrotnote.app.Graph
import com.carrotnote.app.R
import com.carrotnote.app.data.Repository
import com.carrotnote.app.data.TxnKind
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.time.LocalDate
import kotlin.math.roundToInt

/** "Targets": this month's targets with progress bars (the same numbers as Money → Targets). */
class TargetsWidget : CarrotWidget() {

    private val slots = intArrayOf(R.id.g1_slot, R.id.g2_slot, R.id.g3_slot)
    private val labels = intArrayOf(R.id.g1_label, R.id.g2_label, R.id.g3_label)
    private val values = intArrayOf(R.id.g1_value, R.id.g2_value, R.id.g3_value)
    private val bars = intArrayOf(R.id.g1_bar, R.id.g2_bar, R.id.g3_bar)

    private val metricLabel = mapOf("income" to "Income", "profit" to "Profit", "sold" to "Pieces sold", "clients" to "New clients", "hours" to "Hours worked")

    override fun build(context: Context, manager: AppWidgetManager, widgetId: Int): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.widget_targets)
        val (_, height) = Widgets.sizeOf(manager, widgetId, 300, 180)
        val today = LocalDate.now()
        v.setOnClickPendingIntent(R.id.tg_root, Widgets.openApp(context, "targets", 9910))
        v.setTextViewText(R.id.tg_title, Widgets.t("This month's targets"))
        v.setTextViewText(R.id.tg_day, Widgets.t("Day") + " ${today.dayOfMonth} " + Widgets.t("of") + " ${today.lengthOfMonth()}")
        val repo = Graph.repoOrNull
        val list = repo?.targets?.value.orEmpty()
        val fit = ((height - 28 - 24) / 34).coerceIn(1, slots.size)
        slots.forEachIndexed { i, slot ->
            val t = list.getOrNull(i)?.takeIf { i < fit }
            v.setViewVisibility(slot, if (t == null || repo == null) View.GONE else View.VISIBLE)
            if (t == null || repo == null) return@forEachIndexed
            val metric = t.str("metric") ?: "income"
            val currency = t.str("currency") ?: Graph.settings.currency.value
            val amount = t["amount"]?.jsonPrimitive?.doubleOrNull ?: 0.0
            val value = progress(repo, metric, currency, today)
            val pct = if (amount > 0) ((value / amount) * 100).roundToInt() else 0
            v.setTextViewText(labels[i], Widgets.t(metricLabel[metric] ?: "Income"))
            val money = metric == "income" || metric == "profit"
            val shown = when {
                money -> Widgets.short(value) + " / " + Widgets.short(amount) + " " + currency
                metric == "hours" -> String.format(java.util.Locale.US, "%.1f / %s h", value, Widgets.number(amount))
                else -> "${value.roundToInt()} / ${Widgets.number(amount)}"
            }
            v.setTextViewText(values[i], if (pct >= 100) "$shown · 🎉" else shown)
            v.setProgressBar(bars[i], 100, pct.coerceIn(0, 100), false)
        }
        v.setViewVisibility(R.id.tg_empty, if (list.isEmpty()) View.VISIBLE else View.GONE)
        v.setTextViewText(R.id.tg_empty, Widgets.t(if (repo == null) "Open Carrot Note to sign in" else "Set targets in the app: Money → Targets"))
        return v
    }

    /** This month's number for a target, counted like the app does. */
    private fun progress(repo: Repository, metric: String, currency: String, today: LocalDate): Double {
        val start = today.withDayOfMonth(1).toEpochDay()
        val end = today.toEpochDay()
        val tx = repo.txns.value.filter { it.date in start..end && it.currency == currency }
        return when (metric) {
            "income" -> tx.filter { it.kind == TxnKind.INCOME }.sumOf { it.amount }
            "profit" -> tx.sumOf { if (it.kind == TxnKind.INCOME) it.amount else -it.amount }
            "sold" -> repo.items.value.sumOf { item ->
                (item["moves"] as? JsonArray).orEmpty().sumOf { m ->
                    val move = m as? JsonObject
                    val date = move?.get("date")?.jsonPrimitive?.longOrNull ?: 0
                    if (move?.str("kind") == "sell" && date >= start) move["qty"]?.jsonPrimitive?.doubleOrNull ?: 0.0 else 0.0
                }
            }
            "clients" -> repo.customers.value.count { Widgets.dayOf(it.createdAt) >= start }.toDouble()
            "hours" -> repo.time.value.filter { Widgets.dayOf(it.start) >= start }.sumOf { it.durationMs() } / 3_600_000.0
            else -> 0.0
        }
    }

    private fun JsonObject.str(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull
}
