package com.carrotnote.app.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.carrotnote.app.Graph
import com.carrotnote.app.ui.screens.AuthScreen
import com.carrotnote.app.ui.screens.CalendarScreen
import com.carrotnote.app.ui.screens.ChooseUsernameScreen
import com.carrotnote.app.ui.screens.CustomerDetailScreen
import com.carrotnote.app.ui.screens.CustomersScreen
import com.carrotnote.app.ui.screens.DebtsScreen
import com.carrotnote.app.ui.screens.GoalsScreen
import com.carrotnote.app.ui.screens.HomeScreen
import com.carrotnote.app.ui.screens.InvitesScreen
import com.carrotnote.app.ui.screens.LockScreen
import com.carrotnote.app.ui.screens.MoneyScreen
import com.carrotnote.app.ui.screens.NotesScreen
import com.carrotnote.app.ui.screens.ProfileScreen
import com.carrotnote.app.ui.screens.ProjectDetailScreen
import com.carrotnote.app.ui.screens.ProjectsScreen
import com.carrotnote.app.ui.screens.SearchScreen
import com.carrotnote.app.ui.screens.SettingsScreen
import com.carrotnote.app.ui.screens.TimeScreen
import com.carrotnote.app.ui.theme.Ico
import com.carrotnote.app.update.DownloadState
import com.carrotnote.app.update.ReleaseInfo
import com.carrotnote.app.update.Updater
import kotlinx.coroutines.launch

@Composable
fun AppRoot() {
    val repo by Graph.repoFlow.collectAsState()
    val locked by Graph.lock.locked.collectAsState()
    val user by Graph.session.user.collectAsState()
    val release by Updater.available.collectAsState()
    // Keeps the current screen while the app is locked; dialogs are still closed.
    val saveable = rememberSaveableStateHolder()
    var started by rememberSaveable { mutableStateOf(false) }

    // Once per launch after sign-in/unlock: notification permission + update check.
    val notifLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    if (repo != null && !locked && !started) {
        LaunchedEffect(Unit) {
            started = true
            if (Build.VERSION.SDK_INT >= 33) notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            if (Graph.settings.autoUpdate.value) Updater.check(manual = false)
        }
    }

    Box(Modifier.fillMaxSize()) {
        when {
            repo == null -> AuthScreen()
            locked -> LockScreen()
            user?.username.isNullOrBlank() -> ChooseUsernameScreen()
            else -> key(repo!!.userId) { saveable.SaveableStateProvider(repo!!.userId) { MainScaffold() } }
        }
        val r = release
        if (r != null && !(repo != null && locked)) UpdateDialog(r)
    }
}

@Composable
private fun MainScaffold() {
    val nav = rememberNavController()
    val editor = remember { EditorController() }
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    var quickAdd by remember { mutableStateOf(false) }
    var signOut by remember { mutableStateOf(false) }
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    val topLevel = route in TopLevelRoutes
    val go: (String) -> Unit = { dest ->
        if (dest in TopLevelRoutes) {
            nav.navigate(dest) {
                popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                launchSingleTop = true
                restoreState = true
            }
        } else if (dest != route) nav.navigate(dest) { launchSingleTop = true }
    }
    val back: () -> Unit = { nav.popBackStack() }
    val closeThen: (() -> Unit) -> Unit = { action -> scope.launch { drawer.close() }; action() }

    CompositionLocalProvider(
        LocalEditor provides editor,
        LocalNav provides go,
        LocalOpenDrawer provides { scope.launch { drawer.open() } },
    ) {
        ModalNavigationDrawer(
            drawerState = drawer,
            gesturesEnabled = topLevel || drawer.isOpen,
            drawerContent = {
                AppDrawer(
                    route = route,
                    go = { r -> closeThen { go(r) } },
                    onLock = { closeThen { Graph.lock.lockNow() } },
                    onSignOut = { closeThen { signOut = true } },
                )
            },
        ) {
            Scaffold(
                bottomBar = { if (topLevel) BottomBar(route, go) { quickAdd = true } },
            ) { pad ->
                NavHost(
                    navController = nav,
                    startDestination = "home",
                    modifier = Modifier.padding(pad).consumeWindowInsets(pad),
                ) {
                    composable("home") { HomeScreen() }
                    composable("money") { MoneyScreen() }
                    composable("projects") { ProjectsScreen() }
                    composable("notes") { NotesScreen() }
                    composable("calendar") { CalendarScreen(back) }
                    composable("project/{id}") { ProjectDetailScreen(it.arguments?.getString("id").orEmpty(), back) }
                    composable("customers") { CustomersScreen(back) }
                    composable("customer/{id}") { CustomerDetailScreen(it.arguments?.getString("id").orEmpty(), back) }
                    composable("debts") { DebtsScreen(back) }
                    composable("goals") { GoalsScreen(back) }
                    composable("time") { TimeScreen(back) }
                    composable("invites") { InvitesScreen(back) }
                    composable("search") { SearchScreen(back) }
                    composable("profile") { ProfileScreen(back) }
                    composable("settings") { SettingsScreen(back) }
                }
            }
        }
        if (signOut) com.carrotnote.app.ui.screens.SignOutDialog { signOut = false }
        if (quickAdd) QuickAddSheet({ quickAdd = false }, editor, go)
        EditorHost(editor)
    }
}

@Composable
private fun UpdateDialog(release: ReleaseInfo) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val download by Updater.download.collectAsState()
    val busy = download is DownloadState.Downloading
    AlertDialog(
        onDismissRequest = { if (!busy) Updater.later() },
        icon = { Icon(Ico.Download, null, Modifier.size(22.dp), tint = MaterialTheme.colorScheme.primary) },
        title = { Text("Update available") },
        text = {
            Column {
                Text("Carrot Note ${release.version} is ready (you have ${Updater.currentVersion}).")
                if (release.notes.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        release.notes.take(1200),
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.heightIn(max = 220.dp).verticalScroll(rememberScrollState()),
                    )
                }
                when (val d = download) {
                    is DownloadState.Downloading -> {
                        Spacer(Modifier.height(12.dp))
                        LinearProgressIndicator(progress = { d.progress }, modifier = Modifier.padding(top = 4.dp))
                        Text("Downloading… ${(d.progress * 100).toInt()}%", style = MaterialTheme.typography.bodySmall)
                    }
                    is DownloadState.Failed -> {
                        Spacer(Modifier.height(8.dp))
                        Text(d.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                    DownloadState.ReadyToInstall -> {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            if (Updater.canInstall(ctx)) "Downloaded. Tap Install if the installer didn't open."
                            else "Allow Carrot Note to install updates, then come back and tap Install.",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    DownloadState.Idle -> Unit
                }
            }
        },
        confirmButton = {
            if (download == DownloadState.ReadyToInstall) {
                Button(onClick = { Updater.install(ctx) }) { Text("Install") }
            } else {
                Button(enabled = !busy, onClick = { scope.launch { Updater.downloadAndInstall(ctx, release) } }) { Text("Update now") }
            }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = { Updater.later() }) { Text("Later") } },
    )
}
