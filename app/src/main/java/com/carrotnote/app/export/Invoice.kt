package com.carrotnote.app.export

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import androidx.core.content.FileProvider
import com.carrotnote.app.Graph
import com.carrotnote.app.data.Billing
import com.carrotnote.app.data.Project
import com.carrotnote.app.data.TxnKind
import com.carrotnote.app.time.TimeTracker
import com.carrotnote.app.util.Fmt
import java.io.File
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/** Builds a one-page PDF invoice for a project and opens the share sheet. */
object Invoice {
    private const val W = 595
    private const val H = 842
    private const val M = 44f

    fun share(context: Context, project: Project) {
        val file = create(context, project)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        Graph.lock.suppressNextLock()
        context.startActivity(
            Intent.createChooser(
                Intent(Intent.ACTION_SEND).setType("application/pdf")
                    .putExtra(Intent.EXTRA_STREAM, uri)
                    .putExtra(Intent.EXTRA_SUBJECT, "Invoice – ${project.name}")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
                "Share invoice",
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }

    fun create(context: Context, project: Project): File {
        val repo = Graph.repo
        val user = Graph.session.user.value
        val customer = repo.customers.get(project.customerId)
        val payments = repo.txns.value.filter { it.projectId == project.id && it.kind == TxnKind.INCOME && it.currency == project.currency }
            .sortedBy { it.date }
        val hoursMs = repo.time.value.filter { it.projectId == project.id }.sumOf { it.durationMs() }
        val hourly = project.billing == Billing.HOURLY
        val hours = TimeTracker.hours(hoursMs)
        val total = if (hourly) hours * project.hourlyRate else project.price
        val paid = payments.sumOf { it.amount }
        val due = (total - paid).coerceAtLeast(0.0)
        val today = LocalDate.now()
        val number = "INV-" + today.format(DateTimeFormatter.BASIC_ISO_DATE) + "-" + project.id.take(4).uppercase()

        val doc = PdfDocument()
        val page = doc.startPage(PdfDocument.PageInfo.Builder(W, H, 1).create())
        val c = page.canvas
        val orange = Color.rgb(255, 107, 31)
        val ink = Color.rgb(28, 26, 24)
        val muted = Color.rgb(120, 112, 105)
        fun paint(size: Float, color: Int = ink, bold: Boolean = false, mono: Boolean = false) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = size
            this.color = color
            typeface = Typeface.create(if (mono) Typeface.MONOSPACE else Typeface.SANS_SERIF, if (bold) Typeface.BOLD else Typeface.NORMAL)
        }
        fun right(text: String, x: Float, y: Float, p: Paint) = c.drawText(text, x - p.measureText(text), y, p)

        // Header band
        c.drawRect(0f, 0f, W.toFloat(), 120f, Paint().apply { color = orange })
        c.drawText("INVOICE", M, 66f, paint(30f, Color.WHITE, bold = true))
        c.drawText(number, M, 92f, paint(11f, Color.WHITE, mono = true))
        right(user?.name?.ifBlank { null } ?: user?.username ?: "", W - M, 60f, paint(14f, Color.WHITE, bold = true))
        right(user?.email.orEmpty(), W - M, 80f, paint(10f, Color.WHITE))
        user?.username?.takeIf { it.isNotBlank() }?.let { right("@$it", W - M, 96f, paint(10f, Color.WHITE)) }

        var y = 160f
        c.drawText("BILL TO", M, y, paint(9f, muted, bold = true))
        c.drawText("DATE", 330f, y, paint(9f, muted, bold = true))
        y += 18f
        c.drawText((customer?.name ?: project.clientName).ifBlank { "—" }, M, y, paint(13f, bold = true))
        c.drawText(Fmt.date(today.toEpochDay()), 330f, y, paint(12f))
        y += 16f
        listOfNotNull(customer?.company?.ifBlank { null }, customer?.email?.ifBlank { null }, customer?.phone?.ifBlank { null }).forEach {
            c.drawText(it, M, y, paint(10f, muted)); y += 14f
        }
        project.deadline?.let { c.drawText("Project deadline: " + Fmt.date(it), 330f, 194f, paint(10f, muted)) }

        // Line items table
        y = maxOf(y, 230f) + 20f
        c.drawRect(M, y - 14f, W - M, y + 8f, Paint().apply { color = Color.rgb(248, 240, 232) })
        c.drawText("DESCRIPTION", M + 8, y, paint(9f, muted, bold = true))
        right("QTY", 380f, y, paint(9f, muted, bold = true))
        right("RATE", 465f, y, paint(9f, muted, bold = true))
        right("AMOUNT", W - M - 8, y, paint(9f, muted, bold = true))
        y += 30f
        val qty = if (hourly) "%.2f h".format(hours) else "1"
        val rate = if (hourly) Fmt.amount(project.hourlyRate) else Fmt.amount(project.price)
        c.drawText(project.name, M + 8, y, paint(12f, bold = true))
        right(qty, 380f, y, paint(11f, mono = true))
        right(rate, 465f, y, paint(11f, mono = true))
        right(Fmt.money(total, project.currency), W - M - 8, y, paint(11f, mono = true, bold = true))
        if (project.description.isNotBlank()) {
            y += 15f
            project.description.take(160).chunked(70).take(2).forEach { c.drawText(it, M + 8, y, paint(9.5f, muted)); y += 13f }
        }
        y += 14f
        c.drawLine(M, y, W - M, y, Paint().apply { color = Color.rgb(230, 222, 214); strokeWidth = 1f })

        // Payments
        if (payments.isNotEmpty()) {
            y += 26f
            c.drawText("PAYMENTS RECEIVED", M + 8, y, paint(9f, muted, bold = true))
            payments.take(10).forEach { t ->
                y += 18f
                c.drawText(Fmt.date(t.date) + " · " + t.method, M + 8, y, paint(10.5f))
                right("− " + Fmt.money(t.amount, t.currency), W - M - 8, y, paint(10.5f, mono = true))
            }
        }

        // Totals box
        y += 40f
        val box = RectF(310f, y, W - M, y + 92f)
        c.drawRoundRect(box, 10f, 10f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(250, 246, 242) })
        c.drawText("Total", 326f, y + 24f, paint(11f, muted))
        right(Fmt.money(total, project.currency), W - M - 14, y + 24f, paint(11f, mono = true))
        c.drawText("Paid", 326f, y + 44f, paint(11f, muted))
        right(Fmt.money(paid, project.currency), W - M - 14, y + 44f, paint(11f, mono = true))
        c.drawText("Balance due", 326f, y + 74f, paint(13f, bold = true))
        right(Fmt.money(due, project.currency), W - M - 14, y + 74f, paint(15f, orange, bold = true, mono = true))

        // Footer
        c.drawText("Thank you for your business!", M, H - 60f, paint(11f, ink, bold = true))
        c.drawText("Generated with Carrot Note", M, H - 42f, paint(9f, muted))

        doc.finishPage(page)
        val dir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(dir, "$number.pdf")
        file.outputStream().use { doc.writeTo(it) }
        doc.close()
        return file
    }
}
