package com.carrotnote.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.graphicsLayer
import com.carrotnote.app.ui.PillButton
import com.carrotnote.app.ui.components.BentoFab
import com.carrotnote.app.ui.components.RoundIconButton
import com.carrotnote.app.ui.components.Tile
import com.carrotnote.app.ui.components.popIn
import com.carrotnote.app.ui.theme.Bento
import com.carrotnote.app.ui.theme.NumFont
import com.carrotnote.app.Graph
import com.carrotnote.app.data.DebtDirection
import com.carrotnote.app.ui.Edit
import com.carrotnote.app.ui.EventRow
import com.carrotnote.app.ui.Fmt
import com.carrotnote.app.ui.LocalEditor
import com.carrotnote.app.ui.NoteCard
import com.carrotnote.app.ui.TaskRow
import com.carrotnote.app.ui.TxnRow
import com.carrotnote.app.ui.components.AppCard
import com.carrotnote.app.ui.components.ListPadding
import com.carrotnote.app.ui.components.SectionHeader
import com.carrotnote.app.ui.components.SimpleTopBar
import com.carrotnote.app.ui.theme.Ico
import java.time.LocalDate
import java.time.format.TextStyle
import java.time.temporal.WeekFields
import java.util.Locale

@Composable
fun CalendarScreen(onBack: () -> Unit) {
    val nav = com.carrotnote.app.ui.LocalNav.current
    val repo = Graph.repo
    val editor = LocalEditor.current
    val tasks by repo.tasks.flow.collectAsState()
    val events by repo.events.flow.collectAsState()
    val notes by repo.notes.flow.collectAsState()
    val txns by repo.txns.flow.collectAsState()
    val projects by repo.projects.flow.collectAsState()
    val debts by repo.debts.flow.collectAsState()
    var selected by rememberSaveable { mutableLongStateOf(Fmt.today()) }
    var monthStart by rememberSaveable { mutableLongStateOf(LocalDate.now().withDayOfMonth(1).toEpochDay()) }
    var addMenu by remember { mutableStateOf(false) }

    val taskDays = tasks.mapNotNull { it.dueDate }.toSet()
    val eventDays = events.map { it.date }.toSet()
    val noteDays = notes.mapNotNull { it.date }.toSet()
    val moneyDays = txns.map { it.date }.toSet()
    val deadlineDays = (projects.mapNotNull { it.deadline } + debts.filter { !it.settled }.mapNotNull { it.dueDate }).toSet()

    val dayTasks = tasks.filter { it.dueDate == selected }.sortedWith(compareBy({ it.done }, { it.dueTime ?: 9999 }))
    val dayEvents = events.filter { it.date == selected }.sortedBy { it.time ?: -1 }
    val dayNotes = notes.filter { it.date == selected }
    val dayTx = txns.filter { it.date == selected }
    val dayDeadlines = projects.filter { it.deadline == selected }
    val dayDebts = debts.filter { !it.settled && it.dueDate == selected }
    val projectNames = projects.associate { it.id to it.name }

    Scaffold(
        topBar = {
            SimpleTopBar("Calendar", onBack) {
                PillButton("Today", {
                    selected = Fmt.today(); monthStart = LocalDate.now().withDayOfMonth(1).toEpochDay()
                }, icon = Ico.Today, container = Bento.colors.ink, content = Bento.colors.onInk)
                Spacer(Modifier.width(8.dp))
            }
        },
        floatingActionButton = {
            Box {
                BentoFab("Add") { addMenu = true }
                DropdownMenu(expanded = addMenu, onDismissRequest = { addMenu = false }) {
                    DropdownMenuItem(text = { Text("Task") }, leadingIcon = { Icon(Ico.Tasks, null, Modifier.size(15.dp)) }, onClick = { addMenu = false; editor.open(Edit.Task(date = selected)) })
                    DropdownMenuItem(text = { Text("Event / meeting") }, leadingIcon = { Icon(Ico.Calendar, null, Modifier.size(15.dp)) }, onClick = { addMenu = false; editor.open(Edit.Event(date = selected)) })
                    DropdownMenuItem(text = { Text("Note") }, leadingIcon = { Icon(Ico.Note, null, Modifier.size(15.dp)) }, onClick = { addMenu = false; editor.open(Edit.NoteEdit(date = selected)) })
                }
            }
        },
    ) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                MonthGrid(
                    modifier = Modifier.popIn(1),
                    month = LocalDate.ofEpochDay(monthStart),
                    selected = selected,
                    onSelect = { selected = it },
                    onMonth = { monthStart = it.toEpochDay() },
                    dots = { day ->
                        listOfNotNull(
                            if (day in taskDays) MaterialTheme.colorScheme.primary else null,
                            if (day in eventDays) MaterialTheme.colorScheme.tertiary else null,
                            if (day in noteDays) MaterialTheme.colorScheme.secondary else null,
                            if (day in deadlineDays) MaterialTheme.colorScheme.error else null,
                            if (day in moneyDays) MaterialTheme.colorScheme.outline else null,
                        )
                    },
                )
            }
            item { SectionHeader(Fmt.relativeDay(selected).let { if (it == Fmt.date(selected)) it else "$it · ${Fmt.date(selected)}" }) }
            val empty = dayTasks.isEmpty() && dayEvents.isEmpty() && dayNotes.isEmpty() && dayTx.isEmpty() && dayDeadlines.isEmpty() && dayDebts.isEmpty()
            if (empty) item { EmptyHint("Nothing planned. Tap + to add a task, event or note for this day.") }
            items(dayDeadlines.size, key = { "dl_" + dayDeadlines[it].id }) { i ->
                val p = dayDeadlines[i]
                Tile(Bento.colors.rose, Modifier.fillMaxWidth().animateItem(), onClick = { nav("project/${p.id}") }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Ico.Flag, null, Modifier.size(14.dp))
                        Text("  Deadline: ${p.name}", fontWeight = FontWeight.Bold)
                    }
                }
            }
            items(dayDebts.size, key = { "debt_" + dayDebts[it].id }) { i ->
                val d = dayDebts[i]
                Tile(Bento.colors.butter, Modifier.fillMaxWidth().animateItem(), onClick = { nav("debts") }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Ico.Flag, null, Modifier.size(14.dp))
                        Text(
                            if (d.direction == DebtDirection.OWED_TO_ME) "  ${d.person} should pay you ${Fmt.money(d.remaining, d.currency)}"
                            else "  Pay ${d.person} ${Fmt.money(d.remaining, d.currency)}",
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
            if (dayEvents.isNotEmpty() || dayTasks.isNotEmpty()) item(key = "agenda_$selected") {
                AppCard(Modifier.animateItem().popIn(2)) {
                    dayEvents.forEach { e -> EventRow(e, showDate = false) { editor.open(Edit.Event(e)) } }
                    dayTasks.forEach { t -> TaskRow(t, projectNames[t.projectId]) { editor.open(Edit.Task(t)) } }
                }
            }
            items(dayNotes.size, key = { "n_" + dayNotes[it].id }) { i -> NoteCard(dayNotes[i], projectNames[dayNotes[i].projectId], { editor.open(Edit.NoteEdit(dayNotes[i])) }, Modifier.animateItem()) }
            if (dayTx.isNotEmpty()) {
                item { SectionHeader("Money") }
                item(key = "money_$selected") { AppCard(Modifier.animateItem()) { dayTx.forEach { t -> TxnRow(t) { editor.open(Edit.Money(t)) } } } }
            }
        }
    }
}

@Composable
private fun MonthGrid(
    modifier: Modifier = Modifier,
    month: LocalDate,
    selected: Long,
    onSelect: (Long) -> Unit,
    onMonth: (LocalDate) -> Unit,
    dots: @Composable (Long) -> List<Color>,
) {
    val today = Fmt.today()
    val first = month.withDayOfMonth(1)
    val firstDow = WeekFields.of(Locale.getDefault()).firstDayOfWeek
    val offset = (first.dayOfWeek.value - firstDow.value + 7) % 7
    val daysInMonth = month.lengthOfMonth()
    val cells = offset + daysInMonth
    val rows = (cells + 6) / 7
    val weekDays = (0 until 7).map { firstDow.plus(it.toLong()).getDisplayName(TextStyle.NARROW, Locale.getDefault()) }

    AppCard(modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RoundIconButton(Ico.Left, "Previous month", { onMonth(first.minusMonths(1)) }, container = MaterialTheme.colorScheme.background, size = 38.dp)
            AnimatedContent(
                targetState = first,
                transitionSpec = {
                    val dir = if (targetState > initialState) 1 else -1
                    (slideInHorizontally { it * dir / 3 } + fadeIn()) togetherWith (slideOutHorizontally { -it * dir / 3 } + fadeOut())
                },
                label = "calendarMonth",
                modifier = Modifier.weight(1f),
            ) { m ->
                Text(Fmt.month(m), style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            }
            RoundIconButton(Ico.Right, "Next month", { onMonth(first.plusMonths(1)) }, container = MaterialTheme.colorScheme.background, size = 38.dp)
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth()) {
            weekDays.forEach {
                Text(it, modifier = Modifier.weight(1f), textAlign = TextAlign.Center, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(4.dp))
        for (r in 0 until rows) {
            Row(Modifier.fillMaxWidth()) {
                for (c in 0 until 7) {
                    val index = r * 7 + c
                    val dayNum = index - offset + 1
                    if (dayNum < 1 || dayNum > daysInMonth) {
                        Spacer(Modifier.weight(1f).aspectRatio(1f))
                    } else {
                        val epoch = first.withDayOfMonth(dayNum).toEpochDay()
                        val isSel = epoch == selected
                        val isToday = epoch == today
                        val dayDots = dots(epoch)
                        val bg by animateColorAsState(if (isSel) MaterialTheme.colorScheme.primary else Color.Transparent, tween(200), label = "dayBg")
                        val pop by animateFloatAsState(if (isSel) 1f else 0.92f, spring(dampingRatio = 0.4f, stiffness = 500f), label = "dayPop")
                        Column(
                            Modifier
                                .weight(1f)
                                .aspectRatio(1f)
                                .padding(2.dp)
                                .graphicsLayer { scaleX = pop; scaleY = pop }
                                .clip(RoundedCornerShape(14.dp))
                                .background(bg)
                                .then(if (isToday && !isSel) Modifier.border(2.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(14.dp)) else Modifier)
                                .clickable { onSelect(epoch) },
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Text(
                                "$dayNum",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = if (isToday || isSel) FontWeight.ExtraBold else FontWeight.Medium,
                                fontFamily = NumFont,
                                color = if (isSel) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.height(6.dp)) {
                                dayDots.take(4).forEach { col ->
                                    Box(Modifier.size(5.dp).clip(CircleShape).background(if (isSel) MaterialTheme.colorScheme.onPrimary else col))
                                }
                            }
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Legend(MaterialTheme.colorScheme.primary, "Task")
            Legend(MaterialTheme.colorScheme.tertiary, "Event")
            Legend(MaterialTheme.colorScheme.secondary, "Note")
            Legend(MaterialTheme.colorScheme.error, "Due")
            Legend(MaterialTheme.colorScheme.outline, "Money")
        }
    }
}

@Composable
private fun Legend(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(color))
        Text(" $label", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
