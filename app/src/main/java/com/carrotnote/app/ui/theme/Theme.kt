package com.carrotnote.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.carrotnote.app.R

// CarrotPOS palette
val Carrot = Color(0xFFFF8C1A)
val CarrotLight = Color(0xFFFF9A3C)
val CarrotDeep = Color(0xFF9A4A12)
val CarrotBrown = Color(0xFF47290F)
val Amber = Color(0xFFFFC043)
val Leaf = Color(0xFF43A047)
val IncomeGreen = Color(0xFF3DBE7A)
val ExpenseRed = Color(0xFFFF5A5F)

/** Monospace face used for prices, amounts and times (as in CarrotPOS). */
val MonoFont = FontFamily(
    Font(R.font.jetbrains_mono_medium, FontWeight.Medium),
    Font(R.font.jetbrains_mono_bold, FontWeight.Bold),
)

/** Orange gradient used for headline cards (like the CarrotPOS Pay button). */
val HeroBrush = Brush.linearGradient(listOf(Color(0xFFE5771C), Color(0xFFB0561A), Color(0xFF7E3A0D)))

/** True inside a [HeroBrush] card, so stats and chips switch to white. */
val LocalOnHero = staticCompositionLocalOf { false }

private val LightColors = lightColorScheme(
    primary = Color(0xFFE8740F),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFE3CC),
    onPrimaryContainer = Color(0xFF5A2A00),
    secondary = Color(0xFF2E9E5B),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFFE3CC),
    onSecondaryContainer = Color(0xFF5A2A00),
    tertiary = Color(0xFF7A5BC4),
    tertiaryContainer = Color(0xFFE9DDFF),
    background = Color(0xFFFAF8F6),
    onBackground = Color(0xFF1C1A18),
    surface = Color(0xFFFAF8F6),
    onSurface = Color(0xFF1C1A18),
    surfaceVariant = Color(0xFFEDE8E3),
    onSurfaceVariant = Color(0xFF6B635C),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color.White,
    surfaceContainer = Color(0xFFF3EFEB),
    surfaceContainerHigh = Color(0xFFEEE9E4),
    surfaceContainerHighest = Color(0xFFE6E0DA),
    outline = Color(0xFFCFC6BE),
    outlineVariant = Color(0xFFE6DFD8),
    error = Color(0xFFD32F2F),
)

private val DarkColors = darkColorScheme(
    primary = Carrot,
    onPrimary = Color.White,
    primaryContainer = CarrotBrown,
    onPrimaryContainer = CarrotLight,
    secondary = IncomeGreen,
    onSecondary = Color(0xFF06210F),
    secondaryContainer = CarrotBrown,
    onSecondaryContainer = CarrotLight,
    tertiary = Color(0xFFB69CFF),
    tertiaryContainer = Color(0xFF34295A),
    background = Color(0xFF141414),
    onBackground = Color(0xFFF2F2F2),
    surface = Color(0xFF141414),
    onSurface = Color(0xFFF2F2F2),
    surfaceVariant = Color(0xFF2A2A2A),
    onSurfaceVariant = Color(0xFF9A9A9A),
    surfaceContainerLowest = Color(0xFF0E0E0E),
    surfaceContainerLow = Color(0xFF212121),
    surfaceContainer = Color(0xFF1A1A1A),
    surfaceContainerHigh = Color(0xFF262626),
    surfaceContainerHighest = Color(0xFF2E2E2E),
    outline = Color(0xFF3A3A3A),
    outlineVariant = Color(0xFF2C2C2C),
    error = Color(0xFFFF6B6B),
    inverseSurface = Color(0xFFF2F2F2),
    inverseOnSurface = Color(0xFF141414),
)

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(12.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(26.dp),
)

@Composable
fun CarrotTheme(themeMode: Int = 2, content: @Composable () -> Unit) {
    val dark = when (themeMode) {
        1 -> false
        2 -> true
        else -> isSystemInDarkTheme()
    }
    MaterialTheme(
        colorScheme = if (dark) DarkColors else LightColors,
        shapes = AppShapes,
        content = content,
    )
}

/** Note card colors (index stored in Note.color). */
val NoteColors = listOf(
    Color(0x00000000),
    Color(0xFFFFE0C2),
    Color(0xFFFFF3B0),
    Color(0xFFD4F1D0),
    Color(0xFFCFE7FF),
    Color(0xFFEBDDFF),
    Color(0xFFFFD6DE),
)
