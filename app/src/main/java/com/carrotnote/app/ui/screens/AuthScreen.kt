package com.carrotnote.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.carrotnote.app.Graph
import com.carrotnote.app.ui.components.AppLogo
import com.carrotnote.app.ui.components.Segmented
import com.carrotnote.app.ui.theme.ExpenseRed
import com.carrotnote.app.ui.theme.Ico
import com.carrotnote.app.ui.theme.IncomeGreen
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val usernameRule = Regex("^[a-z0-9_.]{3,20}$")

fun cleanUsername(s: String) = s.trim().removePrefix("@").lowercase().filter { it.isLetterOrDigit() || it == '_' || it == '.' }.take(20)

/** 0..4 rough password strength. */
fun passwordStrength(p: String): Int {
    if (p.isEmpty()) return 0
    var s = 0
    if (p.length >= 8) s++
    if (p.length >= 12) s++
    if (p.any { it.isDigit() } && p.any { it.isLetter() }) s++
    if (p.any { it.isUpperCase() } && p.any { it.isLowerCase() } || p.any { !it.isLetterOrDigit() }) s++
    return s.coerceIn(1, 4)
}

@Composable
fun AuthScreen() {
    val scope = rememberCoroutineScope()
    var tab by remember { mutableStateOf(0) }
    var name by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var login by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var show by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var userCheck by remember { mutableStateOf<Pair<String, Boolean?>>("" to null) } // username -> available?
    var userReason by remember { mutableStateOf<String?>(null) }
    val register = tab == 1

    LaunchedEffect(username) {
        userReason = null
        if (!username.matches(usernameRule)) {
            userCheck = username to null
            return@LaunchedEffect
        }
        delay(400)
        runCatching { Graph.api.usernameAvailable(username) }.onSuccess {
            userCheck = username to it.available
            userReason = it.reason
        }
    }

    val emailOk = email.trim().matches(Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$"))
    val usernameOk = username.matches(usernameRule) && userCheck == (username to true)
    val match = confirm.isNotEmpty() && confirm == password
    val canSubmit = !loading && if (register) {
        name.isNotBlank() && usernameOk && emailOk && password.length >= 8 && match
    } else login.isNotBlank() && password.isNotEmpty()

    fun submit() {
        if (!canSubmit) return
        loading = true
        error = null
        scope.launch {
            try {
                val res = if (register) Graph.api.register(username, name.trim(), email.trim(), password)
                else Graph.api.login(login.trim(), password)
                Graph.onSignedIn(res)
            } catch (e: Exception) {
                error = e.message ?: "Something went wrong"
            } finally {
                loading = false
            }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .systemBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Spacer(Modifier.height(20.dp))
        AppLogo(84.dp)
        Text("Carrot Note", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text(
            "Projects, money, notes and your team — in one place.",
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(4.dp))
        Segmented(listOf("Sign in" to Ico.Lock, "Create account" to Ico.UserPlus), tab, { tab = it; error = null })
        Spacer(Modifier.height(4.dp))

        if (register) {
            Field(name, { name = it }, "Full name", Ico.User)
            Field(
                username, { username = cleanUsername(it) }, "Username", Ico.At,
                prefix = "@",
                supporting = when {
                    username.isEmpty() -> "3–20 letters, numbers, _ or ."
                    !username.matches(usernameRule) -> "3–20 letters, numbers, _ or ."
                    userCheck.first != username || userCheck.second == null -> "Checking…"
                    userCheck.second == true -> "✓ @$username is available"
                    else -> userReason ?: "That username is taken"
                },
                supportingColor = when {
                    userCheck == (username to true) -> IncomeGreen
                    userCheck == (username to false) -> ExpenseRed
                    else -> null
                },
            )
            Field(email, { email = it }, "Email", Ico.Email, keyboard = KeyboardType.Email)
        } else {
            Field(login, { login = it }, "Email or username", Ico.User, keyboard = KeyboardType.Email)
        }
        Field(
            password, { password = it }, "Password", Ico.Lock,
            password = !show, keyboard = KeyboardType.Password,
            trailing = {
                IconButton(onClick = { show = !show }) { Icon(if (show) Ico.EyeOff else Ico.Eye, "Show password", Modifier.size(18.dp)) }
            },
        )
        if (register) {
            StrengthMeter(passwordStrength(password))
            Field(
                confirm, { confirm = it }, "Type the password again", Ico.Lock,
                password = !show, keyboard = KeyboardType.Password, ime = ImeAction.Done,
                supporting = when {
                    confirm.isEmpty() -> null
                    match -> "✓ Passwords match"
                    else -> "Passwords don't match"
                },
                supportingColor = if (confirm.isEmpty()) null else if (match) IncomeGreen else ExpenseRed,
            )
        }
        if (error != null) {
            Row(
                Modifier.fillMaxWidth().clip(MaterialTheme.shapes.small).background(ExpenseRed.copy(alpha = 0.12f)).padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Ico.Warning, null, Modifier.size(16.dp), tint = ExpenseRed)
                Spacer(Modifier.width(10.dp))
                Text(error!!, color = ExpenseRed, style = MaterialTheme.typography.bodyMedium)
            }
        }
        Button(onClick = ::submit, enabled = canSubmit, modifier = Modifier.fillMaxWidth().height(54.dp)) {
            if (loading) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp, color = Color.White)
            else Text(if (register) "Create my account" else "Sign in", fontWeight = FontWeight.Bold)
        }
        TextButton(onClick = { tab = 1 - tab; error = null }) {
            Text(if (register) "Already have an account? Sign in" else "New here? Create an account")
        }
        Text(
            "Your data is saved on this phone and synced to your account.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center,
        )
    }
}

@Composable
fun Field(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    keyboard: KeyboardType = KeyboardType.Text,
    ime: ImeAction = ImeAction.Next,
    password: Boolean = false,
    prefix: String? = null,
    supporting: String? = null,
    supportingColor: Color? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        leadingIcon = { Icon(icon, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant) },
        prefix = prefix?.let { { Text(it) } },
        trailingIcon = trailing,
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard, imeAction = ime),
        supportingText = supporting?.let { { Text(it, color = supportingColor ?: MaterialTheme.colorScheme.onSurfaceVariant) } },
        modifier = modifier.fillMaxWidth(),
    )
}

@Composable
private fun StrengthMeter(level: Int) {
    val labels = listOf("", "Weak", "Okay", "Good", "Strong")
    val colors = listOf(Color.Transparent, ExpenseRed, Color(0xFFFFC043), MaterialTheme.colorScheme.primary, IncomeGreen)
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        repeat(4) { i ->
            Box(
                Modifier.weight(1f).height(5.dp).padding(end = 4.dp).clip(CircleShape)
                    .background(if (i < level) colors[level] else MaterialTheme.colorScheme.surfaceVariant),
            )
        }
        Text(labels[level], style = MaterialTheme.typography.labelSmall, color = colors[level], modifier = Modifier.width(52.dp), textAlign = TextAlign.End)
    }
}

/** Shown once to accounts created before usernames existed. */
@Composable
fun ChooseUsernameScreen() {
    val scope = rememberCoroutineScope()
    val user = Graph.session.user.value
    var username by remember { mutableStateOf("") }
    var check by remember { mutableStateOf<Pair<String, Boolean?>>("" to null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(username) {
        if (!username.matches(usernameRule)) { check = username to null; return@LaunchedEffect }
        delay(400)
        runCatching { Graph.api.usernameAvailable(username) }.onSuccess { check = username to it.available }
    }
    Column(
        Modifier.fillMaxSize().systemBarsPadding().imePadding().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Spacer(Modifier.height(40.dp))
        AppLogo(72.dp)
        Text("Pick a username", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(
            "People use it to find you and invite you to projects${user?.name?.let { ", $it" } ?: ""}.",
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center,
        )
        Field(
            username, { username = cleanUsername(it) }, "Username", Ico.At, prefix = "@", ime = ImeAction.Done,
            supporting = when {
                !username.matches(usernameRule) -> "3–20 letters, numbers, _ or ."
                check.first != username || check.second == null -> "Checking…"
                check.second == true -> "✓ Available"
                else -> "That username is taken"
            },
            supportingColor = when (check) { username to true -> IncomeGreen; username to false -> ExpenseRed; else -> null },
        )
        if (error != null) Text(error!!, color = ExpenseRed)
        Button(
            enabled = !busy && check == (username to true),
            modifier = Modifier.fillMaxWidth().height(52.dp),
            onClick = {
                busy = true
                scope.launch {
                    try {
                        Graph.session.updateUser(Graph.api.updateProfile(Graph.session.token ?: "", com.carrotnote.app.data.ProfileUpdate(username = username)))
                    } catch (e: Exception) {
                        error = e.message
                    } finally {
                        busy = false
                    }
                }
            },
        ) { Text("Continue", fontWeight = FontWeight.Bold) }
        TextButton(onClick = { Graph.signOut() }) { Text("Sign out") }
    }
}
