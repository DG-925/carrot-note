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
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import com.carrotnote.app.ui.components.bentoSurface
import com.carrotnote.app.ui.theme.Bento
import com.carrotnote.app.ui.theme.NumFont
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
    val user by Graph.session.user.collectAsState()
    val biometricOn by lock.biometricEnabled.collectAsState()
    val canBio = biometricOn && remember { biometricAvailable(activity) }
    var pin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var fails by remember { mutableIntStateOf(0) }
    var cooldown by remember { mutableStateOf(lock.cooldownRemaining()) }
    val shake = remember { Animatable(0f) }
    val logo = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        logo.animateTo(1f, spring(dampingRatio = 0.45f, stiffness = 260f))
    }
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
    LaunchedEffect(fails) {
        if (fails > 0) for (x in listOf(-22f, 18f, -14f, 10f, -5f, 0f)) shake.animateTo(x, tween(45))
    }

    val pinLength = remember { lock.pinLength }

    fun wrong() {
        error = "Wrong PIN"
        fails++
        cooldown = lock.cooldownRemaining()
    }

    fun onDigit(d: Char) {
        if (cooldown > 0 || pin.length >= pinLength) return
        pin += d
        error = null
        if (pin.length == pinLength) {
            if (lock.verify(pin)) lock.unlock() else wrong()
            pin = ""
        }
    }

    Column(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).systemBarsPadding().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.weight(1f))
        Box(Modifier.graphicsLayer { scaleX = logo.value; scaleY = logo.value; rotationZ = (1f - logo.value) * -20f }) { AppLogo(84.dp) }
        Spacer(Modifier.height(18.dp))
        val first = user?.name?.trim()?.substringBefore(' ')?.ifBlank { null }
        Text(if (first != null) "Welcome back, $first" else "Welcome back", style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
        Text("Enter your PIN to open Carrot Note", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(24.dp))
        Box(Modifier.graphicsLayer { translationX = shake.value.dp.toPx() }) { PinDots(pin.length, pinLength, error = error != null) }
        Spacer(Modifier.height(14.dp))
        Text(
            when {
                cooldown > 0 -> "Too many attempts. Try again in ${(cooldown + 999) / 1000}s"
                error != null -> error!!
                else -> " "
            },
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.weight(1f))
        PinPad(
            onDigit = ::onDigit,
            onBackspace = { pin = pin.dropLast(1) },
            onOk = {
                if (pin.isNotEmpty() && cooldown == 0L) {
                    if (lock.verify(pin)) lock.unlock() else wrong()
                    pin = ""
                }
            },
            onBiometric = if (canBio) ({ showBiometricPrompt(activity, "Unlock Carrot Note") { lock.unlock() } }) else null,
        )
        Spacer(Modifier.height(24.dp))
    }
}

/** PIN dots that pop when filled and turn red on a wrong PIN. */
@Composable
fun PinDots(count: Int, total: Int = maxOf(PIN_LENGTH, count), error: Boolean = false) {
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
        repeat(total) { i ->
            val filled = i < count
            val scale by animateFloatAsState(if (filled) 1f else 0.62f, spring(dampingRatio = 0.4f, stiffness = 600f), label = "dot")
            val color by animateColorAsState(
                when {
                    error -> MaterialTheme.colorScheme.error
                    filled -> MaterialTheme.colorScheme.primary
                    else -> Bento.colors.track
                },
                tween(160), label = "dotColor",
            )
            Box(Modifier.size(18.dp).graphicsLayer { scaleX = scale; scaleY = scale }.clip(CircleShape).background(color))
        }
    }
}

@Composable
fun PinPad(
    onDigit: (Char) -> Unit,
    onBackspace: () -> Unit,
    onOk: (() -> Unit)?,
    onBiometric: (() -> Unit)?,
    keyColor: Color = Bento.colors.card,
) {
    val rows = listOf("123", "456", "789")
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        rows.forEach { r ->
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) { r.forEach { d -> PadKey(d.toString(), keyColor, onClick = { onDigit(d) }) } }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            if (onBiometric != null) PadKey(color = Bento.colors.orange.container, onClick = onBiometric) {
                Icon(Ico.Fingerprint, "Use fingerprint", Modifier.size(26.dp), tint = Bento.colors.orange.content)
            } else if (onOk != null) PadKey("OK", Bento.colors.ink, onClick = onOk, textColor = Bento.colors.onInk) else Spacer(Modifier.size(width = 82.dp, height = 66.dp))
            PadKey("0", keyColor, onClick = { onDigit('0') })
            PadKey(color = Color.Transparent, onClick = onBackspace) { Icon(Ico.Backspace, "Delete", Modifier.size(22.dp)) }
        }
    }
}

@Composable
private fun PadKey(
    label: String = "",
    color: Color,
    onClick: () -> Unit,
    textColor: Color = MaterialTheme.colorScheme.onSurface,
    content: (@Composable () -> Unit)? = null,
) {
    Box(
        Modifier.size(width = 82.dp, height = 66.dp).bentoSurface(RoundedCornerShape(22.dp), color, onClick, pressed = 0.86f),
        contentAlignment = Alignment.Center,
    ) {
        if (content != null) content() else Text(label, fontSize = 26.sp, fontFamily = NumFont, fontWeight = FontWeight.Bold, color = textColor)
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
                    keyColor = MaterialTheme.colorScheme.background,
                )
            }
        },
        confirmButton = {
            Button(enabled = pin.length >= 4, onClick = {
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
