@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.carrotnote.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.carrotnote.app.Graph
import com.carrotnote.app.data.TxnKind
import com.carrotnote.app.time.TimeTracker
import com.carrotnote.app.ui.components.AppLogo
import com.carrotnote.app.ui.components.Avatar
import com.carrotnote.app.ui.components.CountBadge
import com.carrotnote.app.ui.theme.ExpenseRed
import com.carrotnote.app.ui.theme.HeroBrush
import com.carrotnote.app.ui.theme.Ico
import com.carrotnote.app.ui.theme.IncomeGreen

/** Navigate to a route from anywhere in the main UI. */
val LocalNav = staticCompositionLocalOf<(String) -> Unit> { {} }

/** Opens the sidebar. */
val LocalOpenDrawer = staticCompositionLocalOf<() -> Unit> { {} }

val TopLevelRoutes = setOf("home", "money", "projects", "notes")

private data class DrawerEntry(val route: String, val label: String, val icon: ImageVector)

private val drawerSections = listOf(
    "MAIN" to listOf(
        DrawerEntry("home", "Dashboard", Ico.Home),
        DrawerEntry("money", "Money", Ico.Wallet),
        DrawerEntry("projects", "Projects", Ico.Project),
        DrawerEntry("notes", "Notes", Ico.Note),
        DrawerEntry("calendar", "Calendar", Ico.Calendar),
    ),
    "WORK" to listOf(
        DrawerEntry("time", "Time tracker", Ico.Timer),
        DrawerEntry("customers", "Customers", Ico.Users),
        DrawerEntry("debts", "Debts", Ico.Debt),
        DrawerEntry("invites", "Invitations", Ico.Inbox),
    ),
    "PERSONAL" to listOf(
        DrawerEntry("goals", "Savings goals", Ico.Goal),
        DrawerEntry("search", "Search everything", Ico.Search),
    ),
    "SYSTEM" to listOf(
        DrawerEntry("profile", "Profile", Ico.UserCircle),
        DrawerEntry("settings", "Settings", Ico.Settings),
    ),
)

@Composable
fun AppDrawer(route: String?, go: (String) -> Unit, onLock: () -> Unit, onSignOut: () -> Unit) {
    val user by Graph.session.user.collectAsState()
    val invites by Graph.inviteCount.collectAsState()
    ModalDrawerSheet(
        drawerContainerColor = MaterialTheme.colorScheme.surfaceContainer,
        drawerShape = RoundedCornerShape(topEnd = 24.dp, bottomEnd = 24.dp),
        modifier = Modifier.width(300.dp),
    ) {
        Column(Modifier.fillMaxHeight().verticalScroll(rememberScrollState())) {
            Row(Modifier.padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                AppLogo(40.dp)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text("Carrot Note", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("Freelancer workspace", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            // Profile card
            Row(
                Modifier
                    .padding(horizontal = 12.dp, vertical = 8.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(MaterialTheme.colorScheme.surfaceContainerLow)
                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp))
                    .clickable { go("profile") }
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val u = user
                Avatar(u?.id, u?.avatarRev ?: 0, u?.name?.ifBlank { u.username } ?: "", 44.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(u?.name?.ifBlank { null } ?: "@${u?.username}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("@${u?.username.orEmpty()}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary, maxLines = 1)
                }
                Icon(Ico.Right, null, Modifier.size(12.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            drawerSections.forEach { (title, entries) ->
                Text(
                    title, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 28.dp, top = 16.dp, bottom = 6.dp),
                )
                entries.forEach { e ->
                    DrawerRow(e.label, e.icon, selected = route == e.route, badge = if (e.route == "invites") invites else 0) { go(e.route) }
                }
            }
            Spacer(Modifier.weight(1f))
            HorizontalDivider(Modifier.padding(top = 16.dp), color = MaterialTheme.colorScheme.outlineVariant)
            if (Graph.lock.pinEnabled) DrawerRow("Lock", Ico.Lock, selected = false) { onLock() }
            DrawerRow("Sign out", Ico.SignOut, selected = false) { onSignOut() }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun DrawerRow(label: String, icon: ImageVector, selected: Boolean, badge: Int = 0, onClick: () -> Unit) {
    val primary = MaterialTheme.colorScheme.primary
    Row(
        Modifier
            .padding(horizontal = 12.dp, vertical = 2.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(if (selected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(4.dp).height(22.dp).clip(RoundedCornerShape(topEnd = 4.dp, bottomEnd = 4.dp)).background(if (selected) primary else Color.Transparent))
        Spacer(Modifier.width(14.dp))
        Icon(icon, null, Modifier.size(18.dp), tint = if (selected) primary else MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(16.dp))
        Text(
            label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f),
            color = if (selected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
        )
        CountBadge(badge, Modifier.padding(end = 14.dp))
    }
}

/** Top bar of the main screens: menu, title, search, invitations and profile. */
@Composable
fun MainTopBar(title: String, subtitle: String? = null, actions: @Composable RowScope.() -> Unit = {}) {
    val nav = LocalNav.current
    val openDrawer = LocalOpenDrawer.current
    val user by Graph.session.user.collectAsState()
    val invites by Graph.inviteCount.collectAsState()
    TopAppBar(
        navigationIcon = {
            IconButton(onClick = openDrawer) { Icon(Ico.Menu, "Menu", Modifier.size(20.dp)) }
        },
        title = {
            Column {
                Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, maxLines = 1)
                if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        actions = {
            actions()
            IconButton(onClick = { nav("search") }) { Icon(Ico.Search, "Search", Modifier.size(18.dp)) }
            Box {
                IconButton(onClick = { nav("invites") }) { Icon(Ico.Bell, "Invitations", Modifier.size(18.dp)) }
                CountBadge(invites, Modifier.align(Alignment.TopEnd).offset(x = (-4).dp, y = 6.dp))
            }
            val u = user
            Box(Modifier.padding(end = 10.dp, start = 2.dp).clip(CircleShape).clickable { nav("profile") }) {
                Avatar(u?.id, u?.avatarRev ?: 0, u?.name?.ifBlank { u.username } ?: "", 34.dp, ring = true)
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
    )
}

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val bottomTabs = listOf(
    Tab("home", "Home", Ico.Home),
    Tab("money", "Money", Ico.Wallet),
    Tab("projects", "Projects", Ico.Project),
    Tab("notes", "Notes", Ico.Note),
)

/** Bottom bar with a raised orange "+" in the middle. */
@Composable
fun BottomBar(route: String?, go: (String) -> Unit, onAdd: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainer, tonalElevation = 0.dp) {
        Column {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Row(
                Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.navigationBars).height(68.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                bottomTabs.take(2).forEach { BottomItem(it, route == it.route) { go(it.route) } }
                Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    Box(
                        Modifier
                            .offset(y = (-10).dp)
                            .shadow(10.dp, CircleShape, ambientColor = MaterialTheme.colorScheme.primary, spotColor = MaterialTheme.colorScheme.primary)
                            .size(58.dp)
                            .clip(CircleShape)
                            .background(HeroBrush)
                            .clickable(onClick = onAdd),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Ico.Plus, "Add", Modifier.size(22.dp), tint = Color.White) }
                }
                bottomTabs.drop(2).forEach { BottomItem(it, route == it.route) { go(it.route) } }
            }
        }
    }
}

@Composable
private fun RowScope.BottomItem(tab: Tab, selected: Boolean, onClick: () -> Unit) {
    val color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    Column(
        Modifier.weight(1f).fillMaxHeight().clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            Modifier.clip(CircleShape).background(if (selected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent)
                .padding(horizontal = 16.dp, vertical = 5.dp),
        ) { Icon(tab.icon, null, Modifier.size(18.dp), tint = color) }
        Spacer(Modifier.height(3.dp))
        Text(tab.label, style = MaterialTheme.typography.labelSmall, color = color, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium)
    }
}

private data class QuickAction(val label: String, val icon: ImageVector, val tint: @Composable () -> Color, val run: () -> Unit)

/** "+" sheet: quick ways to add anything. */
@Composable
fun QuickAddSheet(onDismiss: () -> Unit, editor: EditorController, go: (String) -> Unit) {
    val ctx = LocalContext.current
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val running = Graph.repo.time.flow.collectAsState().value.any { it.running }
    val today = Fmt.today()
    val actions = listOf(
        QuickAction("Expense", Ico.Expense, { ExpenseRed }) { editor.open(Edit.Money(kind = TxnKind.EXPENSE)) },
        QuickAction("Income", Ico.Income, { IncomeGreen }) { editor.open(Edit.Money(kind = TxnKind.INCOME)) },
        QuickAction("Note", Ico.Note, { MaterialTheme.colorScheme.tertiary }) { editor.open(Edit.NoteEdit()) },
        QuickAction("Checklist", Ico.Checklist, { MaterialTheme.colorScheme.tertiary }) { editor.open(Edit.NoteEdit(checklist = true)) },
        QuickAction("Task", Ico.Tasks, { MaterialTheme.colorScheme.primary }) { editor.open(Edit.Task(date = today)) },
        QuickAction("Event", Ico.Calendar, { MaterialTheme.colorScheme.primary }) { editor.open(Edit.Event(date = today)) },
        QuickAction("Project", Ico.Project, { MaterialTheme.colorScheme.primary }) { editor.open(Edit.ProjectEdit()) },
        if (running) QuickAction("Stop timer", Ico.Stop, { ExpenseRed }) { TimeTracker.stop(ctx) }
        else QuickAction("Start timer", Ico.Timer, { IncomeGreen }) { go("time") },
        QuickAction("Customer", Ico.UserPlus, { MaterialTheme.colorScheme.secondary }) { editor.open(Edit.CustomerEdit()) },
        QuickAction("Debt", Ico.Debt, { MaterialTheme.colorScheme.secondary }) { editor.open(Edit.DebtEdit()) },
        QuickAction("Saving", Ico.Goal, { MaterialTheme.colorScheme.secondary }) { editor.open(Edit.GoalEdit()) },
        QuickAction("Budget", Ico.Budget, { MaterialTheme.colorScheme.secondary }) { editor.open(Edit.BudgetEdit()) },
    )
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = state, containerColor = MaterialTheme.colorScheme.surfaceContainer) {
        Column(Modifier.padding(horizontal = 16.dp).navigationBarsPadding().padding(bottom = 12.dp)) {
            Text("Add new", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text("What do you want to add?", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(16.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp), maxItemsInEachRow = 4) {
                actions.forEach { a ->
                    val tint = a.tint()
                    Column(
                        Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(16.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainerLow)
                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp))
                            .clickable { onDismiss(); a.run() }
                            .padding(vertical = 14.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Box(
                            Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(tint.copy(alpha = 0.14f)),
                            contentAlignment = Alignment.Center,
                        ) { Icon(a.icon, null, Modifier.size(17.dp), tint = tint) }
                        Spacer(Modifier.height(8.dp))
                        Text(a.label, style = MaterialTheme.typography.labelMedium, maxLines = 1, fontWeight = FontWeight.Medium)
                    }
                }
            }
        }
    }
}
