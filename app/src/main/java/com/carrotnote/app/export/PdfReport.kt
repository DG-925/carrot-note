package com.carrotnote.app.export

import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import androidx.core.content.FileProvider
import com.carrotnote.app.Graph
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File

/**
 * Draws a simple A4 PDF from a document the web UI describes, and shares it. Used for invoices
 * and the yearly report.
 *
 * ```
 * { file, title, subtitle, headerRight: [..], footer,
 *   blocks: [ {type:"columns", left:{label, lines:[..]}, right:{label, lines:[..]}},
 *             {type:"heading", text}, {type:"text", text},
 *             {type:"table", columns:[{title, weight, align}], rows:[[..]], muted?:[rowIndex]},
 *             {type:"totals", rows:[[label, value, strong?]]} ] }
 * ```
 */
object PdfReport {
    private const val W = 595
    private const val H = 842
    private const val M = 44f

    private val orange = Color.rgb(255, 107, 31)
    private val ink = Color.rgb(28, 26, 24)
    private val muted = Color.rgb(120, 112, 105)
    private val line = Color.rgb(230, 222, 214)
    private val soft = Color.rgb(250, 245, 240)

    private fun paint(size: Float, color: Int = ink, bold: Boolean = false) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = size
        this.color = color
        typeface = Typeface.create(Typeface.SANS_SERIF, if (bold) Typeface.BOLD else Typeface.NORMAL)
    }

    private fun JsonObject.s(k: String) = this[k]?.jsonPrimitive?.contentOrNull.orEmpty()
    private fun JsonObject.list(k: String): List<String> = (this[k] as? JsonArray)?.map { it.jsonPrimitive.contentOrNull.orEmpty() }.orEmpty()

    /** Cuts [text] into lines no wider than [width]. */
    private fun wrap(text: String, p: Paint, width: Float): List<String> {
        val out = ArrayList<String>()
        text.split('\n').forEach { para ->
            var cur = ""
            para.split(' ').forEach { word ->
                val next = if (cur.isEmpty()) word else "$cur $word"
                if (p.measureText(next) <= width || cur.isEmpty()) cur = next else { out += cur; cur = word }
            }
            out += cur
        }
        return out
    }

    fun create(context: Context, doc: JsonObject): File {
        val pdf = PdfDocument()
        var pageNo = 0
        lateinit var page: PdfDocument.Page
        lateinit var c: Canvas
        var y = 0f

        fun footer() {
            val f = doc.s("footer")
            if (f.isNotBlank()) c.drawText(f, M, H - 30f, paint(9f, muted))
            val n = "Page $pageNo"
            c.drawText(n, W - M - paint(9f, muted).measureText(n), H - 30f, paint(9f, muted))
        }

        fun newPage() {
            if (pageNo > 0) { footer(); pdf.finishPage(page) }
            pageNo++
            page = pdf.startPage(PdfDocument.PageInfo.Builder(W, H, pageNo).create())
            c = page.canvas
            if (pageNo == 1) {
                c.drawRect(0f, 0f, W.toFloat(), 118f, Paint().apply { color = orange })
                c.drawText(doc.s("title"), M, 62f, paint(28f, Color.WHITE, bold = true))
                c.drawText(doc.s("subtitle"), M, 88f, paint(11f, Color.WHITE))
                var ry = 50f
                doc.list("headerRight").forEachIndexed { i, t ->
                    val p = paint(if (i == 0) 13f else 10f, Color.WHITE, bold = i == 0)
                    c.drawText(t, W - M - p.measureText(t), ry, p); ry += if (i == 0) 18f else 14f
                }
                y = 150f
            } else {
                c.drawRect(0f, 0f, W.toFloat(), 8f, Paint().apply { color = orange })
                y = 50f
            }
        }

        fun need(h: Float) { if (y + h > H - 60f) newPage() }

        newPage()
        (doc["blocks"] as? JsonArray).orEmpty().forEach { el ->
            val b = el.jsonObject
            when (b.s("type")) {
                "columns" -> {
                    val cols = listOfNotNull(b["left"]?.jsonObject, b["right"]?.jsonObject)
                    val top = y
                    var bottom = y
                    cols.forEachIndexed { i, col ->
                        val x = if (i == 0) M else W / 2f + 20f
                        var cy = top
                        c.drawText(col.s("label").uppercase(), x, cy, paint(9f, muted, bold = true)); cy += 18f
                        col.list("lines").forEachIndexed { j, t ->
                            c.drawText(t, x, cy, if (j == 0) paint(13f, bold = true) else paint(10.5f, muted)); cy += if (j == 0) 17f else 14f
                        }
                        bottom = maxOf(bottom, cy)
                    }
                    y = bottom + 16f
                }
                "heading" -> {
                    need(40f)
                    y += 10f
                    c.drawText(b.s("text"), M, y, paint(14f, bold = true)); y += 18f
                }
                "text" -> {
                    val p = paint(10.5f, muted)
                    wrap(b.s("text"), p, W - 2 * M).forEach { t -> need(16f); c.drawText(t, M, y, p); y += 14f }
                    y += 6f
                }
                "table" -> {
                    val cols = b["columns"]?.jsonArray?.map { it.jsonObject }.orEmpty()
                    val weights = cols.map { it["weight"]?.jsonPrimitive?.doubleOrNull ?: 1.0 }
                    val total = weights.sum().takeIf { it > 0 } ?: 1.0
                    val widths = weights.map { (it / total * (W - 2 * M - 16)).toFloat() }
                    fun xs(i: Int) = M + 8 + widths.take(i).sum()
                    fun cell(text: String, i: Int, yy: Float, p: Paint) {
                        val right = cols[i].s("align") == "right"
                        var t = text
                        while (t.length > 1 && p.measureText(t) > widths[i] - 6) t = t.dropLast(2) + "…"
                        c.drawText(t, if (right) xs(i) + widths[i] - p.measureText(t) else xs(i), yy, p)
                    }
                    fun header() {
                        need(40f)
                        c.drawRect(M, y - 14f, W - M, y + 8f, Paint().apply { color = soft })
                        cols.forEachIndexed { i, col -> cell(col.s("title").uppercase(), i, y, paint(8.5f, muted, bold = true)) }
                        y += 26f
                    }
                    header()
                    val mutedRows = (b["muted"] as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull?.toIntOrNull() }.orEmpty().toSet()
                    b["rows"]?.jsonArray?.forEachIndexed { r, row ->
                        if (y + 20f > H - 60f) { newPage(); header() }
                        row.jsonArray.forEachIndexed { i, v ->
                            if (i < cols.size) cell(v.jsonPrimitive.contentOrNull.orEmpty(), i, y, paint(10.5f, if (r in mutedRows) muted else ink, bold = i == 0 && r !in mutedRows))
                        }
                        y += 8f
                        c.drawLine(M, y, W - M, y, Paint().apply { color = line; strokeWidth = 0.8f })
                        y += 14f
                    }
                    y += 8f
                }
                "totals" -> {
                    val rows = b["rows"]?.jsonArray?.map { it.jsonArray }.orEmpty()
                    val h = rows.size * 20f + 24f
                    need(h + 10f)
                    c.drawRoundRect(RectF(300f, y, W - M, y + h), 10f, 10f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = soft })
                    var ty = y + 22f
                    rows.forEach { r ->
                        val strong = r.getOrNull(2)?.jsonPrimitive?.booleanOrNull == true
                        val label = r.getOrNull(0)?.jsonPrimitive?.contentOrNull.orEmpty()
                        val value = r.getOrNull(1)?.jsonPrimitive?.contentOrNull.orEmpty()
                        c.drawText(label, 316f, ty, paint(if (strong) 12.5f else 11f, if (strong) ink else muted, bold = strong))
                        val vp = paint(if (strong) 14f else 11f, if (strong) orange else ink, bold = strong)
                        c.drawText(value, W - M - 14 - vp.measureText(value), ty, vp)
                        ty += 20f
                    }
                    y += h + 16f
                }
            }
        }
        footer()
        pdf.finishPage(page)
        val dir = File(context.cacheDir, "exports").apply { mkdirs() }
        val name = doc.s("file").ifBlank { "carrot-note" }.replace(Regex("[^A-Za-z0-9._-]"), "_")
        val file = File(dir, "$name.pdf")
        file.outputStream().use { pdf.writeTo(it) }
        pdf.close()
        return file
    }

    fun share(context: Context, file: File, subject: String) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        Graph.lock.suppressNextLock()
        context.startActivity(
            Intent.createChooser(
                Intent(Intent.ACTION_SEND).setType("application/pdf")
                    .putExtra(Intent.EXTRA_STREAM, uri)
                    .putExtra(Intent.EXTRA_SUBJECT, subject)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
                "Share PDF",
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}
