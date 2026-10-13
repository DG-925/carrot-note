package com.carrotnote.app.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.carrotnote.app.Graph
import com.carrotnote.app.R
import com.carrotnote.app.data.DebtDirection
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive

/** "Owed to you": unpaid invoices and debts in the main currency, and what you owe. */
class OwedWidget : CarrotWidget() {

    private val rows = intArrayOf(R.id.o_row1, R.id.o_row2, R.id.o_row3)
    private val whos = intArrayOf(R.id.o_who1, R.id.o_who2, R.id.o_who3)
    private val amts = intArrayOf(R.id.o_amt1, R.id.o_amt2, R.id.o_amt3)

    override fun build(context: Context, manager: AppWidgetManager, widgetId: Int): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.widget_owed)
        val (_, height) = Widgets.sizeOf(manager, widgetId, 160, 170)
        v.setOnClickPendingIntent(R.id.o_root, Widgets.openApp(context, "debts", 9920))
        v.setTextViewText(R.id.o_title, Widgets.t("Owed to you"))
        val repo = Graph.repoOrNull
        if (repo == null) {
            v.setTextViewText(R.id.o_total, "—")
            v.setTextViewText(R.id.o_split, Widgets.t("Open Carrot Note to sign in"))
            v.setViewVisibility(R.id.o_rows, View.GONE)
            v.setViewVisibility(R.id.o_iowe, View.GONE)
            return v
        }
        val cur = Graph.settings.currency.value
        val owedDebts = repo.debts.value.filter { it.direction == DebtDirection.OWED_TO_ME && it.currency == cur && !it.settled && it.remaining > 0 }
        val invoices = repo.invoices.value.mapNotNull { inv ->
            val status = inv.str("status")
            if (status == "draft" || status == "cancelled" || inv.str("currency") != cur) return@mapNotNull null
            val total = inv["total"]?.jsonPrimitive?.doubleOrNull ?: 0.0
            val paid = (inv["payments"] as? JsonArray).orEmpty().sumOf { (it as? JsonObject)?.get("amount")?.jsonPrimitive?.doubleOrNull ?: 0.0 }
            val due = total - paid
            if (due <= 0.0001) null else Pair(listOfNotNull(inv.str("clientName")?.takeIf { it.isNotBlank() }, inv.str("number")).joinToString(" · "), due)
        }
        val people = (owedDebts.map { Pair(it.person, it.remaining) } + invoices).sortedByDescending { it.second }
        val fromInvoices = invoices.sumOf { it.second }
        val fromDebts = owedDebts.sumOf { it.remaining }
        val iOwe = repo.debts.value.filter { it.direction == DebtDirection.I_OWE && it.currency == cur && !it.settled }.sumOf { it.remaining }

        v.setTextViewText(R.id.o_total, Widgets.money(fromInvoices + fromDebts, cur))
        v.setTextViewText(R.id.o_split, if (people.isEmpty()) Widgets.t("Nobody owes you anything 🎉")
            else Widgets.t("Invoices") + " " + Widgets.short(fromInvoices) + " · " + Widgets.t("Debts") + " " + Widgets.short(fromDebts))
        // The names only fit on a taller widget.
        val fit = if (height < 160) 0 else ((height - 130) / 22).coerceIn(0, rows.size)
        v.setViewVisibility(R.id.o_rows, if (fit > 0 && people.isNotEmpty()) View.VISIBLE else View.GONE)
        rows.forEachIndexed { i, row ->
            val p = people.getOrNull(i)?.takeIf { i < fit }
            v.setViewVisibility(row, if (p == null) View.GONE else View.VISIBLE)
            if (p != null) { v.setTextViewText(whos[i], p.first); v.setTextViewText(amts[i], Widgets.short(p.second)) }
        }
        v.setViewVisibility(R.id.o_iowe, if (iOwe > 0) View.VISIBLE else View.GONE)
        v.setTextViewText(R.id.o_iowe, Widgets.t("You owe") + " " + Widgets.money(iOwe, cur))
        return v
    }

    private fun JsonObject.str(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull
}
