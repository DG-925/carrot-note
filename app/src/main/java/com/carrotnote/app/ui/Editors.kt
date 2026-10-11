

package com.carrotnote.app.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.ContactsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContract
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Contacts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.carrotnote.app.Graph
import com.carrotnote.app.data.CalEvent
import com.carrotnote.app.data.Categories
import com.carrotnote.app.data.Customer
import com.carrotnote.app.data.Debt
import com.carrotnote.app.data.DebtDirection
import com.carrotnote.app.data.DebtPayment
import com.carrotnote.app.data.Goal
import com.carrotnote.app.data.GoalDeposit
import com.carrotnote.app.data.InfoItem
import com.carrotnote.app.data.Note
import com.carrotnote.app.data.Project
import com.carrotnote.app.data.ProjectStatus
import com.carrotnote.app.data.TaskItem
import com.carrotnote.app.data.Txn
import com.carrotnote.app.data.TxnKind
import com.carrotnote.app.reminders.Reminders
import com.carrotnote.app.ui.components.AmountInput
import com.carrotnote.app.ui.components.ChipChoice
import com.carrotnote.app.ui.components.CurrencyInput
import com.carrotnote.app.ui.components.DateInput
import com.carrotnote.app.ui.components.FieldLabel
import com.carrotnote.app.ui.components.FormDialog
import com.carrotnote.app.ui.components.PickerInput
import com.carrotnote.app.ui.components.SwitchRow
import com.carrotnote.app.ui.components.TextInput
import com.carrotnote.app.ui.components.TimeInput
import com.carrotnote.app.ui.theme.NoteColors

/** Anything that can be opened in an editor dialog. */
sealed interface Edit {
    data class Task(val item: TaskItem? = null, val projectId: String? = null, val date: Long? = null) : Edit
    data class NoteEdit(val item: Note? = null, val projectId: String? = null, val date: Long? = null) : Edit
    data class Money(val item: Txn? = null, val kind: String = TxnKind.EXPENSE, val projectId: String? = null, val customerId: String? = null, val date: Long? = null) : Edit
    data class ProjectEdit(val item: Project? = null, val customerId: String? = null) : Edit
    data class CustomerEdit(val item: Customer? = null) : Edit
    data class DebtEdit(val item: Debt? = null, val customerId: String? = null) : Edit
    data class DebtPay(val debt: Debt) : Edit
    data class GoalEdit(val item: Goal? = null) : Edit
    data class GoalMove(val goal: Goal) : Edit
    data class Event(val item: CalEvent? = null, val date: Long? = null, val projectId: String? = null) : Edit
}

class EditorController {
    var current by mutableStateOf<Edit?>(null)
        private set

    fun open(edit: Edit) {
        current = edit
    }

    fun close() {
        current = null
    }
}

val LocalEditor = staticCompositionLocalOf<EditorController> { error("No editor") }

@Composable
fun EditorHost(controller: EditorController) {
    val close = { controller.close() }
    when (val e = controller.current) {
        null -> Unit
        is Edit.Task -> TaskEditor(e, close)
        is Edit.NoteEdit -> NoteEditor(e, close)
        is Edit.Money -> TxnEditor(e, close)
        is Edit.ProjectEdit -> ProjectEditor(e, close)
        is Edit.CustomerEdit -> CustomerEditor(e, close)
        is Edit.DebtEdit -> DebtEditor(e, close)
        is Edit.DebtPay -> DebtPaymentDialog(e.debt, close)
        is Edit.GoalEdit -> GoalEditor(e, close)
        is Edit.GoalMove -> GoalDepositDialog(e.goal, close)
        is Edit.Event -> EventEditor(e, close)
    }
}

// ---------------------------------------------------------------- Task

@Composable
private fun TaskEditor(e: Edit.Task, close: () -> Unit) {
    val ctx = LocalContext.current
    val repo = Graph.repo
    val projects by repo.projects.flow.collectAsState()
    val base = e.item ?: TaskItem(projectId = e.projectId, dueDate = e.date)
    var title by remember { mutableStateOf(base.title) }
    var notes by remember { mutableStateOf(base.notes) }
    var projectId by remember { mutableStateOf(base.projectId) }
    var due by remember { mutableStateOf(base.dueDate) }
    var time by remember { mutableStateOf(base.dueTime) }
    var reminder by remember { mutableStateOf(base.reminder) }
    var priority by remember { mutableStateOf(base.priority) }
    var done by remember { mutableStateOf(base.done) }

    FormDialog(
        title = if (e.item == null) "New task" else "Edit task",
        onDismiss = close,
        saveEnabled = title.isNotBlank(),
        onSave = {
            val t = base.copy(
                title = title.trim(), notes = notes.trim(), projectId = projectId, dueDate = due,
                dueTime = if (due == null) null else time, reminder = reminder && due != null, priority = priority, done = done,
            )
            repo.tasks.save(t)
            Reminders.schedule(ctx, t)
            close()
        },
        onDelete = e.item?.let { item -> { repo.tasks.delete(item.id); Reminders.cancel(ctx, "task_${item.id}"); close() } },
    ) {
        TextInput(title, { title = it }, "Task")
        TextInput(notes, { notes = it }, "Details", singleLine = false, minLines = 3)
        PickerInput("Project", projects.firstOrNull { it.id == projectId }, projects.sortedBy { it.name }, { it.name }, { projectId = it?.id })
        DateInput("Due date", due, { due = it })
        if (due != null) {
            TimeInput("Time", time, { time = it })
            SwitchRow("Remind me", "Notification at the due time (9:00 AM if no time)", reminder, { reminder = it })
        }
        FieldLabel("Priority")
        ChipChoice(listOf("0", "1", "2"), priority.toString(), { priority = it.toInt() }) {
            when (it) { "0" -> "Low"; "2" -> "High"; else -> "Normal" }
        }
        if (e.item != null) SwitchRow("Completed", null, done, { done = it })
    }
}

// ---------------------------------------------------------------- Note

@Composable
private fun NoteEditor(e: Edit.NoteEdit, close: () -> Unit) {
    val repo = Graph.repo
    val projects by repo.projects.flow.collectAsState()
    val base = e.item ?: Note(projectId = e.projectId, date = e.date)
    var title by remember { mutableStateOf(base.title) }
    var body by remember { mutableStateOf(base.body) }
    var projectId by remember { mutableStateOf(base.projectId) }
    var date by remember { mutableStateOf(base.date) }
    var pinned by remember { mutableStateOf(base.pinned) }
    var color by remember { mutableStateOf(base.color) }

    FormDialog(
        title = if (e.item == null) "New note" else "Edit note",
        onDismiss = close,
        saveEnabled = title.isNotBlank() || body.isNotBlank(),
        onSave = {
            repo.notes.save(base.copy(title = title.trim(), body = body.trim(), projectId = projectId, date = date, pinned = pinned, color = color))
            close()
        },
        onDelete = e.item?.let { item -> { repo.notes.delete(item.id); close() } },
    ) {
        TextInput(title, { title = it }, "Title")
        TextInput(body, { body = it }, "Note", singleLine = false, minLines = 8)
        FieldLabel("Color")
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            NoteColors.forEachIndexed { i, c ->
                val bg = if (i == 0) MaterialTheme.colorScheme.surfaceContainerHigh else c
                androidx.compose.foundation.layout.Box(
                    Modifier
                        .size(34.dp)
                        .clip(CircleShape)
                        .background(bg)
                        .border(if (i == color) 3.dp else 1.dp, if (i == color) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant, CircleShape)
                        .clickable { color = i },
                )
            }
        }
        SwitchRow("Pin to top", null, pinned, { pinned = it })
        PickerInput("Project", projects.firstOrNull { it.id == projectId }, projects.sortedBy { it.name }, { it.name }, { projectId = it?.id })
        DateInput("Show on calendar", date, { date = it })
    }
}

// ---------------------------------------------------------------- Money

@Composable
private fun TxnEditor(e: Edit.Money, close: () -> Unit) {
    val repo = Graph.repo
    val projects by repo.projects.flow.collectAsState()
    val customers by repo.customers.flow.collectAsState()
    val defaultCurrency by Graph.settings.currency.collectAsState()
    val base = e.item ?: Txn(
        kind = e.kind, projectId = e.projectId, customerId = e.customerId, date = e.date ?: Fmt.today(),
        currency = e.projectId?.let { repo.projects.get(it)?.currency } ?: defaultCurrency,
        category = if (e.kind == TxnKind.INCOME) (if (e.projectId != null) "Project payment" else "Freelance") else "Food",
    )
    var kind by remember { mutableStateOf(base.kind) }
    var amount by remember { mutableStateOf(if (base.amount == 0.0) "" else Fmt.amount(base.amount).replace(",", "")) }
    var currency by remember { mutableStateOf(base.currency) }
    var category by remember { mutableStateOf(base.category) }
    var method by remember { mutableStateOf(base.method) }
    var date by remember { mutableStateOf(base.date) }
    var note by remember { mutableStateOf(base.note) }
    var projectId by remember { mutableStateOf(base.projectId) }
    var customerId by remember { mutableStateOf(base.customerId) }
    val parsed = Fmt.parseAmount(amount)

    FormDialog(
        title = when {
            e.item != null -> "Edit transaction"
            kind == TxnKind.INCOME -> "Money received"
            else -> "New expense"
        },
        onDismiss = close,
        saveEnabled = parsed != null && parsed > 0 && currency.isNotBlank(),
        onSave = {
            repo.txns.save(
                base.copy(
                    kind = kind, amount = parsed ?: 0.0, currency = currency.trim(), category = category.trim().ifBlank { "Other" },
                    method = method, date = date, note = note.trim(), projectId = projectId, customerId = customerId,
                )
            )
            close()
        },
        onDelete = e.item?.let { item -> { repo.txns.delete(item.id); close() } },
    ) {
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            listOf(TxnKind.EXPENSE to "Expense", TxnKind.INCOME to "Income").forEachIndexed { i, (k, label) ->
                SegmentedButton(
                    selected = kind == k,
                    onClick = {
                        if (kind != k) {
                            kind = k
                            category = if (k == TxnKind.INCOME) "Freelance" else "Food"
                        }
                    },
                    shape = SegmentedButtonDefaults.itemShape(i, 2),
                ) { Text(label) }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AmountInput(amount, { amount = it }, modifier = Modifier.weight(1.4f))
            CurrencyInput(currency, { currency = it }, Modifier.weight(1f))
        }
        FieldLabel("Category")
        val cats = if (kind == TxnKind.INCOME) Categories.income else Categories.expense
        ChipChoice((cats + listOfNotNull(category.takeIf { it.isNotBlank() && it !in cats })), category, { category = it })
        FieldLabel(if (kind == TxnKind.INCOME) "Received via" else "Paid with")
        ChipChoice(Categories.methods, method, { method = it })
        DateInput("Date", date, { date = it ?: Fmt.today() }, allowClear = false)
        TextInput(note, { note = it }, if (kind == TxnKind.INCOME) "Note (from who / what for)" else "What did you spend on?", singleLine = false, minLines = 2)
        PickerInput("Project", projects.firstOrNull { it.id == projectId }, projects.sortedBy { it.name }, { it.name }, { projectId = it?.id })
        PickerInput("Customer", customers.firstOrNull { it.id == customerId }, customers.sortedBy { it.name }, { it.name }, { customerId = it?.id })
    }
}

// ---------------------------------------------------------------- Project

@Composable
private fun ProjectEditor(e: Edit.ProjectEdit, close: () -> Unit) {
    val repo = Graph.repo
    val customers by repo.customers.flow.collectAsState()
    val defaultCurrency by Graph.settings.currency.collectAsState()
    val base = e.item ?: Project(customerId = e.customerId, currency = defaultCurrency, startDate = Fmt.today())
    var name by remember { mutableStateOf(base.name) }
    var customerId by remember { mutableStateOf(base.customerId) }
    var clientName by remember { mutableStateOf(base.clientName) }
    var price by remember { mutableStateOf(if (base.price == 0.0) "" else Fmt.amount(base.price).replace(",", "")) }
    var currency by remember { mutableStateOf(base.currency) }
    var status by remember { mutableStateOf(base.status) }
    var start by remember { mutableStateOf(base.startDate) }
    var deadline by remember { mutableStateOf(base.deadline) }
    var description by remember { mutableStateOf(base.description) }
    val info = remember { base.info.toMutableStateList() }

    FormDialog(
        title = if (e.item == null) "New project" else "Edit project",
        onDismiss = close,
        saveEnabled = name.isNotBlank(),
        onSave = {
            repo.projects.save(
                base.copy(
                    name = name.trim(), customerId = customerId, clientName = clientName.trim(),
                    price = Fmt.parseAmount(price) ?: 0.0, currency = currency.trim().ifBlank { defaultCurrency },
                    status = status, startDate = start, deadline = deadline, description = description.trim(),
                    info = info.filter { it.label.isNotBlank() || it.value.isNotBlank() },
                )
            )
            close()
        },
        onDelete = e.item?.let { item -> { repo.projects.delete(item.id); close() } },
    ) {
        TextInput(name, { name = it }, "Project name")
        PickerInput("Customer", customers.firstOrNull { it.id == customerId }, customers.sortedBy { it.name }, { it.name }, { customerId = it?.id }, noneLabel = "No saved customer")
        if (customerId == null) TextInput(clientName, { clientName = it }, "Client name (optional)")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AmountInput(price, { price = it }, "Total price", Modifier.weight(1.4f))
            CurrencyInput(currency, { currency = it }, Modifier.weight(1f))
        }
        FieldLabel("Status")
        ChipChoice(ProjectStatus.all, status, { status = it }, ProjectStatus::label)
        DateInput("Start date", start, { start = it })
        DateInput("Deadline", deadline, { deadline = it })
        TextInput(description, { description = it }, "Description / scope", singleLine = false, minLines = 3)
        FieldLabel("Project info (links, accounts, specs...)")
        info.forEachIndexed { i, item ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                TextInput(item.label, { info[i] = item.copy(label = it) }, "Label", Modifier.weight(0.8f))
                TextInput(item.value, { info[i] = item.copy(value = it) }, "Value", Modifier.weight(1.2f))
                IconButton(onClick = { info.removeAt(i) }) { Icon(Icons.Default.Close, "Remove") }
            }
        }
        OutlinedButton(onClick = { info.add(InfoItem()) }) {
            Icon(Icons.Default.Add, null); Text("  Add info field")
        }
    }
}

// ---------------------------------------------------------------- Customer

private class PickPhoneContact : ActivityResultContract<Unit, Uri?>() {
    override fun createIntent(context: Context, input: Unit) =
        Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI)

    override fun parseResult(resultCode: Int, intent: Intent?): Uri? = intent?.data
}

private fun readContact(context: Context, uri: Uri): Pair<String, String>? = runCatching {
    context.contentResolver.query(
        uri,
        arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER),
        null, null, null,
    )?.use { c -> if (c.moveToFirst()) (c.getString(0) ?: "") to (c.getString(1) ?: "") else null }
}.getOrNull()

@Composable
private fun CustomerEditor(e: Edit.CustomerEdit, close: () -> Unit) {
    val ctx = LocalContext.current
    val repo = Graph.repo
    val base = e.item ?: Customer()
    var name by remember { mutableStateOf(base.name) }
    var phone by remember { mutableStateOf(base.phone) }
    var email by remember { mutableStateOf(base.email) }
    var company by remember { mutableStateOf(base.company) }
    var notes by remember { mutableStateOf(base.notes) }
    val picker = rememberLauncherForActivityResult(PickPhoneContact()) { uri ->
        if (uri != null) readContact(ctx, uri)?.let { (n, p) ->
            if (n.isNotBlank()) name = n
            if (p.isNotBlank()) phone = p
        }
    }

    FormDialog(
        title = if (e.item == null) "New customer" else "Edit customer",
        onDismiss = close,
        saveEnabled = name.isNotBlank(),
        onSave = {
            repo.customers.save(base.copy(name = name.trim(), phone = phone.trim(), email = email.trim(), company = company.trim(), notes = notes.trim()))
            close()
        },
        onDelete = e.item?.let { item -> { repo.customers.delete(item.id); close() } },
    ) {
        OutlinedButton(onClick = { Graph.lock.suppressNextLock(); picker.launch(Unit) }, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Default.Contacts, null); Text("  Import from contacts")
        }
        TextInput(name, { name = it }, "Name")
        TextInput(phone, { phone = it }, "Phone", keyboardType = KeyboardType.Phone)
        TextInput(email, { email = it }, "Email", keyboardType = KeyboardType.Email)
        TextInput(company, { company = it }, "Company")
        TextInput(notes, { notes = it }, "Notes", singleLine = false, minLines = 3)
    }
}

// ---------------------------------------------------------------- Debt

@Composable
private fun DebtEditor(e: Edit.DebtEdit, close: () -> Unit) {
    val repo = Graph.repo
    val customers by repo.customers.flow.collectAsState()
    val defaultCurrency by Graph.settings.currency.collectAsState()
    val base = e.item ?: Debt(customerId = e.customerId, currency = defaultCurrency)
    var direction by remember { mutableStateOf(base.direction) }
    var customerId by remember { mutableStateOf(base.customerId) }
    var person by remember { mutableStateOf(base.person) }
    var amount by remember { mutableStateOf(if (base.amount == 0.0) "" else Fmt.amount(base.amount).replace(",", "")) }
    var currency by remember { mutableStateOf(base.currency) }
    var due by remember { mutableStateOf(base.dueDate) }
    var note by remember { mutableStateOf(base.note) }
    val parsed = Fmt.parseAmount(amount)
    val customer = customers.firstOrNull { it.id == customerId }

    FormDialog(
        title = if (e.item == null) "New debt" else "Edit debt",
        onDismiss = close,
        saveEnabled = parsed != null && parsed > 0 && (person.isNotBlank() || customer != null),
        onSave = {
            repo.debts.save(
                base.copy(
                    direction = direction, customerId = customerId, person = customer?.name ?: person.trim(),
                    amount = parsed ?: 0.0, currency = currency.trim().ifBlank { defaultCurrency }, dueDate = due, note = note.trim(),
                )
            )
            close()
        },
        onDelete = e.item?.let { item -> { repo.debts.delete(item.id); close() } },
    ) {
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            listOf(DebtDirection.OWED_TO_ME to "They owe me", DebtDirection.I_OWE to "I owe").forEachIndexed { i, (d, label) ->
                SegmentedButton(selected = direction == d, onClick = { direction = d }, shape = SegmentedButtonDefaults.itemShape(i, 2)) { Text(label) }
            }
        }
        PickerInput("Customer", customer, customers.sortedBy { it.name }, { it.name }, { customerId = it?.id }, noneLabel = "Not a saved customer")
        if (customer == null) TextInput(person, { person = it }, "Person name")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AmountInput(amount, { amount = it }, modifier = Modifier.weight(1.4f))
            CurrencyInput(currency, { currency = it }, Modifier.weight(1f))
        }
        DateInput("Due date", due, { due = it })
        TextInput(note, { note = it }, "Note", singleLine = false, minLines = 2)
    }
}

@Composable
private fun DebtPaymentDialog(debt: Debt, close: () -> Unit) {
    var amount by remember { mutableStateOf(Fmt.amount(debt.remaining).replace(",", "")) }
    var alsoRecord by remember { mutableStateOf(true) }
    val parsed = Fmt.parseAmount(amount)
    val incoming = debt.direction == DebtDirection.OWED_TO_ME
    AlertDialog(
        onDismissRequest = close,
        title = { Text(if (incoming) "Record payment received" else "Record payment made") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Remaining: ${Fmt.money(debt.remaining, debt.currency)}")
                AmountInput(amount, { amount = it })
                SwitchRow(
                    if (incoming) "Add to income" else "Add to expenses",
                    "Also record it in Money",
                    alsoRecord, { alsoRecord = it },
                )
            }
        },
        confirmButton = {
            TextButton(enabled = parsed != null && parsed > 0, onClick = {
                val a = parsed ?: return@TextButton
                val repo = Graph.repo
                repo.debts.save(debt.copy(payments = debt.payments + DebtPayment(amount = a, date = Fmt.today())))
                if (alsoRecord) {
                    repo.txns.save(
                        Txn(
                            kind = if (incoming) TxnKind.INCOME else TxnKind.EXPENSE, amount = a, currency = debt.currency,
                            category = if (incoming) "Other" else "Other", method = "Cash", date = Fmt.today(),
                            note = (if (incoming) "Debt repaid by " else "Debt paid to ") + debt.person, customerId = debt.customerId,
                        )
                    )
                }
                close()
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = close) { Text("Cancel") } },
    )
}

// ---------------------------------------------------------------- Goals

@Composable
private fun GoalEditor(e: Edit.GoalEdit, close: () -> Unit) {
    val repo = Graph.repo
    val defaultCurrency by Graph.settings.currency.collectAsState()
    val base = e.item ?: Goal(currency = defaultCurrency)
    var name by remember { mutableStateOf(base.name) }
    var target by remember { mutableStateOf(if (base.target == 0.0) "" else Fmt.amount(base.target).replace(",", "")) }
    var currency by remember { mutableStateOf(base.currency) }
    var deadline by remember { mutableStateOf(base.deadline) }
    var note by remember { mutableStateOf(base.note) }
    var initial by remember { mutableStateOf("") }
    val parsed = Fmt.parseAmount(target)

    FormDialog(
        title = if (e.item == null) "New savings goal" else "Edit goal",
        onDismiss = close,
        saveEnabled = name.isNotBlank() && parsed != null && parsed > 0,
        onSave = {
            val start = Fmt.parseAmount(initial)
            val deposits = if (e.item == null && start != null && start > 0)
                listOf(GoalDeposit(amount = start, date = Fmt.today(), note = "Starting amount")) else base.deposits
            repo.goals.save(
                base.copy(name = name.trim(), target = parsed ?: 0.0, currency = currency.trim().ifBlank { defaultCurrency }, deadline = deadline, note = note.trim(), deposits = deposits)
            )
            close()
        },
        onDelete = e.item?.let { item -> { repo.goals.delete(item.id); close() } },
    ) {
        TextInput(name, { name = it }, "Goal (e.g. New laptop, Emergency fund)")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AmountInput(target, { target = it }, "Target amount", Modifier.weight(1.4f))
            CurrencyInput(currency, { currency = it }, Modifier.weight(1f))
        }
        if (e.item == null) AmountInput(initial, { initial = it }, "Already saved (optional)")
        DateInput("Target date", deadline, { deadline = it })
        TextInput(note, { note = it }, "Note", singleLine = false, minLines = 2)
    }
}

@Composable
private fun GoalDepositDialog(goal: Goal, close: () -> Unit) {
    var amount by remember { mutableStateOf("") }
    var withdraw by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf("") }
    val parsed = Fmt.parseAmount(amount)
    AlertDialog(
        onDismissRequest = close,
        title = { Text(goal.name) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Saved ${Fmt.money(goal.saved, goal.currency)} of ${Fmt.money(goal.target, goal.currency)}")
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    SegmentedButton(selected = !withdraw, onClick = { withdraw = false }, shape = SegmentedButtonDefaults.itemShape(0, 2)) { Text("Add") }
                    SegmentedButton(selected = withdraw, onClick = { withdraw = true }, shape = SegmentedButtonDefaults.itemShape(1, 2)) { Text("Withdraw") }
                }
                AmountInput(amount, { amount = it })
                TextInput(note, { note = it }, "Note (optional)")
            }
        },
        confirmButton = {
            TextButton(enabled = parsed != null && parsed > 0, onClick = {
                val a = parsed ?: return@TextButton
                Graph.repo.goals.save(goal.copy(deposits = goal.deposits + GoalDeposit(amount = if (withdraw) -a else a, date = Fmt.today(), note = note.trim())))
                close()
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = close) { Text("Cancel") } },
    )
}

// ---------------------------------------------------------------- Calendar event

@Composable
private fun EventEditor(e: Edit.Event, close: () -> Unit) {
    val ctx = LocalContext.current
    val repo = Graph.repo
    val projects by repo.projects.flow.collectAsState()
    val customers by repo.customers.flow.collectAsState()
    val base = e.item ?: CalEvent(date = e.date ?: Fmt.today(), projectId = e.projectId, reminder = true)
    var title by remember { mutableStateOf(base.title) }
    var date by remember { mutableStateOf(base.date) }
    var time by remember { mutableStateOf(base.time) }
    var reminder by remember { mutableStateOf(base.reminder) }
    var note by remember { mutableStateOf(base.note) }
    var projectId by remember { mutableStateOf(base.projectId) }
    var customerId by remember { mutableStateOf(base.customerId) }

    FormDialog(
        title = if (e.item == null) "New event" else "Edit event",
        onDismiss = close,
        saveEnabled = title.isNotBlank(),
        onSave = {
            val ev = base.copy(title = title.trim(), date = date, time = time, reminder = reminder, note = note.trim(), projectId = projectId, customerId = customerId)
            repo.events.save(ev)
            Reminders.schedule(ctx, ev)
            close()
        },
        onDelete = e.item?.let { item -> { repo.events.delete(item.id); Reminders.cancel(ctx, "event_${item.id}"); close() } },
    ) {
        TextInput(title, { title = it }, "Title (meeting, call, delivery...)")
        DateInput("Date", date, { date = it ?: Fmt.today() }, allowClear = false)
        TimeInput("Time", time, { time = it })
        SwitchRow("Remind me", "Notification at the event time (9:00 AM if no time)", reminder, { reminder = it })
        PickerInput("Project", projects.firstOrNull { it.id == projectId }, projects.sortedBy { it.name }, { it.name }, { projectId = it?.id })
        PickerInput("Customer", customers.firstOrNull { it.id == customerId }, customers.sortedBy { it.name }, { it.name }, { customerId = it?.id })
        TextInput(note, { note = it }, "Note", singleLine = false, minLines = 3)
    }
}
