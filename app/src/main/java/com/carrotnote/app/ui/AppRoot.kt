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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.carrotnote.app.Graph
import com.carrotnote.app.update.DownloadState
import com.carrotnote.app.update.ReleaseInfo
import com.carrotnote.app.update.Updater
import com.carrotnote.app.ui.screens.AuthScreen
import com.carrotnote.app.ui.screens.CalendarScreen
import com.carrotnote.app.ui.screens.CustomerDetailScreen
import com.carrotnote.app.ui.screens.CustomersScreen
import com.carrotnote.app.ui.screens.DebtsScreen
import com.carrotnote.app.ui.screens.GoalsScreen
import com.carrotnote.app.ui.screens.HomeScreen
import com.carrotnote.app.ui.screens.LockScreen
import com.carrotnote.app.ui.screens.MoneyScreen
import com.carrotnote.app.ui.screens.MoreScreen
import com.carrotnote.app.ui.screens.NotesScreen
import com.carrotnote.app.ui.screens.ProjectDetailScreen
import com.carrotnote.app.ui.screens.ProjectsScreen
import com.carrotnote.app.ui.screens.SettingsScreen
import kotlinx.coroutines.launch

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val tabs = listOf(
    Tab("home", "Home", Icons.Default.Home),
    Tab("projects", "Projects", Icons.Default.Work),
    Tab("money", "Money", Icons.Default.AccountBalanceWallet),
    Tab("calendar", "Calendar", Icons.Default.CalendarMonth),
    Tab("more", "More", Icons.Default.Menu),
)

@Composable
fun AppRoot() {
    val repo by Graph.repoFlow.collectAsState()
    val locked by Graph.lock.locked.collectAsState()
    val release by Updater.available.collectAsState()

    Box(Modifier.fillMaxSize()) {
        when {
            repo == null -> AuthScreen()
            locked -> LockScreen()
            else -> MainScaffold()
        }
        val r = release
        if (r != null && !(repo != null && locked)) UpdateDialog(r)
    }
}

@Composable
private fun MainScaffold() {
    val nav = rememberNavController()
    val editor = remember { EditorController() }
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    val go: (String) -> Unit = { dest ->
        if (tabs.any { it.route == dest }) {
            nav.navigate(dest) {
                popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                launchSingleTop = true
                restoreState = true
            }
        } else nav.navigate(dest)
    }
    val back: () -> Unit = { nav.popBackStack() }

    // Ask for notification permission once (reminders + update alerts).
    val notifLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33) notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        if (Graph.settings.autoUpdate.value) Updater.check(manual = false)
    }

    CompositionLocalProvider(LocalEditor provides editor) {
        Scaffold(
            bottomBar = {
                if (tabs.any { it.route == route }) {
                    NavigationBar {
                        tabs.forEach { t ->
                            NavigationBarItem(
                                selected = route == t.route,
                                onClick = { go(t.route) },
                                icon = { Icon(t.icon, null) },
                                label = { Text(t.label) },
                            )
                        }
                    }
                }
            },
        ) { pad ->
            NavHost(
                navController = nav,
                startDestination = "home",
                modifier = Modifier.padding(pad).consumeWindowInsets(pad),
            ) {
                composable("home") { HomeScreen(go) }
                composable("projects") { ProjectsScreen(go) }
                composable("money") { MoneyScreen(go) }
                composable("calendar") { CalendarScreen(go) }
                composable("more") { MoreScreen(go) }
                composable("project/{id}") { ProjectDetailScreen(it.arguments?.getString("id").orEmpty(), back, go) }
                composable("customers") { CustomersScreen(back, go) }
                composable("customer/{id}") { CustomerDetailScreen(it.arguments?.getString("id").orEmpty(), back, go) }
                composable("debts") { DebtsScreen(back) }
                composable("goals") { GoalsScreen(back) }
                composable("notes") { NotesScreen(back) }
                composable("settings") { SettingsScreen(back) }
            }
        }
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
