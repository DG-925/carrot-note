package com.carrotnote.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import com.carrotnote.app.ui.theme.ExpenseRed
import com.carrotnote.app.ui.theme.IncomeGreen
import com.carrotnote.app.ui.theme.NoteColors
import com.carrotnote.app.ui.theme.MonoFont
import androidx.compose.ui.platform.LocalContext

@Composable
fun TaskRow(task: TaskItem, projectName: String?, onClick: () -> Unit) {
    val ctx = LocalContext.current
    val overdue = !task.done && task.dueDate != null && task.dueDate < Fmt.today()
    Row(
        Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.small)
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked = task.done, onCheckedChange = {
            val t = task.copy(done = it)
            Graph.repo.tasks.save(t)
            Reminders.schedule(ctx, t)
        })
        Column(Modifier.weight(1f)) {
            Text(
                task.title,
                style = MaterialTheme.typography.bodyLarge,
                textDecoration = if (task.done) TextDecoration.LineThrough else null,
                color = if (task.done) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                maxLines = 2, overflow = TextOverflow.Ellipsis,
            )
            val meta = listOfNotNull(
                task.dueDate?.let { Fmt.relativeDay(it) + (task.dueTime?.let { t -> " · " + Fmt.time(t) } ?: "") },
                projectName,
                if (task.priority == 2) "High priority" else null,
            ).joinToString("  •  ")
            if (meta.isNotEmpty()) {
                Text(
                    meta, style = MaterialTheme.typography.bodySmall,
                    color = if (overdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (task.reminder && !task.done) Icon(Icons.Default.NotificationsActive, "Reminder", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
    }
}

@Composable
fun TxnRow(txn: Txn, subtitleExtra: String? = null, onClick: () -> Unit) {
    val income = txn.kind == TxnKind.INCOME
    Row(
        Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.small)
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconBadge(
            if (income) Icons.AutoMirrored.Filled.TrendingUp else Icons.AutoMirrored.Filled.TrendingDown,
            if (income) IncomeGreen else ExpenseRed,
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(txn.note.ifBlank { txn.category }, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(txn.category.takeIf { txn.note.isNotBlank() }, txn.method, subtitleExtra).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            (if (income) "+" else "−") + Fmt.money(txn.amount, txn.currency),
            fontWeight = FontWeight.Bold,
            fontFamily = MonoFont,
            color = if (income) IncomeGreen else ExpenseRed,
        )
    }
}

@Composable
fun NoteCard(note: Note, projectName: String?, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = NoteColors.getOrElse(note.color) { NoteColors[0] }
    val container = if (note.color == 0) MaterialTheme.colorScheme.surfaceContainerLow else c
    val onColor = if (note.color == 0) MaterialTheme.colorScheme.onSurface else androidx.compose.ui.graphics.Color(0xFF2A211B)
    Card(onClick = onClick, modifier = modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = container, contentColor = onColor)) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    note.title.ifBlank { note.body.lineSequence().firstOrNull().orEmpty() },
                    style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold,
                    maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                )
                if (note.pinned) Icon(Icons.Default.PushPin, "Pinned", Modifier.size(16.dp))
            }
            if (note.title.isNotBlank() && note.body.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(note.body, style = MaterialTheme.typography.bodyMedium, maxLines = 6, overflow = TextOverflow.Ellipsis)
            }
            val meta = listOfNotNull(projectName, note.date?.let { Fmt.dateShort(it) }).joinToString(" · ")
            if (meta.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text(meta, style = MaterialTheme.typography.labelSmall, color = onColor.copy(alpha = 0.7f))
            }
        }
    }
}

@Composable
fun EventRow(event: CalEvent, showDate: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(MaterialTheme.shapes.small).clickable(onClick = onClick).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconBadge(Icons.Default.Event, MaterialTheme.colorScheme.tertiary)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(event.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val meta = listOfNotNull(
                if (showDate) Fmt.relativeDay(event.date) else null,
                event.time?.let { Fmt.time(it) } ?: "All day",
            ).joinToString(" · ")
            Text(meta, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (event.reminder) Icon(Icons.Default.NotificationsActive, "Reminder", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
    }
}

@Composable
fun DebtCard(debt: Debt, onClick: () -> Unit, onPay: () -> Unit) {
    val owedToMe = debt.direction == DebtDirection.OWED_TO_ME
    val color = if (owedToMe) IncomeGreen else ExpenseRed
    AppCard(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(debt.person, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(
                    if (owedToMe) "Owes you" else "You owe",
                    style = MaterialTheme.typography.bodySmall, color = color,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(Fmt.money(debt.remaining, debt.currency), style = MaterialTheme.typography.titleMedium, fontFamily = MonoFont, fontWeight = FontWeight.Bold, color = if (debt.settled) MaterialTheme.colorScheme.onSurfaceVariant else color)
                Text("of ${Fmt.money(debt.amount, debt.currency)}", style = MaterialTheme.typography.bodySmall, fontFamily = MonoFont, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(10.dp))
        ProgressBar(if (debt.amount <= 0) 0f else (debt.paid / debt.amount).toFloat().coerceIn(0f, 1f), color = color)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                when {
                    debt.settled -> "Settled ✓"
                    debt.dueDate != null -> Fmt.daysLeft(debt.dueDate)
                    else -> "No due date"
                },
                style = MaterialTheme.typography.bodySmall,
                color = if (!debt.settled && debt.dueDate != null && debt.dueDate < Fmt.today()) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            if (!debt.settled) {
                androidx.compose.material3.FilledTonalButton(onClick = onPay) { Text(if (owedToMe) "Got paid" else "I paid") }
            }
        }
    }
}

@Composable
fun GoalCard(goal: Goal, onClick: () -> Unit, onAdd: () -> Unit) {
    AppCard(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconBadge(Icons.Default.Savings, MaterialTheme.colorScheme.secondary)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(goal.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    "${Fmt.money(goal.saved, goal.currency)} of ${Fmt.money(goal.target, goal.currency)}",
                    style = MaterialTheme.typography.bodySmall, fontFamily = MonoFont, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text("${(goal.progress * 100).toInt()}%", style = MaterialTheme.typography.titleMedium, fontFamily = MonoFont, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.secondary)
        }
        Spacer(Modifier.height(10.dp))
        ProgressBar(goal.progress, color = MaterialTheme.colorScheme.secondary)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            val left = (goal.target - goal.saved).coerceAtLeast(0.0)
            Text(
                if (left <= 0) "Goal reached 🎉" else "${Fmt.money(left, goal.currency)} to go" + (goal.deadline?.let { " · " + Fmt.daysLeft(it) } ?: ""),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f),
            )
            androidx.compose.material3.FilledTonalButton(onClick = onAdd) { Text("Add / withdraw") }
        }
    }
}

/** Sums amounts per currency. */
fun <T> List<T>.sumByCurrency(currency: (T) -> String, amount: (T) -> Double): Map<String, Double> =
    groupBy(currency).mapValues { (_, v) -> v.sumOf(amount) }
