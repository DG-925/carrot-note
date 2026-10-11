@file:OptIn(ExperimentalMaterial3Api::class)

package com.carrotnote.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseOutCubic
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carrotnote.app.data.ProjectStatus
import com.carrotnote.app.profile.Avatars
import com.carrotnote.app.ui.Fmt
import com.carrotnote.app.ui.theme.Bento
import com.carrotnote.app.ui.theme.HeroBrush
import com.carrotnote.app.ui.theme.Ico
import com.carrotnote.app.ui.theme.IncomeGreen
import com.carrotnote.app.ui.theme.NumFont
import compose.icons.FontAwesomeIcons
import compose.icons.fontawesomeicons.Solid
import compose.icons.fontawesomeicons.solid.Ban
import compose.icons.fontawesomeicons.solid.CheckCircle
import compose.icons.fontawesomeicons.solid.PauseCircle
import compose.icons.fontawesomeicons.solid.PlayCircle

/** Profile picture, or initials on orange when there is none. */
@Composable
fun Avatar(userId: String?, avatarRev: Int, name: String, size: Dp, modifier: Modifier = Modifier, ring: Boolean = false) {
    val ctx = LocalContext.current
    val bitmap by produceState<androidx.compose.ui.graphics.ImageBitmap?>(null, userId, avatarRev) {
        value = if (userId == null) null else Avatars.load(ctx, userId, avatarRev)
    }
    val base = modifier
        .size(size)
        .then(if (ring) Modifier.border(2.dp, MaterialTheme.colorScheme.primary, CircleShape).padding(3.dp) else Modifier)
        .clip(CircleShape)
    val bmp = bitmap
    if (bmp != null) {
        Image(bmp, null, base, contentScale = ContentScale.Crop)
    } else {
        val initials = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2)
            .joinToString("") { it.first().uppercase() }.ifBlank { "?" }
        Box(base.background(HeroBrush), contentAlignment = Alignment.Center) {
            Text(initials, color = Color.White, fontWeight = FontWeight.ExtraBold, fontFamily = NumFont, fontSize = (size.value * 0.36f).sp)
        }
    }
}

/** Overlapping row of member avatars. */
@Composable
fun AvatarStack(people: List<Triple<String, Int, String>>, size: Dp = 30.dp, max: Int = 4) {
    Row(horizontalArrangement = Arrangement.spacedBy(-(size * 0.3f))) {
        people.take(max).forEach { (id, rev, name) ->
            Avatar(id, rev, name, size, Modifier.border(2.dp, Bento.colors.card, CircleShape))
        }
        if (people.size > max) {
            Box(
                Modifier.padding(start = 2.dp).size(size).clip(CircleShape).background(Bento.colors.track),
                contentAlignment = Alignment.Center,
            ) { Text("+${people.size - max}", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold) }
        }
    }
}

fun statusColor(status: String, primary: Color, error: Color, other: Color): Color = when (status) {
    ProjectStatus.ACTIVE -> primary
    ProjectStatus.DONE -> IncomeGreen
    ProjectStatus.CANCELLED -> error
    else -> other
}

fun statusIcon(status: String): ImageVector = when (status) {
    ProjectStatus.ACTIVE -> FontAwesomeIcons.Solid.PlayCircle
    ProjectStatus.DONE -> FontAwesomeIcons.Solid.CheckCircle
    ProjectStatus.CANCELLED -> FontAwesomeIcons.Solid.Ban
    else -> FontAwesomeIcons.Solid.PauseCircle
}

/** Drop-down for a project's status, each option with its color and icon. */
@Composable
fun StatusDropdown(status: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    var expanded by remember { mutableStateOf(false) }
    val cs = MaterialTheme.colorScheme
    val color = statusColor(status, cs.primary, cs.error, cs.tertiary)
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }, modifier = modifier) {
        TextField(
            value = ProjectStatus.label(status),
            onValueChange = {},
            readOnly = true,
            label = { Text("Status") },
            singleLine = true,
            leadingIcon = { Icon(statusIcon(status), null, Modifier.size(18.dp), tint = color) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
            shape = FieldShape,
            colors = fieldColors(),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            ProjectStatus.all.forEach { s ->
                val c = statusColor(s, cs.primary, cs.error, cs.tertiary)
                DropdownMenuItem(
                    text = { Text(ProjectStatus.label(s), fontWeight = if (s == status) FontWeight.Bold else FontWeight.Normal) },
                    leadingIcon = { Icon(statusIcon(s), null, Modifier.size(18.dp), tint = c) },
                    trailingIcon = if (s == status) ({ Icon(Ico.Check, null, Modifier.size(14.dp), tint = cs.primary) }) else null,
                    onClick = { onChange(s); expanded = false },
                )
            }
        }
    }
}

/** Segmented tabs with a pill that springs to the selected option. */
@Composable
fun Segmented(options: List<Pair<String, ImageVector?>>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val b = Bento.colors
    val cs = MaterialTheme.colorScheme
    val track = if (LocalInCard.current) cs.background else b.card
    val pill = if (b.dark) cs.primary else b.ink
    BoxWithConstraints(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(track)
            .padding(4.dp),
    ) {
        val n = options.size.coerceAtLeast(1)
        val w = maxWidth / n
        val x by animateDpAsState(w * selected.coerceIn(0, n - 1), spring(dampingRatio = 0.62f, stiffness = 420f), label = "segment")
        Box(Modifier.offset(x = x).width(w).height(42.dp).clip(RoundedCornerShape(16.dp)).background(pill))
        Row(Modifier.fillMaxWidth()) {
            options.forEachIndexed { i, (label, icon) ->
                val sel = i == selected
                val color by animateColorAsState(if (sel) Color.White else cs.onSurfaceVariant, tween(200), label = "segmentText")
                Row(
                    Modifier
                        .weight(1f)
                        .height(42.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .clickable { onSelect(i) },
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (icon != null) {
                        Icon(icon, null, Modifier.size(13.dp), tint = color)
                        Spacer(Modifier.width(7.dp))
                    }
                    Text(label, color = color, style = MaterialTheme.typography.labelLarge, fontWeight = if (sel) FontWeight.Bold else FontWeight.Medium, maxLines = 1)
                }
            }
        }
    }
}

/** Small numeric badge (e.g. pending invitations). */
@Composable
fun CountBadge(n: Int, modifier: Modifier = Modifier) {
    if (n <= 0) return
    Box(
        modifier.clip(CircleShape).background(MaterialTheme.colorScheme.primary).padding(horizontal = 6.dp, vertical = 1.dp),
        contentAlignment = Alignment.Center,
    ) { Text(if (n > 99) "99+" else "$n", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = NumFont) }
}

// ---------------------------------------------------------------- charts

/**
 * Daily spending columns for one month. Columns rise from the baseline one after another;
 * today is orange; tap a column to read it.
 */
@Composable
fun DailyBars(values: List<Double>, todayIndex: Int, currency: String, modifier: Modifier = Modifier) {
    var selected by remember(values) { mutableStateOf(if (todayIndex in values.indices) todayIndex else values.indexOfLast { it > 0 }) }
    val grow = remember { Animatable(0f) }
    LaunchedEffect(Unit) { grow.animateTo(1f, tween(900, easing = EaseOutCubic)) }
    val max = (values.maxOrNull() ?: 0.0).coerceAtLeast(1.0)
    val accent = MaterialTheme.colorScheme.primary
    val dim = Bento.colors.track
    val sel = Bento.colors.ink
    Column(modifier) {
        val s = selected
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                if (s in values.indices) "Day ${s + 1}" else "Tap a day",
                style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            if (s in values.indices) {
                Text(Fmt.money(values[s], currency), style = MaterialTheme.typography.titleMedium, fontFamily = NumFont, fontWeight = FontWeight.ExtraBold)
            }
        }
        Spacer(Modifier.height(12.dp))
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(130.dp)
                .pointerInput(values) {
                    detectTapGestures { p ->
                        val slot = size.width / values.size.coerceAtLeast(1)
                        selected = (p.x / slot).toInt().coerceIn(0, values.lastIndex)
                    }
                },
        ) {
            val n = values.size.coerceAtLeast(1)
            val slot = size.width / n
            val gap = 3.dp.toPx()
            val barW = (slot - gap).coerceAtLeast(1f)
            val r = CornerRadius(minOf(5.dp.toPx(), barW / 2), minOf(5.dp.toPx(), barW / 2))
            values.forEachIndexed { i, v ->
                // stagger: each column starts a little after the one before it
                val local = ((grow.value * 1.6f) - i / n.toFloat() * 0.6f).coerceIn(0f, 1f)
                val full = if (v <= 0) 3.dp.toPx() else (v / max * (size.height - 4.dp.toPx())).toFloat().coerceAtLeast(4.dp.toPx())
                val h = full * local
                if (h <= 0f) return@forEachIndexed
                val x = i * slot + gap / 2
                val color = when {
                    i == s -> sel
                    i == todayIndex -> accent
                    v > 0 -> accent.copy(alpha = 0.45f)
                    else -> dim
                }
                drawRoundRect(color, Offset(x, size.height - h), Size(barW, h), r)
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 6.dp)) {
            Text("1", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            Text("${values.size}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Ranked horizontal bars with an icon, a direct label and value; bars grow in. */
@Composable
fun RankedBars(items: List<Triple<String, ImageVector, Double>>, currency: String, color: Color, onClick: ((String) -> Unit)? = null) {
    val total = items.sumOf { it.third }.coerceAtLeast(0.0001)
    val max = (items.maxOfOrNull { it.third } ?: 1.0).coerceAtLeast(0.0001)
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        items.forEach { (label, icon, v) ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = if (onClick != null) Modifier.clip(RoundedCornerShape(12.dp)).clickable { onClick(label) } else Modifier,
            ) {
                IconBadge(icon, color, Modifier.size(38.dp))
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(Fmt.money(v, currency), style = MaterialTheme.typography.bodyMedium, fontFamily = NumFont, fontWeight = FontWeight.ExtraBold)
                    }
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        ProgressBar((v / max).toFloat().coerceIn(0.02f, 1f), Modifier.weight(1f), color = color, height = 6.dp)
                        Text(
                            "${(v / total * 100).toInt()}%",
                            style = MaterialTheme.typography.labelSmall, fontFamily = NumFont, fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.width(40.dp).padding(start = 8.dp),
                        )
                    }
                }
            }
        }
    }
}

/** Two-part bar comparing income and spending, drawn white on the orange hero. */
@Composable
fun SplitBar(income: Double, expense: Double, modifier: Modifier = Modifier) {
    val total = (income + expense).coerceAtLeast(0.0001)
    val target = (income / total).toFloat()
    val share = remember { Animatable(0.5f) }
    LaunchedEffect(target) { share.animateTo(target, tween(900, easing = EaseOutCubic)) }
    Canvas(modifier.fillMaxWidth().height(12.dp)) {
        val gap = 3.dp.toPx()
        val r = CornerRadius(size.height / 2, size.height / 2)
        if (income + expense <= 0) {
            drawRoundRect(Color.White.copy(alpha = 0.22f), cornerRadius = r)
            return@Canvas
        }
        val w1 = (size.width * share.value - gap / 2).coerceAtLeast(0f)
        if (w1 > 0) drawRoundRect(Color.White, Offset.Zero, Size(w1, size.height), r)
        val x2 = w1 + gap
        if (x2 < size.width) drawRoundRect(Color.White.copy(alpha = 0.35f), Offset(x2, 0f), Size(size.width - x2, size.height), r)
    }
}

/** Smooth line through [values] that draws itself from left to right. */
@Composable
fun Sparkline(values: List<Double>, modifier: Modifier = Modifier, color: Color = Color.White, strokeWidth: Dp = 3.dp) {
    val draw = remember { Animatable(0f) }
    LaunchedEffect(Unit) { draw.animateTo(1f, tween(1400, delayMillis = 200, easing = EaseOutCubic)) }
    Canvas(modifier) {
        if (values.size < 2) return@Canvas
        val min = values.min()
        val span = (values.max() - min).takeIf { it > 0.0001 } ?: 1.0
        val pad = strokeWidth.toPx()
        val pts = values.mapIndexed { i, v ->
            Offset(
                pad + i * (size.width - pad * 2) / (values.size - 1),
                size.height - pad - ((v - min) / span).toFloat() * (size.height - pad * 2),
            )
        }
        val path = Path().apply {
            moveTo(pts[0].x, pts[0].y)
            for (i in 1 until pts.size) {
                val a = pts[i - 1]
                val b = pts[i]
                val cx = (a.x + b.x) / 2
                cubicTo(cx, a.y, cx, b.y, b.x, b.y)
            }
        }
        val measure = PathMeasure()
        measure.setPath(path, false)
        val part = Path()
        measure.getSegment(0f, measure.length * draw.value, part, true)
        drawPath(part, color, style = Stroke(strokeWidth.toPx(), cap = StrokeCap.Round))
        if (draw.value >= 0.999f) drawCircle(color, strokeWidth.toPx() * 1.4f, pts.last())
    }
}

/** Small dot with a ring that keeps pinging outwards, for "live" things like a running timer. */
@Composable
fun PulseDot(color: Color, modifier: Modifier = Modifier, size: Dp = 9.dp) {
    val ping = rememberInfiniteTransition(label = "ping")
    val t by ping.animateFloat(0f, 1f, infiniteRepeatable(tween(1500, easing = EaseOutCubic), RepeatMode.Restart), label = "t")
    Canvas(modifier.size(size)) {
        val r = this.size.minDimension / 2
        drawCircle(color.copy(alpha = (1f - t) * 0.5f), r * (1f + t * 1.8f))
        drawCircle(color, r)
    }
}
