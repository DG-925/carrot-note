@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.carrotnote.app.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.carrotnote.app.Graph
import com.carrotnote.app.data.TxnKind
import com.carrotnote.app.ui.components.AppLogo
import com.carrotnote.app.ui.components.Avatar
import com.carrotnote.app.ui.components.CountBadge
import com.carrotnote.app.ui.components.RoundIconButton
import com.carrotnote.app.ui.components.bentoSurface
import com.carrotnote.app.ui.components.bounceClick
import com.carrotnote.app.ui.components.popIn
import com.carrotnote.app.ui.theme.Bento
import com.carrotnote.app.ui.theme.Carrot
import com.carrotnote.app.ui.theme.HeroBrush
import com.carrotnote.app.ui.theme.Ico
import com.carrotnote.app.ui.theme.TileColors

/** Navigate to a route from anywhere in the main UI. */
val LocalNav = staticCompositionLocalOf<(String) -> Unit> { {} }

/** Opens the sidebar. */
val LocalOpenDrawer = staticCompositionLocalOf<() -> Unit> { {} }

val TopLevelRoutes = setOf("home", "money", "projects", "notes")

private data class DrawerEntry(val route: String, val label: String, val icon: ImageVector)

private val drawerSections = listOf(
    "" to listOf(
        DrawerEntry("home", "Home", Ico.Home),
        DrawerEntry("money", "Money", Ico.Wallet),
        DrawerEntry("projects", "Projects", Ico.Project),
        DrawerEntry("notes", "Notes", Ico.Note),
        DrawerEntry("calendar", "Calendar", Ico.Calendar),
    ),
    "More" to listOf(
        DrawerEntry("time", "Time tracker", Ico.Timer),
        DrawerEntry("customers", "Customers", Ico.Users),
        DrawerEntry("debts", "Debts", Ico.Debt),
        DrawerEntry("goals", "Savings", Ico.Goal),
        DrawerEntry("invites", "Invitations", Ico.Inbox),
    ),
    "Account" to listOf(
        DrawerEntry("profile", "Profile", Ico.UserCircle),
        DrawerEntry("settings", "Settings", Ico.Settings),
    ),
)

@Composable
fun AppDrawer(route: String?, go: (String) -> Unit, onLock: () -> Unit, onSignOut: () -> Unit) {
    val user by Graph.session.user.collectAsState()
    val invites by Graph.inviteCount.collectAsState()
    val orange = Bento.colors.orange
    ModalDrawerSheet(
        drawerContainerColor = MaterialTheme.colorScheme.background,
        drawerShape = RoundedCornerShape(topEnd = 32.dp, bottomEnd = 32.dp),
        modifier = Modifier.width(304.dp),
    ) {
        Column(Modifier.fillMaxHeight().verticalScroll(rememberScrollState()).padding(horizontal = 14.dp)) {
            Row(Modifier.padding(start = 6.dp, top = 20.dp, bottom = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                AppLogo(42.dp)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text("Carrot Note", style = MaterialTheme.typography.titleLarge)
                    Text("Freelancer workspace", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            // Profile tile
            Row(
                Modifier
                    .fillMaxWidth()
                    .bentoSurface(RoundedCornerShape(24.dp), orange.container, { go("profile") })
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val u = user
                Avatar(u?.id, u?.avatarRev ?: 0, u?.name?.ifBlank { u.username } ?: "", 46.dp, Modifier.border(2.dp, Color.White.copy(alpha = 0.6f), CircleShape))
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        u?.name?.ifBlank { null } ?: "@${u?.username}", style = MaterialTheme.typography.titleMedium,
                        color = orange.content, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                    Text("@${u?.username.orEmpty()}", style = MaterialTheme.typography.bodySmall, color = orange.content.copy(alpha = 0.8f), maxLines = 1)
                }
                Icon(Ico.Right, null, Modifier.size(12.dp), tint = orange.content)
            }
            drawerSections.forEach { (title, all) ->
                val entries = all.filter { it.route != "invites" || invites > 0 }
                if (title.isNotEmpty()) Text(
                    title.uppercase(), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 14.dp, top = 18.dp, bottom = 6.dp),
                )
                else Spacer(Modifier.height(12.dp))
                entries.forEach { e ->
                    DrawerRow(e.label, e.icon, selected = route == e.route, badge = if (e.route == "invites") invites else 0) { go(e.route) }
                }
            }
            Spacer(Modifier.weight(1f))
            Spacer(Modifier.height(16.dp))
            if (Graph.lock.pinEnabled) DrawerRow("Lock", Ico.Lock, selected = false) { onLock() }
            DrawerRow("Sign out", Ico.SignOut, selected = false) { onSignOut() }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun DrawerRow(label: String, icon: ImageVector, selected: Boolean, badge: Int = 0, onClick: () -> Unit) {
    val b = Bento.colors
    val cs = MaterialTheme.colorScheme
    val selBg = if (b.dark) cs.primary else b.ink
    val bg by animateColorAsState(if (selected) selBg else Color.Transparent, tween(200), label = "drawerBg")
    val fg = if (selected) Color.White else cs.onSurface
    Row(
        Modifier
            .padding(vertical = 2.dp)
            .fillMaxWidth()
            .bentoSurface(RoundedCornerShape(18.dp), bg, onClick)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(34.dp)
                .clip(RoundedCornerShape(11.dp))
                .background(if (selected) Color.White.copy(alpha = 0.14f) else b.card),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, null, Modifier.size(15.dp), tint = if (selected) Color.White else cs.primary) }
        Spacer(Modifier.width(14.dp))
        Text(
            label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f), color = fg,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
        )
        CountBadge(badge, Modifier.padding(end = 8.dp))
    }
}

/**
 * Header of the main screens: menu button, a small line above a big title, invitations and profile.
 * The title may take two lines (the greeting on Home).
 */
@Composable
fun MainTopBar(title: String, subtitle: String? = null, titleLines: Int = 1, actions: @Composable RowScope.() -> Unit = {}) {
    val nav = LocalNav.current
    val openDrawer = LocalOpenDrawer.current
    val user by Graph.session.user.collectAsState()
    val invites by Graph.inviteCount.collectAsState()
    Row(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars)
            .padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RoundIconButton(Ico.Menu, "Menu", openDrawer)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f).popIn(0)) {
            if (subtitle != null) {
                Text(subtitle, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text(
                title, style = if (titleLines > 1) MaterialTheme.typography.headlineMedium else MaterialTheme.typography.headlineSmall,
                maxLines = titleLines, overflow = TextOverflow.Ellipsis,
            )
        }
        CompositionLocalProvider(LocalContentColor provides MaterialTheme.colorScheme.onSurface) { actions() }
        if (invites > 0) Box(Modifier.padding(start = 6.dp)) {
            RoundIconButton(Ico.Bell, "Invitations", { nav("invites") })
            CountBadge(invites, Modifier.align(Alignment.TopEnd).offset(x = 2.dp, y = (-2).dp))
        }
        val u = user
        Box(Modifier.padding(start = 8.dp).clip(CircleShape).bounceClick { nav("profile") }) {
            Avatar(u?.id, u?.avatarRev ?: 0, u?.name?.ifBlank { u.username } ?: "", 42.dp)
        }
    }
}

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val bottomTabs = listOf(
    Tab("home", "Home", Ico.Home),
    Tab("money", "Money", Ico.Wallet),
    Tab("projects", "Projects", Ico.Project),
    Tab("notes", "Notes", Ico.Note),
)

/** Floating dark tab bar. A pill springs to the selected tab; the orange + turns into × while the add sheet is open. */
@Composable
fun BottomBar(route: String?, go: (String) -> Unit, addOpen: Boolean, onAdd: () -> Unit) {
    val b = Bento.colors
    val barShape = RoundedCornerShape(28.dp)
    Box(
        Modifier
            .fillMaxWidth()
            .windowInsetsPadding(WindowInsets.navigationBars)
            .padding(start = 14.dp, end = 14.dp, top = 18.dp, bottom = 10.dp),
    ) {
        BoxWithConstraints(
            Modifier
                .fillMaxWidth()
                .height(66.dp)
                .shadow(18.dp, barShape, ambientColor = Color.Black.copy(alpha = 0.3f), spotColor = Color.Black.copy(alpha = 0.3f))
                .clip(barShape)
                .background(b.ink),
        ) {
            val slot = maxWidth / 5
            val index = when (route) { "home" -> 0; "money" -> 1; "projects" -> 3; "notes" -> 4; else -> -1 }
            val pillW = 58.dp
            val x by animateDpAsState(slot * index.coerceAtLeast(0) + (slot - pillW) / 2, spring(dampingRatio = 0.55f, stiffness = 380f), label = "tabPill")
            if (index >= 0) {
                Box(Modifier.offset(x = x, y = 8.dp).size(pillW, 50.dp).clip(RoundedCornerShape(18.dp)).background(b.inkPill))
            }
            Row(Modifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                bottomTabs.take(2).forEach { BottomItem(it, route == it.route) { go(it.route) } }
                Spacer(Modifier.weight(1f))
                bottomTabs.drop(2).forEach { BottomItem(it, route == it.route) { go(it.route) } }
            }
        }
        val turn by animateFloatAsState(if (addOpen) 135f else 0f, spring(dampingRatio = 0.5f, stiffness = 320f), label = "fabTurn")
        Box(
            Modifier
                .align(Alignment.TopCenter)
                .offset(y = (-16).dp)
                .size(64.dp)
                .clip(CircleShape)
                .bounceClick(pressed = 0.88f, onClick = onAdd)
                .background(b.ink)
                .padding(5.dp)
                .shadow(10.dp, CircleShape, ambientColor = Carrot, spotColor = Carrot)
                .clip(CircleShape)
                .background(HeroBrush),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Ico.Plus, if (addOpen) "Close" else "Add", Modifier.size(22.dp).graphicsLayer { rotationZ = turn }, tint = Color.White)
        }
    }
}

@Composable
private fun RowScope.BottomItem(tab: Tab, selected: Boolean, onClick: () -> Unit) {
    val b = Bento.colors
    val color by animateColorAsState(if (selected) b.onInk else b.inkMuted, tween(220), label = "tabColor")
    val scale by animateFloatAsState(if (selected) 1.1f else 1f, spring(dampingRatio = 0.4f, stiffness = 500f), label = "tabScale")
    Column(
        Modifier
            .weight(1f)
            .fillMaxHeight()
            .clickable(interactionSource = null, indication = null, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(tab.icon, null, Modifier.size(18.dp).graphicsLayer { scaleX = scale; scaleY = scale }, tint = color)
        Spacer(Modifier.height(4.dp))
        Text(tab.label, style = MaterialTheme.typography.labelSmall, color = color, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium, maxLines = 1)
    }
}

private data class QuickAction(val label: String, val icon: ImageVector, val colors: @Composable () -> TileColors, val run: () -> Unit)

/** "+" sheet: colored tiles that pop in one after another. */
@Composable
fun QuickAddSheet(onDismiss: () -> Unit, editor: EditorController, go: (String) -> Unit) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val today = Fmt.today()
    val actions = listOf(
        QuickAction("Expense", Ico.Expense, { Bento.colors.rose }) { editor.open(Edit.Money(kind = TxnKind.EXPENSE)) },
        QuickAction("Income", Ico.Income, { Bento.colors.mint }) { editor.open(Edit.Money(kind = TxnKind.INCOME)) },
        QuickAction("Task", Ico.Tasks, { Bento.colors.butter }) { editor.open(Edit.Task(date = today)) },
        QuickAction("Note", Ico.Note, { Bento.colors.lilac }) { editor.open(Edit.NoteEdit()) },
        QuickAction("Event", Ico.Calendar, { Bento.colors.sky }) { editor.open(Edit.Event(date = today)) },
        QuickAction("Project", Ico.Project, { Bento.colors.orange }) { editor.open(Edit.ProjectEdit()) },
    )
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = state,
        containerColor = MaterialTheme.colorScheme.background,
        shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp),
    ) {
        Column(Modifier.padding(horizontal = 16.dp).navigationBarsPadding().padding(bottom = 16.dp)) {
            Text("Add new", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(start = 4.dp))
            Text(
                "Pick one. You can fill in the details next.", style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 4.dp),
            )
            Spacer(Modifier.height(16.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp), maxItemsInEachRow = 3) {
                actions.forEachIndexed { i, a ->
                    val c = a.colors()
                    Column(
                        Modifier
                            .weight(1f)
                            .popIn(i)
                            .bentoSurface(RoundedCornerShape(24.dp), c.container, { onDismiss(); a.run() }, pressed = 0.92f)
                            .padding(vertical = 18.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Box(
                            Modifier.size(44.dp).clip(RoundedCornerShape(15.dp)).background(c.content.copy(alpha = 0.12f)),
                            contentAlignment = Alignment.Center,
                        ) { Icon(a.icon, null, Modifier.size(17.dp), tint = c.content) }
                        Spacer(Modifier.height(10.dp))
                        Text(a.label, style = MaterialTheme.typography.labelLarge, color = c.content, fontWeight = FontWeight.Bold, maxLines = 1)
                    }
                }
            }
        }
    }
}
