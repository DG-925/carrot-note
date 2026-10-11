package com.carrotnote.app.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.carrotnote.app.Graph
import com.carrotnote.app.data.CalEvent
import com.carrotnote.app.data.Debt
import com.carrotnote.app.data.DebtDirection
import com.carrotnote.app.data.Goal
import com.carrotnote.app.data.Note
import com.carrotnote.app.data.TaskItem
import com.carrotnote.app.data.Txn
import com.carrotnote.app.data.TxnKind
import com.carrotnote.app.reminders.Reminders
import com.carrotnote.app.ui.components.AppCard
import com.carrotnote.app.ui.components.IconBadge
import com.carrotnote.app.ui.components.ProgressBar
import com.carrotnote.app.ui.components.ProgressRing
import com.carrotnote.app.ui.components.bentoSurface
import com.carrotnote.app.ui.theme.Bento
import com.carrotnote.app.ui.theme.ExpenseRed
import com.carrotnote.app.ui.theme.Ico
import com.carrotnote.app.ui.theme.IncomeGreen
import com.carrotnote.app.ui.theme.NoteColors
import com.carrotnote.app.ui.theme.NumFont

/** Rounded checkbox that fills orange and pops when checked. */
@Composable
fun BentoCheck(checked: Boolean, onToggle: () -> Unit, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.primary) {
    val fill by animateColorAsState(if (checked) color else Color.Transparent, tween(180), label = "checkFill")
    val edge by animateColorAsState(
        if (checked) color else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f), tween(180), label = "checkEdge",
    )
    val scale = remember { Animatable(1f) }
    var last by remember { mutableStateOf(checked) }
    LaunchedEffect(checked) {
        if (checked && !last) {
            scale.snapTo(0.6f)
            scale.animateTo(1f, spring(dampingRatio = 0.35f, stiffness = 520f))
        }
        last = checked
    }
    Box(modifier.size(40.dp).clip(CircleShape).clickable(onClick = onToggle), contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .size(24.dp)
                .graphicsLayer { scaleX = scale.value; scaleY = scale.value }
                .clip(RoundedCornerShape(8.dp))
                .background(fill)
                .border(2.dp, edge, RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center,
        ) {
            if (checked) Icon(Ico.Check, null, Modifier.size(12.dp), tint = Color.White)
        }
    }
}

/** Small pill button used inside cards. */
@Composable
fun PillButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    container: Color = MaterialTheme.colorScheme.primary,
    content: Color = Color.White,
) {
    Row(
        modifier.bentoSurface(CircleShape, container, onClick, pressed = 0.92f).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) {
            Icon(icon, null, Modifier.size(12.dp), tint = content)
            Spacer(Modifier.width(8.dp))
        }
        Text(label, color = content, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

@Composable
fun TaskRow(task: TaskItem, projectName: String?, onClick: () -> Unit) {
    val ctx = LocalContext.current
    val overdue = !task.done && task.dueDate != null && task.dueDate < Fmt.today()
    val textColor by animateColorAsState(
        if (task.done) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface, tween(250), label = "taskText",
    )
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BentoCheck(task.done, onToggle = {
            val t = task.copy(done = !task.done)
            Graph.repo.tasks.save(t)
            Reminders.schedule(ctx, t)
        })
        Spacer(Modifier.width(4.dp))
        Column(Modifier.weight(1f).padding(vertical = 6.dp)) {
            Text(
                task.title,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                textDecoration = if (task.done) TextDecoration.LineThrough else null,
                color = textColor,
                maxLines = 2, overflow = TextOverflow.Ellipsis,
            )
            val meta = listOfNotNull(
                task.dueDate?.let { Fmt.relativeDay(it) + (task.dueTime?.let { t -> " · " + Fmt.time(t) } ?: "") },
                projectName,
                if (task.priority == 2) "High priority" else null,
            ).joinToString(" · ")
            if (meta.isNotEmpty()) {
                Text(
                    meta, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    fontWeight = if (overdue) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (overdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (task.priority == 2 && !task.done) {
            Box(Modifier.padding(end = 6.dp).size(8.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
        }
        if (task.reminder && !task.done) Icon(Ico.Bell, "Reminder", Modifier.padding(end = 6.dp).size(13.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun TxnRow(txn: Txn, subtitleExtra: String? = null, onClick: () -> Unit) {
    val income = txn.kind == TxnKind.INCOME
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconBadge(Ico.category(txn.category), if (income) IncomeGreen else MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(txn.note.ifBlank { txn.category }, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(txn.category.takeIf { txn.note.isNotBlank() }, txn.method, subtitleExtra).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        Text(
            (if (income) "+" else "−") + Fmt.money(txn.amount, txn.currency),
            fontWeight = FontWeight.ExtraBold,
            fontFamily = NumFont,
            style = MaterialTheme.typography.bodyLarge,
            color = if (income) IncomeGreen else MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
fun NoteCard(note: Note, projectName: String?, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val plain = note.color == 0
    val container = if (plain) Bento.colors.card else NoteColors.getOrElse(note.color) { NoteColors[0] }
    val onColor = if (plain) MaterialTheme.colorScheme.onSurface else Color(0xFF2A211B)
    Column(
        modifier
            .fillMaxWidth()
            .bentoSurface(RoundedCornerShape(22.dp), container, onClick)
            .padding(14.dp),
    ) {
        CompositionLocalProvider(LocalContentColor provides onColor) {
            Row(verticalAlignment = Alignment.Top) {
                Text(
                    note.title.ifBlank { note.body.lineSequence().firstOrNull()?.ifBlank { null } ?: note.checklist.firstOrNull()?.text.orEmpty() },
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                )
                if (note.pinned) {
                    Spacer(Modifier.width(6.dp))
                    Icon(Ico.Pin, "Pinned", Modifier.padding(top = 3.dp).size(12.dp), tint = if (plain) MaterialTheme.colorScheme.primary else onColor)
                }
            }
            if (note.title.isNotBlank() && note.body.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(note.body, style = MaterialTheme.typography.bodyMedium, color = onColor.copy(alpha = 0.8f), maxLines = 7, overflow = TextOverflow.Ellipsis)
            }
            if (note.checklist.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                note.checklist.take(4).forEach { item ->
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 2.dp)) {
                        Icon(if (item.done) Ico.CheckSquare else Ico.Square, null, Modifier.size(12.dp), tint = onColor.copy(alpha = if (item.done) 0.45f else 0.75f))
                        Spacer(Modifier.width(8.dp))
                        Text(
                            item.text, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            textDecoration = if (item.done) TextDecoration.LineThrough else null,
                            color = onColor.copy(alpha = if (item.done) 0.5f else 1f),
                        )
                    }
                }
                if (note.checklist.size > 4) Text("+${note.checklist.size - 4} more", style = MaterialTheme.typography.labelSmall, color = onColor.copy(alpha = 0.6f))
                Spacer(Modifier.height(8.dp))
                val done = note.checklist.count { it.done }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ProgressBar(
                        done.toFloat() / note.checklist.size, Modifier.weight(1f), height = 5.dp,
                        color = if (plain) MaterialTheme.colorScheme.primary else onColor,
                    )
                    Text(
                        "  $done/${note.checklist.size}", style = MaterialTheme.typography.labelSmall, fontFamily = NumFont,
                        fontWeight = FontWeight.Bold, color = onColor.copy(alpha = 0.75f),
                    )
                }
            }
            val meta = listOfNotNull(projectName, note.date?.let { Fmt.dateShort(it) }).joinToString(" · ")
            if (meta.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Text(meta, style = MaterialTheme.typography.labelSmall, color = onColor.copy(alpha = 0.65f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
fun EventRow(event: CalEvent, showDate: Boolean, onClick: () -> Unit) {
    val lilac = Bento.colors.lilac
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable(onClick = onClick).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            Modifier.width(58.dp).clip(RoundedCornerShape(14.dp)).background(lilac.container).padding(vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // "4:30 PM" -> "4:30" over "PM" (some locales use a no-break space)
            val parts = event.time?.let { Fmt.time(it).split(Regex("[\\s\\u00A0\\u202F]+"), limit = 2) }
            Text(
                parts?.getOrNull(0) ?: "All", style = MaterialTheme.typography.labelLarge, fontFamily = NumFont,
                fontWeight = FontWeight.ExtraBold, color = lilac.content, maxLines = 1,
            )
            Text(
                parts?.getOrNull(1) ?: if (parts == null) "day" else "",
                style = MaterialTheme.typography.labelSmall, color = lilac.content.copy(alpha = 0.7f), maxLines = 1,
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(event.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val meta = listOfNotNull(
                if (showDate) Fmt.relativeDay(event.date) else null,
                event.note.lineSequence().firstOrNull()?.ifBlank { null },
            ).joinToString(" · ")
            if (meta.isNotEmpty()) Text(meta, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (event.reminder) Icon(Ico.Bell, "Reminder", Modifier.padding(end = 6.dp).size(13.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun DebtCard(debt: Debt, onClick: () -> Unit, onPay: () -> Unit) {
    val owedToMe = debt.direction == DebtDirection.OWED_TO_ME
    val color = if (owedToMe) IncomeGreen else ExpenseRed
    val progress = if (debt.amount <= 0) 0f else (debt.paid / debt.amount).toFloat().coerceIn(0f, 1f)
    AppCard(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            ProgressRing(progress, diameter = 46.dp, color = color) {
                Icon(if (owedToMe) Ico.Income else Ico.Expense, null, Modifier.size(13.dp), tint = color)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(debt.person, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(if (owedToMe) "Owes you" else "You owe", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = color)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    Fmt.money(debt.remaining, debt.currency), style = MaterialTheme.typography.titleMedium, fontFamily = NumFont,
                    fontWeight = FontWeight.ExtraBold, color = if (debt.settled) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                )
                Text("of ${Fmt.money(debt.amount, debt.currency)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                when {
                    debt.settled -> "Settled ✓"
                    debt.dueDate != null -> Fmt.daysLeft(debt.dueDate)
                    else -> "No due date"
                },
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = if (!debt.settled && debt.dueDate != null && debt.dueDate < Fmt.today()) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            if (!debt.settled) {
                PillButton(
                    if (owedToMe) "Got paid" else "I paid", onPay,
                    container = if (Bento.colors.dark) Bento.colors.track else Bento.colors.ink, content = Color.White,
                )
            }
        }
    }
}

@Composable
fun GoalCard(goal: Goal, onClick: () -> Unit, onAdd: () -> Unit) {
    val mint = Bento.colors.mint
    AppCard(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            ProgressRing(goal.progress, diameter = 52.dp, stroke = 5.dp, color = MaterialTheme.colorScheme.secondary) {
                Text("${(goal.progress * 100).toInt()}%", style = MaterialTheme.typography.labelSmall, fontFamily = NumFont, fontWeight = FontWeight.ExtraBold)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(goal.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    "${Fmt.money(goal.saved, goal.currency)} of ${Fmt.money(goal.target, goal.currency)}",
                    style = MaterialTheme.typography.bodySmall, fontFamily = NumFont, fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            val left = (goal.target - goal.saved).coerceAtLeast(0.0)
            Text(
                if (left <= 0) "Goal reached 🎉" else "${Fmt.money(left, goal.currency)} to go" + (goal.deadline?.let { " · " + Fmt.daysLeft(it) } ?: ""),
                style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f),
            )
            PillButton("Add / withdraw", onAdd, container = mint.container, content = mint.content)
        }
    }
}

/** Sums amounts per currency. */
fun <T> List<T>.sumByCurrency(currency: (T) -> String, amount: (T) -> Double): Map<String, Double> =
    groupBy(currency).mapValues { (_, v) -> v.sumOf(amount) }
