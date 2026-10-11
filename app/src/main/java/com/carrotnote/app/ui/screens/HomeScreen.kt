package com.carrotnote.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import com.carrotnote.app.ui.PillButton
import com.carrotnote.app.ui.TaskRow
import com.carrotnote.app.ui.components.AnimatedTotals
import com.carrotnote.app.ui.components.AppCard
import com.carrotnote.app.ui.components.CountUpText
import com.carrotnote.app.ui.components.Eyebrow
import com.carrotnote.app.ui.components.HeroCard
import com.carrotnote.app.ui.components.ProgressRing
import com.carrotnote.app.ui.components.PulseDot
import com.carrotnote.app.ui.components.RoundIconButton
import com.carrotnote.app.ui.components.Sparkline
import com.carrotnote.app.ui.components.Tile
import com.carrotnote.app.ui.components.bentoSurface
import com.carrotnote.app.ui.components.popIn
import com.carrotnote.app.ui.sumByCurrency
import com.carrotnote.app.ui.theme.Bento
import com.carrotnote.app.ui.theme.Ico
import com.carrotnote.app.ui.theme.NumFont
import com.carrotnote.app.ui.theme.TileColors
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.TextStyle
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
    val notes by repo.notes.flow.collectAsState()
    val time by repo.time.flow.collectAsState()

    val today = Fmt.today()
    val now = LocalDate.now()
    val monthStart = now.withDayOfMonth(1).toEpochDay()
    val monthTx = txns.filter { it.date in monthStart..today }
    val income = monthTx.filter { it.kind == TxnKind.INCOME }.sumByCurrency({ it.currency }, { it.amount })
    val expense = monthTx.filter { it.kind == TxnKind.EXPENSE }.sumByCurrency({ it.currency }, { it.amount })
    val net = (income.keys + expense.keys).associateWith { (income[it] ?: 0.0) - (expense[it] ?: 0.0) }
    // Running balance through the month in the main currency, for the sparkline.
    val trend = remember(monthTx, currency, today) {
        var sum = 0.0
        (monthStart..today).map { d ->
            monthTx.filter { it.date == d && it.currency == currency }.forEach { sum += if (it.kind == TxnKind.INCOME) it.amount else -it.amount }
            sum
        }
    }

    val active = projects.filter { it.status == ProjectStatus.ACTIVE || it.status == ProjectStatus.ON_HOLD }
        .sortedWith(compareBy<Project> { it.deadline ?: Long.MAX_VALUE }.thenByDescending { it.createdAt })
    val dueTasks = tasks.filter { !it.done && it.dueDate != null && it.dueDate <= today }.sortedWith(compareBy({ it.dueDate }, { it.dueTime ?: 9999 }))
    val lateCount = dueTasks.count { (it.dueDate ?: today) < today }
    val todayEvents = events.filter { it.date == today }.sortedBy { it.time ?: -1 }
    val projectNames = projects.associate { it.id to it.name }
    val recentNotes = notes.sortedWith(compareByDescending<Note> { it.pinned }.thenByDescending { it.createdAt }).take(3)
    val running = time.filter { it.running }.maxByOrNull { it.start }
    val zone = ZoneId.systemDefault()
    val todayMs = time.filter { !it.running && Instant.ofEpochMilli(it.start).atZone(zone).toLocalDate().toEpochDay() == today }.sumOf { it.durationMs() }
    val isNew = projects.isEmpty() && txns.isEmpty() && notes.isEmpty() && tasks.isEmpty()

    val greeting = when (LocalTime.now().hour) { in 5..11 -> "Good morning"; in 12..17 -> "Good afternoon"; else -> "Good evening" }
    val firstName = user?.name?.trim()?.substringBefore(' ')?.ifBlank { null } ?: user?.username.orEmpty()
    val monthName = now.month.getDisplayName(TextStyle.FULL, Locale.getDefault())

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            MainTopBar("$greeting, $firstName", Fmt.date(today), titleLines = 2) {
                RoundIconButton(Ico.Search, "Search", { nav("search") })
            }
        },
    ) { pad ->
        LazyColumn(
            Modifier.padding(pad),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Money
            item {
                HeroCard(Modifier.popIn(1), onClick = { nav("money") }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Eyebrow("$monthName, so far", Modifier.weight(1f))
                        Icon(Ico.Right, null, Modifier.size(12.dp))
                    }
                    Spacer(Modifier.height(4.dp))
                    AnimatedTotals(net, currency, style = MaterialTheme.typography.displaySmall, sign = true)
                    if (trend.size >= 2 && trend.any { it != 0.0 }) {
                        Spacer(Modifier.height(8.dp))
                        Sparkline(trend, Modifier.fillMaxWidth().height(44.dp))
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        HeroPill("↓ " + Fmt.totals(income, currency) + " in", Modifier.weight(1f, fill = false))
                        HeroPill("↑ " + Fmt.totals(expense, currency) + " out", Modifier.weight(1f, fill = false))
                    }
                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        HeroButton("Expense", Ico.Expense, Modifier.weight(1f)) { editor.open(Edit.Money(kind = TxnKind.EXPENSE)) }
                        HeroButton("Income", Ico.Income, Modifier.weight(1f)) { editor.open(Edit.Money(kind = TxnKind.INCOME)) }
                    }
                }
            }

            // Timer + due today
            item {
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).popIn(2), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    TimerTile(running, running?.let { projectNames[it.projectId] }, todayMs, Modifier.weight(1f).fillMaxHeight()) { nav("time") }
                    Tile(Bento.colors.butter, Modifier.weight(1f).fillMaxHeight(), onClick = { nav("calendar") }) {
                        Eyebrow("Due today")
                        CountUpText(dueTasks.size.toDouble(), { it.toLong().toString() }, style = MaterialTheme.typography.displayMedium)
                        Text(
                            when {
                                dueTasks.isEmpty() -> "Nothing due"
                                lateCount > 0 -> "task${if (dueTasks.size == 1) "" else "s"}, $lateCount late"
                                else -> "task${if (dueTasks.size == 1) "" else "s"}"
                            },
                            style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold,
                        )
                        if (todayEvents.isNotEmpty()) {
                            Text(
                                "+ ${todayEvents.size} event${if (todayEvents.size == 1) "" else "s"}",
                                style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }
            }

            if (isNew) {
                item {
                    WelcomeTile(
                        Modifier.popIn(3),
                        onProject = { editor.open(Edit.ProjectEdit()) },
                        onNote = { editor.open(Edit.NoteEdit()) },
                        onTask = { editor.open(Edit.Task(date = today)) },
                    )
                }
            }

            // Today
            item {
                AppCard(Modifier.popIn(3)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Today", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                        PillButton("Task", { editor.open(Edit.Task(date = today)) }, icon = Ico.Plus, container = Bento.colors.track, content = MaterialTheme.colorScheme.onSurface)
                    }
                    Spacer(Modifier.height(6.dp))
                    if (dueTasks.isEmpty() && todayEvents.isEmpty()) {
                        Text(
                            "Nothing due today. Enjoy it 🥕", style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 8.dp),
                        )
                    } else {
                        todayEvents.take(3).forEach { e -> EventRow(e, showDate = false) { editor.open(Edit.Event(e)) } }
                        dueTasks.take(5).forEach { t -> TaskRow(t, projectNames[t.projectId]) { editor.open(Edit.Task(t)) } }
                        if (dueTasks.size > 5) {
                            Text(
                                "+${dueTasks.size - 5} more in the calendar", style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.bentoSurface(RoundedCornerShape(10.dp), Color.Transparent, { nav("calendar") }).padding(8.dp),
                            )
                        }
                    }
                }
            }

            // Projects
            if (projects.isNotEmpty()) {
                item {
                    AppCard(Modifier.popIn(4)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Projects", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                            SeeAll { nav("projects") }
                        }
                        Spacer(Modifier.height(6.dp))
                        if (active.isEmpty()) {
                            Text("No projects in progress.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        active.take(3).forEach { p ->
                            val tracked = time.filter { it.projectId == p.id }.sumOf { it.durationMs() }
                            ProjectLine(p, projectReceived(p, txns), projectValue(p, tracked)) { nav("project/${p.id}") }
                        }
                    }
                }
            }

            // Notes
            if (notes.isNotEmpty()) {
                item {
                    Tile(Bento.colors.lilac, Modifier.fillMaxWidth().popIn(5)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Notes", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                            SeeAll(LocalContentColor.current) { nav("notes") }
                        }
                        Spacer(Modifier.height(6.dp))
                        recentNotes.forEach { n -> NoteLine(n) { editor.open(Edit.NoteEdit(n)) } }
                    }
                }
            }

            // Shortcuts
            item {
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).popIn(6),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Shortcut("Calendar", Ico.Calendar, Bento.colors.sky) { nav("calendar") }
                    Shortcut("Time", Ico.Timer, Bento.colors.mint) { nav("time") }
                    Shortcut("Customers", Ico.Users, Bento.colors.rose) { nav("customers") }
                    Shortcut("Debts", Ico.Debt, Bento.colors.butter) { nav("debts") }
                    Shortcut("Savings", Ico.Goal, Bento.colors.lilac) { nav("goals") }
                }
            }
        }
    }
}

@Composable
private fun SeeAll(color: Color = MaterialTheme.colorScheme.primary, onClick: () -> Unit) {
    Text(
        "See all", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = color,
        modifier = Modifier.bentoSurface(CircleShape, Color.Transparent, onClick).padding(horizontal = 10.dp, vertical = 6.dp),
    )
}

/** Translucent white pill on the orange hero. */
@Composable
fun HeroPill(text: String, modifier: Modifier = Modifier) {
    Text(
        text, modifier = modifier.clip(CircleShape).background(Color.White.copy(alpha = 0.2f)).padding(horizontal = 12.dp, vertical = 6.dp),
        style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = Color.White,
        maxLines = 1, overflow = TextOverflow.Ellipsis,
    )
}

/** Mint tile: the running timer with a live clock, or the time tracked today. */
@Composable
private fun TimerTile(running: TimeEntry?, projectName: String?, todayMs: Long, modifier: Modifier, onOpen: () -> Unit) {
    val ctx = LocalContext.current
    val mint = Bento.colors.mint
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    if (running != null) {
        LaunchedEffect(running.id) {
            while (true) {
                now = System.currentTimeMillis()
                delay(1000)
            }
        }
    }
    Tile(mint, modifier, onClick = onOpen) {
        if (running != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PulseDot(mint.content)
                Spacer(Modifier.width(8.dp))
                Eyebrow("Tracking")
            }
            Spacer(Modifier.height(4.dp))
            Text(TimeTracker.format(running.durationMs(now)), style = MaterialTheme.typography.headlineSmall, fontFamily = NumFont, maxLines = 1)
            Text(
                projectName ?: running.note.ifBlank { "No project" }, style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.weight(1f))
            Spacer(Modifier.height(10.dp))
            PillButton("Stop", { TimeTracker.stop(ctx) }, icon = Ico.Stop, container = mint.content, content = mint.container)
        } else {
            Eyebrow("Tracked today")
            Spacer(Modifier.height(4.dp))
            Text(TimeTracker.format(todayMs), style = MaterialTheme.typography.headlineSmall, fontFamily = NumFont, maxLines = 1)
            Text("No timer running", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Spacer(Modifier.height(10.dp))
            PillButton("Start", onOpen, icon = Ico.Play, container = mint.content, content = mint.container)
        }
    }
}

@Composable
private fun WelcomeTile(modifier: Modifier, onProject: () -> Unit, onNote: () -> Unit, onTask: () -> Unit) {
    val sky = Bento.colors.sky
    Tile(sky, modifier.fillMaxWidth()) {
        Text("Welcome to Carrot Note 👋", style = MaterialTheme.typography.titleLarge)
        Text("Start with one of these:", style = MaterialTheme.typography.bodyMedium, color = sky.content.copy(alpha = 0.75f))
        Spacer(Modifier.height(12.dp))
        StartRow(Ico.Project, "Add your first project", onProject)
        StartRow(Ico.Note, "Write a note", onNote)
        StartRow(Ico.Tasks, "Add a task for today", onTask)
    }
}

@Composable
private fun StartRow(icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .bentoSurface(RoundedCornerShape(16.dp), Bento.colors.card, onClick)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(14.dp))
        Text(label, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
        Icon(Ico.Right, null, Modifier.size(11.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ProjectLine(p: Project, received: Double, value: Double, onClick: () -> Unit) {
    val progress = if (value > 0) (received / value).toFloat().coerceIn(0f, 1f) else 0f
    val late = p.deadline != null && p.deadline < Fmt.today()
    Row(
        Modifier
            .fillMaxWidth()
            .bentoSurface(RoundedCornerShape(16.dp), Color.Transparent, onClick)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ProgressRing(progress, diameter = 44.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(p.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(p.clientName.ifBlank { null }, p.deadline?.let { Fmt.daysLeft(it) }).joinToString(" · ").ifBlank { ProjectStatus.label(p.status) },
                style = MaterialTheme.typography.bodySmall,
                color = if (late) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        if (value > 0) {
            Text("${(progress * 100).toInt()}%", style = MaterialTheme.typography.titleMedium, fontFamily = NumFont, fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun NoteLine(n: Note, onClick: () -> Unit) {
    val content = LocalContentColor.current
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp)
            .bentoSurface(RoundedCornerShape(16.dp), Bento.colors.card.copy(alpha = if (Bento.colors.dark) 0.25f else 0.6f), onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(if (n.checklist.isNotEmpty()) Ico.CheckSquare else Ico.Note, null, Modifier.size(14.dp), tint = content)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            val title = n.title.ifBlank { n.body.lineSequence().firstOrNull()?.ifBlank { null } ?: n.checklist.firstOrNull()?.text.orEmpty() }
            Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val sub = if (n.checklist.isNotEmpty()) "${n.checklist.count { it.done }}/${n.checklist.size} done" else n.body.takeIf { n.title.isNotBlank() }.orEmpty()
            if (sub.isNotBlank()) Text(sub, style = MaterialTheme.typography.bodySmall, color = content.copy(alpha = 0.7f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (n.pinned) Icon(Ico.Pin, null, Modifier.size(11.dp), tint = content)
    }
}

@Composable
private fun Shortcut(label: String, icon: ImageVector, colors: TileColors, onClick: () -> Unit) {
    Column(
        Modifier
            .width(92.dp)
            .bentoSurface(RoundedCornerShape(22.dp), colors.container, onClick, pressed = 0.92f)
            .padding(vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(38.dp).clip(RoundedCornerShape(13.dp)).background(colors.content.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
            Icon(icon, null, Modifier.size(15.dp), tint = colors.content)
        }
        Spacer(Modifier.height(8.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = colors.content, maxLines = 1)
    }
}
