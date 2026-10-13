package com.carrotnote.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.carrotnote.app.Graph
import com.carrotnote.app.MainActivity
import com.carrotnote.app.data.Repository
import com.carrotnote.app.data.TxnKind
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

/** Shared helpers for the home-screen widgets. */
object Widgets {

    /** Redraws every Carrot Note widget on the home screen. */
    fun refresh(context: Context) {
        TodayWidget.refresh(context)
        MoneyWidget.refresh(context)
    }

    /** Opens the app and runs one of its shortcuts ("expense", "task-open:<id>", …). */
    fun openApp(context: Context, shortcut: String, requestCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .setAction(Intent.ACTION_VIEW)
            // The data makes each widget button its own PendingIntent (extras alone don't).
            .setData(Uri.parse("carrot-widget://open/" + Uri.encode(shortcut)))
            .putExtra(MainActivity.EXTRA_SHORTCUT, shortcut)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    /** Width and height of a placed widget in dp (portrait), or a 4×3 guess when the launcher doesn't say. */
    fun sizeOf(manager: AppWidgetManager, id: Int, defaultW: Int, defaultH: Int): Pair<Int, Int> {
        val o = manager.getAppWidgetOptions(id)
        val w = o?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) ?: 0
        val h = o?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) ?: 0
        return Pair(if (w > 0) w else defaultW, if (h > 0) h else defaultH)
    }

    // ---- words

    val arabic: Boolean get() = Graph.settings.language == "ar"

    private val ar = mapOf(
        "so far" to "حتى الآن",
        "in" to "دخل",
        "out" to "خرج",
        "Timer" to "المؤقت",
        "Expense" to "مصروف",
        "Income" to "دخل",
        "Task" to "مهمة",
        "Nothing due today. Enjoy it 🥕" to "لا شيء مستحق اليوم. استمتع 🥕",
        "Open Carrot Note to sign in" to "افتح كاروت نوت لتسجيل الدخول",
        "Yesterday" to "أمس",
        "late" to "متأخرة",
        "more" to "أخرى",
        "task due" to "مهمة مستحقة",
        "tasks due" to "مهام مستحقة",
        "event today" to "موعد اليوم",
        "events today" to "مواعيد اليوم",
        "rental to renew" to "إيجار للتجديد",
        "rentals to renew" to "إيجارات للتجديد",
        "Tracking" to "يتم التتبع",
        "of" to "من",
        "target" to "الهدف",
        "Mark done" to "تم",
    )

    fun t(s: String): String = if (arabic) ar[s] ?: s else s

    private val locale: Locale get() = if (arabic) Locale("ar") else Locale.getDefault()

    fun monthName(d: LocalDate): String = d.month.getDisplayName(TextStyle.FULL, locale)

    /** "Tue, 13 Oct" (digits stay Western, like the app). */
    fun shortDate(d: LocalDate): String {
        val day = d.dayOfWeek.getDisplayName(TextStyle.SHORT, locale)
        val month = d.month.getDisplayName(TextStyle.SHORT, locale)
        return if (arabic) "$day، ${d.dayOfMonth} $month" else "$day, ${d.dayOfMonth} $month"
    }

    // ---- money

    private val whole = DecimalFormat("#,##0", DecimalFormatSymbols(Locale.US))
    private val cents = DecimalFormat("#,##0.##", DecimalFormatSymbols(Locale.US))

    fun number(v: Double): String = if (abs(v - v.roundToLong()) < 0.005) whole.format(v) else cents.format(v)

    /** "12,500 EGP", or dots when amounts are hidden. */
    fun money(v: Double, currency: String, sign: Boolean = false): String {
        if (Graph.settings.hideAmounts) return "•••• $currency"
        val s = number(abs(v))
        val prefix = if (v < 0) "−" else if (sign && v > 0) "+" else ""
        return "$prefix$s $currency"
    }

    /** "16,000" or "1.2M" for the small in/out labels. */
    fun short(v: Double): String {
        if (Graph.settings.hideAmounts) return "••••"
        val a = abs(v)
        return when {
            a >= 1_000_000 -> cents.format(Math.round(a / 100_000.0) / 10.0) + "M"
            a >= 100_000 -> whole.format(a / 1000) + "k"
            else -> number(a)
        }
    }

    class MonthMoney(val income: Double, val spent: Double, val currency: String) {
        val net: Double get() = income - spent
    }

    /** Money in and out this month, in the main currency. */
    fun monthMoney(repo: Repository): MonthMoney {
        val currency = Graph.settings.currency.value
        val today = LocalDate.now()
        val from = today.withDayOfMonth(1).toEpochDay()
        val to = today.toEpochDay()
        var income = 0.0
        var spent = 0.0
        for (t in repo.txns.value) {
            if (t.currency != currency || t.date < from || t.date > to) continue
            if (t.kind == TxnKind.INCOME) income += t.amount else if (t.kind == TxnKind.EXPENSE) spent += t.amount
        }
        return MonthMoney(income, spent, currency)
    }

    /** The monthly income (or profit) target in the main currency, if one is set: (amount, metric). */
    fun incomeTarget(repo: Repository): Pair<Double, String>? {
        val currency = Graph.settings.currency.value
        val list: List<JsonObject> = repo.targets.value
        for (metric in listOf("income", "profit")) {
            val t = list.firstOrNull {
                it["metric"]?.jsonPrimitive?.contentOrNull == metric && it["currency"]?.jsonPrimitive?.contentOrNull == currency
            } ?: continue
            val amount = t["amount"]?.jsonPrimitive?.doubleOrNull ?: continue
            if (amount > 0) return Pair(amount, metric)
        }
        return null
    }
}
