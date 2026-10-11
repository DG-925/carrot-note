@file:OptIn(ExperimentalMaterial3Api::class)

package com.carrotnote.app.ui.screens

import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.carrotnote.app.BuildConfig
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import com.carrotnote.app.ui.components.popIn
import com.carrotnote.app.ui.theme.Bento
import com.carrotnote.app.Graph
import com.carrotnote.app.data.ProfileUpdate
import com.carrotnote.app.data.ProjectStatus
import com.carrotnote.app.data.TxnKind
import com.carrotnote.app.profile.Avatars
import com.carrotnote.app.profile.Github
import com.carrotnote.app.profile.GithubProfile
import com.carrotnote.app.time.TimeTracker
import com.carrotnote.app.ui.LocalNav
import com.carrotnote.app.ui.components.AppCard
import com.carrotnote.app.ui.components.Avatar
import com.carrotnote.app.ui.components.ListPadding
import com.carrotnote.app.ui.components.SectionHeader
import com.carrotnote.app.ui.components.SimpleTopBar
import com.carrotnote.app.ui.shareText
import com.carrotnote.app.ui.sumByCurrency
import com.carrotnote.app.ui.theme.ExpenseRed
import com.carrotnote.app.ui.theme.HeroBrush
import com.carrotnote.app.ui.theme.Ico
import com.carrotnote.app.ui.theme.IncomeGreen
import com.carrotnote.app.ui.theme.NumFont
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.LocalDate

@Composable
fun ProfileScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val repo = Graph.repo
    val user by Graph.session.user.collectAsState()
    val projects by repo.projects.flow.collectAsState()
    val notes by repo.notes.flow.collectAsState()
    val time by repo.time.flow.collectAsState()
    val txns by repo.txns.flow.collectAsState()
    val spaces by repo.spaces.collectAsState()
    val currency by Graph.settings.currency.collectAsState()
    var edit by remember { mutableStateOf(false) }
    var photoSheet by remember { mutableStateOf(false) }
    var linkGithub by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var gh by remember { mutableStateOf<GithubProfile?>(null) }
    var ghAvatar by remember { mutableStateOf<ImageBitmap?>(null) }
    val u = user ?: return

    LaunchedEffect(u.github) {
        gh = null; ghAvatar = null
        if (u.github.isNotBlank()) {
            gh = Github.profile(u.github)
            gh?.let { p -> Github.avatarBytes(p)?.let { b -> ghAvatar = BitmapFactory.decodeByteArray(b, 0, b.size)?.asImageBitmap() } }
        }
    }

    fun upload(bytes: ByteArray?) {
        if (bytes == null) { error = "Couldn't read that image"; return }
        busy = true; error = null
        scope.launch {
            try {
                Avatars.upload(ctx, bytes)
            } catch (e: Exception) {
                error = e.message
            } finally {
                busy = false
            }
        }
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch { upload(Avatars.prepareFromUri(ctx, uri)) }
    }

    val monthStart = LocalDate.now().withDayOfMonth(1).toEpochDay()
    val earned = txns.filter { it.kind == TxnKind.INCOME && it.date >= monthStart }.sumByCurrency({ it.currency }, { it.amount })

    Scaffold(
        topBar = {
            SimpleTopBar("Profile", onBack) {
                IconButton(onClick = { nav("settings") }) { Icon(Ico.Settings, "Settings", Modifier.size(18.dp)) }
            }
        },
    ) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = ListPadding, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                val dotA = Bento.colors.butter.container
                val dotB = Bento.colors.mint.container
                Column(
                    Modifier.fillMaxWidth().popIn(1).clip(RoundedCornerShape(28.dp)).background(MaterialTheme.colorScheme.surfaceContainerLow),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(Modifier.fillMaxWidth().height(170.dp)) {
                    Box(
                        Modifier.fillMaxWidth().height(110.dp).background(Bento.colors.orange.container).drawBehind {
                            drawCircle(Color.White.copy(alpha = 0.12f), size.height * 0.9f, Offset(size.width * 0.92f, 0f))
                            drawCircle(Color.White.copy(alpha = 0.08f), size.height * 0.55f, Offset(size.width * 0.08f, size.height))
                            drawCircle(dotA.copy(alpha = 0.9f), 10.dp.toPx(), Offset(size.width * 0.22f, size.height * 0.3f))
                            drawCircle(dotB.copy(alpha = 0.9f), 6.dp.toPx(), Offset(size.width * 0.75f, size.height * 0.7f))
                        },
                    )
                    Box(Modifier.align(Alignment.BottomCenter).size(116.dp).clip(CircleShape).clickable { photoSheet = true }, contentAlignment = Alignment.Center) {
                        Avatar(u.id, u.avatarRev, u.name.ifBlank { u.username }, 108.dp, Modifier.border(4.dp, MaterialTheme.colorScheme.surfaceContainerLow, CircleShape))
                        if (busy) CircularProgressIndicator(Modifier.size(40.dp), color = Color.White)
                        Box(
                            Modifier.align(Alignment.BottomEnd).padding(6.dp).size(32.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary)
                                .border(3.dp, MaterialTheme.colorScheme.surfaceContainerLow, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) { Icon(Ico.Camera, "Change photo", Modifier.size(13.dp), tint = Color.White) }
                    }
                    }
                    Text(u.name.ifBlank { "@${u.username}" }, style = MaterialTheme.typography.headlineMedium)
                    Text("@${u.username}", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.primary, fontFamily = NumFont)
                    if (u.bio.isNotBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Text(u.bio, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 24.dp))
                    }
                    Spacer(Modifier.height(14.dp))
                    Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(onClick = { edit = true }, modifier = Modifier.weight(1f)) { Icon(Ico.Pen, null, Modifier.size(12.dp)); Text("  Edit profile") }
                        OutlinedButton(onClick = {
                            shareText(
                                ctx, "Carrot Note",
                                "Find me on Carrot Note — my username is @${u.username}.\n" +
                                    (if (u.github.isNotBlank()) "GitHub: https://github.com/${u.github}\n" else "") +
                                    "Get the app: https://github.com/${BuildConfig.GITHUB_REPO}/releases/latest",
                            )
                        }, modifier = Modifier.weight(1f)) { Icon(Ico.Share, null, Modifier.size(12.dp)); Text("  Share") }
                    }
                    Spacer(Modifier.height(16.dp))
                }
            }
            error?.let { item { Text(it, color = ExpenseRed) } }
            item {
                AppCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Ico.Github, null, Modifier.size(22.dp))
                        Spacer(Modifier.width(10.dp))
                        Text("GitHub", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                        if (u.github.isNotBlank()) TextButton(onClick = { linkGithub = true }) { Text("Change") }
                    }
                    Spacer(Modifier.height(10.dp))
                    if (u.github.isBlank()) {
                        Text("Link your GitHub to show your work on your profile and use your GitHub photo.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(10.dp))
                        Button(onClick = { linkGithub = true }) { Icon(Ico.Link, null, Modifier.size(12.dp)); Text("  Link GitHub") }
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            val img = ghAvatar
                            if (img != null) Image(img, null, Modifier.size(46.dp).clip(CircleShape))
                            else Box(Modifier.size(46.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceContainerHigh), contentAlignment = Alignment.Center) { Icon(Ico.Github, null, Modifier.size(20.dp)) }
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(gh?.name?.ifBlank { null } ?: u.github, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                                Text("github.com/${u.github}", style = MaterialTheme.typography.bodySmall, fontFamily = NumFont, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        gh?.let { p ->
                            Spacer(Modifier.height(10.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                MiniTile("Repos", "${p.publicRepos}", Modifier.weight(1f))
                                MiniTile("Followers", "${p.followers}", Modifier.weight(1f))
                            }
                            if (p.bio.isNotBlank()) {
                                Spacer(Modifier.height(8.dp))
                                Text(p.bio, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { openUrl(ctx, "https://github.com/${u.github}") }) { Icon(Ico.Open, null, Modifier.size(11.dp)); Text("  Open") }
                            OutlinedButton(enabled = gh != null && !busy, onClick = {
                                val p = gh ?: return@OutlinedButton
                                busy = true
                                scope.launch {
                                    val bytes = Github.avatarBytes(p)?.let(Avatars::prepare)
                                    busy = false
                                    upload(bytes)
                                }
                            }) { Icon(Ico.Image, null, Modifier.size(11.dp)); Text("  Use photo") }
                        }
                    }
                }
            }
            item { SectionHeader("Your stats") }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile(Ico.Project, "Projects", "${projects.size}", MaterialTheme.colorScheme.primary, Modifier.weight(1f))
                    StatTile(Ico.CheckCircle, "Completed", "${projects.count { it.status == ProjectStatus.DONE }}", IncomeGreen, Modifier.weight(1f))
                    StatTile(Ico.Team, "Shared", "${spaces.size}", MaterialTheme.colorScheme.tertiary, Modifier.weight(1f))
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile(Ico.Timer, "Hours", "%.0f".format(TimeTracker.hours(time.sumOf { it.durationMs() })), MaterialTheme.colorScheme.primary, Modifier.weight(1f))
                    StatTile(Ico.Note, "Notes", "${notes.size}", MaterialTheme.colorScheme.tertiary, Modifier.weight(1f))
                    StatTile(Ico.Income, "This month", com.carrotnote.app.ui.Fmt.totals(earned, currency), IncomeGreen, Modifier.weight(1f))
                }
            }
            item {
                AppCard {
                    SectionHeader("Account")
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Ico.Email, null, Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.width(10.dp))
                        Text(u.email, style = MaterialTheme.typography.bodyMedium)
                    }
                    Spacer(Modifier.height(10.dp))
                    OutlinedButton(onClick = { nav("settings") }) { Icon(Ico.Shield, null, Modifier.size(12.dp)); Text("  Security & settings") }
                }
            }
        }
    }

    if (photoSheet) {
        ModalBottomSheet(onDismissRequest = { photoSheet = false }, containerColor = MaterialTheme.colorScheme.surfaceContainer) {
            Column(Modifier.padding(horizontal = 16.dp).navigationBarsPadding().padding(bottom = 16.dp)) {
                Text("Profile photo", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(12.dp))
                SheetRow(Ico.Image, "Choose from gallery") {
                    photoSheet = false
                    Graph.lock.suppressNextLock()
                    picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }
                if (gh != null) SheetRow(Ico.Github, "Use my GitHub photo") {
                    photoSheet = false
                    val p = gh ?: return@SheetRow
                    busy = true
                    scope.launch { val b = Github.avatarBytes(p)?.let(Avatars::prepare); busy = false; upload(b) }
                }
                if (u.avatarRev > 0) SheetRow(Ico.Trash, "Remove photo", ExpenseRed) {
                    photoSheet = false
                    scope.launch {
                        runCatching { Graph.api.deleteAvatar(Graph.session.token ?: "") }.onSuccess { Graph.session.updateUser(it) }.onFailure { error = it.message }
                    }
                }
            }
        }
    }
    if (edit) EditProfileDialog { edit = false }
    if (linkGithub) LinkGithubDialog(u.github) { linkGithub = false }
}

@Composable
private fun SheetRow(icon: ImageVector, label: String, tint: Color? = null, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(vertical = 14.dp, horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, Modifier.size(18.dp), tint = tint ?: MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(16.dp))
        Text(label, style = MaterialTheme.typography.bodyLarge, color = tint ?: MaterialTheme.colorScheme.onSurface)
    }
}

@Composable
private fun MiniTile(label: String, value: String, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(10.dp)) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.titleMedium, fontFamily = NumFont, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun StatTile(icon: ImageVector, label: String, value: String, tint: Color, modifier: Modifier) {
    AppCard(modifier) {
        Icon(icon, null, Modifier.size(15.dp), tint = tint)
        Spacer(Modifier.height(8.dp))
        Text(value, style = MaterialTheme.typography.titleMedium, fontFamily = NumFont, fontWeight = FontWeight.Bold, maxLines = 1)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
    }
}

@Composable
private fun EditProfileDialog(onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    val u = Graph.session.user.value ?: return
    var name by remember { mutableStateOf(u.name) }
    var username by remember { mutableStateOf(u.username) }
    var bio by remember { mutableStateOf(u.bio) }
    var check by remember { mutableStateOf<Pair<String, Boolean?>>(u.username to true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(username) {
        if (username == u.username) { check = username to true; return@LaunchedEffect }
        if (!username.matches(Regex("^[a-z0-9_.]{3,20}$"))) { check = username to null; return@LaunchedEffect }
        delay(400)
        runCatching { Graph.api.usernameAvailable(username) }.onSuccess { check = username to it.available }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit profile") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Field(name, { name = it }, "Full name", Ico.User)
                Field(
                    username, { username = cleanUsername(it) }, "Username", Ico.At, prefix = "@",
                    supporting = when {
                        username == u.username -> null
                        check.first != username || check.second == null -> "3–20 letters, numbers, _ or ."
                        check.second == true -> "✓ Available"
                        else -> "That username is taken"
                    },
                    supportingColor = if (check == (username to false)) ExpenseRed else if (check == (username to true) && username != u.username) IncomeGreen else null,
                )
                OutlinedTextField(bio, { if (it.length <= 280) bio = it }, label = { Text("Bio") }, minLines = 3, modifier = Modifier.fillMaxWidth(), supportingText = { Text("${bio.length}/280") })
                error?.let { Text(it, color = ExpenseRed) }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy && check == (username to true), onClick = {
                busy = true
                scope.launch {
                    try {
                        Graph.session.updateUser(Graph.api.updateProfile(Graph.session.token ?: "", ProfileUpdate(name = name.trim(), username = username, bio = bio.trim())))
                        onDismiss()
                    } catch (e: Exception) {
                        error = e.message
                    } finally {
                        busy = false
                    }
                }
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun LinkGithubDialog(current: String, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(current) }
    var found by remember { mutableStateOf<GithubProfile?>(null) }
    var checking by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(name) {
        found = null; error = null
        if (name.isBlank()) return@LaunchedEffect
        checking = true
        delay(600)
        found = Github.profile(name)
        if (found == null) error = "No GitHub user with that name"
        checking = false
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Ico.Github, null, Modifier.size(26.dp)) },
        title = { Text("Link GitHub") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Field(name, { name = it.trim() }, "GitHub username", Ico.At, prefix = "github.com/")
                if (checking) Text("Looking up…", style = MaterialTheme.typography.bodySmall)
                found?.let { Text("✓ ${it.name.ifBlank { it.login }} · ${it.publicRepos} public repos", color = IncomeGreen, style = MaterialTheme.typography.bodySmall) }
                error?.let { Text(it, color = ExpenseRed, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = {
            TextButton(enabled = found != null, onClick = {
                val login = found?.login ?: return@TextButton
                scope.launch {
                    runCatching { Graph.api.updateProfile(Graph.session.token ?: "", ProfileUpdate(github = login)) }
                        .onSuccess { Graph.session.updateUser(it); onDismiss() }
                        .onFailure { error = it.message }
                }
            }) { Text("Link") }
        },
        dismissButton = {
            Row {
                if (current.isNotBlank()) TextButton(onClick = {
                    scope.launch {
                        runCatching { Graph.api.updateProfile(Graph.session.token ?: "", ProfileUpdate(github = "")) }
                            .onSuccess { Graph.session.updateUser(it); onDismiss() }
                    }
                }) { Text("Unlink", color = ExpenseRed) }
                TextButton(onClick = onDismiss) { Text("Cancel") }
            }
        },
    )
}
