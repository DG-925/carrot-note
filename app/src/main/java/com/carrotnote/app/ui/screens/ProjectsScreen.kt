@file:OptIn(ExperimentalMaterial3Api::class)

package com.carrotnote.app.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.carrotnote.app.Graph
import com.carrotnote.app.data.Billing
import com.carrotnote.app.data.Note
import com.carrotnote.app.data.Project
import com.carrotnote.app.data.ProjectStatus
import com.carrotnote.app.data.PublicUser
import com.carrotnote.app.data.SpaceInfo
import com.carrotnote.app.data.Txn
import com.carrotnote.app.data.TxnKind
import com.carrotnote.app.export.Invoice
import com.carrotnote.app.time.TimeTracker
import com.carrotnote.app.ui.Edit
import com.carrotnote.app.ui.EventRow
import com.carrotnote.app.ui.Fmt
import com.carrotnote.app.ui.LocalEditor
import com.carrotnote.app.ui.LocalNav
import com.carrotnote.app.ui.MainTopBar
import com.carrotnote.app.ui.NoteCard
import com.carrotnote.app.ui.TaskRow
import com.carrotnote.app.ui.TxnRow
import com.carrotnote.app.ui.components.AppCard
import com.carrotnote.app.ui.components.Avatar
import com.carrotnote.app.ui.components.AvatarStack
import com.carrotnote.app.ui.components.EmptyState
import com.carrotnote.app.ui.components.HeroCard
import com.carrotnote.app.ui.components.PillChip
import com.carrotnote.app.ui.components.ProgressBar
import com.carrotnote.app.ui.components.SectionHeader
import com.carrotnote.app.ui.components.Segmented
import com.carrotnote.app.ui.components.SimpleTopBar
import com.carrotnote.app.ui.components.statusIcon
import com.carrotnote.app.ui.shareText
import com.carrotnote.app.ui.theme.ExpenseRed
import com.carrotnote.app.ui.theme.Ico
import com.carrotnote.app.ui.theme.IncomeGreen
import com.carrotnote.app.ui.theme.LocalOnHero
import com.carrotnote.app.ui.theme.MonoFont
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Amount received for a project in the project's currency. */
fun projectReceived(p: Project, txns: List<Txn>) =
    txns.filter { it.projectId == p.id && it.kind == TxnKind.INCOME && it.currency == p.currency }.sumOf { it.amount }

/** What the project is worth: fixed price, or tracked hours × rate. */
fun projectValue(p: Project, trackedMs: Long): Double =
    if (p.billing == Billing.HOURLY) TimeTracker.hours(trackedMs) * p.hourlyRate else p.price

@Composable
fun StatusChip(status: String) {
    val hero = LocalOnHero.current
    val color = when {
        hero -> Color.White
        status == ProjectStatus.ACTIVE -> MaterialTheme.colorScheme.primary
        status == ProjectStatus.DONE -> IncomeGreen
        status == ProjectStatus.CANCELLED -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.tertiary
    }
    Row(
        Modifier.clip(CircleShape).background(color.copy(alpha = if (hero) 0.22f else 0.14f)).padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(statusIcon(status), null, Modifier.size(10.dp), tint = color)
        Spacer(Modifier.width(5.dp))
        Text(ProjectStatus.label(status), color = color, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun ProjectsScreen() {
    val repo = Graph.repo
    val editor = LocalEditor.current
    val nav = LocalNav.current
    val projects by repo.projects.flow.collectAsState()
    val txns by repo.txns.flow.collectAsState()
    val tasks by repo.tasks.flow.collectAsState()
    val time by repo.time.flow.collectAsState()
    val spaces by repo.spaces.collectAsState()
    var filter by rememberSaveable { mutableStateOf("open") }
    var query by rememberSaveable { mutableStateOf("") }

    val shown = projects
        .filter {
            when (filter) {
                "open" -> it.status == ProjectStatus.ACTIVE || it.status == ProjectStatus.ON_HOLD
                "done" -> it.status == ProjectStatus.DONE
                "cancelled" -> it.status == ProjectStatus.CANCELLED
                "shared" -> spaces.any { s -> s.projectId == it.id }
                else -> true
            }
        }
        .filter { query.isBlank() || it.name.contains(query, true) || it.clientName.contains(query, true) }
        .sortedWith(compareBy<Project>({ it.deadline ?: Long.MAX_VALUE }).thenByDescending { it.createdAt })

    Scaffold(
        topBar = { MainTopBar("Projects", "${projects.count { it.status == ProjectStatus.ACTIVE }} active") },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary,
                onClick = { editor.open(Edit.ProjectEdit()) }, icon = { Icon(Ico.Plus, null, Modifier.size(14.dp)) }, text = { Text("Project") },
            )
        },
    ) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 96.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (projects.size > 6) item {
                OutlinedTextField(
                    value = query, onValueChange = { query = it }, placeholder = { Text("Search projects or clients") },
                    leadingIcon = { Icon(Ico.Search, null, Modifier.size(16.dp)) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
            }
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("open" to "In progress", "done" to "Done", "all" to "All").forEach { (k, l) ->
                        PillChip(selected = filter == k, onClick = { filter = k }, label = l)
                    }
                }
            }
            if (shown.isEmpty()) {
                item { EmptyState(Ico.Project, "No projects here", "Add your freelance projects to track price, payments, time, tasks and notes — and invite your team.") }
            }
            items(shown.size, key = { shown[it].id }) { i ->
                val p = shown[i]
                val space = spaces.firstOrNull { it.projectId == p.id }
                ProjectCard(
                    p, projectReceived(p, txns), tasks.count { it.projectId == p.id && !it.done },
                    time.filter { it.projectId == p.id }.sumOf { it.durationMs() }, space,
                ) { nav("project/${p.id}") }
            }
        }
    }
}

@Composable
private fun ProjectCard(p: Project, received: Double, openTasks: Int, trackedMs: Long, space: SpaceInfo?, onClick: () -> Unit) {
    val value = projectValue(p, trackedMs)
    AppCard(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(p.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    if (space != null) {
                        Spacer(Modifier.width(8.dp))
                        Icon(Ico.Team, "Shared", Modifier.size(13.dp), tint = MaterialTheme.colorScheme.tertiary)
                    }
                }
                Text(p.clientName.ifBlank { "No client" }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
            StatusChip(p.status)
        }
        Spacer(Modifier.height(12.dp))
        if (value > 0) {
            ProgressBar((received / value).toFloat().coerceIn(0f, 1f), color = IncomeGreen)
            Spacer(Modifier.height(6.dp))
            Row {
                Text("Paid ${Fmt.money(received, p.currency)}", style = MaterialTheme.typography.labelMedium, fontFamily = MonoFont, modifier = Modifier.weight(1f))
                Text("of ${Fmt.money(value, p.currency)}", style = MaterialTheme.typography.labelMedium, fontFamily = MonoFont, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(8.dp))
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            if (openTasks > 0) Meta(Ico.Tasks, "$openTasks to do")
            p.deadline?.let { Meta(Ico.Flag, Fmt.daysLeft(it), if (it < Fmt.today() && p.status == ProjectStatus.ACTIVE) ExpenseRed else null) }
            Spacer(Modifier.weight(1f))
            if (space != null && space.members.size > 1) AvatarStack(space.members.map { Triple(it.id, it.avatarRev, it.name.ifBlank { it.username }) }, 24.dp, 3)
        }
    }
}

@Composable
private fun Meta(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String, color: Color? = null) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, Modifier.size(11.dp), tint = color ?: MaterialTheme.colorScheme.onSurfaceVariant)
        Text(" $text", style = MaterialTheme.typography.labelSmall, color = color ?: MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun ProjectDetailScreen(id: String, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val repo = Graph.repo
    val editor = LocalEditor.current
    val nav = LocalNav.current
    val projects by repo.projects.flow.collectAsState()
    val txns by repo.txns.flow.collectAsState()
    val tasks by repo.tasks.flow.collectAsState()
    val notes by repo.notes.flow.collectAsState()
    val events by repo.events.flow.collectAsState()
    val time by repo.time.flow.collectAsState()
    val spaces by repo.spaces.collectAsState()
    val me by Graph.session.user.collectAsState()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var team by remember { mutableStateOf(false) }
    val p = projects.firstOrNull { it.id == id }
    if (p == null) {
        Box(Modifier.fillMaxSize()) { TextButton(onClick = onBack, modifier = Modifier.align(Alignment.Center)) { Text("This project is gone — go back") } }
        return
    }
    val space = spaces.firstOrNull { it.projectId == id }
    val isOwner = space == null || space.ownerId == me?.id
    val customer = repo.customers.get(p.customerId)
    val received = projectReceived(p, txns)
    val pTime = time.filter { it.projectId == id }.sortedByDescending { it.start }
    val trackedMs = pTime.sumOf { it.durationMs() }
    val value = projectValue(p, trackedMs)
    val pTasks = tasks.filter { it.projectId == id }.sortedWith(compareBy({ it.done }, { it.dueDate ?: Long.MAX_VALUE }))
    val pNotes = notes.filter { it.projectId == id }.sortedWith(compareByDescending<Note> { it.pinned }.thenByDescending { it.createdAt })
    val pTx = txns.filter { it.projectId == id }.sortedByDescending { it.date }
    val pEvents = events.filter { it.projectId == id }.sortedBy { it.date }
    val costs = pTx.filter { it.kind == TxnKind.EXPENSE && it.currency == p.currency }.sumOf { it.amount }
    val running = pTime.firstOrNull { it.running }

    Scaffold(
        topBar = {
            SimpleTopBar(p.name, onBack) {
                IconButton(onClick = { Invoice.share(ctx, p) }) { Icon(Ico.Invoice, "Invoice", Modifier.size(18.dp)) }
                IconButton(onClick = { editor.open(Edit.ProjectEdit(p)) }) { Icon(Ico.Edit, "Edit", Modifier.size(18.dp)) }
            }
        },
        floatingActionButton = {
            val (label, action) = when (tab) {
                0 -> "Task" to { editor.open(Edit.Task(projectId = id)) }
                1 -> "Note" to { editor.open(Edit.NoteEdit(projectId = id)) }
                2 -> "Payment" to { editor.open(Edit.Money(kind = TxnKind.INCOME, projectId = id, customerId = p.customerId)) }
                else -> "Event" to { editor.open(Edit.Event(projectId = id)) }
            }
            ExtendedFloatingActionButton(
                containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary,
                onClick = action, icon = { Icon(Ico.Plus, null, Modifier.size(14.dp)) }, text = { Text(label) },
            )
        },
    ) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 96.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                HeroCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("CLIENT", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.75f))
                            Text(
                                (customer?.name ?: p.clientName).ifBlank { "—" }, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                                modifier = if (customer != null) Modifier.clickable { nav("customer/${customer.id}") } else Modifier,
                            )
                        }
                        StatusChip(p.status)
                    }
                    Spacer(Modifier.height(12.dp))
                    Row {
                        if (p.billing == Billing.HOURLY) {
                            Stat("Hours", "%.1f h".format(TimeTracker.hours(trackedMs)), Modifier.weight(1f))
                            Stat("Rate", Fmt.money(p.hourlyRate, p.currency), Modifier.weight(1f))
                            Stat("Earned", Fmt.money(value, p.currency), Modifier.weight(1f))
                        } else {
                            Stat("Price", Fmt.money(p.price, p.currency), Modifier.weight(1f))
                            Stat("Received", Fmt.money(received, p.currency), Modifier.weight(1f))
                            Stat("Remaining", Fmt.money((p.price - received).coerceAtLeast(0.0), p.currency), Modifier.weight(1f))
                        }
                    }
                    if (value > 0) {
                        Spacer(Modifier.height(10.dp))
                        ProgressBar((received / value).toFloat().coerceIn(0f, 1f))
                    }
                    Spacer(Modifier.height(10.dp))
                    Text(
                        listOfNotNull(
                            p.startDate?.let { "Started " + Fmt.dateShort(it) },
                            p.deadline?.let { "Due " + Fmt.dateShort(it) + " · " + Fmt.daysLeft(it) },
                        ).joinToString("  ·  ").ifBlank { "No dates set" },
                        style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.85f),
                    )
                }
            }
            item {
                // Team + timer row
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    AppCard(Modifier.weight(1f), onClick = { team = true }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (space != null && space.members.isNotEmpty()) {
                                AvatarStack(space.members.map { Triple(it.id, it.avatarRev, it.name.ifBlank { it.username }) }, 26.dp, 3)
                            } else {
                                Icon(Ico.UserPlus, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                            }
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text("Team", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                                Text(
                                    when {
                                        space == null -> "Invite people"
                                        else -> "${space.members.size} member" + (if (space.members.size == 1) "" else "s") +
                                            (if (space.pending.isNotEmpty()) " · ${space.pending.size} invited" else "")
                                    },
                                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1,
                                )
                            }
                        }
                    }
                    AppCard(Modifier.weight(1f), onClick = { if (running != null) TimeTracker.stop(ctx) else TimeTracker.start(ctx, id) }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                Modifier.size(28.dp).clip(CircleShape).background(if (running != null) ExpenseRed else IncomeGreen),
                                contentAlignment = Alignment.Center,
                            ) { Icon(if (running != null) Ico.Stop else Ico.Play, null, Modifier.size(11.dp), tint = Color.White) }
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(if (running != null) "Stop timer" else "Start timer", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                                LiveDuration(running?.start, pTime.filter { !it.running }.sumOf { it.durationMs() })
                            }
                        }
                    }
                }
            }
            if (p.repo.isNotBlank()) {
                item {
                    AppCard(onClick = { openUrl(ctx, p.repo) }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Ico.Github, null, Modifier.size(20.dp))
                            Spacer(Modifier.width(12.dp))
                            Text(p.repo.removePrefix("https://").removePrefix("http://"), style = MaterialTheme.typography.bodyMedium, fontFamily = MonoFont, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Icon(Ico.Open, null, Modifier.size(12.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            item {
                Segmented(
                    listOf("Tasks" to null, "Notes" to null, "Money" to null, "Info" to null),
                    tab, { tab = it },
                )
            }
            when (tab) {
                0 -> {
                    if (pTasks.isEmpty()) item { EmptyHint("No tasks yet. Break the project into steps.") }
                    else item {
                        val done = pTasks.count { it.done }
                        Column {
                            Text("$done of ${pTasks.size} done", style = MaterialTheme.typography.labelMedium, fontFamily = MonoFont, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(6.dp))
                            ProgressBar(done.toFloat() / pTasks.size)
                        }
                    }
                    items(pTasks.size, key = { pTasks[it].id }) { i -> TaskRow(pTasks[i], null) { editor.open(Edit.Task(pTasks[i])) } }
                }
                1 -> {
                    if (pNotes.isEmpty()) item { EmptyHint(if (space != null) "Notes here are shared with your team." else "Save requirements, ideas and client feedback here.") }
                    items(pNotes.size, key = { pNotes[it].id }) { i -> NoteCard(pNotes[i], null, { editor.open(Edit.NoteEdit(pNotes[i])) }) }
                }
                2 -> {
                    item {
                        AppCard {
                            Row {
                                Stat("Received", Fmt.money(received, p.currency), Modifier.weight(1f), IncomeGreen)
                                Stat("Costs", Fmt.money(costs, p.currency), Modifier.weight(1f), ExpenseRed)
                                Stat("Profit", Fmt.money(received - costs, p.currency), Modifier.weight(1f))
                            }
                        }
                    }
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { editor.open(Edit.Money(kind = TxnKind.EXPENSE, projectId = id)) }) { Icon(Ico.Expense, null, Modifier.size(12.dp)); Text("  Add cost") }
                            OutlinedButton(onClick = { Invoice.share(ctx, p) }) { Icon(Ico.Invoice, null, Modifier.size(12.dp)); Text("  Invoice PDF") }
                        }
                    }
                    if (pTx.isEmpty()) item { EmptyHint("Payments you receive for this project show here (only you see your money).") }
                    items(pTx.size, key = { pTx[it].id }) { i -> TxnRow(pTx[i], Fmt.dateShort(pTx[i].date)) { editor.open(Edit.Money(pTx[i])) } }
                    if (pTime.isNotEmpty()) {
                        item { SectionHeader("Time logged") { TextButton(onClick = { editor.open(Edit.TimeEdit(projectId = id)) }) { Text("+ Add") } } }
                        items(pTime.size, key = { pTime[it].id }) { i -> TimeRow(pTime[i], null) { editor.open(Edit.TimeEdit(pTime[i])) } }
                    }
                }
                else -> {
                    if (p.description.isNotBlank()) {
                        item { SectionHeader("Description") }
                        item { Text(p.description, style = MaterialTheme.typography.bodyMedium) }
                    }
                    item { SectionHeader("Info") { TextButton(onClick = { editor.open(Edit.ProjectEdit(p)) }) { Text("Edit") } } }
                    if (p.info.isEmpty()) item { EmptyHint("Add links, logins, specs, or anything you need for this project.") }
                    items(p.info.size) { i ->
                        val info = p.info[i]
                        AppCard(onClick = { copy(ctx, info.value) }) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(info.label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(info.value, style = MaterialTheme.typography.bodyLarge)
                                }
                                Icon(Ico.Copy, "Copy", Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                    item { SectionHeader("Events & meetings") }
                    if (pEvents.isEmpty()) item { EmptyHint("No events. Add meetings, calls or delivery dates.") }
                    items(pEvents.size, key = { pEvents[it].id }) { i -> EventRow(pEvents[i], showDate = true) { editor.open(Edit.Event(pEvents[i])) } }
                }
            }
        }
    }
    if (team) TeamSheet(p, space, isOwner) { team = false }
}

@Composable
private fun LiveDuration(runningSince: Long?, finishedMs: Long) {
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    if (runningSince != null) LaunchedEffect(runningSince) { while (true) { now = System.currentTimeMillis(); delay(1000) } }
    val total = finishedMs + (runningSince?.let { (now - it).coerceAtLeast(0) } ?: 0L)
    Text(TimeTracker.format(total), style = MaterialTheme.typography.labelSmall, fontFamily = MonoFont, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

/** Members, pending invites, invite by username, and leave/remove. */
@Composable
private fun TeamSheet(project: Project, space: SpaceInfo?, isOwner: Boolean, onDismiss: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val me = Graph.session.user.collectAsState().value
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<PublicUser>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    val token = Graph.session.token ?: ""

    LaunchedEffect(query) {
        val q = cleanUsername(query)
        if (q.length < 2) { results = emptyList(); return@LaunchedEffect }
        searching = true
        delay(350)
        results = runCatching { Graph.api.searchUsers(token, q) }.getOrDefault(emptyList())
        searching = false
    }

    fun invite(username: String) {
        busy = username
        message = null
        scope.launch {
            try {
                Graph.sync.syncNow() // make sure the project exists on the server
                Graph.api.invite(token, project.id, username)
                Graph.sync.syncNow()
                message = "Invitation sent to @$username"
                query = ""
            } catch (e: Exception) {
                message = e.message
            } finally {
                busy = null
            }
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = state, containerColor = MaterialTheme.colorScheme.surfaceContainer) {
        Column(Modifier.padding(horizontal = 16.dp).navigationBarsPadding().padding(bottom = 16.dp).verticalScroll(rememberScrollState())) {
            Text("Team", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                "Members can see and add tasks, notes and events in “${project.name}”. Your money stays private.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(14.dp))
            val members = space?.members ?: listOfNotNull(me?.let { com.carrotnote.app.data.SpaceMember(it.id, it.username, it.name, it.avatarRev, "owner") })
            members.sortedBy { it.role != "owner" }.forEach { m ->
                PersonRow(m.id, m.avatarRev, m.name, m.username, if (m.role == "owner") "Owner" else "Member") {
                    if (isOwner && m.id != me?.id && space != null) {
                        TextButton(onClick = {
                            scope.launch {
                                runCatching { Graph.api.removeMember(token, space.id, m.id) }.onFailure { message = it.message }
                                Graph.sync.syncNow()
                            }
                        }) { Text("Remove", color = ExpenseRed) }
                    }
                }
            }
            space?.pending?.forEach { m -> PersonRow(m.id, m.avatarRev, m.name, m.username, "Invited · waiting") {} }

            if (isOwner) {
                Spacer(Modifier.height(16.dp))
                Text("Invite by username", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = query, onValueChange = { query = it }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Search @username") }, prefix = { Text("@") },
                    leadingIcon = { Icon(Ico.Search, null, Modifier.size(15.dp)) },
                    trailingIcon = { if (searching) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp) },
                )
                results.filter { r -> members.none { it.id == r.id } }.forEach { u ->
                    PersonRow(u.id, u.avatarRev, u.name, u.username, null) {
                        Button(enabled = busy == null, onClick = { invite(u.username) }, contentPadding = PaddingValues(horizontal = 14.dp)) {
                            if (busy == u.username) CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp, color = Color.White) else Text("Invite")
                        }
                    }
                }
                if (cleanUsername(query).length >= 3 && results.none { it.username == cleanUsername(query) } && !searching) {
                    TextButton(enabled = busy == null, onClick = { invite(cleanUsername(query)) }) { Text("Invite @${cleanUsername(query)}") }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = {
                    shareText(
                        ctx, "Join my project on Carrot Note",
                        "Hi! Join my project “${project.name}” on Carrot Note so we can work on it together.\n\n" +
                            "1. Download the app: https://github.com/${com.carrotnote.app.BuildConfig.GITHUB_REPO}/releases/latest\n" +
                            "2. Create an account and send me your username.\n\nMy username: @${me?.username}",
                    )
                }, modifier = Modifier.fillMaxWidth()) { Icon(Ico.Share, null, Modifier.size(13.dp)); Text("  Share an invite link") }
            } else if (space != null) {
                Spacer(Modifier.height(16.dp))
                OutlinedButton(
                    onClick = {
                        scope.launch {
                            runCatching { Graph.api.leaveSpace(token, space.id) }.onFailure { message = it.message }
                            Graph.sync.syncNow()
                            onDismiss()
                        }
                    },
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = ExpenseRed),
                    modifier = Modifier.fillMaxWidth(),
                ) { Icon(Ico.SignOut, null, Modifier.size(13.dp)); Text("  Leave this project") }
            }
            message?.let {
                Spacer(Modifier.height(10.dp))
                Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
fun PersonRow(id: String, avatarRev: Int, name: String, username: String, label: String?, trailing: @Composable () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Avatar(id, avatarRev, name.ifBlank { username }, 40.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(name.ifBlank { "@$username" }, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Text("@$username" + (label?.let { " · $it" } ?: ""), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
        trailing()
    }
}

@Composable
fun TimeRow(entry: com.carrotnote.app.data.TimeEntry, projectName: String?, onClick: () -> Unit) {
    val zone = java.time.ZoneId.systemDefault()
    fun hm(ms: Long) = java.time.Instant.ofEpochMilli(ms).atZone(zone).toLocalTime().let { Fmt.time(it.hour * 60 + it.minute) }
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    if (entry.running) LaunchedEffect(entry.id) { while (true) { delay(1000); now = System.currentTimeMillis() } }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(38.dp).clip(RoundedCornerShape(11.dp)).background((if (entry.running) ExpenseRed else MaterialTheme.colorScheme.primary).copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) { Icon(if (entry.running) Ico.Timer else Ico.Clock, null, Modifier.size(15.dp), tint = if (entry.running) ExpenseRed else MaterialTheme.colorScheme.primary) }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(entry.note.ifBlank { projectName ?: "Work" }, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(projectName?.takeIf { entry.note.isNotBlank() }, hm(entry.start) + " – " + (entry.end?.let(::hm) ?: "now")).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1,
            )
        }
        Text(TimeTracker.format(entry.durationMs(now)), fontFamily = MonoFont, fontWeight = FontWeight.Bold, color = if (entry.running) ExpenseRed else MaterialTheme.colorScheme.onSurface)
    }
}

fun openUrl(ctx: Context, url: String) {
    val full = if (url.startsWith("http")) url else "https://$url"
    try {
        Graph.lock.suppressNextLock()
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(full)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: Exception) {
        Toast.makeText(ctx, "Can't open link", Toast.LENGTH_SHORT).show()
    }
}

private fun copy(ctx: Context, text: String) {
    ctx.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Carrot Note", text))
    Toast.makeText(ctx, "Copied", Toast.LENGTH_SHORT).show()
}

@Composable
fun Stat(label: String, value: String, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.onSurface) {
    val hero = LocalOnHero.current
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = if (hero) Color.White.copy(alpha = 0.75f) else MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontFamily = MonoFont, fontWeight = FontWeight.Bold, color = if (hero) Color.White else color, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun EmptyHint(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 16.dp))
}
