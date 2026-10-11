package com.carrotnote.app.ui.screens

import android.content.Context
import android.content.Intent
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.carrotnote.app.Graph
import com.carrotnote.app.data.Budget
import com.carrotnote.app.data.Txn
import com.carrotnote.app.data.TxnKind
import com.carrotnote.app.ui.Edit
import com.carrotnote.app.ui.Fmt
import com.carrotnote.app.ui.LocalEditor
import com.carrotnote.app.ui.MainTopBar
import com.carrotnote.app.ui.PillButton
import com.carrotnote.app.ui.TxnRow
import com.carrotnote.app.ui.components.AnimatedTotals
import com.carrotnote.app.ui.components.AppCard
import com.carrotnote.app.ui.components.DailyBars
import com.carrotnote.app.ui.components.EmptyState
import com.carrotnote.app.ui.components.Eyebrow
import com.carrotnote.app.ui.components.HeroCard
import com.carrotnote.app.ui.components.IconBadge
import com.carrotnote.app.ui.components.PillChip
import com.carrotnote.app.ui.components.ProgressBar
import com.carrotnote.app.ui.components.RankedBars
import com.carrotnote.app.ui.components.RoundIconButton
import com.carrotnote.app.ui.components.SectionHeader
import com.carrotnote.app.ui.components.Segmented
import com.carrotnote.app.ui.components.SplitBar
import com.carrotnote.app.ui.components.bentoSurface
import com.carrotnote.app.ui.components.popIn
import com.carrotnote.app.ui.sumByCurrency
import com.carrotnote.app.ui.theme.Amber
import com.carrotnote.app.ui.theme.Bento
import com.carrotnote.app.ui.theme.CarrotDeep
import com.carrotnote.app.ui.theme.ExpenseRed
import com.carrotnote.app.ui.theme.Ico
import com.carrotnote.app.ui.theme.IncomeGreen
import com.carrotnote.app.ui.theme.NumFont
import java.io.File
import java.time.LocalDate

@Composable
fun MoneyScreen() {
    val ctx = LocalContext.current
    val repo = Graph.repo
    val editor = LocalEditor.current
    val txns by repo.txns.flow.collectAsState()
    val budgets by repo.budgets.flow.collectAsState()
    val currency by Graph.settings.currency.collectAsState()
    var monthStartDay by rememberSaveable { mutableLongStateOf(LocalDate.now().withDayOfMonth(1).toEpochDay()) }
    var tab by rememberSaveable { mutableIntStateOf(0) } // 0 = transactions, 1 = summary
    var filter by rememberSaveable { mutableStateOf("all") }

    val month = LocalDate.ofEpochDay(monthStartDay)
    val monthEnd = month.plusMonths(1).minusDays(1).toEpochDay()
    val monthTx = txns.filter { it.date in monthStartDay..monthEnd }
    val income = monthTx.filter { it.kind == TxnKind.INCOME }
    val expense = monthTx.filter { it.kind == TxnKind.EXPENSE }
    val incomeSum = income.sumByCurrency({ it.currency }, { it.amount })
    val expenseSum = expense.sumByCurrency({ it.currency }, { it.amount })
    val net = (incomeSum.keys + expenseSum.keys).associateWith { (incomeSum[it] ?: 0.0) - (expenseSum[it] ?: 0.0) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            MainTopBar("Money", "Income, spending and budgets") {
                RoundIconButton(Ico.Download, "Export CSV", { exportCsv(ctx, txns) })
            }
        },
    ) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                MonthSwitcher(month, Modifier.popIn(1)) { monthStartDay = it.toEpochDay() }
            }
            item {
                HeroCard(Modifier.popIn(2)) {
                    Eyebrow("Balance")
                    Spacer(Modifier.height(2.dp))
                    AnimatedTotals(net, currency, style = MaterialTheme.typography.displaySmall, sign = true)
                    Spacer(Modifier.height(14.dp))
                    SplitBar(incomeSum[currency] ?: 0.0, expenseSum[currency] ?: 0.0)
                    Spacer(Modifier.height(12.dp))
                    Row {
                        Stat("↓ Income", Fmt.totals(incomeSum, currency), Modifier.weight(1f))
                        Stat("↑ Spent", Fmt.totals(expenseSum, currency), Modifier.weight(1f))
                    }
                    Spacer(Modifier.height(16.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        HeroButton("Expense", Ico.Expense, Modifier.weight(1f)) { editor.open(Edit.Money(kind = TxnKind.EXPENSE)) }
                        HeroButton("Income", Ico.Income, Modifier.weight(1f)) { editor.open(Edit.Money(kind = TxnKind.INCOME)) }
                    }
                }
            }
            item {
                Segmented(listOf("Transactions" to Ico.Receipt, "Summary" to Ico.ChartBar), tab, { tab = it }, Modifier.popIn(3))
            }
            when (tab) {
                1 -> {
                    overview(this, expense, monthStartDay, monthEnd, currency)
                    budgetsTab(this, budgets, expense, currency, onEdit = { editor.open(Edit.BudgetEdit(it)) }, onAdd = { editor.open(Edit.BudgetEdit()) })
                }
                else -> {
                    item(key = "filters") {
                        Row(Modifier.horizontalScroll(rememberScrollState()).animateItem(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf("all" to "All", TxnKind.EXPENSE to "Expenses", TxnKind.INCOME to "Income").forEach { (k, l) ->
                                PillChip(selected = filter == k, onClick = { filter = k }, label = l)
                            }
                        }
                    }
                    val list = monthTx.filter { filter == "all" || it.kind == filter }
                    if (list.isEmpty()) item(key = "empty") { EmptyState(Ico.Receipt, "Nothing this month", "Use + Expense or + Income above to add one.", Modifier.animateItem()) }
                    val byDay = list.groupBy { it.date }.toSortedMap(compareByDescending { it })
                    byDay.forEach { (day, dayTx) ->
                        item(key = "day_$day") {
                            val spent = dayTx.filter { it.kind == TxnKind.EXPENSE }.sumByCurrency({ it.currency }, { it.amount })
                            val got = dayTx.filter { it.kind == TxnKind.INCOME }.sumByCurrency({ it.currency }, { it.amount })
                            Row(Modifier.fillMaxWidth().padding(top = 6.dp, start = 4.dp, end = 4.dp).animateItem(), verticalAlignment = Alignment.CenterVertically) {
                                Text(Fmt.relativeDay(day), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                                if (got.isNotEmpty()) Text("+" + Fmt.totals(got, currency) + "  ", style = MaterialTheme.typography.labelLarge, fontFamily = NumFont, fontWeight = FontWeight.ExtraBold, color = IncomeGreen)
                                if (spent.isNotEmpty()) Text("−" + Fmt.totals(spent, currency), style = MaterialTheme.typography.labelLarge, fontFamily = NumFont, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        item(key = "card_$day") {
                            AppCard(Modifier.animateItem().popIn(4)) {
                                dayTx.sortedByDescending { it.createdAt }.forEach { t ->
                                    val extra = repo.projects.get(t.projectId)?.name ?: repo.customers.get(t.customerId)?.name
                                    TxnRow(t, extra) { editor.open(Edit.Money(t)) }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Month name between two round arrows; the name slides in the direction you move. */
@Composable
private fun MonthSwitcher(month: LocalDate, modifier: Modifier = Modifier, onChange: (LocalDate) -> Unit) {
    Row(
        modifier.fillMaxWidth().bentoSurface(CircleShape, Bento.colors.card, null).padding(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RoundIconButton(Ico.Left, "Previous month", { onChange(month.minusMonths(1)) }, container = MaterialTheme.colorScheme.background, size = 40.dp)
        AnimatedContent(
            targetState = month,
            transitionSpec = {
                val dir = if (targetState > initialState) 1 else -1
                (slideInHorizontally { it * dir / 3 } + fadeIn()) togetherWith (slideOutHorizontally { -it * dir / 3 } + fadeOut())
            },
            label = "month",
            modifier = Modifier.weight(1f),
        ) { m ->
            Text(Fmt.month(m), style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
        RoundIconButton(Ico.Right, "Next month", { onChange(month.plusMonths(1)) }, container = MaterialTheme.colorScheme.background, size = 40.dp)
    }
}

/** Solid white pill button on the orange hero. */
@Composable
fun HeroButton(label: String, icon: ImageVector, modifier: Modifier, onClick: () -> Unit) {
    Row(
        modifier.bentoSurface(CircleShape, Color.White, onClick, pressed = 0.92f).padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, Modifier.size(11.dp), tint = CarrotDeep)
        Spacer(Modifier.width(8.dp))
        Text(label, color = CarrotDeep, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
    }
}

private fun overview(
    scope: androidx.compose.foundation.lazy.LazyListScope,
    expense: List<Txn>,
    start: Long,
    end: Long,
    currency: String,
) = with(scope) {
    val main = expense.filter { it.currency == currency }
    val days = (end - start + 1).toInt()
    val daily = List(days) { i -> main.filter { it.date == start + i }.sumOf { it.amount } }
    val today = Fmt.today()
    val todayIndex = if (today in start..end) (today - start).toInt() else -1

    item(key = "daily") {
        AppCard(Modifier.animateItem().popIn(4)) {
            Text("Daily spending", style = MaterialTheme.typography.titleLarge)
            Text("In $currency · tap a day", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(14.dp))
            DailyBars(daily, todayIndex, currency)
        }
    }
    item(key = "categories") {
        AppCard(Modifier.animateItem().popIn(5)) {
            Text("Where your money went", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(14.dp))
            val cats = groupTop(main) { it.category }
            if (cats.isEmpty()) Text("No spending this month", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            else RankedBars(cats.map { Triple(it.first, Ico.category(it.first), it.second) }, currency, MaterialTheme.colorScheme.primary)
            OtherCurrencies(expense, currency)
        }
    }
    item(key = "methods") {
        AppCard(Modifier.animateItem().popIn(6)) {
            Text("How you paid", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(14.dp))
            val methods = groupTop(main) { it.method }
            if (methods.isEmpty()) Text("Nothing yet", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            else RankedBars(methods.map { Triple(it.first, Ico.method(it.first), it.second) }, currency, MaterialTheme.colorScheme.tertiary)
        }
    }
}

/** Top 6 groups by amount; the rest folds into "Other". */
private fun groupTop(list: List<Txn>, key: (Txn) -> String): List<Pair<String, Double>> {
    val sorted = list.groupBy(key).mapValues { (_, v) -> v.sumOf { it.amount } }.entries.sortedByDescending { it.value }.map { it.key to it.value }
    if (sorted.size <= 6) return sorted
    return sorted.take(5) + ("Other" to sorted.drop(5).sumOf { it.second })
}

@Composable
private fun OtherCurrencies(list: List<Txn>, currency: String) {
    val others = list.filter { it.currency != currency }
    if (others.isNotEmpty()) {
        Spacer(Modifier.height(10.dp))
        Text(
            "Also in other currencies: " + Fmt.totals(others.sumByCurrency({ it.currency }, { it.amount }), currency),
            style = MaterialTheme.typography.bodySmall, fontFamily = NumFont, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun budgetsTab(
    scope: androidx.compose.foundation.lazy.LazyListScope,
    budgets: List<Budget>,
    expense: List<Txn>,
    currency: String,
    onEdit: (Budget) -> Unit,
    onAdd: () -> Unit,
) = with(scope) {
    item(key = "budgetsHeader") {
        SectionHeader("Monthly budgets", Modifier.animateItem()) {
            PillButton("Add", onAdd, icon = Ico.Plus)
        }
    }
    if (budgets.isEmpty()) {
        item(key = "budgetsEmpty") {
            Text(
                "Set a monthly spending limit, for everything or for one category like Food.",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 4.dp).animateItem(),
            )
        }
    }
    val sorted = budgets.sortedWith(compareBy({ it.category.isNotEmpty() }, { it.category }))
    items(sorted.size, key = { "budget_" + sorted[it].id }) { i ->
        val b = sorted[i]
        val spent = expense.filter { it.currency == b.currency && (b.category.isEmpty() || it.category == b.category) }.sumOf { it.amount }
        val ratio = if (b.limit > 0) spent / b.limit else 0.0
        val (statusLabel, statusColor, statusIcon) = when {
            ratio > 1.0 -> Triple("Over budget", ExpenseRed, Ico.Warning)
            ratio >= 0.8 -> Triple("Almost there", Amber, Ico.Warning)
            else -> Triple("On track", IncomeGreen, Ico.CheckCircle)
        }
        AppCard(Modifier.animateItem(), onClick = { onEdit(b) }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconBadge(if (b.category.isEmpty()) Ico.Wallet else Ico.category(b.category), MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(b.category.ifEmpty { "All spending" }, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(statusIcon, null, Modifier.size(11.dp), tint = statusColor)
                        Text(" $statusLabel", style = MaterialTheme.typography.labelMedium, color = statusColor)
                    }
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(Fmt.money(spent, b.currency), style = MaterialTheme.typography.titleMedium, fontFamily = NumFont, fontWeight = FontWeight.ExtraBold)
                    Text("of " + Fmt.money(b.limit, b.currency), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Spacer(Modifier.height(12.dp))
            ProgressBar(ratio.toFloat().coerceIn(0f, 1f), color = if (ratio > 1) ExpenseRed else if (ratio >= 0.8) Amber else MaterialTheme.colorScheme.primary, height = 10.dp)
            Spacer(Modifier.height(8.dp))
            Text(
                if (spent <= b.limit) Fmt.money(b.limit - spent, b.currency) + " left this month" else Fmt.money(spent - b.limit, b.currency) + " over the limit",
                style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun csv(s: String) = "\"" + s.replace("\"", "\"\"") + "\""

private fun exportCsv(ctx: Context, txns: List<Txn>) {
    val repo = Graph.repo
    val sb = StringBuilder("Date,Type,Amount,Currency,Category,Method,Note,Project,Customer\n")
    txns.sortedBy { it.date }.forEach { t ->
        sb.append(LocalDate.ofEpochDay(t.date)).append(',')
            .append(t.kind).append(',')
            .append(t.amount).append(',')
            .append(csv(t.currency)).append(',')
            .append(csv(t.category)).append(',')
            .append(csv(t.method)).append(',')
            .append(csv(t.note)).append(',')
            .append(csv(repo.projects.get(t.projectId)?.name.orEmpty())).append(',')
            .append(csv(repo.customers.get(t.customerId)?.name.orEmpty())).append('\n')
    }
    val dir = File(ctx.cacheDir, "exports").apply { mkdirs() }
    val file = File(dir, "carrot-note-transactions-${LocalDate.now()}.csv")
    file.writeText(sb.toString())
    val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", file)
    Graph.lock.suppressNextLock()
    ctx.startActivity(
        Intent.createChooser(
            Intent(Intent.ACTION_SEND).setType("text/csv").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
            "Export transactions",
        )
    )
}
