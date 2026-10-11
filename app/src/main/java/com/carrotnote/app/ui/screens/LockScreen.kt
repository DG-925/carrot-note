package com.carrotnote.app.ui.screens

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import com.carrotnote.app.ui.components.AppLogo
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.carrotnote.app.Graph
import com.carrotnote.app.ui.theme.Ico
import kotlinx.coroutines.delay

private const val PIN_LENGTH = 4

fun biometricAvailable(activity: FragmentActivity): Boolean =
    BiometricManager.from(activity).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS

fun showBiometricPrompt(activity: FragmentActivity, title: String, onSuccess: () -> Unit) {
    val prompt = BiometricPrompt(
        activity,
        ContextCompat.getMainExecutor(activity),
        object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = onSuccess()
        },
    )
    prompt.authenticate(
        BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle("Use your fingerprint or face")
            .setNegativeButtonText("Use PIN")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
            .build()
    )
}

@Composable
fun LockScreen() {
    val activity = LocalContext.current as FragmentActivity
    val lock = Graph.lock
    val biometricOn by lock.biometricEnabled.collectAsState()
    val canBio = biometricOn && remember { biometricAvailable(activity) }
    var pin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var cooldown by remember { mutableStateOf(lock.cooldownRemaining()) }

    LaunchedEffect(Unit) {
        if (canBio) showBiometricPrompt(activity, "Unlock Carrot Note") { lock.unlock() }
    }
    LaunchedEffect(cooldown) {
        if (cooldown > 0) {
            delay(1000)
            cooldown = lock.cooldownRemaining()
            if (cooldown == 0L) error = null
        }
    }

    val pinLength = remember { lock.pinLength }

    fun onDigit(d: Char) {
        if (cooldown > 0 || pin.length >= pinLength) return
        pin += d
        error = null
        if (pin.length == pinLength) {
            if (lock.verify(pin)) {
                lock.unlock()
            } else {
                error = "Wrong PIN"
                cooldown = lock.cooldownRemaining()
            }
            pin = ""
        }
    }

    Column(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).systemBarsPadding().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.weight(1f))
        AppLogo(80.dp)
        Spacer(Modifier.height(12.dp))
        Text("Enter your PIN", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(20.dp))
        PinDots(pin.length, pinLength)
        Spacer(Modifier.height(12.dp))
        Text(
            when {
                cooldown > 0 -> "Too many attempts. Try again in ${(cooldown + 999) / 1000}s"
                error != null -> error!!
                else -> " "
            },
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.weight(1f))
        PinPad(
            onDigit = ::onDigit,
            onBackspace = { pin = pin.dropLast(1) },
            onOk = {
                if (pin.isNotEmpty() && cooldown == 0L) {
                    if (lock.verify(pin)) lock.unlock() else {
                        error = "Wrong PIN"
                        cooldown = lock.cooldownRemaining()
                    }
                    pin = ""
                }
            },
            onBiometric = if (canBio) ({ showBiometricPrompt(activity, "Unlock Carrot Note") { lock.unlock() } }) else null,
        )
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
fun PinDots(count: Int, total: Int = maxOf(PIN_LENGTH, count)) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        repeat(total) { i ->
            Box(
                Modifier
                    .size(16.dp)
                    .clip(CircleShape)
                    .background(if (i < count) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface)
                    .border(2.dp, MaterialTheme.colorScheme.primary, CircleShape),
            )
        }
    }
}

@Composable
fun PinPad(onDigit: (Char) -> Unit, onBackspace: () -> Unit, onOk: (() -> Unit)?, onBiometric: (() -> Unit)?) {
    val rows = listOf("123", "456", "789")
    Column(verticalArrangement = Arrangement.spacedBy(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        rows.forEach { r ->
            Row(horizontalArrangement = Arrangement.spacedBy(22.dp)) { r.forEach { d -> PadKey(d.toString(), onClick = { onDigit(d) }) } }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(22.dp)) {
            if (onBiometric != null) PadKey(icon = true, onClick = onBiometric) {
                Icon(Ico.Fingerprint, "Use fingerprint", Modifier.size(28.dp), tint = MaterialTheme.colorScheme.primary)
            } else if (onOk != null) PadKey("OK", onClick = onOk) else Spacer(Modifier.size(74.dp))
            PadKey("0", onClick = { onDigit('0') })
            PadKey(icon = true, onClick = onBackspace) { Icon(Ico.Backspace, "Delete", Modifier.size(22.dp)) }
        }
    }
}

@Composable
private fun PadKey(label: String = "", icon: Boolean = false, onClick: () -> Unit, content: (@Composable () -> Unit)? = null) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = if (icon) MaterialTheme.colorScheme.surface else MaterialTheme.colorScheme.surfaceContainerHigh,
        modifier = Modifier.size(74.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (content != null) content() else Text(label, fontSize = 26.sp, fontWeight = FontWeight.Medium)
        }
    }
}

/** Two-step dialog to create a new PIN (enter + confirm). */
@Composable
fun SetPinDialog(onDismiss: () -> Unit, onSet: (String) -> Unit) {
    var first by remember { mutableStateOf<String?>(null) }
    var pin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (first == null) "Choose a PIN" else "Confirm your PIN") },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(top = 8.dp)) {
                Text("4 to 8 digits", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(12.dp))
                PinDots(pin.length)
                Spacer(Modifier.height(8.dp))
                Text(error ?: " ", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
                PinPad(
                    onDigit = { if (pin.length < 8) { pin += it; error = null } },
                    onBackspace = { pin = pin.dropLast(1) },
                    onOk = null,
                    onBiometric = null,
                )
            }
        },
        confirmButton = {
            TextButton(enabled = pin.length >= 4, onClick = {
                if (first == null) {
                    first = pin; pin = ""
                } else if (first == pin) {
                    onSet(pin)
                } else {
                    error = "PINs don't match. Try again."
                    first = null; pin = ""
                }
            }) { Text(if (first == null) "Next" else "Set PIN") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
