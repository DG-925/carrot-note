package com.carrotnote.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.carrotnote.app.Graph
import com.carrotnote.app.data.Billing
import com.carrotnote.app.data.Note
import com.carrotnote.app.data.Project
import com.carrotnote.app.data.ProjectStatus
import com.carrotnote.app.data.TimeEntry
import com.carrotnote.app.data.TxnKind
import com.carrotnote.app.time.TimeTracker
import com.carrotnote.app.ui.Edit
import com.carrotnote.app.ui.EventRow
import com.carrotnote.app.ui.Fmt
import com.carrotnote.app.ui.LocalEditor
import com.carrotnote.app.ui.LocalNav
import com.carrotnote.app.ui.MainTopBar
import com.carrotnote.app.ui.TaskRow
import com.carrotnote.app.ui.components.AppCard
import com.carrotnote.app.ui.components.HeroCard
import com.carrotnote.app.ui.components.ProgressBar
import com.carrotnote.app.ui.components.SectionHeader
import com.carrotnote.app.ui.sumByCurrency
import com.carrotnote.app.ui.theme.ExpenseRed
import com.carrotnote.app.ui.theme.Ico
import com.carrotnote.app.ui.theme.IncomeGreen
import com.carrotnote.app.ui.theme.MonoFont
import kotlinx.coroutines.delay
import java.time.LocalDate
import java.time.LocalTime

@Composable
fun HomeScreen() {
    val repo = Graph.repo
    val editor = LocalEditor.current
    val nav = LocalNav.current
    val user by Graph.session.user.collectAsState()
    val currency by Graph.settings.currency.collectAsState()
    val txns by repo.txns.flow.collectAsState()
    val tasks by repo.tasks.flow.collectAsState()
    val projects by repo.projects.flow.collectAsState()
    val events by repo.events.flow.collectAsState()
    val notes by repo.notes.flow.collectAsState()
    val time by repo.time.flow.collectAsState()

    val today = Fmt.today()
    val monthStart = LocalDate.now().withDayOfMonth(1).toEpochDay()
    val monthTx = txns.filter { it.date in monthStart..today }
    val income = monthTx.filter { it.kind == TxnKind.INCOME }.sumByCurrency({ it.currency }, { it.amount })
    val expense = monthTx.filter { it.kind == TxnKind.EXPENSE }.sumByCurrency({ it.currency }, { it.amount })
    val net = (income.keys + expense.keys).associateWith { (income[it] ?: 0.0) - (expense[it] ?: 0.0) }

    val active = projects.filter { it.status == ProjectStatus.ACTIVE || it.status == ProjectStatus.ON_HOLD }
        .sortedWith(compareBy<Project> { it.deadline ?: Long.MAX_VALUE }.thenByDescending { it.createdAt })
    val dueTasks = tasks.filter { !it.done && it.dueDate != null && it.dueDate <= today }.sortedWith(compareBy({ it.dueDate }, { it.dueTime ?: 9999 }))
    val todayEvents = events.filter { it.date == today }.sortedBy { it.time ?: -1 }
    val projectNames = projects.associate { it.id to it.name }
    val recentNotes = notes.sortedWith(compareByDescending<Note> { it.pinned }.thenByDescending { it.createdAt }).take(3)
    val running = time.filter { it.running }.maxByOrNull { it.start }
    val isNew = projects.isEmpty() && txns.isEmpty() && notes.isEmpty() && tasks.isEmpty()

    val greeting = when (LocalTime.now().hour) { in 5..11 -> "Good morning"; in 12..17 -> "Good afternoon"; else -> "Good evening" }
    val firstName = user?.name?.trim()?.substringBefore(' ')?.ifBlank { null } ?: user?.username.orEmpty()

    Scaffold(
        topBar = {
            MainTopBar("$greeting, $firstName", Fmt.date(today)) {
                IconButton(onClick = { nav("search") }) { Icon(Ico.Search, "Search", Modifier.size(18.dp)) }
            }
        },
    ) { pad ->
        LazyColumn(
            Modifier.padding(pad),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (running != null) item { RunningTimerCard(running, projectNames[running.projectId]) }

            item {
                HeroCard {
                    Row(Modifier.clickable { nav("money") }, verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("This month", style = MaterialTheme.typography.labelLarge, color = Color.White.copy(alpha = 0.85f))
                            Text(Fmt.totals(net, currency), style = MaterialTheme.typography.headlineMedium, fontFamily = MonoFont, fontWeight = FontWeight.Bold, maxLines = 1)
                        }
                        Icon(Ico.Right, null, Modifier.size(12.dp), tint = Color.White.copy(alpha = 0.8f))
                    }
                    Spacer(Modifier.height(8.dp))
                    Row {
                        Stat("Income", Fmt.totals(income, currency), Modifier.weight(1f))
                        Stat("Spent", Fmt.totals(expense, currency), Modifier.weight(1f))
                    }
                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        HeroButton("Expense", Ico.Expense, Modifier.weight(1f)) { editor.open(Edit.Money(kind = TxnKind.EXPENSE)) }
                        HeroButton("Income", Ico.Income, Modifier.weight(1f)) { editor.open(Edit.Money(kind = TxnKind.INCOME)) }
                    }
                }
            }

            if (isNew) {
                item { WelcomeCard(onProject = { editor.open(Edit.ProjectEdit()) }, onNote = { editor.open(Edit.NoteEdit()) }, onTask = { editor.open(Edit.Task(date = today)) }) }
            }

            // Today
            item { SectionHeader("Today") { TextButton(onClick = { editor.open(Edit.Task(date = today)) }) { Text("+ Task") } } }
            if (dueTasks.isEmpty() && todayEvents.isEmpty()) {
                item { Hint("Nothing due today 🥕") }
            } else {
                item {
                    AppCard {
                        todayEvents.take(3).forEach { e -> EventRow(e, showDate = false) { editor.open(Edit.Event(e)) } }
                        dueTasks.take(5).forEach { t -> TaskRow(t, projectNames[t.projectId]) { editor.open(Edit.Task(t)) } }
                        if (dueTasks.size > 5) TextButton(onClick = { nav("calendar") }) { Text("+${dueTasks.size - 5} more") }
                    }
                }
            }

            // Projects
            if (projects.isNotEmpty()) {
                item { SectionHeader("Projects") { TextButton(onClick = { nav("projects") }) { Text("See all") } } }
                if (active.isEmpty()) item { Hint("No projects in progress.") }
                else item {
                    AppCard {
                        active.take(3).forEachIndexed { i, p ->
                            if (i > 0) Spacer(Modifier.height(12.dp))
                            ProjectLine(p, projectReceived(p, txns)) { nav("project/${p.id}") }
                        }
                    }
                }
            }

            // Notes
            if (notes.isNotEmpty()) {
                item { SectionHeader("Notes") { TextButton(onClick = { nav("notes") }) { Text("See all") } } }
                item {
                    AppCard {
                        recentNotes.forEachIndexed { i, n ->
                            if (i > 0) Spacer(Modifier.height(10.dp))
                            NoteLine(n) { editor.open(Edit.NoteEdit(n)) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Hint(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 4.dp))
}

@Composable
private fun WelcomeCard(onProject: () -> Unit, onNote: () -> Unit, onTask: () -> Unit) {
    AppCard {
        Text("Welcome to Carrot Note 👋", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text("Start with one of these:", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(12.dp))
        StartRow(Ico.Project, "Add your first project", onProject)
        StartRow(Ico.Note, "Write a note", onNote)
        StartRow(Ico.Tasks, "Add a task for today", onTask)
    }
}

@Composable
private fun StartRow(icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 4.dp).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(14.dp))
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Icon(Ico.Right, null, Modifier.size(11.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ProjectLine(p: Project, received: Double, onClick: () -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(p.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    listOfNotNull(p.clientName.ifBlank { null }, p.deadline?.let { Fmt.daysLeft(it) }).joinToString(" · ").ifBlank { ProjectStatus.label(p.status) },
                    style = MaterialTheme.typography.bodySmall,
                    color = if (p.deadline != null && p.deadline < Fmt.today()) ExpenseRed else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
            if (p.billing == Billing.FIXED && p.price > 0) {
                Text("${Fmt.amount(received)}/${Fmt.money(p.price, p.currency)}", style = MaterialTheme.typography.labelMedium, fontFamily = MonoFont)
            }
        }
        if (p.billing == Billing.FIXED && p.price > 0) {
            Spacer(Modifier.height(6.dp))
            ProgressBar((received / p.price).toFloat().coerceIn(0f, 1f), color = IncomeGreen)
        }
    }
}

@Composable
private fun NoteLine(n: Note, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.tertiary.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) { Icon(if (n.checklist.isNotEmpty()) Ico.CheckSquare else Ico.Note, null, Modifier.size(14.dp), tint = MaterialTheme.colorScheme.tertiary) }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            val title = n.title.ifBlank { n.body.lineSequence().firstOrNull()?.ifBlank { null } ?: n.checklist.firstOrNull()?.text.orEmpty() }
            Text(title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val sub = if (n.checklist.isNotEmpty()) "${n.checklist.count { it.done }}/${n.checklist.size} done" else n.body.takeIf { n.title.isNotBlank() }.orEmpty()
            if (sub.isNotBlank()) Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (n.pinned) Icon(Ico.Pin, null, Modifier.size(11.dp), tint = MaterialTheme.colorScheme.primary)
    }
}

@Composable
fun RunningTimerCard(entry: TimeEntry, projectName: String?) {
    val ctx = LocalContext.current
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(entry.id) {
        while (true) {
            now = System.currentTimeMillis()
            delay(1000)
        }
    }
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.primaryContainer)
            .border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.5f), RoundedCornerShape(18.dp))
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(ExpenseRed))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(projectName ?: "Timer running", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onPrimaryContainer, maxLines = 1)
            Text(TimeTracker.format(entry.durationMs(now)), style = MaterialTheme.typography.headlineSmall, fontFamily = MonoFont, fontWeight = FontWeight.Bold)
        }
        Button(onClick = { TimeTracker.stop(ctx) }, colors = ButtonDefaults.buttonColors(containerColor = ExpenseRed)) {
            Icon(Ico.Stop, null, Modifier.size(12.dp)); Text("  Stop")
        }
    }
}
