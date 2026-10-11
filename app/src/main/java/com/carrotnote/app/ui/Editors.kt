@file:OptIn(ExperimentalLayoutApi::class)

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
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carrotnote.app.Graph
import com.carrotnote.app.data.Billing
import com.carrotnote.app.data.Budget
import com.carrotnote.app.data.CalEvent
import com.carrotnote.app.data.Categories
import com.carrotnote.app.data.CheckItem
import com.carrotnote.app.data.Customer
import com.carrotnote.app.data.Debt
import com.carrotnote.app.data.DebtDirection
import com.carrotnote.app.data.DebtPayment
import com.carrotnote.app.data.Goal
import com.carrotnote.app.data.GoalDeposit
import com.carrotnote.app.data.InfoItem
import com.carrotnote.app.data.Note
import com.carrotnote.app.data.Project
import com.carrotnote.app.data.TaskItem
import com.carrotnote.app.data.TimeEntry
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
import com.carrotnote.app.ui.components.Segmented
import com.carrotnote.app.ui.components.StatusDropdown
import com.carrotnote.app.ui.components.SwitchRow
import com.carrotnote.app.ui.components.TextInput
import com.carrotnote.app.ui.components.TimeInput
import com.carrotnote.app.ui.theme.ExpenseRed
import com.carrotnote.app.ui.theme.Ico
import com.carrotnote.app.ui.theme.IncomeGreen
import com.carrotnote.app.ui.theme.MonoFont
import com.carrotnote.app.ui.theme.NoteColors
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/** Anything that can be opened in an editor dialog. */
sealed interface Edit {
    data class Task(val item: TaskItem? = null, val projectId: String? = null, val date: Long? = null) : Edit
    data class NoteEdit(val item: Note? = null, val projectId: String? = null, val date: Long? = null, val checklist: Boolean = false) : Edit
    data class Money(val item: Txn? = null, val kind: String = TxnKind.EXPENSE, val projectId: String? = null, val customerId: String? = null, val date: Long? = null) : Edit
    data class ProjectEdit(val item: Project? = null, val customerId: String? = null) : Edit
    data class CustomerEdit(val item: Customer? = null) : Edit
    data class DebtEdit(val item: Debt? = null, val customerId: String? = null) : Edit
    data class DebtPay(val debt: Debt) : Edit
    data class GoalEdit(val item: Goal? = null) : Edit
    data class GoalMove(val goal: Goal) : Edit
    data class Event(val item: CalEvent? = null, val date: Long? = null, val projectId: String? = null) : Edit
    data class TimeEdit(val item: TimeEntry? = null, val projectId: String? = null) : Edit
    data class BudgetEdit(val item: Budget? = null) : Edit
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
        is Edit.TimeEdit -> TimeEditor(e, close)
        is Edit.BudgetEdit -> BudgetEditor(e, close)
    }
}

fun shareText(context: Context, subject: String, text: String) {
    Graph.lock.suppressNextLock()
    context.startActivity(
        Intent.createChooser(
            Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, subject).putExtra(Intent.EXTRA_TEXT, text),
            "Share",
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
}

private fun amountText(v: Double) = if (v == 0.0) "" else Fmt.amount(v).replace(",", "")

@Composable
private fun ProjectPicker(projectId: String?, onChange: (String?) -> Unit, label: String = "Project (optional)") {
    val projects by Graph.repo.projects.flow.collectAsState()
    PickerInput(label, projects.firstOrNull { it.id == projectId }, projects.sortedBy { it.name }, { it.name }, { onChange(it?.id) }, noneLabel = "No project — just for me")
}

@Composable
private fun CustomerPicker(customerId: String?, onChange: (String?) -> Unit, noneLabel: String = "None") {
    val customers by Graph.repo.customers.flow.collectAsState()
    PickerInput("Customer", customers.firstOrNull { it.id == customerId }, customers.sortedBy { it.name }, { it.name }, { onChange(it?.id) }, noneLabel = noneLabel)
}

/** Large centered amount entry used by money forms. */
@Composable
private fun BigAmount(value: String, onChange: (String) -> Unit, currency: String, onCurrency: (String) -> Unit, color: androidx.compose.ui.graphics.Color) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceContainerLow)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(20.dp)).padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("AMOUNT", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
        BasicTextField(
            value = value,
            onValueChange = { s -> if (s.all { it.isDigit() || it == '.' || it == ',' } && s.length <= 14) onChange(s) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            textStyle = TextStyle(fontFamily = MonoFont, fontWeight = FontWeight.Bold, fontSize = 40.sp, color = color, textAlign = TextAlign.Center),
            cursorBrush = SolidColor(color),
            decorationBox = { inner ->
                Box(Modifier.fillMaxWidth().padding(vertical = 6.dp), contentAlignment = Alignment.Center) {
                    if (value.isEmpty()) Text("0", fontFamily = MonoFont, fontWeight = FontWeight.Bold, fontSize = 40.sp, color = color.copy(alpha = 0.35f))
                    inner()
                }
            },
        )
        Box(Modifier.width(140.dp)) { CurrencyInput(currency, onCurrency) }
    }
}

/** Grid of icon tiles for picking a category. */
@Composable
private fun CategoryGrid(options: List<String>, selected: String, onSelect: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), maxItemsInEachRow = 4) {
        options.forEach { c ->
            val sel = c == selected
            Column(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (sel) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainerLow)
                    .border(1.dp, if (sel) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp))
                    .clickable { onSelect(c) }
                    .padding(vertical = 10.dp, horizontal = 4.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(Ico.category(c), null, Modifier.size(18.dp), tint = if (sel) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(6.dp))
                Text(
                    c, style = MaterialTheme.typography.labelSmall, maxLines = 1, textAlign = TextAlign.Center,
                    color = if (sel) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface,
                    fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal,
                )
            }
        }
        // Keep tiles the same width when the last row is not full.
        repeat((4 - options.size % 4) % 4) { Spacer(Modifier.weight(1f)) }
    }
}

/** Pill chips with icons (payment methods). */
@Composable
fun IconChips(options: List<String>, selected: String, icon: (String) -> ImageVector, onSelect: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { o ->
            val sel = o == selected
            Row(
                Modifier
                    .clip(CircleShape)
                    .background(if (sel) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerLow)
                    .border(1.dp, if (sel) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline, CircleShape)
                    .clickable { onSelect(o) }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(icon(o), null, Modifier.size(14.dp), tint = if (sel) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.width(8.dp))
                Text(o, style = MaterialTheme.typography.labelLarge, color = if (sel) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface, fontWeight = if (sel) FontWeight.Bold else FontWeight.Medium)
            }
        }
    }
}

// ---------------------------------------------------------------- Task

@Composable
private fun TaskEditor(e: Edit.Task, close: () -> Unit) {
    val ctx = LocalContext.current
    val repo = Graph.repo
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
        TextInput(title, { title = it }, "What needs to be done?")
        TextInput(notes, { notes = it }, "Details", singleLine = false, minLines = 3)
        FieldLabel("Priority")
        IconChips(listOf("Low", "Normal", "High"), listOf("Low", "Normal", "High")[priority], { if (it == "High") Ico.Flag else if (it == "Low") Ico.List else Ico.Tasks }) {
            priority = listOf("Low", "Normal", "High").indexOf(it)
        }
        ProjectPicker(projectId, { projectId = it })
        DateInput("Due date", due, { due = it })
        if (due != null) {
            TimeInput("Time", time, { time = it })
            SwitchRow("Remind me", "Notification at the due time (9:00 AM if no time)", reminder, { reminder = it })
        }
        if (e.item != null) SwitchRow("Completed", null, done, { done = it })
    }
}

// ---------------------------------------------------------------- Note

@Composable
private fun NoteEditor(e: Edit.NoteEdit, close: () -> Unit) {
    val ctx = LocalContext.current
    val repo = Graph.repo
    val base = e.item ?: Note(projectId = e.projectId, date = e.date, checklist = if (e.checklist) listOf(CheckItem()) else emptyList())
    var title by remember { mutableStateOf(base.title) }
    var body by remember { mutableStateOf(base.body) }
    var projectId by remember { mutableStateOf(base.projectId) }
    var date by remember { mutableStateOf(base.date) }
    var pinned by remember { mutableStateOf(base.pinned) }
    var color by remember { mutableStateOf(base.color) }
    val checklist = remember { base.checklist.toMutableStateList() }
    var focusId by remember { mutableStateOf<String?>(null) }
    val shared = repo.spaceForProject(projectId) != null

    fun current() = base.copy(
        title = title.trim(), body = body.trim(), projectId = projectId, date = date, pinned = pinned, color = color,
        checklist = checklist.filter { it.text.isNotBlank() },
    )

    FormDialog(
        title = if (e.item == null) "New note" else "Edit note",
        onDismiss = close,
        saveEnabled = title.isNotBlank() || body.isNotBlank() || checklist.any { it.text.isNotBlank() },
        onSave = { repo.notes.save(current()); close() },
        onDelete = e.item?.let { item -> { repo.notes.delete(item.id); close() } },
        actions = {
            IconButton(onClick = { pinned = !pinned }) {
                Icon(Ico.Pin, "Pin", Modifier.size(16.dp), tint = if (pinned) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = { shareText(ctx, title.ifBlank { "Note" }, noteAsText(current())) }) { Icon(Ico.Share, "Share", Modifier.size(16.dp)) }
        },
    ) {
        BasicTextField(
            value = title, onValueChange = { title = it }, singleLine = true,
            textStyle = MaterialTheme.typography.headlineSmall.copy(color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
            decorationBox = { inner ->
                Box { if (title.isEmpty()) Text("Title", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)); inner() }
            },
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        )
        BasicTextField(
            value = body, onValueChange = { body = it },
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
            decorationBox = { inner ->
                Box(Modifier.fillMaxWidth().height(if (checklist.isEmpty()) 180.dp else 80.dp)) {
                    if (body.isEmpty()) Text("Write anything…", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
                    inner()
                }
            },
            modifier = Modifier.fillMaxWidth(),
        )
        if (checklist.isNotEmpty()) {
            FieldLabel("Checklist · ${checklist.count { it.done }}/${checklist.size}")
            checklist.forEachIndexed { i, item ->
                val focus = remember(item.id) { FocusRequester() }
                LaunchedEffect(focusId) {
                    if (focusId == item.id) {
                        runCatching { focus.requestFocus() }
                        focusId = null
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(item.done, { checklist[i] = item.copy(done = it) })
                    BasicTextField(
                        value = item.text, onValueChange = { checklist[i] = item.copy(text = it) }, singleLine = true,
                        textStyle = MaterialTheme.typography.bodyLarge.copy(
                            color = if (item.done) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                            textDecoration = if (item.done) TextDecoration.LineThrough else null,
                        ),
                        cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                        decorationBox = { inner -> Box { if (item.text.isEmpty()) Text("Item", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)); inner() } },
                        modifier = Modifier.weight(1f).focusRequester(focus),
                    )
                    IconButton(onClick = { checklist.removeAt(i) }) { Icon(Ico.Close, "Remove", Modifier.size(14.dp)) }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { val item = CheckItem(); checklist.add(item); focusId = item.id }) {
                Icon(Ico.CheckSquare, null, Modifier.size(14.dp)); Text(if (checklist.isEmpty()) "  Add checklist" else "  Add item")
            }
        }
        FieldLabel("Color")
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            NoteColors.forEachIndexed { i, c ->
                val bg = if (i == 0) MaterialTheme.colorScheme.surfaceContainerHigh else c
                Box(
                    Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(bg)
                        .border(if (i == color) 3.dp else 1.dp, if (i == color) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant, CircleShape)
                        .clickable { color = i },
                )
            }
        }
        ProjectPicker(projectId, { projectId = it })
        Text(
            when {
                projectId == null -> "Personal note — only you can see it."
                shared -> "This project is shared: your team can see and edit this note."
                else -> "Saved under the project."
            },
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        DateInput("Show on calendar", date, { date = it })
    }
}

fun noteAsText(n: Note): String = buildString {
    if (n.title.isNotBlank()) appendLine(n.title).appendLine()
    if (n.body.isNotBlank()) appendLine(n.body)
    if (n.checklist.isNotEmpty()) {
        if (n.body.isNotBlank()) appendLine()
        n.checklist.forEach { appendLine((if (it.done) "☑ " else "☐ ") + it.text) }
    }
}.trim()

// ---------------------------------------------------------------- Money

@Composable
private fun TxnEditor(e: Edit.Money, close: () -> Unit) {
    val repo = Graph.repo
    val defaultCurrency by Graph.settings.currency.collectAsState()
    val base = e.item ?: Txn(
        kind = e.kind, projectId = e.projectId, customerId = e.customerId, date = e.date ?: Fmt.today(),
        currency = e.projectId?.let { repo.projects.get(it)?.currency } ?: defaultCurrency,
        category = if (e.kind == TxnKind.INCOME) (if (e.projectId != null) "Project payment" else "Freelance") else "Food",
    )
    var kind by remember { mutableStateOf(base.kind) }
    var amount by remember { mutableStateOf(amountText(base.amount)) }
    var currency by remember { mutableStateOf(base.currency) }
    var category by remember { mutableStateOf(base.category) }
    var method by remember { mutableStateOf(base.method) }
    var date by remember { mutableStateOf(base.date) }
    var note by remember { mutableStateOf(base.note) }
    var projectId by remember { mutableStateOf(base.projectId) }
    var customerId by remember { mutableStateOf(base.customerId) }
    val parsed = Fmt.parseAmount(amount)
    val income = kind == TxnKind.INCOME

    FormDialog(
        title = when {
            e.item != null -> "Edit transaction"
            income -> "Money received"
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
        Segmented(listOf("Expense" to Ico.Expense, "Income" to Ico.Income), if (income) 1 else 0, { i ->
            val k = if (i == 1) TxnKind.INCOME else TxnKind.EXPENSE
            if (k != kind) {
                kind = k
                category = if (k == TxnKind.INCOME) "Freelance" else "Food"
            }
        })
        BigAmount(amount, { amount = it }, currency, { currency = it }, if (income) IncomeGreen else ExpenseRed)
        FieldLabel("Category")
        val cats = if (income) Categories.income else Categories.expense
        CategoryGrid(cats + listOfNotNull(category.takeIf { it.isNotBlank() && it !in cats }), category) { category = it }
        FieldLabel(if (income) "Received via" else "Paid with")
        IconChips(Categories.methods, method, Ico::method) { method = it }
        TextInput(note, { note = it }, if (income) "From who / what for" else "What did you spend on?")
        DateInput("Date", date, { date = it ?: Fmt.today() }, allowClear = false)
        ProjectPicker(projectId, { projectId = it })
        CustomerPicker(customerId, { customerId = it })
    }
}

// ---------------------------------------------------------------- Project

@Composable
private fun ProjectEditor(e: Edit.ProjectEdit, close: () -> Unit) {
    val repo = Graph.repo
    val customers by repo.customers.flow.collectAsState()
    val defaultCurrency by Graph.settings.currency.collectAsState()
    val base = e.item ?: Project(customerId = e.customerId, currency = defaultCurrency, startDate = Fmt.today())
    val space = repo.spaceForProject(base.id)
    val isOwner = space == null || space.role == "owner"
    var name by remember { mutableStateOf(base.name) }
    var customerId by remember { mutableStateOf(base.customerId) }
    var clientName by remember { mutableStateOf(base.clientName) }
    var price by remember { mutableStateOf(amountText(base.price)) }
    var rate by remember { mutableStateOf(amountText(base.hourlyRate)) }
    var billing by remember { mutableStateOf(base.billing) }
    var currency by remember { mutableStateOf(base.currency) }
    var status by remember { mutableStateOf(base.status) }
    var start by remember { mutableStateOf(base.startDate) }
    var deadline by remember { mutableStateOf(base.deadline) }
    var description by remember { mutableStateOf(base.description) }
    var repoUrl by remember { mutableStateOf(base.repo) }
    val info = remember { base.info.toMutableStateList() }

    FormDialog(
        title = if (e.item == null) "New project" else "Edit project",
        onDismiss = close,
        saveEnabled = name.isNotBlank(),
        onSave = {
            val customer = customers.firstOrNull { it.id == customerId }
            repo.projects.save(
                base.copy(
                    name = name.trim(), customerId = customerId,
                    // Keep the client's name on the project so teammates see it too.
                    clientName = customer?.name ?: clientName.trim(),
                    price = Fmt.parseAmount(price) ?: 0.0, hourlyRate = Fmt.parseAmount(rate) ?: 0.0, billing = billing,
                    currency = currency.trim().ifBlank { defaultCurrency },
                    status = status, startDate = start, deadline = deadline, description = description.trim(), repo = repoUrl.trim(),
                    info = info.filter { it.label.isNotBlank() || it.value.isNotBlank() },
                )
            )
            close()
        },
        onDelete = if (isOwner) e.item?.let { item -> { repo.projects.delete(item.id); close() } } else null,
    ) {
        TextInput(name, { name = it }, "Project name")
        StatusDropdown(status, { status = it })
        if (isOwner) {
            CustomerPicker(customerId, { customerId = it }, noneLabel = "No saved customer")
        }
        if (customerId == null || !isOwner) TextInput(clientName, { clientName = it }, "Client name (optional)")
        FieldLabel("Billing")
        Segmented(listOf("Fixed price" to Ico.Tag, "Hourly" to Ico.Timer), if (billing == Billing.HOURLY) 1 else 0, {
            billing = if (it == 1) Billing.HOURLY else Billing.FIXED
        })
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (billing == Billing.HOURLY) AmountInput(rate, { rate = it }, "Rate per hour", Modifier.weight(1.4f))
            else AmountInput(price, { price = it }, "Total price", Modifier.weight(1.4f))
            CurrencyInput(currency, { currency = it }, Modifier.weight(1f))
        }
        DateInput("Start date", start, { start = it })
        DateInput("Deadline", deadline, { deadline = it })
        TextInput(description, { description = it }, "Description / scope", singleLine = false, minLines = 3)
        TextInput(repoUrl, { repoUrl = it }, "GitHub repository (optional)", keyboardType = KeyboardType.Uri, supporting = "e.g. github.com/you/project")
        FieldLabel("Project info (links, accounts, specs…)")
        info.forEachIndexed { i, item ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                TextInput(item.label, { info[i] = item.copy(label = it) }, "Label", Modifier.weight(0.8f))
                TextInput(item.value, { info[i] = item.copy(value = it) }, "Value", Modifier.weight(1.2f))
                IconButton(onClick = { info.removeAt(i) }) { Icon(Ico.Close, "Remove", Modifier.size(14.dp)) }
            }
        }
        OutlinedButton(onClick = { info.add(InfoItem()) }) {
            Icon(Ico.Plus, null, Modifier.size(14.dp)); Text("  Add info field")
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
            Icon(Ico.Contacts, null, Modifier.size(16.dp)); Text("  Import from contacts")
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
    var amount by remember { mutableStateOf(amountText(base.amount)) }
    var currency by remember { mutableStateOf(base.currency) }
    var due by remember { mutableStateOf(base.dueDate) }
    var note by remember { mutableStateOf(base.note) }
    val parsed = Fmt.parseAmount(amount)
    val customer = customers.firstOrNull { it.id == customerId }
    val owed = direction == DebtDirection.OWED_TO_ME

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
        Segmented(listOf("They owe me" to Ico.Income, "I owe" to Ico.Expense), if (owed) 0 else 1, {
            direction = if (it == 0) DebtDirection.OWED_TO_ME else DebtDirection.I_OWE
        })
        BigAmount(amount, { amount = it }, currency, { currency = it }, if (owed) IncomeGreen else ExpenseRed)
        CustomerPicker(customerId, { customerId = it }, noneLabel = "Not a saved customer")
        if (customer == null) TextInput(person, { person = it }, "Person name")
        DateInput("Due date", due, { due = it })
        TextInput(note, { note = it }, "Note", singleLine = false, minLines = 2)
    }
}

@Composable
private fun DebtPaymentDialog(debt: Debt, close: () -> Unit) {
    var amount by remember { mutableStateOf(amountText(debt.remaining)) }
    var alsoRecord by remember { mutableStateOf(true) }
    val parsed = Fmt.parseAmount(amount)
    val incoming = debt.direction == DebtDirection.OWED_TO_ME
    AlertDialog(
        onDismissRequest = close,
        icon = { Icon(Ico.Debt, null, Modifier.size(22.dp), tint = MaterialTheme.colorScheme.primary) },
        title = { Text(if (incoming) "Payment received" else "Payment made") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Remaining: ${Fmt.money(debt.remaining, debt.currency)}", fontFamily = MonoFont)
                AmountInput(amount, { amount = it })
                SwitchRow(if (incoming) "Add to income" else "Add to expenses", "Also record it in Money", alsoRecord, { alsoRecord = it })
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
                            category = "Other", method = "Cash", date = Fmt.today(),
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
    var target by remember { mutableStateOf(amountText(base.target)) }
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
            repo.goals.save(base.copy(name = name.trim(), target = parsed ?: 0.0, currency = currency.trim().ifBlank { defaultCurrency }, deadline = deadline, note = note.trim(), deposits = deposits))
            close()
        },
        onDelete = e.item?.let { item -> { repo.goals.delete(item.id); close() } },
    ) {
        TextInput(name, { name = it }, "Goal (e.g. New laptop, Emergency fund)")
        BigAmount(target, { target = it }, currency, { currency = it }, IncomeGreen)
        if (e.item == null) AmountInput(initial, { initial = it }, "Already saved (optional)")
        DateInput("Target date", deadline, { deadline = it })
        TextInput(note, { note = it }, "Note", singleLine = false, minLines = 2)
    }
}

@Composable
private fun GoalDepositDialog(goal: Goal, close: () -> Unit) {
    var amount by remember { mutableStateOf("") }
    var withdraw by remember { mutableStateOf(0) }
    var note by remember { mutableStateOf("") }
    val parsed = Fmt.parseAmount(amount)
    AlertDialog(
        onDismissRequest = close,
        icon = { Icon(Ico.Goal, null, Modifier.size(22.dp), tint = IncomeGreen) },
        title = { Text(goal.name) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Saved ${Fmt.money(goal.saved, goal.currency)} of ${Fmt.money(goal.target, goal.currency)}", fontFamily = MonoFont, style = MaterialTheme.typography.bodySmall)
                Segmented(listOf("Add" to Ico.Plus, "Withdraw" to Ico.Expense), withdraw, { withdraw = it })
                AmountInput(amount, { amount = it })
                TextInput(note, { note = it }, "Note (optional)")
            }
        },
        confirmButton = {
            TextButton(enabled = parsed != null && parsed > 0, onClick = {
                val a = parsed ?: return@TextButton
                Graph.repo.goals.save(goal.copy(deposits = goal.deposits + GoalDeposit(amount = if (withdraw == 1) -a else a, date = Fmt.today(), note = note.trim())))
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
        TextInput(title, { title = it }, "Title (meeting, call, delivery…)")
        DateInput("Date", date, { date = it ?: Fmt.today() }, allowClear = false)
        TimeInput("Time", time, { time = it })
        SwitchRow("Remind me", "Notification at the event time (9:00 AM if no time)", reminder, { reminder = it })
        ProjectPicker(projectId, { projectId = it })
        CustomerPicker(customerId, { customerId = it })
        TextInput(note, { note = it }, "Note", singleLine = false, minLines = 3)
    }
}

// ---------------------------------------------------------------- Time entries

private fun minutesOf(ms: Long): Int = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()).toLocalTime().let { it.hour * 60 + it.minute }
private fun dayOf(ms: Long): Long = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()).toLocalDate().toEpochDay()
private fun at(day: Long, minutes: Int): Long =
    LocalDate.ofEpochDay(day).atTime(LocalTime.of(minutes / 60, minutes % 60)).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()

@Composable
private fun TimeEditor(e: Edit.TimeEdit, close: () -> Unit) {
    val repo = Graph.repo
    val now = System.currentTimeMillis()
    val base = e.item ?: TimeEntry(projectId = e.projectId, start = now - 3_600_000, end = now)
    var projectId by remember { mutableStateOf(base.projectId) }
    var day by remember { mutableStateOf(dayOf(base.start)) }
    var startMin by remember { mutableStateOf<Int?>(minutesOf(base.start)) }
    var endMin by remember { mutableStateOf<Int?>(base.end?.let(::minutesOf)) }
    var note by remember { mutableStateOf(base.note) }
    val s = startMin
    val en = endMin
    val startMs = s?.let { at(day, it) }
    val endMs = en?.let { at(day, it).let { v -> if (startMs != null && v < startMs) v + 86_400_000 else v } }

    FormDialog(
        title = if (e.item == null) "Add time" else "Edit time",
        onDismiss = close,
        saveEnabled = startMs != null && (base.running || endMs != null),
        onSave = {
            repo.time.save(base.copy(projectId = projectId, start = startMs ?: base.start, end = if (base.running && endMs == null) null else endMs, note = note.trim()))
            close()
        },
        onDelete = e.item?.let { item -> { repo.time.delete(item.id); close() } },
    ) {
        ProjectPicker(projectId, { projectId = it }, label = "Project")
        DateInput("Day", day, { day = it ?: Fmt.today() }, allowClear = false)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f)) { TimeInput("Start", startMin, { startMin = it }) }
            Box(Modifier.weight(1f)) { TimeInput("End", endMin, { endMin = it }) }
        }
        if (startMs != null && endMs != null) {
            Text(
                "Duration: " + com.carrotnote.app.time.TimeTracker.format(endMs - startMs),
                fontFamily = MonoFont, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary,
            )
        }
        TextInput(note, { note = it }, "What did you work on?")
    }
}

// ---------------------------------------------------------------- Budgets

@Composable
private fun BudgetEditor(e: Edit.BudgetEdit, close: () -> Unit) {
    val repo = Graph.repo
    val defaultCurrency by Graph.settings.currency.collectAsState()
    val base = e.item ?: Budget(currency = defaultCurrency)
    var category by remember { mutableStateOf(base.category) }
    var limit by remember { mutableStateOf(amountText(base.limit)) }
    var currency by remember { mutableStateOf(base.currency) }
    val parsed = Fmt.parseAmount(limit)
    val options = listOf("") + Categories.expense
    FormDialog(
        title = if (e.item == null) "New budget" else "Edit budget",
        onDismiss = close,
        saveEnabled = parsed != null && parsed > 0,
        onSave = { repo.budgets.save(base.copy(category = category, limit = parsed ?: 0.0, currency = currency.trim().ifBlank { defaultCurrency })); close() },
        onDelete = e.item?.let { item -> { repo.budgets.delete(item.id); close() } },
    ) {
        Text("Set how much you want to spend per month — in total or on one category.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        BigAmount(limit, { limit = it }, currency, { currency = it }, MaterialTheme.colorScheme.primary)
        FieldLabel("Applies to")
        ChipChoice(options, category, { category = it }) { if (it.isEmpty()) "All spending" else it }
    }
}
