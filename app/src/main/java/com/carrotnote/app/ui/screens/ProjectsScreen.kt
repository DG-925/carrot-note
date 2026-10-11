package com.carrotnote.app.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.ExtendedFloatingActionButton
import com.carrotnote.app.ui.components.PillChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.carrotnote.app.Graph
import com.carrotnote.app.data.Project
import com.carrotnote.app.data.ProjectStatus
import com.carrotnote.app.data.Txn
import com.carrotnote.app.data.TxnKind
import com.carrotnote.app.ui.Edit
import com.carrotnote.app.ui.EventRow
import com.carrotnote.app.ui.Fmt
import com.carrotnote.app.ui.LocalEditor
import com.carrotnote.app.ui.NoteCard
import com.carrotnote.app.ui.TaskRow
import com.carrotnote.app.ui.TxnRow
import com.carrotnote.app.ui.components.AppCard
import com.carrotnote.app.ui.components.HeroCard
import com.carrotnote.app.ui.theme.LocalOnHero
import com.carrotnote.app.ui.theme.MonoFont
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import com.carrotnote.app.ui.components.EmptyState
import com.carrotnote.app.ui.components.ListPadding
import com.carrotnote.app.ui.components.ProgressBar
import com.carrotnote.app.ui.components.SectionHeader
import com.carrotnote.app.ui.components.SimpleTopBar
import com.carrotnote.app.ui.theme.ExpenseRed
import com.carrotnote.app.ui.theme.IncomeGreen

/** Amount received for a project in the project's currency. */
fun projectReceived(p: Project, txns: List<Txn>) =
    txns.filter { it.projectId == p.id && it.kind == TxnKind.INCOME && it.currency == p.currency }.sumOf { it.amount }

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
    Text(
        ProjectStatus.label(status),
        color = color,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.Bold,
        modifier = Modifier
            .clip(CircleShape)
            .background(color.copy(alpha = if (hero) 0.22f else 0.14f))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
fun ProjectsScreen(nav: (String) -> Unit) {
    val repo = Graph.repo
    val editor = LocalEditor.current
    val projects by repo.projects.flow.collectAsState()
    val txns by repo.txns.flow.collectAsState()
    val tasks by repo.tasks.flow.collectAsState()
    var filter by rememberSaveable { mutableStateOf("open") }
    var query by rememberSaveable { mutableStateOf("") }

    val shown = projects
        .filter {
            when (filter) {
                "open" -> it.status == ProjectStatus.ACTIVE || it.status == ProjectStatus.ON_HOLD
                "done" -> it.status == ProjectStatus.DONE
                "cancelled" -> it.status == ProjectStatus.CANCELLED
                else -> true
            }
        }
        .filter { query.isBlank() || it.name.contains(query, true) || it.clientName.contains(query, true) || (repo.customers.get(it.customerId)?.name?.contains(query, true) == true) }
        .sortedWith(compareBy<Project>({ it.deadline ?: Long.MAX_VALUE }).thenByDescending { it.createdAt })

    Scaffold(
        topBar = { SimpleTopBar("Projects") },
        floatingActionButton = {
            ExtendedFloatingActionButton(containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary, onClick = { editor.open(Edit.ProjectEdit()) }, icon = { Icon(Icons.Default.Add, null) }, text = { Text("Project") })
        },
    ) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                OutlinedTextField(
                    value = query, onValueChange = { query = it }, placeholder = { Text("Search projects or clients") },
                    leadingIcon = { Icon(Icons.Default.Search, null) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
            }
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("open" to "In progress", "done" to "Done", "cancelled" to "Cancelled", "all" to "All").forEach { (k, l) ->
                        PillChip(selected = filter == k, onClick = { filter = k }, label = l)
                    }
                }
            }
            if (shown.isEmpty()) {
                item { EmptyState(Icons.Default.Work, "No projects here", "Add your freelance projects to track price, payments, tasks and notes.") }
            }
            items(shown.size, key = { shown[it].id }) { i ->
                val p = shown[i]
                val received = projectReceived(p, txns)
                val openTasks = tasks.count { it.projectId == p.id && !it.done }
                AppCard(onClick = { nav("project/${p.id}") }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(p.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            val client = repo.customers.get(p.customerId)?.name ?: p.clientName
                            Text(
                                listOfNotNull(client.ifBlank { null }, p.deadline?.let { Fmt.daysLeft(it) }, if (openTasks > 0) "$openTasks open tasks" else null).joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        StatusChip(p.status)
                    }
                    if (p.price > 0) {
                        Spacer(Modifier.height(8.dp))
                        ProgressBar((received / p.price).toFloat().coerceIn(0f, 1f), color = IncomeGreen)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Paid ${Fmt.money(received, p.currency)} of ${Fmt.money(p.price, p.currency)}", fontFamily = MonoFont,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun ProjectDetailScreen(id: String, onBack: () -> Unit, nav: (String) -> Unit) {
    val ctx = LocalContext.current
    val repo = Graph.repo
    val editor = LocalEditor.current
    val projects by repo.projects.flow.collectAsState()
    val txns by repo.txns.flow.collectAsState()
    val tasks by repo.tasks.flow.collectAsState()
    val notes by repo.notes.flow.collectAsState()
    val events by repo.events.flow.collectAsState()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val p = projects.firstOrNull { it.id == id }
    if (p == null) {
        Box(Modifier.fillMaxSize()) { TextButton(onClick = onBack, modifier = Modifier.align(Alignment.Center)) { Text("Project was deleted — go back") } }
        return
    }
    val customer = repo.customers.get(p.customerId)
    val received = projectReceived(p, txns)
    val pTasks = tasks.filter { it.projectId == id }.sortedWith(compareBy({ it.done }, { it.dueDate ?: Long.MAX_VALUE }))
    val pNotes = notes.filter { it.projectId == id }.sortedWith(compareByDescending<com.carrotnote.app.data.Note> { it.pinned }.thenByDescending { it.createdAt })
    val pTx = txns.filter { it.projectId == id }.sortedByDescending { it.date }
    val pEvents = events.filter { it.projectId == id }.sortedBy { it.date }
    val costs = pTx.filter { it.kind == TxnKind.EXPENSE && it.currency == p.currency }.sumOf { it.amount }

    Scaffold(
        topBar = {
            SimpleTopBar(p.name, onBack) {
                IconButton(onClick = { editor.open(Edit.ProjectEdit(p)) }) { Icon(Icons.Default.Edit, "Edit") }
            }
        },
        floatingActionButton = {
            val (label, action) = when (tab) {
                0 -> "Task" to { editor.open(Edit.Task(projectId = id)) }
                1 -> "Note" to { editor.open(Edit.NoteEdit(projectId = id)) }
                2 -> "Payment" to { editor.open(Edit.Money(kind = TxnKind.INCOME, projectId = id, customerId = p.customerId)) }
                else -> "Event" to { editor.open(Edit.Event(projectId = id)) }
            }
            ExtendedFloatingActionButton(containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary, onClick = action, icon = { Icon(Icons.Default.Add, null) }, text = { Text(label) })
        },
    ) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                HeroCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Client", style = MaterialTheme.typography.labelMedium)
                            Text(
                                (customer?.name ?: p.clientName).ifBlank { "—" },
                                style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,

                                modifier = if (customer != null) Modifier.clickable { nav("customer/${customer.id}") } else Modifier,
                            )
                        }
                        StatusChip(p.status)
                    }
                    Spacer(Modifier.height(10.dp))
                    Row {
                        Stat("Price", Fmt.money(p.price, p.currency), Modifier.weight(1f))
                        Stat("Received", Fmt.money(received, p.currency), Modifier.weight(1f), IncomeGreen)
                        Stat("Remaining", Fmt.money((p.price - received).coerceAtLeast(0.0), p.currency), Modifier.weight(1f), MaterialTheme.colorScheme.primary)
                    }
                    if (p.price > 0) {
                        Spacer(Modifier.height(8.dp))
                        ProgressBar((received / p.price).toFloat().coerceIn(0f, 1f), color = IncomeGreen)
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        listOfNotNull(
                            p.startDate?.let { "Started " + Fmt.dateShort(it) },
                            p.deadline?.let { "Deadline " + Fmt.dateShort(it) + " (" + Fmt.daysLeft(it) + ")" },
                        ).joinToString(" · ").ifBlank { "No dates set" },
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
            item {
                PrimaryTabRow(selectedTabIndex = tab, containerColor = MaterialTheme.colorScheme.background) {
                    listOf("Tasks", "Notes", "Money", "Info").forEachIndexed { i, t ->
                        Tab(selected = tab == i, onClick = { tab = i }, unselectedContentColor = MaterialTheme.colorScheme.onSurfaceVariant, text = { Text(t) })
                    }
                }
            }
            when (tab) {
                0 -> {
                    if (pTasks.isEmpty()) item { EmptyHint("No tasks yet. Break the project into steps.") }
                    items(pTasks.size, key = { pTasks[it].id }) { i -> TaskRow(pTasks[i], null) { editor.open(Edit.Task(pTasks[i])) } }
                    if (pTasks.isNotEmpty()) item {
                        val done = pTasks.count { it.done }
                        Text("$done of ${pTasks.size} done", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                1 -> {
                    if (pNotes.isEmpty()) item { EmptyHint("No notes yet. Save requirements, ideas and feedback here.") }
                    items(pNotes.size, key = { pNotes[it].id }) { i -> NoteCard(pNotes[i], null, { editor.open(Edit.NoteEdit(pNotes[i])) }) }
                }
                2 -> {
                    item {
                        Row {
                            Stat("Received", Fmt.money(received, p.currency), Modifier.weight(1f), IncomeGreen)
                            Stat("Costs", Fmt.money(costs, p.currency), Modifier.weight(1f), ExpenseRed)
                            Stat("Profit", Fmt.money(received - costs, p.currency), Modifier.weight(1f))
                        }
                    }
                    item {
                        TextButton(onClick = { editor.open(Edit.Money(kind = TxnKind.EXPENSE, projectId = id)) }) { Text("+ Add project cost") }
                    }
                    if (pTx.isEmpty()) item { EmptyHint("Payments you receive for this project will show here.") }
                    items(pTx.size, key = { pTx[it].id }) { i -> TxnRow(pTx[i], Fmt.dateShort(pTx[i].date)) { editor.open(Edit.Money(pTx[i])) } }
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
                                Icon(Icons.Default.ContentCopy, "Copy", tint = MaterialTheme.colorScheme.onSurfaceVariant)
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
