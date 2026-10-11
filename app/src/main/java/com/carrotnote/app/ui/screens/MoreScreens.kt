package com.carrotnote.app.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.carrotnote.app.Graph
import com.carrotnote.app.data.DebtDirection
import com.carrotnote.app.data.Invite
import com.carrotnote.app.data.Note
import com.carrotnote.app.data.TxnKind
import com.carrotnote.app.time.TimeTracker
import com.carrotnote.app.ui.DebtCard
import com.carrotnote.app.ui.Edit
import com.carrotnote.app.ui.EventRow
import com.carrotnote.app.ui.Fmt
import com.carrotnote.app.ui.GoalCard
import com.carrotnote.app.ui.LocalEditor
import com.carrotnote.app.ui.LocalNav
import com.carrotnote.app.ui.MainTopBar
import com.carrotnote.app.ui.NoteCard
import com.carrotnote.app.ui.TxnRow
import com.carrotnote.app.ui.components.AppCard
import com.carrotnote.app.ui.components.Avatar
import com.carrotnote.app.ui.components.EmptyState
import com.carrotnote.app.ui.components.HeroCard
import com.carrotnote.app.ui.components.IconBadge
import com.carrotnote.app.ui.components.ListPadding
import com.carrotnote.app.ui.components.PickerInput
import com.carrotnote.app.ui.components.PillChip
import com.carrotnote.app.ui.components.SectionHeader
import com.carrotnote.app.ui.components.SimpleTopBar
import com.carrotnote.app.ui.sumByCurrency
import com.carrotnote.app.ui.theme.ExpenseRed
import com.carrotnote.app.ui.theme.Ico
import com.carrotnote.app.ui.theme.IncomeGreen
import com.carrotnote.app.ui.theme.MonoFont
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.WeekFields
import java.util.Locale

@Composable
private fun AddFab(label: String, onClick: () -> Unit) {
    ExtendedFloatingActionButton(
        containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary,
        onClick = onClick, icon = { Icon(Ico.Plus, null, Modifier.size(14.dp)) }, text = { Text(label) },
    )
}

@Composable
private fun SearchField(query: String, onChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier) {
    OutlinedTextField(
        value = query, onValueChange = onChange, placeholder = { Text(placeholder) },
        leadingIcon = { Icon(Ico.Search, null, Modifier.size(16.dp)) },
        trailingIcon = { if (query.isNotEmpty()) IconButton(onClick = { onChange("") }) { Icon(Ico.Close, "Clear", Modifier.size(13.dp)) } },
        singleLine = true, modifier = modifier.fillMaxWidth(),
    )
}

// ---------------------------------------------------------------- Notes

@Composable
fun NotesScreen() {
    val repo = Graph.repo
    val editor = LocalEditor.current
    val notes by repo.notes.flow.collectAsState()
    val projects by repo.projects.flow.collectAsState()
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf("all") }
    val names = projects.associate { it.id to it.name }
    val shown = notes
        .filter {
            when (filter) {
                "pinned" -> it.pinned
                "personal" -> it.projectId == null
                "projects" -> it.projectId != null
                "checklists" -> it.checklist.isNotEmpty()
                else -> true
            }
        }
        .filter { n -> query.isBlank() || n.title.contains(query, true) || n.body.contains(query, true) || n.checklist.any { it.text.contains(query, true) } }
        .sortedWith(compareByDescending<Note> { it.pinned }.thenByDescending { it.createdAt })

    Scaffold(
        topBar = { MainTopBar("Notes", "${notes.size} note${if (notes.size == 1) "" else "s"} · ${notes.count { it.projectId == null }} personal") },
        floatingActionButton = { AddFab("Note") { editor.open(Edit.NoteEdit()) } },
    ) { pad ->
        LazyVerticalStaggeredGrid(
            columns = StaggeredGridCells.Fixed(2),
            modifier = Modifier.padding(pad),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 96.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalItemSpacing = 10.dp,
        ) {
            if (notes.size > 6) item(span = StaggeredGridItemSpan.FullLine) { SearchField(query, { query = it }, "Search notes") }
            item(span = StaggeredGridItemSpan.FullLine) {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("all" to "All", "personal" to "Personal", "pinned" to "Pinned").forEach { (k, l) ->
                        PillChip(selected = filter == k, onClick = { filter = k }, label = l)
                    }
                }
            }
            if (shown.isEmpty()) item(span = StaggeredGridItemSpan.FullLine) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    EmptyState(Ico.Note, "No notes here", "Write ideas, client requests or a to-do checklist. Notes are personal unless you put them in a project.")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { editor.open(Edit.NoteEdit()) }) { Icon(Ico.Pen, null, Modifier.size(12.dp)); Text("  New note") }
                        OutlinedButton(onClick = { editor.open(Edit.NoteEdit(checklist = true)) }) { Icon(Ico.CheckSquare, null, Modifier.size(12.dp)); Text("  Checklist") }
                    }
                }
            }
            items(shown.size, key = { shown[it].id }) { i ->
                NoteCard(shown[i], names[shown[i].projectId], { editor.open(Edit.NoteEdit(shown[i])) })
            }
        }
    }
}

// ---------------------------------------------------------------- Customers

@Composable
fun CustomersScreen(onBack: () -> Unit) {
    val repo = Graph.repo
    val editor = LocalEditor.current
    val nav = LocalNav.current
    val ctx = LocalContext.current
    val customers by repo.customers.flow.collectAsState()
    val debts by repo.debts.flow.collectAsState()
    var query by rememberSaveable { mutableStateOf("") }
    val shown = customers
        .filter { query.isBlank() || it.name.contains(query, true) || it.phone.contains(query) || it.company.contains(query, true) }
        .sortedBy { it.name.lowercase() }

    Scaffold(
        topBar = { SimpleTopBar("Customers", onBack) },
        floatingActionButton = { AddFab("Customer") { editor.open(Edit.CustomerEdit()) } },
    ) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { SearchField(query, { query = it }, "Search name, phone, company") }
            if (shown.isEmpty()) item { EmptyState(Ico.Users, "No customers yet", "Add clients manually or import them from your phone contacts.") }
            items(shown.size, key = { shown[it].id }) { i ->
                val c = shown[i]
                val owes = debts.filter { it.customerId == c.id && !it.settled && it.direction == DebtDirection.OWED_TO_ME }.sumByCurrency({ it.currency }, { it.remaining })
                AppCard(onClick = { nav("customer/${c.id}") }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Avatar(null, 0, c.name, 42.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(c.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            Text(
                                listOf(c.company, c.phone).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { "No contact info" },
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            if (owes.isNotEmpty()) Text("Owes you " + Fmt.totals(owes, Graph.settings.currency.value), style = MaterialTheme.typography.labelMedium, fontFamily = MonoFont, color = IncomeGreen)
                        }
                        if (c.phone.isNotBlank()) {
                            IconButton(onClick = { whatsapp(ctx, c.phone) }) { Icon(Ico.Whatsapp, "WhatsApp", Modifier.size(18.dp), tint = IncomeGreen) }
                            IconButton(onClick = { dial(ctx, c.phone) }) { Icon(Ico.Phone, "Call", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary) }
                        }
                    }
                }
            }
        }
    }
}

private fun launch(ctx: Context, intent: Intent) {
    try {
        Graph.lock.suppressNextLock()
        ctx.startActivity(intent)
    } catch (e: Exception) {
        Toast.makeText(ctx, "No app found to do that", Toast.LENGTH_SHORT).show()
    }
}

private fun dial(ctx: Context, phone: String) = launch(ctx, Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(phone))))
private fun whatsapp(ctx: Context, phone: String) = launch(ctx, Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/" + phone.filter { it.isDigit() })))
private fun email(ctx: Context, to: String) = launch(ctx, Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$to")))

@Composable
fun CustomerDetailScreen(id: String, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val repo = Graph.repo
    val editor = LocalEditor.current
    val nav = LocalNav.current
    val customers by repo.customers.flow.collectAsState()
    val projects by repo.projects.flow.collectAsState()
    val txns by repo.txns.flow.collectAsState()
    val debts by repo.debts.flow.collectAsState()
    val events by repo.events.flow.collectAsState()
    val currency by Graph.settings.currency.collectAsState()
    val c = customers.firstOrNull { it.id == id }
    if (c == null) {
        Box(Modifier.fillMaxSize()) { TextButton(onClick = onBack, modifier = Modifier.align(Alignment.Center)) { Text("Customer was deleted — go back") } }
        return
    }
    val cProjects = projects.filter { it.customerId == id }.sortedByDescending { it.createdAt }
    val projectIds = cProjects.map { it.id }.toSet()
    val cTx = txns.filter { it.customerId == id || (it.projectId != null && it.projectId in projectIds) }.sortedByDescending { it.date }
    val paid = cTx.filter { it.kind == TxnKind.INCOME }.sumByCurrency({ it.currency }, { it.amount })
    val cDebts = debts.filter { it.customerId == id }.sortedBy { it.settled }
    val cEvents = events.filter { it.customerId == id && it.date >= Fmt.today() }.sortedBy { it.date }

    Scaffold(
        topBar = {
            SimpleTopBar(c.name, onBack) {
                IconButton(onClick = { editor.open(Edit.CustomerEdit(c)) }) { Icon(Ico.Edit, "Edit", Modifier.size(18.dp)) }
            }
        },
    ) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                AppCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Avatar(null, 0, c.name, 56.dp)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(c.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                            if (c.company.isNotBlank()) Text(c.company, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    if (c.phone.isNotBlank() || c.email.isNotBlank()) {
                        Spacer(Modifier.height(12.dp))
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (c.phone.isNotBlank()) {
                                FilledTonalButton(onClick = { dial(ctx, c.phone) }) { Icon(Ico.Phone, null, Modifier.size(13.dp)); Text("  Call") }
                                FilledTonalButton(onClick = { whatsapp(ctx, c.phone) }) { Icon(Ico.Whatsapp, null, Modifier.size(14.dp)); Text("  WhatsApp") }
                            }
                            if (c.email.isNotBlank()) FilledTonalButton(onClick = { email(ctx, c.email) }) { Icon(Ico.Email, null, Modifier.size(13.dp)); Text("  Email") }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Stat("Total paid to you", Fmt.totals(paid, currency), color = IncomeGreen)
                    if (c.notes.isNotBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Text(c.notes, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { editor.open(Edit.ProjectEdit(customerId = id)) }) { Icon(Ico.Project, null, Modifier.size(12.dp)); Text("  Project") }
                    OutlinedButton(onClick = { editor.open(Edit.Money(kind = TxnKind.INCOME, customerId = id)) }) { Icon(Ico.Income, null, Modifier.size(12.dp)); Text("  Payment") }
                    OutlinedButton(onClick = { editor.open(Edit.DebtEdit(customerId = id)) }) { Icon(Ico.Debt, null, Modifier.size(12.dp)); Text("  Debt") }
                }
            }
            item { SectionHeader("Projects") }
            if (cProjects.isEmpty()) item { EmptyHint("No projects with this customer yet.") }
            items(cProjects.size, key = { "p_" + cProjects[it].id }) { i ->
                val p = cProjects[i]
                AppCard(onClick = { nav("project/${p.id}") }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(p.name, fontWeight = FontWeight.SemiBold)
                            Text("Paid ${Fmt.money(projectReceived(p, txns), p.currency)} of ${Fmt.money(p.price, p.currency)}", style = MaterialTheme.typography.bodySmall, fontFamily = MonoFont)
                        }
                        StatusChip(p.status)
                    }
                }
            }
            if (cDebts.isNotEmpty()) {
                item { SectionHeader("Debts") }
                items(cDebts.size, key = { "d_" + cDebts[it].id }) { i ->
                    DebtCard(cDebts[i], onClick = { editor.open(Edit.DebtEdit(cDebts[i])) }, onPay = { editor.open(Edit.DebtPay(cDebts[i])) })
                }
            }
            if (cEvents.isNotEmpty()) {
                item { SectionHeader("Upcoming") }
                items(cEvents.size, key = { "e_" + cEvents[it].id }) { i -> EventRow(cEvents[i], showDate = true) { editor.open(Edit.Event(cEvents[i])) } }
            }
            if (cTx.isNotEmpty()) {
                item { SectionHeader("Payments") }
                items(cTx.size, key = { "t_" + cTx[it].id }) { i -> TxnRow(cTx[i], Fmt.dateShort(cTx[i].date)) { editor.open(Edit.Money(cTx[i])) } }
            }
        }
    }
}

// ---------------------------------------------------------------- Debts

@Composable
fun DebtsScreen(onBack: () -> Unit) {
    val repo = Graph.repo
    val editor = LocalEditor.current
    val debts by repo.debts.flow.collectAsState()
    val currency by Graph.settings.currency.collectAsState()
    var filter by rememberSaveable { mutableStateOf("open") }
    val open = debts.filter { !it.settled }
    val owedToMe = open.filter { it.direction == DebtDirection.OWED_TO_ME }.sumByCurrency({ it.currency }, { it.remaining })
    val iOwe = open.filter { it.direction == DebtDirection.I_OWE }.sumByCurrency({ it.currency }, { it.remaining })
    val shown = debts.filter {
        when (filter) {
            "open" -> !it.settled
            DebtDirection.OWED_TO_ME -> !it.settled && it.direction == DebtDirection.OWED_TO_ME
            DebtDirection.I_OWE -> !it.settled && it.direction == DebtDirection.I_OWE
            else -> it.settled
        }
    }.sortedWith(compareBy({ it.dueDate ?: Long.MAX_VALUE }, { -it.createdAt }))

    Scaffold(
        topBar = { SimpleTopBar("Debts", onBack) },
        floatingActionButton = { AddFab("Debt") { editor.open(Edit.DebtEdit()) } },
    ) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                HeroCard {
                    Row {
                        Stat("↓ People owe you", Fmt.totals(owedToMe, currency), Modifier.weight(1f))
                        Stat("↑ You owe", Fmt.totals(iOwe, currency), Modifier.weight(1f))
                    }
                }
            }
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("open" to "Open", DebtDirection.OWED_TO_ME to "Owed to me", DebtDirection.I_OWE to "I owe", "settled" to "Settled").forEach { (k, l) ->
                        PillChip(selected = filter == k, onClick = { filter = k }, label = l)
                    }
                }
            }
            if (shown.isEmpty()) item { EmptyState(Ico.Debt, "No debts here", "Track money people owe you and money you owe others.") }
            items(shown.size, key = { shown[it].id }) { i ->
                DebtCard(shown[i], onClick = { editor.open(Edit.DebtEdit(shown[i])) }, onPay = { editor.open(Edit.DebtPay(shown[i])) })
            }
        }
    }
}

// ---------------------------------------------------------------- Goals

@Composable
fun GoalsScreen(onBack: () -> Unit) {
    val repo = Graph.repo
    val editor = LocalEditor.current
    val goals by repo.goals.flow.collectAsState()
    val currency by Graph.settings.currency.collectAsState()
    val saved = goals.sumByCurrency({ it.currency }, { it.saved })
    val sorted = goals.sortedWith(compareBy({ it.progress >= 1f }, { it.deadline ?: Long.MAX_VALUE }))

    Scaffold(
        topBar = { SimpleTopBar("Savings goals", onBack) },
        floatingActionButton = { AddFab("Goal") { editor.open(Edit.GoalEdit()) } },
    ) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                HeroCard {
                    Text("TOTAL SAVED", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.8f))
                    Text(Fmt.totals(saved, currency), style = MaterialTheme.typography.headlineMedium, fontFamily = MonoFont, fontWeight = FontWeight.Bold)
                    Text("${goals.count { it.progress >= 1f }} of ${goals.size} goals reached", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.85f))
                }
            }
            if (sorted.isEmpty()) item { EmptyState(Ico.Goal, "No goals yet", "Set a target — a new laptop, a trip, an emergency fund — and add to it as you save.") }
            items(sorted.size, key = { sorted[it].id }) { i ->
                val g = sorted[i]
                GoalCard(g, onClick = { editor.open(Edit.GoalEdit(g)) }, onAdd = { editor.open(Edit.GoalMove(g)) })
            }
        }
    }
}

// ---------------------------------------------------------------- Time tracker

private fun dayOf(ms: Long) = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()).toLocalDate().toEpochDay()

@Composable
fun TimeScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current
    val repo = Graph.repo
    val editor = LocalEditor.current
    val time by repo.time.flow.collectAsState()
    val projects by repo.projects.flow.collectAsState()
    var projectId by rememberSaveable { mutableStateOf<String?>(null) }
    var note by rememberSaveable { mutableStateOf("") }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val running = time.filter { it.running }.maxByOrNull { it.start }
    if (running != null) LaunchedEffect(running.id) { while (true) { now = System.currentTimeMillis(); delay(1000) } }
    val names = projects.associate { it.id to it.name }
    val today = Fmt.today()
    val weekStart = LocalDate.now().with(WeekFields.of(Locale.getDefault()).dayOfWeek(), 1).toEpochDay()
    val todayMs = time.filter { dayOf(it.start) == today }.sumOf { it.durationMs(now) }
    val weekMs = time.filter { dayOf(it.start) >= weekStart }.sumOf { it.durationMs(now) }
    val byDay = time.sortedByDescending { it.start }.groupBy { dayOf(it.start) }

    Scaffold(
        topBar = {
            SimpleTopBar("Time tracker", onBack) {
                IconButton(onClick = { editor.open(Edit.TimeEdit()) }) { Icon(Ico.Plus, "Add time", Modifier.size(18.dp)) }
            }
        },
    ) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                HeroCard {
                    Text(if (running != null) "TRACKING · ${names[running.projectId] ?: "No project"}" else "READY", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.85f))
                    Text(
                        TimeTracker.format(running?.durationMs(now) ?: 0),
                        style = MaterialTheme.typography.displaySmall, fontFamily = MonoFont, fontWeight = FontWeight.Bold,
                        modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center,
                    )
                    if (running?.note?.isNotBlank() == true) Text(running.note, color = Color.White.copy(alpha = 0.85f), modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
                    Spacer(Modifier.height(12.dp))
                    Row {
                        Stat("Today", TimeTracker.format(todayMs), Modifier.weight(1f))
                        Stat("This week", TimeTracker.format(weekMs), Modifier.weight(1f))
                    }
                }
            }
            item {
                if (running != null) {
                    Button(onClick = { TimeTracker.stop(ctx) }, modifier = Modifier.fillMaxWidth().height(52.dp), colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = ExpenseRed)) {
                        Icon(Ico.Stop, null, Modifier.size(14.dp)); Text("  Stop timer", fontWeight = FontWeight.Bold)
                    }
                } else {
                    AppCard {
                        PickerInput("Project", projects.firstOrNull { it.id == projectId }, projects.sortedBy { it.name }, { it.name }, { projectId = it?.id }, noneLabel = "No project")
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(note, { note = it }, label = { Text("What are you working on?") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        Spacer(Modifier.height(12.dp))
                        Button(onClick = { TimeTracker.start(ctx, projectId, note.trim()); note = "" }, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                            Icon(Ico.Play, null, Modifier.size(14.dp)); Text("  Start timer", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            if (time.isEmpty()) item { EmptyState(Ico.Timer, "No time tracked yet", "Track hours per project, then bill hourly clients with an invoice in one tap.") }
            byDay.forEach { (day, entries) ->
                item(key = "h_$day") {
                    Row(Modifier.fillMaxWidth().padding(top = 6.dp)) {
                        Text(Fmt.relativeDay(day), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                        Text(TimeTracker.format(entries.sumOf { it.durationMs(now) }), style = MaterialTheme.typography.labelLarge, fontFamily = MonoFont, color = MaterialTheme.colorScheme.primary)
                    }
                }
                item(key = "c_$day") {
                    AppCard { entries.forEach { e -> TimeRow(e, names[e.projectId]) { editor.open(Edit.TimeEdit(e)) } } }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- Invitations

@Composable
fun InvitesScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val nav = LocalNav.current
    var invites by remember { mutableStateOf<List<Invite>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }
    val token = Graph.session.token ?: ""
    suspend fun load() {
        error = null
        runCatching { Graph.api.invites(token) }.onSuccess { invites = it; Graph.setInviteCount(it.size) }.onFailure { error = it.message; if (invites == null) invites = emptyList() }
    }
    LaunchedEffect(Unit) { load() }

    Scaffold(topBar = { SimpleTopBar("Invitations", onBack) }) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            val list = invites
            if (list == null) item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
            error?.let { item { Text(it, color = ExpenseRed) } }
            if (list != null && list.isEmpty()) item {
                EmptyState(Ico.Inbox, "No invitations", "When someone invites you to their project, it shows up here. Share your username so people can find you.")
            }
            list?.let { l ->
                items(l.size, key = { l[it].id }) { i ->
                    val inv = l[i]
                    AppCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Avatar(inv.from.id, inv.from.avatarRev, inv.from.name.ifBlank { inv.from.username }, 44.dp)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(inv.projectName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                Text("${inv.from.name.ifBlank { "@" + inv.from.username }} invited you", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(enabled = busy == null, modifier = Modifier.weight(1f), onClick = {
                                busy = inv.id
                                scope.launch {
                                    runCatching { Graph.api.answerInvite(token, inv.id, true) }.onFailure { error = it.message }
                                    Graph.sync.syncNow()
                                    load()
                                    busy = null
                                    inv.spaceId.removePrefix("p_").let { pid -> if (Graph.repo.projects.get(pid) != null) nav("project/$pid") }
                                }
                            }) { Icon(Ico.Check, null, Modifier.size(12.dp)); Text("  Accept") }
                            OutlinedButton(enabled = busy == null, modifier = Modifier.weight(1f), onClick = {
                                busy = inv.id
                                scope.launch {
                                    runCatching { Graph.api.answerInvite(token, inv.id, false) }.onFailure { error = it.message }
                                    load()
                                    busy = null
                                }
                            }) { Text("Decline") }
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- Search

private data class Hit(val icon: ImageVector, val tint: @Composable () -> Color, val title: String, val subtitle: String, val open: () -> Unit)

@Composable
fun SearchScreen(onBack: () -> Unit) {
    val repo = Graph.repo
    val editor = LocalEditor.current
    val nav = LocalNav.current
    var query by rememberSaveable { mutableStateOf("") }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    val q = query.trim()
    val hits: List<Pair<String, List<Hit>>> = if (q.length < 2) emptyList() else listOf(
        "Projects" to repo.projects.value.filter { it.name.contains(q, true) || it.clientName.contains(q, true) || it.description.contains(q, true) }.map { p ->
            Hit(Ico.Project, { MaterialTheme.colorScheme.primary }, p.name, p.clientName.ifBlank { "Project" }) { nav("project/${p.id}") }
        },
        "Notes" to repo.notes.value.filter { n -> n.title.contains(q, true) || n.body.contains(q, true) || n.checklist.any { it.text.contains(q, true) } }.map { n ->
            Hit(Ico.Note, { MaterialTheme.colorScheme.tertiary }, n.title.ifBlank { n.body.take(40) }, n.body.take(60)) { editor.open(Edit.NoteEdit(n)) }
        },
        "Tasks" to repo.tasks.value.filter { it.title.contains(q, true) || it.notes.contains(q, true) }.map { t ->
            Hit(Ico.Tasks, { MaterialTheme.colorScheme.primary }, t.title, (if (t.done) "Done" else "Open") + (t.dueDate?.let { " · " + Fmt.dateShort(it) } ?: "")) { editor.open(Edit.Task(t)) }
        },
        "Customers" to repo.customers.value.filter { it.name.contains(q, true) || it.phone.contains(q) || it.company.contains(q, true) || it.email.contains(q, true) }.map { c ->
            Hit(Ico.User, { MaterialTheme.colorScheme.secondary }, c.name, listOf(c.company, c.phone).filter { it.isNotBlank() }.joinToString(" · ")) { nav("customer/${c.id}") }
        },
        "Money" to repo.txns.value.filter { it.note.contains(q, true) || it.category.contains(q, true) || it.method.contains(q, true) }.sortedByDescending { it.date }.take(30).map { t ->
            Hit(Ico.category(t.category), { if (t.kind == TxnKind.INCOME) IncomeGreen else ExpenseRed }, t.note.ifBlank { t.category }, (if (t.kind == TxnKind.INCOME) "+" else "−") + Fmt.money(t.amount, t.currency) + " · " + Fmt.dateShort(t.date)) { editor.open(Edit.Money(t)) }
        },
        "Events" to repo.events.value.filter { it.title.contains(q, true) || it.note.contains(q, true) }.map { e ->
            Hit(Ico.Calendar, { MaterialTheme.colorScheme.tertiary }, e.title, Fmt.date(e.date)) { editor.open(Edit.Event(e)) }
        },
    ).filter { it.second.isNotEmpty() }

    Scaffold(topBar = { SimpleTopBar("Search", onBack) }) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            item { SearchField(query, { query = it }, "Projects, notes, tasks, customers, money…", Modifier.focusRequester(focus)) }
            if (q.length >= 2 && hits.isEmpty()) item { EmptyState(Ico.Search, "Nothing found", "Try another word.") }
            if (q.length < 2) item { EmptyHint("Type at least 2 letters to search everything in Carrot Note.") }
            hits.forEach { (section, list) ->
                item(key = "s_$section") { SectionHeader("$section · ${list.size}") }
                items(list.size, key = { "${section}_$it" }) { i ->
                    val h = list[i]
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceContainerLow)
                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp))
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        IconBadge(h.icon, h.tint(), Modifier.size(36.dp))
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(h.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (h.subtitle.isNotBlank()) Text(h.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        TextButton(onClick = h.open) { Text("Open") }
                    }
                }
            }
        }
    }
}
