@file:OptIn(ExperimentalMaterial3Api::class)

package com.carrotnote.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import com.carrotnote.app.ui.theme.HeroBrush
import com.carrotnote.app.ui.theme.Ico
import com.carrotnote.app.ui.theme.IncomeGreen
import com.carrotnote.app.ui.theme.MonoFont
import compose.icons.FontAwesomeIcons
import compose.icons.fontawesomeicons.Solid
import compose.icons.fontawesomeicons.solid.Ban
import compose.icons.fontawesomeicons.solid.CheckCircle
import compose.icons.fontawesomeicons.solid.PauseCircle
import compose.icons.fontawesomeicons.solid.PlayCircle

/** Profile picture, or initials on the orange gradient when there is none. */
@Composable
fun Avatar(userId: String?, avatarRev: Int, name: String, size: Dp, modifier: Modifier = Modifier, ring: Boolean = false) {
    val ctx = LocalContext.current
    val bitmap by produceState<androidx.compose.ui.graphics.ImageBitmap?>(null, userId, avatarRev) {
        value = if (userId == null) null else Avatars.load(ctx, userId, avatarRev)
    }
    val base = modifier
        .size(size)
        .clip(CircleShape)
        .then(if (ring) Modifier.border(2.dp, MaterialTheme.colorScheme.primary, CircleShape) else Modifier)
    val bmp = bitmap
    if (bmp != null) {
        Image(bmp, null, base, contentScale = ContentScale.Crop)
    } else {
        val initials = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2)
            .joinToString("") { it.first().uppercase() }.ifBlank { "?" }
        Box(base.background(HeroBrush), contentAlignment = Alignment.Center) {
            Text(initials, color = Color.White, fontWeight = FontWeight.Bold, fontSize = (size.value * 0.38f).sp)
        }
    }
}

/** Overlapping row of member avatars. */
@Composable
fun AvatarStack(people: List<Triple<String, Int, String>>, size: Dp = 30.dp, max: Int = 4) {
    Row(horizontalArrangement = Arrangement.spacedBy(-(size * 0.3f))) {
        people.take(max).forEach { (id, rev, name) ->
            Avatar(
                id, rev, name, size,
                Modifier
                    .border(2.dp, MaterialTheme.colorScheme.surface, CircleShape),
            )
        }
        if (people.size > max) {
            Box(
                Modifier.padding(start = 2.dp).size(size).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceContainerHigh),
                contentAlignment = Alignment.Center,
            ) { Text("+${people.size - max}", style = MaterialTheme.typography.labelSmall) }
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
        OutlinedTextField(
            value = ProjectStatus.label(status),
            onValueChange = {},
            readOnly = true,
            label = { Text("Status") },
            singleLine = true,
            leadingIcon = { Icon(statusIcon(status), null, Modifier.size(18.dp), tint = color) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
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

/** POS-style segmented tabs: a dark track with the selected tab in brown and orange. */
@Composable
fun Segmented(options: List<Pair<String, ImageVector?>>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp))
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        options.forEachIndexed { i, (label, icon) ->
            val sel = i == selected
            Row(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (sel) MaterialTheme.colorScheme.primaryContainer else Color.Transparent)
                    .clickable { onSelect(i) }
                    .padding(vertical = 10.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val color = if (sel) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
                if (icon != null) {
                    Icon(icon, null, Modifier.size(14.dp), tint = color)
                    Spacer(Modifier.width(6.dp))
                }
                Text(label, color = color, style = MaterialTheme.typography.labelLarge, fontWeight = if (sel) FontWeight.Bold else FontWeight.Medium, maxLines = 1)
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
    ) { Text(if (n > 99) "99+" else "$n", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = MonoFont) }
}

// ---------------------------------------------------------------- charts

/**
 * Daily spending columns for one month. One hue; today is emphasized; tap a column to read it.
 * Values are labelled on selection only, so the chart stays quiet.
 */
@Composable
fun DailyBars(values: List<Double>, todayIndex: Int, currency: String, modifier: Modifier = Modifier) {
    var selected by remember(values) { mutableStateOf(if (todayIndex in values.indices) todayIndex else values.indexOfLast { it > 0 }) }
    val max = (values.maxOrNull() ?: 0.0).coerceAtLeast(1.0)
    val accent = MaterialTheme.colorScheme.primary
    val dim = MaterialTheme.colorScheme.primary.copy(alpha = 0.38f)
    val track = MaterialTheme.colorScheme.outlineVariant
    Column(modifier) {
        val sel = selected
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                if (sel in values.indices) "Day ${sel + 1}" else "Tap a day",
                style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            if (sel in values.indices) {
                Text(Fmt.money(values[sel], currency), style = MaterialTheme.typography.titleSmall, fontFamily = MonoFont, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(10.dp))
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(120.dp)
                .pointerInput(values) {
                    detectTapGestures { p ->
                        val slot = size.width / values.size.coerceAtLeast(1)
                        selected = (p.x / slot).toInt().coerceIn(0, values.lastIndex)
                    }
                },
        ) {
            val n = values.size.coerceAtLeast(1)
            val slot = size.width / n
            val gap = 2.dp.toPx()
            val barW = (slot - gap).coerceAtLeast(1f)
            drawLine(track, Offset(0f, size.height), Offset(size.width, size.height), strokeWidth = 1.dp.toPx())
            values.forEachIndexed { i, v ->
                if (v <= 0) return@forEachIndexed
                val h = (v / max * (size.height - 4.dp.toPx())).toFloat().coerceAtLeast(3.dp.toPx())
                val x = i * slot + gap / 2
                val color = if (i == selected || i == todayIndex) accent else dim
                val r = minOf(4.dp.toPx(), barW / 2)
                drawRoundRect(color, Offset(x, size.height - h), Size(barW, h), CornerRadius(r, r))
                // square off the baseline end
                drawRect(color, Offset(x, size.height - minOf(h, r)), Size(barW, minOf(h, r)))
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 4.dp)) {
            Text("1", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            Text("${values.size}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Ranked horizontal bars with an icon, a direct label and value (one hue). */
@Composable
fun RankedBars(items: List<Triple<String, ImageVector, Double>>, currency: String, color: Color, onClick: ((String) -> Unit)? = null) {
    val total = items.sumOf { it.third }.coerceAtLeast(0.0001)
    val max = (items.maxOfOrNull { it.third } ?: 1.0).coerceAtLeast(0.0001)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items.forEach { (label, icon, v) ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = if (onClick != null) Modifier.clip(RoundedCornerShape(10.dp)).clickable { onClick(label) } else Modifier,
            ) {
                IconBadge(icon, color, Modifier.size(36.dp))
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(Fmt.money(v, currency), style = MaterialTheme.typography.bodyMedium, fontFamily = MonoFont, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.weight(1f).height(6.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant)) {
                            Box(Modifier.fillMaxWidth((v / max).toFloat().coerceIn(0.02f, 1f)).height(6.dp).clip(CircleShape).background(color))
                        }
                        Text(
                            "  ${(v / total * 100).toInt()}%",
                            style = MaterialTheme.typography.labelSmall, fontFamily = MonoFont,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

/** Two-part bar comparing income and spending, labelled on both ends. */
@Composable
fun SplitBar(income: Double, expense: Double, modifier: Modifier = Modifier) {
    val total = (income + expense).coerceAtLeast(0.0001)
    val share = (income / total).toFloat()
    Canvas(modifier.fillMaxWidth().height(10.dp)) {
        val gap = 2.dp.toPx()
        val r = CornerRadius(size.height / 2, size.height / 2)
        if (income + expense <= 0) {
            drawRoundRect(Color.White.copy(alpha = 0.22f), cornerRadius = r)
            return@Canvas
        }
        val w1 = (size.width * share - gap / 2).coerceAtLeast(0f)
        if (w1 > 0) drawRoundRect(Color.White, Offset.Zero, Size(w1, size.height), r)
        val x2 = w1 + gap
        if (x2 < size.width) drawRoundRect(Color.White.copy(alpha = 0.38f), Offset(x2, 0f), Size(size.width - x2, size.height), r)
    }
}
