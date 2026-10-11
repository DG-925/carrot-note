package com.carrotnote.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.carrotnote.app.Graph
import com.carrotnote.app.ui.theme.Ico
import com.carrotnote.app.ui.theme.Bento
import com.carrotnote.app.ui.PillButton
import com.carrotnote.app.ui.components.popIn
import com.carrotnote.app.update.UpdateWorker
import com.carrotnote.app.update.Updater
import com.carrotnote.app.ui.components.AppCard
import com.carrotnote.app.ui.components.ChipChoice
import com.carrotnote.app.ui.components.CurrencyInput
import com.carrotnote.app.ui.components.FieldLabel
import com.carrotnote.app.ui.components.ListPadding
import com.carrotnote.app.ui.components.SectionHeader
import com.carrotnote.app.ui.components.SimpleTopBar
import com.carrotnote.app.ui.components.SwitchRow
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date

@Composable
fun SettingsScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current
    val activity = ctx as FragmentActivity
    val scope = rememberCoroutineScope()
    val user by Graph.session.user.collectAsState()
    val sync by Graph.sync.state.collectAsState()
    val currency by Graph.settings.currency.collectAsState()
    val theme by Graph.settings.theme.collectAsState()
    val autoUpdate by Graph.settings.autoUpdate.collectAsState()
    val lock = Graph.lock
    val biometric by lock.biometricEnabled.collectAsState()
    val lockDelay by lock.lockDelay.collectAsState()
    val secureScreen by lock.secureScreen.collectAsState()
    var pinOn by remember { mutableStateOf(lock.pinEnabled) }
    var setPin by remember { mutableStateOf(false) }
    var confirmSignOut by remember { mutableStateOf(false) }
    var changePassword by remember { mutableStateOf(false) }
    var deleteAccount by remember { mutableStateOf(false) }
    var checking by remember { mutableStateOf(false) }
    var notifGranted by remember {
        mutableStateOf(Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
    }
    val notifLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { notifGranted = it }
    val bioAvailable = remember { biometricAvailable(activity) }

    Scaffold(topBar = { SimpleTopBar("Settings", onBack) }) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                AppCard(Modifier.popIn(1)) {
                    SectionHeader("Account")
                    Text(user?.name?.ifBlank { null } ?: "Carrot Note user", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(user?.email.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        when {
                            sync.syncing -> "Syncing…"
                            sync.error != null -> "Sync problem: ${sync.error}"
                            sync.lastSync > 0 -> "Last synced " + DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(sync.lastSync))
                            else -> "Not synced yet"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = if (sync.error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { scope.launch { Graph.sync.syncNow() } }, enabled = !sync.syncing) { Text("Sync now") }
                        OutlinedButton(onClick = { changePassword = true }) { Text("Password") }
                    }
                }
            }
            item {
                AppCard(Modifier.popIn(2)) {
                    SectionHeader("Preferences")
                    CurrencyInput(currency, { if (it.isNotBlank()) Graph.settings.setCurrency(it) })
                    Text("Used for new entries and summaries", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(8.dp))
                    FieldLabel("Theme")
                    ChipChoice(listOf("0", "1", "2"), theme.toString(), { Graph.settings.setTheme(it.toInt()) }) {
                        when (it) { "1" -> "Light"; "2" -> "Dark"; else -> "System" }
                    }
                    if (!notifGranted && Build.VERSION.SDK_INT >= 33) {
                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(onClick = { notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS) }) { Text("Allow notifications (reminders & updates)") }
                    }
                }
            }
            item {
                AppCard(Modifier.popIn(3)) {
                    SectionHeader("Security")
                    SwitchRow("PIN lock", "Ask for a PIN when opening the app", pinOn, { on ->
                        if (on) setPin = true else {
                            lock.disable(); pinOn = false
                        }
                    })
                    if (pinOn) {
                        TextButton(onClick = { setPin = true }) { Text("Change PIN") }
                        SwitchRow(
                            "Fingerprint / face unlock",
                            if (bioAvailable) "Unlock with biometrics instead of typing the PIN" else "No fingerprint or face unlock set up on this phone",
                            biometric,
                            { on ->
                                if (on) showBiometricPrompt(activity, "Enable fingerprint unlock") { lock.setBiometric(true) }
                                else lock.setBiometric(false)
                            },
                            enabled = bioAvailable,
                        )
                        FieldLabel("Lock again after leaving the app")
                        ChipChoice(listOf("0", "30", "60", "300"), lockDelay.toString(), { lock.setLockDelay(it.toInt()) }) {
                            when (it) { "0" -> "Immediately"; "30" -> "30 sec"; "60" -> "1 min"; else -> "5 min" }
                        }
                        TextButton(onClick = { lock.lockNow() }) { Text("Lock now") }
                    }
                    SwitchRow("Hide in recent apps", "Blocks screenshots and hides content in the app switcher", secureScreen, { lock.setSecureScreen(it) })
                }
            }
            item {
                AppCard(Modifier.popIn(4)) {
                    SectionHeader("Updates")
                    Text("Version ${Updater.currentVersion}", style = MaterialTheme.typography.bodyLarge)
                    SwitchRow("Check for updates automatically", "Get a notification when a new version is on GitHub", autoUpdate, { on ->
                        Graph.settings.setAutoUpdate(on)
                        if (on) UpdateWorker.schedule(ctx) else UpdateWorker.cancel(ctx)
                    })
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Button(onClick = {
                            checking = true
                            scope.launch {
                                val r = Updater.check(manual = true)
                                checking = false
                                if (r == null) Toast.makeText(ctx, "You have the latest version", Toast.LENGTH_SHORT).show()
                            }
                        }, enabled = !checking) { Text("Check for updates") }
                        if (checking) CircularProgressIndicator(Modifier.padding(start = 12.dp).height(24.dp))
                    }
                }
            }
            item {
                Column(Modifier.fillMaxWidth().popIn(5)) {
                    Spacer(Modifier.height(4.dp))
                    PillButton(
                        "Sign out", { confirmSignOut = true }, Modifier.fillMaxWidth(), icon = Ico.SignOut,
                        container = Bento.colors.ink, content = Bento.colors.onInk,
                    )
                    TextButton(onClick = { deleteAccount = true }, modifier = Modifier.fillMaxWidth()) {
                        Text("Delete account", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
    }

    if (setPin) {
        SetPinDialog(onDismiss = { setPin = false }, onSet = {
            lock.setPin(it); pinOn = true; setPin = false
            Toast.makeText(ctx, "PIN set", Toast.LENGTH_SHORT).show()
        })
    }
    if (confirmSignOut) SignOutDialog { confirmSignOut = false }
    if (changePassword) PasswordDialog(onDismiss = { changePassword = false })
    if (deleteAccount) DeleteAccountDialog(onDismiss = { deleteAccount = false })
}

@Composable
private fun PasswordDialog(onDismiss: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var old by remember { mutableStateOf("") }
    var new by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Change password") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(old, { old = it }, label = { Text("Current password") }, singleLine = true, visualTransformation = PasswordVisualTransformation())
                OutlinedTextField(new, { new = it }, label = { Text("New password (8+ characters)") }, singleLine = true, visualTransformation = PasswordVisualTransformation())
                if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
            }
        },
        confirmButton = {
            TextButton(enabled = !busy && old.isNotEmpty() && new.length >= 8, onClick = {
                busy = true
                scope.launch {
                    try {
                        Graph.api.changePassword(Graph.session.token ?: "", old, new)
                        Toast.makeText(ctx, "Password changed", Toast.LENGTH_SHORT).show()
                        onDismiss()
                    } catch (e: Exception) {
                        error = e.message
                    } finally {
                        busy = false
                    }
                }
            }) { Text("Change") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun DeleteAccountDialog(onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Delete account?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("This permanently deletes your account and all your data from the cloud and this phone.")
                OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true, visualTransformation = PasswordVisualTransformation())
                if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
            }
        },
        confirmButton = {
            Button(
                enabled = !busy && password.isNotEmpty(),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                onClick = {
                    busy = true
                    scope.launch {
                        try {
                            Graph.api.deleteAccount(Graph.session.token ?: "", password)
                            Graph.forceSignOut()
                        } catch (e: Exception) {
                            error = e.message
                        } finally {
                            busy = false
                        }
                    }
                },
            ) { Text("Delete forever") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun SignOutDialog(onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    val unsynced = Graph.repoOrNull?.hasUnsynced() == true
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { androidx.compose.material3.Icon(com.carrotnote.app.ui.theme.Ico.SignOut, null, Modifier.size(22.dp)) },
        title = { Text("Sign out?") },
        text = {
            Text(
                if (unsynced) "Some changes haven't synced yet. We'll try to sync first; anything not synced will be lost on this phone."
                else "Your data stays in your account. Sign in again any time to get it back."
            )
        },
        confirmButton = {
            TextButton(onClick = {
                onDismiss()
                scope.launch {
                    Graph.sync.syncNow()
                    Graph.signOut()
                }
            }) { Text("Sign out") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
