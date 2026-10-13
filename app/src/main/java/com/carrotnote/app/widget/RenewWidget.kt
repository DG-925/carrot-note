package com.carrotnote.app.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.carrotnote.app.Graph
import com.carrotnote.app.R
import java.time.LocalDate

/** "Renew soon": active rentals in order of when they run out, with the days left. */
class RenewWidget : CarrotWidget() {

    private val rows = intArrayOf(R.id.r_row1, R.id.r_row2, R.id.r_row3, R.id.r_row4, R.id.r_row5)
    private val names = intArrayOf(R.id.r_name1, R.id.r_name2, R.id.r_name3, R.id.r_name4, R.id.r_name5)
    private val subs = intArrayOf(R.id.r_sub1, R.id.r_sub2, R.id.r_sub3, R.id.r_sub4, R.id.r_sub5)
    private val lefts = intArrayOf(R.id.r_left1, R.id.r_left2, R.id.r_left3, R.id.r_left4, R.id.r_left5)
    private val lates = intArrayOf(R.id.r_late1, R.id.r_late2, R.id.r_late3, R.id.r_late4, R.id.r_late5)

    override fun build(context: Context, manager: AppWidgetManager, widgetId: Int): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.widget_renew)
        val (_, height) = Widgets.sizeOf(manager, widgetId, 300, 180)
        val today = LocalDate.now().toEpochDay()
        v.setOnClickPendingIntent(R.id.r_root, Widgets.openApp(context, "rentals", 9800))
        v.setTextViewText(R.id.r_title, Widgets.t("Renew soon"))
        val repo = Graph.repoOrNull
        val active = repo?.rentals?.value.orEmpty().filter { it.status == "active" }
        val list = active.filter { it.expiryDate != null }.sortedBy { it.expiryDate }
        v.setTextViewText(R.id.r_count, if (active.isEmpty()) "" else "${active.size} " + Widgets.t("active"))
        val fit = ((height - 24 - 24) / 44).coerceIn(1, rows.size)
        rows.forEachIndexed { i, row ->
            val r = list.getOrNull(i)?.takeIf { i < fit }
            v.setViewVisibility(row, if (r == null) View.GONE else View.VISIBLE)
            if (r == null) return@forEachIndexed
            v.setTextViewText(names[i], r.name.ifBlank { r.clientName })
            v.setTextViewText(subs[i], listOf(r.clientName, Widgets.money(r.price, r.priceCurrency)).filter { it.isNotBlank() }.joinToString(" · "))
            val left = (r.expiryDate ?: today) - today
            v.setViewVisibility(lefts[i], if (left > 0) View.VISIBLE else View.GONE)
            v.setViewVisibility(lates[i], if (left > 0) View.GONE else View.VISIBLE)
            v.setTextViewText(lefts[i], "${left}d")
            v.setTextViewText(lates[i], Widgets.t(if (left == 0L) "Today" else "Expired"))
            v.setOnClickPendingIntent(row, Widgets.openApp(context, "rental-open:" + r.id, 9810 + i))
        }
        v.setViewVisibility(R.id.r_empty, if (list.isEmpty()) View.VISIBLE else View.GONE)
        v.setTextViewText(R.id.r_empty, Widgets.t(if (repo == null) "Open Carrot Note to sign in" else "No rentals yet"))
        return v
    }
}
