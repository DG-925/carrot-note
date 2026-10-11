package com.carrotnote.app.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.NoteAdd
import androidx.compose.material.icons.automirrored.filled.StickyNote2
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Handshake
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.carrotnote.app.Graph
import com.carrotnote.app.data.DebtDirection
import com.carrotnote.app.data.Note
import com.carrotnote.app.data.TxnKind
import com.carrotnote.app.ui.DebtCard
import com.carrotnote.app.ui.Edit
import com.carrotnote.app.ui.EventRow
import com.carrotnote.app.ui.Fmt
import com.carrotnote.app.ui.GoalCard
import com.carrotnote.app.ui.LocalEditor
import com.carrotnote.app.ui.NoteCard
import com.carrotnote.app.ui.TxnRow
import com.carrotnote.app.ui.components.AppCard
import com.carrotnote.app.ui.components.EmptyState
import com.carrotnote.app.ui.components.IconBadge
import com.carrotnote.app.ui.components.ListPadding
import com.carrotnote.app.ui.components.SectionHeader
import com.carrotnote.app.ui.components.SimpleTopBar
import com.carrotnote.app.ui.sumByCurrency
import com.carrotnote.app.ui.theme.ExpenseRed
import com.carrotnote.app.ui.theme.IncomeGreen

@Composable
fun MoreScreen(nav: (String) -> Unit) {
    val repo = Graph.repo
    val customers by repo.customers.flow.collectAsState()
    val debts by repo.debts.flow.collectAsState()
    val goals by repo.goals.flow.collectAsState()
    val notes by repo.notes.flow.collectAsState()
    Scaffold(topBar = { SimpleTopBar("More") }) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { MoreRow(Icons.Default.Groups, "Customers", "${customers.size} saved", MaterialTheme.colorScheme.primary) { nav("customers") } }
            item { MoreRow(Icons.Default.Handshake, "Debts", "${debts.count { !it.settled }} open", ExpenseRed) { nav("debts") } }
            item { MoreRow(Icons.Default.Savings, "Savings goals", "${goals.size} goals", MaterialTheme.colorScheme.secondary) { nav("goals") } }
            item { MoreRow(Icons.AutoMirrored.Filled.StickyNote2, "Notes", "${notes.size} notes", MaterialTheme.colorScheme.tertiary) { nav("notes") } }
            item { MoreRow(Icons.Default.Settings, "Settings", "Account, security, sync, updates", MaterialTheme.colorScheme.outline) { nav("settings") } }
        }
    }
}

@Composable
private fun MoreRow(icon: ImageVector, title: String, subtitle: String, tint: androidx.compose.ui.graphics.Color, onClick: () -> Unit) {
    AppCard(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconBadge(icon, tint)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.Default.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// ---------------------------------------------------------------- Customers

@Composable
fun CustomersScreen(onBack: () -> Unit, nav: (String) -> Unit) {
    val repo = Graph.repo
    val editor = LocalEditor.current
    val customers by repo.customers.flow.collectAsState()
    val debts by repo.debts.flow.collectAsState()
    var query by rememberSaveable { mutableStateOf("") }
    val shown = customers
        .filter { query.isBlank() || it.name.contains(query, true) || it.phone.contains(query) || it.company.contains(query, true) }
        .sortedBy { it.name.lowercase() }

    Scaffold(
        topBar = { SimpleTopBar("Customers", onBack) },
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = { editor.open(Edit.CustomerEdit()) }, icon = { Icon(Icons.Default.Add, null) }, text = { Text("Customer") })
        },
    ) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                OutlinedTextField(
                    value = query, onValueChange = { query = it }, placeholder = { Text("Search name, phone, company") },
                    leadingIcon = { Icon(Icons.Default.Search, null) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
            }
            if (shown.isEmpty()) item {
                EmptyState(Icons.Default.Groups, "No customers yet", "Add clients manually or import them from your phone contacts.")
            }
            items(shown.size, key = { shown[it].id }) { i ->
                val c = shown[i]
                val owes = debts.filter { it.customerId == c.id && !it.settled && it.direction == DebtDirection.OWED_TO_ME }
                    .sumByCurrency({ it.currency }, { it.remaining })
                AppCard(onClick = { nav("customer/${c.id}") }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconBadge(Icons.Default.Person, MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(c.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            Text(
                                listOf(c.company, c.phone).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { "No contact info" },
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            if (owes.isNotEmpty()) Text("Owes you " + Fmt.totals(owes, Graph.settings.currency.value), style = MaterialTheme.typography.labelMedium, color = IncomeGreen)
                        }
                        if (c.phone.isNotBlank()) {
                            val ctx = LocalContext.current
                            IconButton(onClick = { dial(ctx, c.phone) }) { Icon(Icons.Default.Call, "Call", tint = MaterialTheme.colorScheme.primary) }
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
private fun whatsapp(ctx: Context, phone: String) =
    launch(ctx, Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/" + phone.filter { it.isDigit() })))
private fun email(ctx: Context, to: String) = launch(ctx, Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:" + to)))

@Composable
fun CustomerDetailScreen(id: String, onBack: () -> Unit, nav: (String) -> Unit) {
    val ctx = LocalContext.current
    val repo = Graph.repo
    val editor = LocalEditor.current
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
                IconButton(onClick = { editor.open(Edit.CustomerEdit(c)) }) { Icon(Icons.Default.Edit, "Edit") }
            }
        },
    ) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                AppCard(container = MaterialTheme.colorScheme.primaryContainer) {
                    if (c.company.isNotBlank()) Text(c.company, style = MaterialTheme.typography.titleSmall)
                    if (c.phone.isNotBlank()) Text(c.phone, style = MaterialTheme.typography.bodyLarge)
                    if (c.email.isNotBlank()) Text(c.email, style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (c.phone.isNotBlank()) {
                            FilledTonalButton(onClick = { dial(ctx, c.phone) }) { Icon(Icons.Default.Call, null); Text(" Call") }
                            FilledTonalButton(onClick = { whatsapp(ctx, c.phone) }) { Icon(Icons.AutoMirrored.Filled.Chat, null); Text(" WhatsApp") }
                        }
                        if (c.email.isNotBlank()) FilledTonalButton(onClick = { email(ctx, c.email) }) { Icon(Icons.Default.Email, null); Text(" Email") }
                    }
                    Spacer(Modifier.height(8.dp))
                    Stat("Total paid to you", Fmt.totals(paid, currency), color = IncomeGreen)
                    if (c.notes.isNotBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Text(c.notes, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilledTonalButton(onClick = { editor.open(Edit.ProjectEdit(customerId = id)) }) { Text("+ Project") }
                    FilledTonalButton(onClick = { editor.open(Edit.Money(kind = TxnKind.INCOME, customerId = id)) }) { Text("+ Payment") }
                    FilledTonalButton(onClick = { editor.open(Edit.DebtEdit(customerId = id)) }) { Text("+ Debt") }
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
                            Text("Paid ${Fmt.money(projectReceived(p, txns), p.currency)} of ${Fmt.money(p.price, p.currency)}", style = MaterialTheme.typography.bodySmall)
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
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = { editor.open(Edit.DebtEdit()) }, icon = { Icon(Icons.Default.Add, null) }, text = { Text("Debt") })
        },
    ) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    AppCard(Modifier.weight(1f)) { Stat("People owe you", Fmt.totals(owedToMe, currency), color = IncomeGreen) }
                    AppCard(Modifier.weight(1f)) { Stat("You owe", Fmt.totals(iOwe, currency), color = ExpenseRed) }
                }
            }
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("open" to "Open", DebtDirection.OWED_TO_ME to "Owed to me", DebtDirection.I_OWE to "I owe", "settled" to "Settled").forEach { (k, l) ->
                        FilterChip(selected = filter == k, onClick = { filter = k }, label = { Text(l) })
                    }
                }
            }
            if (shown.isEmpty()) item { EmptyState(Icons.Default.Handshake, "No debts here", "Track money people owe you and money you owe others.") }
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
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = { editor.open(Edit.GoalEdit()) }, icon = { Icon(Icons.Default.Add, null) }, text = { Text("Goal") })
        },
    ) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                AppCard(container = MaterialTheme.colorScheme.secondary.copy(alpha = 0.16f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.AccountBalanceWallet, null, tint = MaterialTheme.colorScheme.onSurface)
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text("Total saved", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface)
                            Text(Fmt.totals(saved, currency), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                        }
                    }
                }
            }
            if (sorted.isEmpty()) item { EmptyState(Icons.Default.Savings, "No goals yet", "Set a target — a new laptop, a trip, an emergency fund — and add to it as you save.") }
            items(sorted.size, key = { sorted[it].id }) { i ->
                val g = sorted[i]
                GoalCard(g, onClick = { editor.open(Edit.GoalEdit(g)) }, onAdd = { editor.open(Edit.GoalMove(g)) })
                if (g.deposits.isNotEmpty()) {
                    val last = g.deposits.takeLast(3).reversed()
                    Column(Modifier.padding(start = 16.dp, top = 4.dp)) {
                        last.forEach { d ->
                            Text(
                                "${Fmt.dateShort(d.date)}  ${if (d.amount >= 0) "+" else "−"}${Fmt.money(kotlin.math.abs(d.amount), g.currency)}" + (if (d.note.isNotBlank()) "  · ${d.note}" else ""),
                                style = MaterialTheme.typography.bodySmall, color = if (d.amount >= 0) IncomeGreen else ExpenseRed,
                            )
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- Notes

@Composable
fun NotesScreen(onBack: () -> Unit) {
    val repo = Graph.repo
    val editor = LocalEditor.current
    val notes by repo.notes.flow.collectAsState()
    val projects by repo.projects.flow.collectAsState()
    var query by rememberSaveable { mutableStateOf("") }
    val names = projects.associate { it.id to it.name }
    val shown = notes
        .filter { query.isBlank() || it.title.contains(query, true) || it.body.contains(query, true) }
        .sortedWith(compareByDescending<Note> { it.pinned }.thenByDescending { it.createdAt })

    Scaffold(
        topBar = { SimpleTopBar("Notes", onBack) },
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = { editor.open(Edit.NoteEdit()) }, icon = { Icon(Icons.AutoMirrored.Filled.NoteAdd, null) }, text = { Text("Note") })
        },
    ) { pad ->
        LazyVerticalStaggeredGrid(
            columns = StaggeredGridCells.Fixed(2),
            modifier = Modifier.padding(pad),
            contentPadding = ListPadding,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalItemSpacing = 10.dp,
        ) {
            item(span = StaggeredGridItemSpan.FullLine) {
                OutlinedTextField(
                    value = query, onValueChange = { query = it }, placeholder = { Text("Search notes") },
                    leadingIcon = { Icon(Icons.Default.Search, null) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
            }
            if (shown.isEmpty()) item(span = StaggeredGridItemSpan.FullLine) {
                EmptyState(Icons.AutoMirrored.Filled.StickyNote2, "No notes", "Write down ideas, client requests, passwords hints, anything.")
            }
            items(shown.size, key = { shown[it].id }) { i ->
                NoteCard(shown[i], names[shown[i].projectId], { editor.open(Edit.NoteEdit(shown[i])) })
            }
        }
    }
}
