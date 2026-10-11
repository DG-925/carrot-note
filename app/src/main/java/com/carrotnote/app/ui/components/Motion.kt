package com.carrotnote.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseOutCubic
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.carrotnote.app.ui.Fmt
import kotlinx.coroutines.delay
import kotlin.math.abs
import kotlin.math.roundToLong

/** Shrinks a little while pressed and springs back on release. */
fun Modifier.pressScale(interaction: InteractionSource, pressed: Float = 0.96f): Modifier = composed {
    val isPressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        if (isPressed) pressed else 1f,
        spring(dampingRatio = 0.45f, stiffness = 650f),
        label = "press",
    )
    Modifier.graphicsLayer { scaleX = scale; scaleY = scale }
}

/** Clickable with a springy press, for things that are already shaped. */
fun Modifier.bounceClick(enabled: Boolean = true, pressed: Float = 0.94f, onClick: () -> Unit): Modifier = composed {
    val interaction = remember { MutableInteractionSource() }
    Modifier
        .pressScale(interaction, pressed)
        .clickable(interactionSource = interaction, indication = LocalIndication.current, enabled = enabled, onClick = onClick)
}

/** Shape + fill, plus a springy press when [onClick] is set. */
fun Modifier.bentoSurface(shape: Shape, color: Color, onClick: (() -> Unit)?, pressed: Float = 0.97f): Modifier = composed {
    if (onClick == null) {
        Modifier.clip(shape).background(color)
    } else {
        val interaction = remember { MutableInteractionSource() }
        Modifier
            .pressScale(interaction, pressed)
            .clip(shape)
            .background(color)
            .clickable(interactionSource = interaction, indication = LocalIndication.current, onClick = onClick)
    }
}

/** Open for the first moments after a screen appears; items composed then pop in, later ones just show. */
class EntranceClock {
    var active by mutableStateOf(true)
}

val LocalEntrance = staticCompositionLocalOf<EntranceClock?> { null }

/** Wrap a screen so its first items pop in one after another. */
@Composable
fun Entrance(content: @Composable () -> Unit) {
    val clock = remember { EntranceClock() }
    LaunchedEffect(Unit) {
        delay(1000)
        clock.active = false
    }
    CompositionLocalProvider(LocalEntrance provides clock, content = content)
}

/** Rises, grows and fades in with a bouncy spring, [index] steps after the screen opens. */
fun Modifier.popIn(index: Int = 0): Modifier = composed {
    val clock = LocalEntrance.current
    val animate = remember { clock?.active ?: true }
    val progress = remember { Animatable(if (animate) 0f else 1f) }
    if (animate) {
        LaunchedEffect(Unit) {
            delay(index.coerceIn(0, 10) * 55L)
            progress.animateTo(1f, spring(dampingRatio = 0.6f, stiffness = 320f))
        }
    }
    Modifier.graphicsLayer {
        val v = progress.value
        alpha = v.coerceIn(0f, 1f)
        translationY = (1f - v) * 28.dp.toPx()
        val s = 0.9f + 0.1f * v
        scaleX = s
        scaleY = s
    }
}

/** A number that counts up to [value] when it first shows and glides to new values. */
@Composable
fun CountUpText(
    value: Double,
    format: (Double) -> String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = Color.Unspecified,
    fontWeight: FontWeight? = null,
) {
    val anim = remember { Animatable(0f) }
    var settled by remember { mutableStateOf(false) }
    LaunchedEffect(value) {
        settled = false
        anim.animateTo(value.toFloat(), tween(1100, easing = EaseOutCubic))
        settled = true
    }
    val whole = value % 1.0 == 0.0
    val shown = if (settled) value else anim.value.toDouble().let { if (whole) it.roundToLong().toDouble() else it }
    Text(
        format(shown),
        modifier = modifier,
        style = style.copy(fontFeatureSettings = "tnum"),
        color = color,
        fontWeight = fontWeight,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

/**
 * Money totals that may be in several currencies. A single currency counts up;
 * several are shown as text ("1,200 USD · 300 EGP").
 */
@Composable
fun AnimatedTotals(
    totals: Map<String, Double>,
    currency: String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = Color.Unspecified,
    sign: Boolean = false,
) {
    val nonZero = totals.filterValues { abs(it) > 0.0001 }
    if (nonZero.size <= 1) {
        val (cur, v) = nonZero.entries.firstOrNull()?.let { it.key to it.value } ?: (currency to 0.0)
        CountUpText(v, { (if (sign && it > 0.0001) "+" else "") + Fmt.money(it, cur) }, modifier, style, color)
    } else {
        Text(Fmt.totals(totals, currency), modifier = modifier, style = style, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
