package com.carrotnote.app.ui

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

object Fmt {
    private val amountFormat = DecimalFormat("#,##0.##", DecimalFormatSymbols(Locale.US))
    private val dayFull = DateTimeFormatter.ofPattern("EEE, d MMM yyyy", Locale.getDefault())
    private val dayShort = DateTimeFormatter.ofPattern("d MMM", Locale.getDefault())
    private val monthFmt = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.getDefault())
    private val timeFmt = DateTimeFormatter.ofPattern("h:mm a", Locale.getDefault())

    fun amount(v: Double): String = amountFormat.format(v)

    fun money(v: Double, currency: String): String = "${amount(v)} $currency"

    /** "1,200 USD · 300 EGP" — totals that may be in several currencies. */
    fun totals(map: Map<String, Double>, fallbackCurrency: String): String {
        val nonZero = map.filterValues { kotlin.math.abs(it) > 0.0001 }
        if (nonZero.isEmpty()) return money(0.0, fallbackCurrency)
        return nonZero.entries
            .sortedByDescending { if (it.key == fallbackCurrency) Double.MAX_VALUE else kotlin.math.abs(it.value) }
            .joinToString(" · ") { money(it.value, it.key) }
    }

    fun today(): Long = LocalDate.now().toEpochDay()

    fun date(epochDay: Long): String = LocalDate.ofEpochDay(epochDay).format(dayFull)
    fun dateShort(epochDay: Long): String = LocalDate.ofEpochDay(epochDay).format(dayShort)
    fun month(d: LocalDate): String = d.format(monthFmt)

    fun relativeDay(epochDay: Long): String {
        val diff = epochDay - today()
        return when (diff) {
            0L -> "Today"
            1L -> "Tomorrow"
            -1L -> "Yesterday"
            else -> date(epochDay)
        }
    }

    fun daysLeft(epochDay: Long): String {
        val diff = ChronoUnit.DAYS.between(LocalDate.now(), LocalDate.ofEpochDay(epochDay))
        return when {
            diff == 0L -> "due today"
            diff == 1L -> "due tomorrow"
            diff > 1 -> "$diff days left"
            diff == -1L -> "1 day overdue"
            else -> "${-diff} days overdue"
        }
    }

    fun time(minutes: Int): String = LocalTime.of(minutes / 60, minutes % 60).format(timeFmt)

    fun parseAmount(s: String): Double? = s.replace(",", "").trim().toDoubleOrNull()
}
