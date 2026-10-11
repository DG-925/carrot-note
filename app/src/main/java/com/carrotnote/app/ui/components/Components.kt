@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.carrotnote.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseOutCubic
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldColors
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.carrotnote.app.R
import com.carrotnote.app.ui.Fmt
import com.carrotnote.app.ui.theme.Bento
import com.carrotnote.app.ui.theme.Carrot
import com.carrotnote.app.ui.theme.ExpenseRed
import com.carrotnote.app.ui.theme.Ico
import com.carrotnote.app.ui.theme.LocalOnHero
import com.carrotnote.app.ui.theme.TileColors
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

val CardShape = RoundedCornerShape(24.dp)
val FieldShape = RoundedCornerShape(16.dp)

/** True inside a card or tile, so inputs use the page color instead of the card color. */
val LocalInCard = staticCompositionLocalOf { false }

// ---------------------------------------------------------------- surfaces

/** Plain white bento card. */
@Composable
fun AppCard(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, container: Color? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .bentoSurface(CardShape, container ?: Bento.colors.card, onClick)
            .padding(16.dp),
    ) {
        CompositionLocalProvider(LocalContentColor provides MaterialTheme.colorScheme.onSurface, LocalInCard provides true) { content() }
    }
}

/** Colored bento tile (mint, butter, lilac...). */
@Composable
fun Tile(colors: TileColors, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.bentoSurface(CardShape, colors.container, onClick).padding(16.dp)) {
        CompositionLocalProvider(LocalContentColor provides colors.content, LocalInCard provides true) { content() }
    }
}

/** Headline tile in solid carrot orange with two slowly drifting circles; content inside turns white. */
@Composable
fun HeroCard(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val drift = rememberInfiniteTransition(label = "hero")
    val t by drift.animateFloat(0f, 1f, infiniteRepeatable(tween(7000, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "drift")
    Column(
        modifier
            .fillMaxWidth()
            .bentoSurface(RoundedCornerShape(28.dp), Bento.colors.orange.container, onClick, pressed = 0.98f)
            .drawBehind {
                val r1 = size.minDimension * 0.62f
                drawCircle(Color.White.copy(alpha = 0.10f), r1, Offset(size.width - r1 * 0.35f + t * 18.dp.toPx(), r1 * 0.15f - t * 10.dp.toPx()))
                val r2 = size.minDimension * 0.32f
                drawCircle(Color.White.copy(alpha = 0.08f), r2, Offset(size.width * 0.12f - t * 12.dp.toPx(), size.height + r2 * 0.25f))
            }
            .padding(20.dp),
    ) {
        CompositionLocalProvider(LocalContentColor provides Bento.colors.orange.content, LocalOnHero provides true, LocalInCard provides true) { content() }
    }
}

/** Round button with an icon, used in top bars and dialogs. */
@Composable
fun RoundIconButton(
    icon: ImageVector,
    description: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = MaterialTheme.colorScheme.onSurface,
    container: Color = Bento.colors.card,
    size: Dp = 42.dp,
) {
    Box(modifier.size(size).bentoSurface(CircleShape, container, onClick, pressed = 0.86f), contentAlignment = Alignment.Center) {
        Icon(icon, description, Modifier.size(15.dp), tint = tint)
    }
}

/** Orange pill button that springs in; used as the add button on screens. */
@Composable
fun BentoFab(label: String, icon: ImageVector = Ico.Plus, onClick: () -> Unit) {
    val appear = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(200)
        appear.animateTo(1f, spring(dampingRatio = 0.5f, stiffness = 380f))
    }
    val onPrimary = MaterialTheme.colorScheme.onPrimary
    Row(
        Modifier
            .graphicsLayer { scaleX = appear.value; scaleY = appear.value; alpha = appear.value.coerceIn(0f, 1f) }
            .shadow(14.dp, CircleShape, ambientColor = Carrot, spotColor = Carrot)
            .bentoSurface(CircleShape, MaterialTheme.colorScheme.primary, onClick, pressed = 0.9f)
            .padding(horizontal = 22.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, Modifier.size(14.dp), tint = onPrimary)
        Spacer(Modifier.width(10.dp))
        Text(label, color = onPrimary, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
    }
}

// ---------------------------------------------------------------- dialogs and bars

/** Full-screen form that slides up, with a close button, title and Save. */
@Composable
fun FormDialog(
    title: String,
    onDismiss: () -> Unit,
    onSave: () -> Unit,
    saveEnabled: Boolean = true,
    onDelete: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    var confirmDelete by remember { mutableStateOf(false) }
    val appear = remember { MutableTransitionState(false).apply { targetState = true } }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            AnimatedVisibility(
                visibleState = appear,
                enter = fadeIn(tween(180)) + slideInVertically(spring(dampingRatio = 0.78f, stiffness = 380f)) { it / 7 },
            ) {
                Column(Modifier.fillMaxSize()) {
                    Row(
                        Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RoundIconButton(Ico.Close, "Close", onDismiss)
                        Spacer(Modifier.width(12.dp))
                        Text(title, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        actions()
                        if (onDelete != null) {
                            Spacer(Modifier.width(6.dp))
                            RoundIconButton(Ico.Trash, "Delete", { confirmDelete = true }, tint = ExpenseRed)
                        }
                        Spacer(Modifier.width(8.dp))
                        Button(
                            onClick = onSave,
                            enabled = saveEnabled,
                            contentPadding = PaddingValues(horizontal = 20.dp),
                            modifier = Modifier.height(42.dp),
                        ) { Text("Save", fontWeight = FontWeight.Bold) }
                    }
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .imePadding()
                            .verticalScroll(rememberScrollState())
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        content()
                        Spacer(Modifier.height(24.dp))
                    }
                }
            }
        }
    }
    if (confirmDelete && onDelete != null) {
        ConfirmDialog(
            title = "Delete?",
            text = "This can't be undone.",
            confirm = "Delete",
            onConfirm = { confirmDelete = false; onDelete() },
            onDismiss = { confirmDelete = false },
        )
    }
}

@Composable
fun ConfirmDialog(title: String, text: String, confirm: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = { Button(onClick = onConfirm) { Text(confirm, fontWeight = FontWeight.Bold) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Top bar for inner screens: round back button and a big title. */
@Composable
fun SimpleTopBar(title: String, onBack: (() -> Unit)? = null, actions: @Composable RowScope.() -> Unit = {}) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars)
            .heightIn(min = 64.dp)
            .padding(start = 16.dp, end = 8.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            RoundIconButton(Ico.Back, "Back", onBack)
            Spacer(Modifier.width(14.dp))
        }
        Text(
            title, style = MaterialTheme.typography.headlineSmall, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f).popIn(0),
        )
        CompositionLocalProvider(LocalContentColor provides MaterialTheme.colorScheme.onSurface) { actions() }
    }
}

// ---------------------------------------------------------------- inputs

@Composable
fun fieldColors(): TextFieldColors {
    val container = if (LocalInCard.current) MaterialTheme.colorScheme.background else Bento.colors.card
    return TextFieldDefaults.colors(
        focusedContainerColor = container,
        unfocusedContainerColor = container,
        disabledContainerColor = container,
        errorContainerColor = container,
        focusedIndicatorColor = Color.Transparent,
        unfocusedIndicatorColor = Color.Transparent,
        disabledIndicatorColor = Color.Transparent,
        errorIndicatorColor = Color.Transparent,
    )
}

@Composable
fun TextInput(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
    minLines: Int = 1,
    keyboardType: KeyboardType = KeyboardType.Text,
    supporting: String? = null,
) {
    TextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = singleLine,
        minLines = minLines,
        modifier = modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        supportingText = supporting?.let { { Text(it) } },
        shape = FieldShape,
        colors = fieldColors(),
    )
}

@Composable
fun AmountInput(value: String, onChange: (String) -> Unit, label: String = "Amount", modifier: Modifier = Modifier) {
    TextField(
        value = value,
        onValueChange = { s -> if (s.all { it.isDigit() || it == '.' || it == ',' }) onChange(s) },
        label = { Text(label) },
        singleLine = true,
        modifier = modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        shape = FieldShape,
        colors = fieldColors(),
    )
}

/** Text field with suggestions dropdown (free text allowed). */
@Composable
fun SuggestInput(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    options: List<String>,
    modifier: Modifier = Modifier,
    transform: (String) -> String = { it },
) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }, modifier = modifier) {
        TextField(
            value = value,
            onValueChange = { onChange(transform(it)) },
            label = { Text(label) },
            singleLine = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor(ExposedDropdownMenuAnchorType.PrimaryEditable),
            shape = FieldShape,
            colors = fieldColors(),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { opt ->
                DropdownMenuItem(text = { Text(opt) }, onClick = { onChange(opt); expanded = false })
            }
        }
    }
}

/** Read-only dropdown for choosing an entity (project, customer...). */
@Composable
fun <T> PickerInput(
    label: String,
    selected: T?,
    options: List<T>,
    display: (T) -> String,
    onSelect: (T?) -> Unit,
    noneLabel: String = "None",
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }, modifier = modifier) {
        TextField(
            value = selected?.let(display) ?: noneLabel,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            singleLine = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
            shape = FieldShape,
            colors = fieldColors(),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(text = { Text(noneLabel) }, onClick = { onSelect(null); expanded = false })
            options.forEach { opt ->
                DropdownMenuItem(text = { Text(display(opt)) }, onClick = { onSelect(opt); expanded = false })
            }
        }
    }
}

@Composable
fun ChipChoice(options: List<String>, selected: String, onSelect: (String) -> Unit, label: (String) -> String = { it }) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { opt ->
            PillChip(selected = opt == selected, onClick = { onSelect(opt) }, label = label(opt))
        }
    }
}

@Composable
fun FieldLabel(text: String) {
    Text(
        text.uppercase(), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 4.dp, top = 4.dp),
    )
}

private fun epochDayToUtcMillis(day: Long) = LocalDate.ofEpochDay(day).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
private fun utcMillisToEpochDay(ms: Long) = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate().toEpochDay()

@Composable
fun DateInput(label: String, value: Long?, onChange: (Long?) -> Unit, allowClear: Boolean = true, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    PickerBox(
        label = label,
        text = value?.let { Fmt.date(it) } ?: "Not set",
        icon = Ico.Calendar,
        onClick = { open = true },
        onClear = if (allowClear && value != null) ({ onChange(null) }) else null,
        modifier = modifier,
    )
    if (open) {
        val state = rememberDatePickerState(initialSelectedDateMillis = epochDayToUtcMillis(value ?: Fmt.today()))
        DatePickerDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { onChange(utcMillisToEpochDay(it)) }
                    open = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { open = false }) { Text("Cancel") } },
        ) { DatePicker(state = state) }
    }
}

@Composable
fun TimeInput(label: String, value: Int?, onChange: (Int?) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    PickerBox(
        label = label,
        text = value?.let { Fmt.time(it) } ?: "No time",
        icon = Ico.Clock,
        onClick = { open = true },
        onClear = if (value != null) ({ onChange(null) }) else null,
        modifier = modifier,
    )
    if (open) {
        val state = rememberTimePickerState(initialHour = (value ?: 540) / 60, initialMinute = (value ?: 540) % 60)
        AlertDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(onClick = { onChange(state.hour * 60 + state.minute); open = false }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { open = false }) { Text("Cancel") } },
            text = { TimePicker(state = state) },
        )
    }
}

@Composable
private fun PickerBox(
    label: String,
    text: String,
    icon: ImageVector,
    onClick: () -> Unit,
    onClear: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val container = if (LocalInCard.current) MaterialTheme.colorScheme.background else Bento.colors.card
    Row(
        modifier
            .fillMaxWidth()
            .bentoSurface(FieldShape, container, onClick, pressed = 0.98f)
            .padding(start = 14.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconBadge(icon, MaterialTheme.colorScheme.primary, Modifier.size(36.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f).padding(vertical = 4.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(text, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
        }
        if (onClear != null) {
            IconButton(onClick = onClear) { Icon(Ico.Close, "Clear", Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

@Composable
fun SwitchRow(title: String, subtitle: String? = null, checked: Boolean, onChange: (Boolean) -> Unit, enabled: Boolean = true) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.small)
            .clickable(enabled = enabled) { onChange(!checked) }
            .padding(vertical = 10.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.width(12.dp))
        Switch(
            checked = checked, onCheckedChange = onChange, enabled = enabled,
            colors = SwitchDefaults.colors(
                checkedTrackColor = MaterialTheme.colorScheme.primary,
                checkedThumbColor = Color.White,
                uncheckedTrackColor = Bento.colors.track,
                uncheckedThumbColor = Color.White,
                uncheckedBorderColor = Color.Transparent,
            ),
        )
    }
}

// ---------------------------------------------------------------- text and states

@Composable
fun SectionHeader(title: String, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(top = 8.dp, start = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        action?.invoke()
    }
}

/** Small uppercase label used above values on tiles. */
@Composable
fun Eyebrow(text: String, modifier: Modifier = Modifier, color: Color = Color.Unspecified) {
    Text(
        text.uppercase(), modifier = modifier, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold,
        color = if (color != Color.Unspecified) color else LocalContentColor.current.copy(alpha = 0.7f),
        maxLines = 1, overflow = TextOverflow.Ellipsis,
    )
}

/** Friendly empty state: a gently floating tile with an icon, a title and a hint. */
@Composable
fun EmptyState(icon: ImageVector, title: String, subtitle: String, modifier: Modifier = Modifier) {
    val float = rememberInfiniteTransition(label = "empty")
    val y by float.animateFloat(-5f, 5f, infiniteRepeatable(tween(1800, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "y")
    val rot by float.animateFloat(-7f, 7f, infiniteRepeatable(tween(2600, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "rot")
    val butter = Bento.colors.butter
    Column(
        modifier.fillMaxWidth().padding(vertical = 32.dp, horizontal = 24.dp).popIn(1),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(84.dp)
                .graphicsLayer { rotationZ = rot; translationY = y.dp.toPx() }
                .clip(RoundedCornerShape(28.dp))
                .background(butter.container),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, null, tint = butter.content, modifier = Modifier.size(32.dp)) }
        Spacer(Modifier.height(18.dp))
        Text(title, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
        Spacer(Modifier.height(6.dp))
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    }
}

// ---------------------------------------------------------------- progress

/** Rounded bar that grows to [progress] with a soft spring. */
@Composable
fun ProgressBar(progress: Float, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.primary, height: Dp = 8.dp) {
    val hero = LocalOnHero.current
    val anim = remember { Animatable(0f) }
    LaunchedEffect(progress) { anim.animateTo(progress.coerceIn(0f, 1f), spring(dampingRatio = 0.85f, stiffness = 110f)) }
    val fg = if (hero) Color.White else color
    val track = if (hero) Color.White.copy(alpha = 0.25f) else Bento.colors.track
    Canvas(modifier.fillMaxWidth().height(height)) {
        val r = CornerRadius(size.height / 2, size.height / 2)
        drawRoundRect(track, cornerRadius = r)
        val w = size.width * anim.value.coerceIn(0f, 1f)
        if (w > 0f) drawRoundRect(fg, size = Size(maxOf(w, size.height), size.height), cornerRadius = r)
    }
}

/** Ring that sweeps to [progress]; put a label inside with [content]. */
@Composable
fun ProgressRing(
    progress: Float,
    modifier: Modifier = Modifier,
    diameter: Dp = 42.dp,
    stroke: Dp = 4.5.dp,
    color: Color = MaterialTheme.colorScheme.primary,
    track: Color = Bento.colors.track,
    content: @Composable BoxScope.() -> Unit = {},
) {
    val anim = remember { Animatable(0f) }
    LaunchedEffect(progress) { anim.animateTo(progress.coerceIn(0f, 1f), tween(1100, easing = EaseOutCubic)) }
    Box(modifier.size(diameter), contentAlignment = Alignment.Center) {
        Canvas(Modifier.matchParentSize()) {
            val sw = stroke.toPx()
            val topLeft = Offset(sw / 2, sw / 2)
            val arc = Size(size.width - sw, size.height - sw)
            drawArc(track, startAngle = 0f, sweepAngle = 360f, useCenter = false, topLeft = topLeft, size = arc, style = Stroke(sw))
            if (anim.value > 0f) {
                drawArc(
                    color, startAngle = -90f, sweepAngle = 360f * anim.value, useCenter = false,
                    topLeft = topLeft, size = arc, style = Stroke(sw, cap = StrokeCap.Round),
                )
            }
        }
        content()
    }
}

// ---------------------------------------------------------------- small pieces

/** Rounded-square icon tile tinted with [tint]. */
@Composable
fun IconBadge(icon: ImageVector, tint: Color, modifier: Modifier = Modifier) {
    Box(
        modifier
            .size(42.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(tint.copy(alpha = if (Bento.colors.dark) 0.2f else 0.13f)),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, null, tint = tint, modifier = Modifier.size(17.dp)) }
}

/** Pill filter chip: dark when selected, white otherwise; colors fade on change. */
@Composable
fun PillChip(selected: Boolean, onClick: () -> Unit, label: String) {
    val b = Bento.colors
    val cs = MaterialTheme.colorScheme
    val selBg = if (b.dark) cs.primary else b.ink
    val bg by animateColorAsState(if (selected) selBg else b.card, tween(220), label = "chipBg")
    val fg by animateColorAsState(if (selected) Color.White else cs.onSurface, tween(220), label = "chipFg")
    Text(
        label,
        color = fg,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
        maxLines = 1,
        modifier = Modifier
            .bentoSurface(CircleShape, bg, onClick, pressed = 0.9f)
            .padding(horizontal = 16.dp, vertical = 9.dp),
    )
}

@Composable
fun CurrencyInput(value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) =
    SuggestInput(value, onChange, "Currency", com.carrotnote.app.data.Categories.currencies, modifier) { it.uppercase().take(8) }

val ListPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 110.dp)

@Composable
fun AppLogo(size: Dp) {
    Box(
        Modifier.size(size).clip(RoundedCornerShape(size * 0.3f)).background(Color(0xFFFFE58F)),
        contentAlignment = Alignment.Center,
    ) {
        Image(painterResource(R.drawable.ic_launcher_foreground), null, Modifier.size(size * 1.5f))
    }
}
