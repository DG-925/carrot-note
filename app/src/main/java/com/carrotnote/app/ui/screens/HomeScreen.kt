package com.carrotnote.app.ui.screens

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.NoteAdd
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.AddTask
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.carrotnote.app.Graph
import com.carrotnote.app.data.DebtDirection
import com.carrotnote.app.data.ProjectStatus
import com.carrotnote.app.data.TxnKind
import com.carrotnote.app.ui.Edit
import com.carrotnote.app.ui.EventRow
import com.carrotnote.app.ui.Fmt
import com.carrotnote.app.ui.GoalCard
import com.carrotnote.app.ui.LocalEditor
import com.carrotnote.app.ui.TaskRow
import com.carrotnote.app.ui.components.AppCard
import com.carrotnote.app.ui.components.AppLogo
import com.carrotnote.app.ui.components.HeroCard
import com.carrotnote.app.ui.theme.MonoFont
import androidx.compose.ui.graphics.Color
import com.carrotnote.app.ui.components.ListPadding
import com.carrotnote.app.ui.components.SectionHeader
import com.carrotnote.app.ui.sumByCurrency
import com.carrotnote.app.ui.theme.ExpenseRed
import com.carrotnote.app.ui.theme.IncomeGreen
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalTime

@Composable
fun HomeScreen(nav: (String) -> Unit) {
    val repo = Graph.repo
    val editor = LocalEditor.current
    val scope = rememberCoroutineScope()
    val user by Graph.session.user.collectAsState()
    val currency by Graph.settings.currency.collectAsState()
    val txns by repo.txns.flow.collectAsState()
    val tasks by repo.tasks.flow.collectAsState()
    val projects by repo.projects.flow.collectAsState()
    val events by repo.events.flow.collectAsState()
    val debts by repo.debts.flow.collectAsState()
    val goals by repo.goals.flow.collectAsState()
    val sync by Graph.sync.state.collectAsState()

    val today = Fmt.today()
    val monthStart = LocalDate.now().withDayOfMonth(1).toEpochDay()
    val monthTx = txns.filter { it.date in monthStart..today }
    val income = monthTx.filter { it.kind == TxnKind.INCOME }.sumByCurrency({ it.currency }, { it.amount })
    val expense = monthTx.filter { it.kind == TxnKind.EXPENSE }.sumByCurrency({ it.currency }, { it.amount })
    val todaySpent = txns.filter { it.date == today && it.kind == TxnKind.EXPENSE }.sumByCurrency({ it.currency }, { it.amount })

    val activeProjects = projects.filter { it.status == ProjectStatus.ACTIVE || it.status == ProjectStatus.ON_HOLD }
    val unpaid = activeProjects.associateWith { p ->
        val got = txns.filter { it.projectId == p.id && it.kind == TxnKind.INCOME && it.currency == p.currency }.sumOf { it.amount }
        (p.price - got).coerceAtLeast(0.0)
    }.filterValues { it > 0 }
    val unpaidTotals = unpaid.entries.groupBy({ it.key.currency }, { it.value }).mapValues { it.value.sum() }

    val openDebts = debts.filter { !it.settled }
    val owedToMe = openDebts.filter { it.direction == DebtDirection.OWED_TO_ME }.sumByCurrency({ it.currency }, { it.remaining })
    val iOwe = openDebts.filter { it.direction == DebtDirection.I_OWE }.sumByCurrency({ it.currency }, { it.remaining })

    val dueTasks = tasks.filter { !it.done && it.dueDate != null && it.dueDate <= today }
        .sortedWith(compareBy({ it.dueDate }, { it.dueTime ?: 9999 }))
    val upcomingTasks = tasks.filter { !it.done && it.dueDate != null && it.dueDate in (today + 1)..(today + 7) }
        .sortedWith(compareBy({ it.dueDate }, { it.dueTime ?: 9999 })).take(5)
    val upcomingEvents = events.filter { it.date in today..(today + 7) }.sortedWith(compareBy({ it.date }, { it.time ?: -1 })).take(5)
    val projectNames = projects.associate { it.id to it.name }

    val hour = LocalTime.now().hour
    val greeting = when (hour) { in 5..11 -> "Good morning"; in 12..17 -> "Good afternoon"; else -> "Good evening" }

    LazyColumn(contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
                AppLogo(46.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(greeting + (user?.name?.takeIf { it.isNotBlank() }?.let { ", ${it.substringBefore(' ')}" } ?: ""),
                        style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, maxLines = 1)
                    Text(Fmt.date(today), style = MaterialTheme.typography.bodySmall, fontFamily = MonoFont, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = { scope.launch { Graph.sync.syncNow() } }) {
                    Icon(
                        if (sync.error != null) Icons.Default.CloudOff else Icons.Default.Sync,
                        "Sync",
                        tint = if (sync.error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                QuickChip("Expense", Icons.AutoMirrored.Filled.TrendingDown) { editor.open(Edit.Money(kind = TxnKind.EXPENSE)) }
                QuickChip("Income", Icons.AutoMirrored.Filled.TrendingUp) { editor.open(Edit.Money(kind = TxnKind.INCOME)) }
                QuickChip("Task", Icons.Default.AddTask) { editor.open(Edit.Task(date = today)) }
                QuickChip("Note", Icons.AutoMirrored.Filled.NoteAdd) { editor.open(Edit.NoteEdit()) }
                QuickChip("Event", Icons.Default.Event) { editor.open(Edit.Event(date = today)) }
            }
        }
        item {
            val net = (income.keys + expense.keys).associateWith { (income[it] ?: 0.0) - (expense[it] ?: 0.0) }
            HeroCard(onClick = { nav("money") }) {
                Text("THIS MONTH · NET", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.8f))
                Text(Fmt.totals(net, currency), style = MaterialTheme.typography.headlineMedium, fontFamily = MonoFont, fontWeight = FontWeight.Bold, maxLines = 1)
                Spacer(Modifier.height(12.dp))
                Row {
                    Stat("Income", Fmt.totals(income, currency), Modifier.weight(1f))
                    Stat("Spent", Fmt.totals(expense, currency), Modifier.weight(1f))
                    Stat("Today", Fmt.totals(todaySpent, currency), Modifier.weight(1f))
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppCard(Modifier.weight(1f), onClick = { nav("projects") }) {
                    Text("Active projects", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("${activeProjects.size}", style = MaterialTheme.typography.headlineSmall, fontFamily = MonoFont, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text("Waiting", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(Fmt.totals(unpaidTotals, currency), style = MaterialTheme.typography.bodyMedium, fontFamily = MonoFont, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                }
                AppCard(Modifier.weight(1f), onClick = { nav("debts") }) {
                    Text("Debts", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("Owed to me", style = MaterialTheme.typography.labelSmall, color = IncomeGreen)
                    Text(Fmt.totals(owedToMe, currency), style = MaterialTheme.typography.bodyMedium, fontFamily = MonoFont, fontWeight = FontWeight.Bold)
                    Text("I owe", style = MaterialTheme.typography.labelSmall, color = ExpenseRed)
                    Text(Fmt.totals(iOwe, currency), style = MaterialTheme.typography.bodyMedium, fontFamily = MonoFont, fontWeight = FontWeight.Bold)
                }
            }
        }
        item {
            SectionHeader("Today & overdue") { TextButton(onClick = { nav("calendar") }) { Text("Calendar") } }
        }
        if (dueTasks.isEmpty()) {
            item { Text("Nothing due. Enjoy your day 🥕", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium) }
        } else {
            items(dueTasks.size, key = { "due_" + dueTasks[it].id }) { i ->
                val t = dueTasks[i]
                TaskRow(t, projectNames[t.projectId]) { editor.open(Edit.Task(t)) }
            }
        }
        if (upcomingEvents.isNotEmpty() || upcomingTasks.isNotEmpty()) {
            item { SectionHeader("Next 7 days") }
            items(upcomingEvents.size, key = { "ev_" + upcomingEvents[it].id }) { i ->
                EventRow(upcomingEvents[i], showDate = true) { editor.open(Edit.Event(upcomingEvents[i])) }
            }
            items(upcomingTasks.size, key = { "up_" + upcomingTasks[it].id }) { i ->
                val t = upcomingTasks[i]
                TaskRow(t, projectNames[t.projectId]) { editor.open(Edit.Task(t)) }
            }
        }
        if (unpaid.isNotEmpty()) {
            item { SectionHeader("Waiting for payment") }
            items(unpaid.size, key = { "unpaid_" + unpaid.keys.elementAt(it).id }) { i ->
                val (p, left) = unpaid.entries.elementAt(i).toPair()
                AppCard(onClick = { nav("project/${p.id}") }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(p.name, fontWeight = FontWeight.SemiBold)
                            Text(
                                (repo.customers.get(p.customerId)?.name ?: p.clientName).ifBlank { "No client" } +
                                    (p.deadline?.let { " · " + Fmt.daysLeft(it) } ?: ""),
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(Fmt.money(left, p.currency), fontFamily = MonoFont, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
        if (goals.isNotEmpty()) {
            item { SectionHeader("Savings goals") { TextButton(onClick = { nav("goals") }) { Text("All") } } }
            val top = goals.sortedByDescending { it.progress }.take(2)
            items(top.size, key = { "goal_" + top[it].id }) { i ->
                GoalCard(top[i], onClick = { nav("goals") }, onAdd = { editor.open(Edit.GoalMove(top[i])) })
            }
        }
        item { Spacer(Modifier.width(1.dp)) }
    }
}

@Composable
private fun QuickChip(label: String, icon: ImageVector, onClick: () -> Unit) {
    AssistChip(
        onClick = onClick,
        label = { Text(label) },
        leadingIcon = { Icon(icon, null, Modifier.padding(0.dp), tint = MaterialTheme.colorScheme.primary) },
        shape = androidx.compose.foundation.shape.CircleShape,
        colors = AssistChipDefaults.assistChipColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    )
}
