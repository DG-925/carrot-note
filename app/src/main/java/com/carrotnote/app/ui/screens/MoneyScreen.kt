package com.carrotnote.app.ui.screens

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.IosShare
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material3.ExtendedFloatingActionButton
import com.carrotnote.app.ui.components.PillChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Tab
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.carrotnote.app.Graph
import com.carrotnote.app.data.Txn
import com.carrotnote.app.data.TxnKind
import com.carrotnote.app.ui.Edit
import com.carrotnote.app.ui.Fmt
import com.carrotnote.app.ui.LocalEditor
import com.carrotnote.app.ui.TxnRow
import com.carrotnote.app.ui.components.AppCard
import com.carrotnote.app.ui.components.HeroCard
import com.carrotnote.app.ui.theme.LocalOnHero
import com.carrotnote.app.ui.theme.MonoFont
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import com.carrotnote.app.ui.components.EmptyState
import com.carrotnote.app.ui.components.ListPadding
import com.carrotnote.app.ui.components.ProgressBar
import com.carrotnote.app.ui.components.SectionHeader
import com.carrotnote.app.ui.components.SimpleTopBar
import com.carrotnote.app.ui.sumByCurrency
import com.carrotnote.app.ui.theme.ExpenseRed
import com.carrotnote.app.ui.theme.IncomeGreen
import java.io.File
import java.time.LocalDate

@Composable
fun MoneyScreen(nav: (String) -> Unit) {
    val ctx = LocalContext.current
    val repo = Graph.repo
    val editor = LocalEditor.current
    val txns by repo.txns.flow.collectAsState()
    val currency by Graph.settings.currency.collectAsState()
    var monthStartDay by rememberSaveable { mutableLongStateOf(LocalDate.now().withDayOfMonth(1).toEpochDay()) }
    var tab by rememberSaveable { mutableIntStateOf(0) }
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
        topBar = {
            SimpleTopBar("Money") {
                IconButton(onClick = { nav("goals") }) { Icon(Icons.Default.Savings, "Savings goals") }
                IconButton(onClick = { exportCsv(ctx, txns) }) { Icon(Icons.Default.IosShare, "Export CSV") }
            }
        },
        floatingActionButton = {
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SmallFloatingActionButton(onClick = { editor.open(Edit.Money(kind = TxnKind.INCOME)) }, containerColor = IncomeGreen, contentColor = Color.White) {
                    Text("+ In", modifier = Modifier.padding(horizontal = 10.dp), fontWeight = FontWeight.Bold)
                }
                ExtendedFloatingActionButton(containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary, onClick = { editor.open(Edit.Money(kind = TxnKind.EXPENSE)) }, icon = { Icon(Icons.Default.Add, null) }, text = { Text("Expense") })
            }
        },
    ) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { monthStartDay = month.minusMonths(1).toEpochDay() }) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "Previous month") }
                    Text(Fmt.month(month), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                    IconButton(onClick = { monthStartDay = month.plusMonths(1).toEpochDay() }) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, "Next month") }
                }
            }
            item {
                HeroCard {
                    Row {
                        Stat("Income", Fmt.totals(incomeSum, currency), Modifier.weight(1f), IncomeGreen)
                        Stat("Expenses", Fmt.totals(expenseSum, currency), Modifier.weight(1f), ExpenseRed)
                    }
                    Spacer(Modifier.height(8.dp))
                    Stat("Balance", Fmt.totals(net, currency))
                }
            }
            item {
                PrimaryTabRow(selectedTabIndex = tab, containerColor = MaterialTheme.colorScheme.background) {
                    Tab(selected = tab == 0, onClick = { tab = 0 }, unselectedContentColor = MaterialTheme.colorScheme.onSurfaceVariant, text = { Text("Transactions") })
                    Tab(selected = tab == 1, onClick = { tab = 1 }, unselectedContentColor = MaterialTheme.colorScheme.onSurfaceVariant, text = { Text("Reports") })
                }
            }
            if (tab == 0) {
                item {
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("all" to "All", TxnKind.EXPENSE to "Expenses", TxnKind.INCOME to "Income").forEach { (k, l) ->
                            PillChip(selected = filter == k, onClick = { filter = k }, label = l)
                        }
                    }
                }
                val list = monthTx.filter { filter == "all" || it.kind == filter }
                if (list.isEmpty()) {
                    item { EmptyState(Icons.AutoMirrored.Filled.ReceiptLong, "No transactions", "Add what you spend each day and the money you receive.") }
                }
                val byDay = list.groupBy { it.date }.toSortedMap(compareByDescending { it })
                byDay.forEach { (day, dayTx) ->
                    item(key = "day_$day") {
                        val spent = dayTx.filter { it.kind == TxnKind.EXPENSE }.sumByCurrency({ it.currency }, { it.amount })
                        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(Fmt.relativeDay(day), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                            if (spent.isNotEmpty()) Text("Spent " + Fmt.totals(spent, currency), style = MaterialTheme.typography.labelMedium, fontFamily = MonoFont, color = ExpenseRed)
                        }
                    }
                    items(dayTx.size, key = { dayTx[it].id }) { i ->
                        val t = dayTx[i]
                        val extra = repo.projects.get(t.projectId)?.name ?: repo.customers.get(t.customerId)?.name
                        TxnRow(t, extra) { editor.open(Edit.Money(t)) }
                    }
                }
            } else {
                item { ReportSection("Spending by category", expense, currency, ExpenseRed) { it.category } }
                item { ReportSection("Spent with", expense, currency, ExpenseRed) { it.method } }
                item { ReportSection("Income by source", income, currency, IncomeGreen) { it.category } }
                item { ReportSection("Received via", income, currency, IncomeGreen) { it.method } }
                item {
                    val days = if (monthStartDay <= Fmt.today() && Fmt.today() <= monthEnd) (Fmt.today() - monthStartDay + 1) else (monthEnd - monthStartDay + 1)
                    val avg = expenseSum.mapValues { it.value / days.coerceAtLeast(1) }
                    AppCard {
                        Text("Average daily spending", style = MaterialTheme.typography.labelLarge)
                        Text(Fmt.totals(avg, currency), style = MaterialTheme.typography.titleLarge, fontFamily = MonoFont, fontWeight = FontWeight.Bold, color = ExpenseRed)
                    }
                }
            }
        }
    }
}

@Composable
private fun ReportSection(title: String, list: List<Txn>, currency: String, color: Color, key: (Txn) -> String) {
    // Reports are computed in the main currency; other currencies are listed separately.
    val main = list.filter { it.currency == currency }
    val others = list.filter { it.currency != currency }
    val groups = main.groupBy(key).mapValues { (_, v) -> v.sumOf { it.amount } }.entries.sortedByDescending { it.value }
    val total = groups.sumOf { it.value }
    AppCard {
        SectionHeader(title)
        if (groups.isEmpty() && others.isEmpty()) {
            Text("Nothing this month", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        groups.forEach { (k, v) ->
            Spacer(Modifier.height(8.dp))
            Row {
                Text(k, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                Text(Fmt.money(v, currency) + "  ·  ${if (total > 0) (v / total * 100).toInt() else 0}%", style = MaterialTheme.typography.bodyMedium, fontFamily = MonoFont, fontWeight = FontWeight.SemiBold)
            }
            Spacer(Modifier.height(4.dp))
            ProgressBar(if (total > 0) (v / total).toFloat() else 0f, color = color)
        }
        if (others.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(
                "Other currencies: " + Fmt.totals(others.sumByCurrency({ it.currency }, { it.amount }), currency),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
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
