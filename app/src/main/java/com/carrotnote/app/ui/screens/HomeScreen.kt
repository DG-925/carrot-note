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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
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
import com.carrotnote.app.data.DebtDirection
import com.carrotnote.app.data.Note
import com.carrotnote.app.data.Project
import com.carrotnote.app.data.ProjectStatus
import com.carrotnote.app.data.TimeEntry
import com.carrotnote.app.data.TxnKind
import com.carrotnote.app.time.TimeTracker
import com.carrotnote.app.ui.Edit
import com.carrotnote.app.ui.EventRow
import com.carrotnote.app.ui.Fmt
import com.carrotnote.app.ui.GoalCard
import com.carrotnote.app.ui.LocalEditor
import com.carrotnote.app.ui.LocalNav
import com.carrotnote.app.ui.MainTopBar
import com.carrotnote.app.ui.NoteCard
import com.carrotnote.app.ui.TaskRow
import com.carrotnote.app.ui.components.AppCard
import com.carrotnote.app.ui.components.Avatar
import com.carrotnote.app.ui.components.AvatarStack
import com.carrotnote.app.ui.components.HeroCard
import com.carrotnote.app.ui.components.ProgressBar
import com.carrotnote.app.ui.components.SectionHeader
import com.carrotnote.app.ui.components.SplitBar
import com.carrotnote.app.ui.sumByCurrency
import com.carrotnote.app.ui.theme.ExpenseRed
import com.carrotnote.app.ui.theme.Ico
import com.carrotnote.app.ui.theme.IncomeGreen
import com.carrotnote.app.ui.theme.MonoFont
import kotlinx.coroutines.delay
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.TextStyle
import java.time.temporal.WeekFields
import java.util.Locale

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
    val debts by repo.debts.flow.collectAsState()
    val goals by repo.goals.flow.collectAsState()
    val notes by repo.notes.flow.collectAsState()
    val time by repo.time.flow.collectAsState()
    val spaces by repo.spaces.collectAsState()

    val today = Fmt.today()
    val monthStart = LocalDate.now().withDayOfMonth(1).toEpochDay()
    val monthTx = txns.filter { it.date in monthStart..today }
    val income = monthTx.filter { it.kind == TxnKind.INCOME }.sumByCurrency({ it.currency }, { it.amount })
    val expense = monthTx.filter { it.kind == TxnKind.EXPENSE }.sumByCurrency({ it.currency }, { it.amount })
    val net = (income.keys + expense.keys).associateWith { (income[it] ?: 0.0) - (expense[it] ?: 0.0) }

    val active = projects.filter { it.status == ProjectStatus.ACTIVE || it.status == ProjectStatus.ON_HOLD }
        .sortedWith(compareBy<Project> { it.deadline ?: Long.MAX_VALUE }.thenByDescending { it.createdAt })
    val unpaid = active.filter { it.billing == Billing.FIXED }
        .associateWith { p -> (p.price - projectReceived(p, txns)).coerceAtLeast(0.0) }.filterValues { it > 0 }
    val unpaidTotals = unpaid.entries.groupBy({ it.key.currency }, { it.value }).mapValues { it.value.sum() }
    val owedToMe = debts.filter { !it.settled && it.direction == DebtDirection.OWED_TO_ME }.sumByCurrency({ it.currency }, { it.remaining })
    val weekStart = LocalDate.now().with(WeekFields.of(Locale.getDefault()).dayOfWeek(), 1)
        .atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
    val nowMs = System.currentTimeMillis()
    val weekMs = time.filter { (it.end ?: nowMs) >= weekStart }.sumOf { ((it.end ?: nowMs) - maxOf(it.start, weekStart)).coerceAtLeast(0) }

    val dueTasks = tasks.filter { !it.done && it.dueDate != null && it.dueDate <= today }.sortedWith(compareBy({ it.dueDate }, { it.dueTime ?: 9999 }))
    val todayEvents = events.filter { it.date == today }.sortedBy { it.time ?: -1 }
    val upcoming = events.filter { it.date in (today + 1)..(today + 7) }.sortedWith(compareBy({ it.date }, { it.time ?: -1 })).take(3)
    val projectNames = projects.associate { it.id to it.name }
    val recentNotes = notes.sortedWith(compareByDescending<Note> { it.pinned }.thenByDescending { it.createdAt }).take(8)
    val running = time.filter { it.running }.maxByOrNull { it.start }

    val greeting = when (LocalTime.now().hour) { in 5..11 -> "Good morning"; in 12..17 -> "Good afternoon"; else -> "Good evening" }

    Scaffold(topBar = { MainTopBar("Carrot Note", Fmt.date(today)) }) { pad ->
        LazyColumn(
            Modifier.padding(pad),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val u = user
                    Avatar(u?.id, u?.avatarRev ?: 0, u?.name?.ifBlank { u.username } ?: "", 50.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text("$greeting 👋", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            u?.name?.ifBlank { null } ?: "@${u?.username}", style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
            if (running != null) item { RunningTimerCard(running, projectNames[running.projectId]) }
            item {
                HeroCard(onClick = { nav("money") }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "THIS MONTH · BALANCE", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold,
                            color = Color.White.copy(alpha = 0.8f), modifier = Modifier.weight(1f),
                        )
                        Icon(Ico.Right, null, Modifier.size(12.dp), tint = Color.White.copy(alpha = 0.8f))
                    }
                    Text(Fmt.totals(net, currency), style = MaterialTheme.typography.headlineMedium, fontFamily = MonoFont, fontWeight = FontWeight.Bold, maxLines = 1)
                    Spacer(Modifier.height(12.dp))
                    SplitBar(income[currency] ?: 0.0, expense[currency] ?: 0.0)
                    Spacer(Modifier.height(10.dp))
                    Row {
                        Stat("↓ Income", Fmt.totals(income, currency), Modifier.weight(1f))
                        Stat("↑ Spent", Fmt.totals(expense, currency), Modifier.weight(1f))
                    }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Kpi(Ico.Project, "Active projects", "${active.size}", MaterialTheme.colorScheme.primary, Modifier.weight(1f)) { nav("projects") }
                    Kpi(Ico.Hourglass, "Waiting payment", Fmt.totals(unpaidTotals, currency), MaterialTheme.colorScheme.tertiary, Modifier.weight(1f)) { nav("projects") }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Kpi(Ico.Debt, "Owed to me", Fmt.totals(owedToMe, currency), IncomeGreen, Modifier.weight(1f)) { nav("debts") }
                    Kpi(Ico.Timer, "Hours this week", "%.1f h".format(TimeTracker.hours(weekMs)), MaterialTheme.colorScheme.primary, Modifier.weight(1f)) { nav("time") }
                }
            }
            item { WeekStrip(today, tasks.mapNotNull { if (it.done) null else it.dueDate }.toSet() + events.map { it.date }) { nav("calendar") } }
            item {
                SectionHeader("Today") {
                    TextButton(onClick = { editor.open(Edit.Task(date = today)) }) { Icon(Ico.Plus, null, Modifier.size(12.dp)); Text("  Task") }
                }
            }
            if (dueTasks.isEmpty() && todayEvents.isEmpty()) {
                item {
                    AppCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Ico.CheckCircle, null, Modifier.size(20.dp), tint = IncomeGreen)
                            Spacer(Modifier.width(12.dp))
                            Text("You're all clear for today 🥕", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
            items(todayEvents.size, key = { "ev_" + todayEvents[it].id }) { i -> EventRow(todayEvents[i], showDate = false) { editor.open(Edit.Event(todayEvents[i])) } }
            items(dueTasks.size, key = { "due_" + dueTasks[it].id }) { i -> TaskRow(dueTasks[i], projectNames[dueTasks[i].projectId]) { editor.open(Edit.Task(dueTasks[i])) } }
            if (upcoming.isNotEmpty()) {
                item { SectionHeader("Coming up") { TextButton(onClick = { nav("calendar") }) { Text("Calendar") } } }
                items(upcoming.size, key = { "up_" + upcoming[it].id }) { i -> EventRow(upcoming[i], showDate = true) { editor.open(Edit.Event(upcoming[i])) } }
            }
            if (active.isNotEmpty()) {
                item { SectionHeader("Projects in progress") { TextButton(onClick = { nav("projects") }) { Text("All") } } }
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(active.size, key = { active[it].id }) { i ->
                            val p = active[i]
                            val space = spaces.firstOrNull { it.projectId == p.id }
                            MiniProjectCard(p, projectReceived(p, txns), space?.members?.map { Triple(it.id, it.avatarRev, it.name.ifBlank { it.username }) }.orEmpty()) {
                                nav("project/${p.id}")
                            }
                        }
                    }
                }
            }
            item { SectionHeader("Notes") { TextButton(onClick = { nav("notes") }) { Text("All notes") } } }
            item {
                if (recentNotes.isEmpty()) {
                    AppCard(onClick = { editor.open(Edit.NoteEdit()) }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Ico.Note, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.tertiary)
                            Spacer(Modifier.width(12.dp))
                            Text("Write your first note — just for you, or for a project.", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                } else {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(recentNotes.size, key = { recentNotes[it].id }) { i ->
                            NoteCard(recentNotes[i], projectNames[recentNotes[i].projectId], { editor.open(Edit.NoteEdit(recentNotes[i])) }, Modifier.width(180.dp).height(150.dp))
                        }
                    }
                }
            }
            if (goals.isNotEmpty()) {
                item { SectionHeader("Savings goals") { TextButton(onClick = { nav("goals") }) { Text("All") } } }
                val top = goals.sortedByDescending { it.progress }.take(2)
                items(top.size, key = { "goal_" + top[it].id }) { i -> GoalCard(top[i], onClick = { nav("goals") }, onAdd = { editor.open(Edit.GoalMove(top[i])) }) }
            }
        }
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

@Composable
private fun Kpi(icon: ImageVector, label: String, value: String, tint: Color, modifier: Modifier, onClick: () -> Unit) {
    AppCard(modifier, onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(tint.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) {
                Icon(icon, null, Modifier.size(14.dp), tint = tint)
            }
            Spacer(Modifier.width(8.dp))
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.height(10.dp))
        Text(value, style = MaterialTheme.typography.titleMedium, fontFamily = MonoFont, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun WeekStrip(today: Long, busyDays: Set<Long>, onClick: () -> Unit) {
    val start = today - 1
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
        (0 until 7).forEach { i ->
            val day = start + i
            val d = LocalDate.ofEpochDay(day)
            val isToday = day == today
            Column(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (isToday) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerLow)
                    .border(1.dp, if (isToday) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp))
                    .clickable(onClick = onClick)
                    .padding(vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                val fg = if (isToday) Color.White else MaterialTheme.colorScheme.onSurface
                Text(d.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.getDefault()).take(3), style = MaterialTheme.typography.labelSmall, color = fg.copy(alpha = 0.75f))
                Text("${d.dayOfMonth}", style = MaterialTheme.typography.titleMedium, fontFamily = MonoFont, fontWeight = FontWeight.Bold, color = fg)
                Box(
                    Modifier.size(5.dp).clip(CircleShape)
                        .background(if (day in busyDays) (if (isToday) Color.White else MaterialTheme.colorScheme.primary) else Color.Transparent),
                )
            }
        }
    }
}

@Composable
private fun MiniProjectCard(p: Project, received: Double, members: List<Triple<String, Int, String>>, onClick: () -> Unit) {
    AppCard(Modifier.width(220.dp), onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(p.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            StatusChip(p.status)
        }
        Text(p.clientName.ifBlank { "No client" }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        Spacer(Modifier.height(10.dp))
        if (p.billing == Billing.FIXED && p.price > 0) {
            ProgressBar((received / p.price).toFloat().coerceIn(0f, 1f), color = IncomeGreen)
            Spacer(Modifier.height(6.dp))
            Text("${Fmt.money(received, p.currency)} / ${Fmt.money(p.price, p.currency)}", style = MaterialTheme.typography.labelSmall, fontFamily = MonoFont)
        } else {
            Text(
                if (p.billing == Billing.HOURLY) "Hourly · ${Fmt.money(p.hourlyRate, p.currency)}/h" else "No price set",
                style = MaterialTheme.typography.labelSmall, fontFamily = MonoFont,
            )
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            val d = p.deadline
            if (d != null) {
                Icon(Ico.Flag, null, Modifier.size(11.dp), tint = if (d < Fmt.today()) ExpenseRed else MaterialTheme.colorScheme.onSurfaceVariant)
                Text(" " + Fmt.daysLeft(d), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            } else {
                Spacer(Modifier.weight(1f))
            }
            if (members.size > 1) AvatarStack(members, 22.dp, 3)
        }
    }
}
