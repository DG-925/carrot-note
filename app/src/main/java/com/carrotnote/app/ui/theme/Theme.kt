package com.carrotnote.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carrotnote.app.R

// Bento Pop palette
val Carrot = Color(0xFFFF6B1F)
val CarrotLight = Color(0xFFFF8F52)
val CarrotDeep = Color(0xFFE05A12)
val Ink = Color(0xFF1E1A17)
val Amber = Color(0xFFF5B400)
val IncomeGreen = Color(0xFF1FA86A)
val ExpenseRed = Color(0xFFE5484D)

/** Bricolage Grotesque: headings and big numbers. */
val DisplayFont = FontFamily(
    Font(R.font.bricolage_medium, FontWeight.Medium),
    Font(R.font.bricolage_semibold, FontWeight.SemiBold),
    Font(R.font.bricolage_bold, FontWeight.Bold),
    Font(R.font.bricolage_extrabold, FontWeight.ExtraBold),
)

/** Onest: everything else. */
val BodyFont = FontFamily(
    Font(R.font.onest_regular, FontWeight.Normal),
    Font(R.font.onest_medium, FontWeight.Medium),
    Font(R.font.onest_semibold, FontWeight.SemiBold),
    Font(R.font.onest_bold, FontWeight.Bold),
)

/** Face used for amounts, times and counters. */
val NumFont = DisplayFont

/** Orange used for avatars and the + button. */
val HeroBrush = Brush.linearGradient(listOf(Color(0xFFFF8A45), Color(0xFFFF6B1F), Color(0xFFF2560C)))

/** True inside an orange [com.carrotnote.app.ui.components.HeroCard], so stats and chips switch to white. */
val LocalOnHero = staticCompositionLocalOf { false }

/** A colored bento tile: background and the text/icon color that sits on it. */
@Immutable
data class TileColors(val container: Color, val content: Color)

@Immutable
data class BentoColors(
    val orange: TileColors,
    val mint: TileColors,
    val butter: TileColors,
    val lilac: TileColors,
    val sky: TileColors,
    val rose: TileColors,
    /** Card / tile background. */
    val card: Color,
    /** Floating tab bar. */
    val ink: Color,
    val onInk: Color,
    val inkMuted: Color,
    /** Selected tab highlight inside the tab bar. */
    val inkPill: Color,
    /** Empty part of bars and rings. */
    val track: Color,
    val dark: Boolean,
) {
    val tiles get() = listOf(mint, butter, lilac, sky, rose)
}

private val LightBento = BentoColors(
    orange = TileColors(Carrot, Color.White),
    mint = TileColors(Color(0xFFC7F0D8), Color(0xFF0F3D25)),
    butter = TileColors(Color(0xFFFFE58F), Color(0xFF3D2E00)),
    lilac = TileColors(Color(0xFFE6DEFF), Color(0xFF2A1E5C)),
    sky = TileColors(Color(0xFFCFE6FF), Color(0xFF0D2F55)),
    rose = TileColors(Color(0xFFFFD6DE), Color(0xFF5A1426)),
    card = Color.White,
    ink = Ink,
    onInk = Color.White,
    inkMuted = Color(0xFF8F8780),
    inkPill = Color(0xFF3A332E),
    track = Color(0xFFECE7E1),
    dark = false,
)

private val DarkBento = BentoColors(
    orange = TileColors(Carrot, Color.White),
    mint = TileColors(Color(0xFF173A29), Color(0xFFB6F0CF)),
    butter = TileColors(Color(0xFF3A3014), Color(0xFFFFE58F)),
    lilac = TileColors(Color(0xFF2A2450), Color(0xFFE1D8FF)),
    sky = TileColors(Color(0xFF15304D), Color(0xFFCFE6FF)),
    rose = TileColors(Color(0xFF47202A), Color(0xFFFFD6DE)),
    card = Color(0xFF1E1B18),
    ink = Color(0xFF2B2622),
    onInk = Color.White,
    inkMuted = Color(0xFF9A918A),
    inkPill = Color(0xFF453D37),
    track = Color(0xFF2E2925),
    dark = true,
)

val LocalBento = staticCompositionLocalOf { LightBento }

/** Bento colors for the current theme. */
object Bento {
    val colors: BentoColors
        @Composable @ReadOnlyComposable get() = LocalBento.current
}

private val LightColors = lightColorScheme(
    primary = Carrot,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFE3D1),
    onPrimaryContainer = Color(0xFF7A2E00),
    secondary = IncomeGreen,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFC7F0D8),
    onSecondaryContainer = Color(0xFF0F3D25),
    tertiary = Color(0xFF7C5CE0),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFE6DEFF),
    onTertiaryContainer = Color(0xFF2A1E5C),
    background = Color(0xFFF4F2EF),
    onBackground = Ink,
    surface = Color(0xFFF4F2EF),
    onSurface = Ink,
    surfaceVariant = Color(0xFFECE7E1),
    onSurfaceVariant = Color(0xFF857C74),
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color.White,
    surfaceContainer = Color.White,
    surfaceContainerHigh = Color.White,
    surfaceContainerHighest = Color(0xFFECE7E1),
    outline = Color(0xFFDCD4CC),
    outlineVariant = Color(0xFFECE7E1),
    error = ExpenseRed,
    onError = Color.White,
    inverseSurface = Ink,
    inverseOnSurface = Color(0xFFF4F2EF),
    inversePrimary = CarrotLight,
    scrim = Color(0xFF1E1A17),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFFF7A35),
    onPrimary = Color.White,
    primaryContainer = Color(0xFF3D2112),
    onPrimaryContainer = Color(0xFFFFB68C),
    secondary = Color(0xFF3DD68C),
    onSecondary = Color(0xFF062814),
    secondaryContainer = Color(0xFF173A29),
    onSecondaryContainer = Color(0xFFB6F0CF),
    tertiary = Color(0xFFB9A4FF),
    onTertiary = Color(0xFF1E1546),
    tertiaryContainer = Color(0xFF2A2450),
    onTertiaryContainer = Color(0xFFE1D8FF),
    background = Color(0xFF131110),
    onBackground = Color(0xFFF4EFEA),
    surface = Color(0xFF131110),
    onSurface = Color(0xFFF4EFEA),
    surfaceVariant = Color(0xFF2E2925),
    onSurfaceVariant = Color(0xFFA39A92),
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color(0xFF0E0C0B),
    surfaceContainerLow = Color(0xFF1E1B18),
    surfaceContainer = Color(0xFF1E1B18),
    surfaceContainerHigh = Color(0xFF26221F),
    surfaceContainerHighest = Color(0xFF302B27),
    outline = Color(0xFF3F3833),
    outlineVariant = Color(0xFF2A2522),
    error = Color(0xFFFF6B6B),
    onError = Color(0xFF2D0A0A),
    inverseSurface = Color(0xFFF4EFEA),
    inverseOnSurface = Color(0xFF131110),
    inversePrimary = Carrot,
    scrim = Color.Black,
)

private val base = Typography()

private val AppTypography = Typography(
    displayLarge = base.displayLarge.copy(fontFamily = DisplayFont, fontWeight = FontWeight.ExtraBold, letterSpacing = (-1.5).sp),
    displayMedium = base.displayMedium.copy(fontFamily = DisplayFont, fontWeight = FontWeight.ExtraBold, letterSpacing = (-1.2).sp),
    displaySmall = base.displaySmall.copy(fontFamily = DisplayFont, fontWeight = FontWeight.ExtraBold, letterSpacing = (-1).sp),
    headlineLarge = base.headlineLarge.copy(fontFamily = DisplayFont, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.8).sp),
    headlineMedium = base.headlineMedium.copy(fontFamily = DisplayFont, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.6).sp),
    headlineSmall = base.headlineSmall.copy(fontFamily = DisplayFont, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.4).sp),
    titleLarge = base.titleLarge.copy(fontFamily = DisplayFont, fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp),
    titleMedium = base.titleMedium.copy(fontFamily = DisplayFont, fontWeight = FontWeight.Bold, letterSpacing = 0.sp),
    titleSmall = base.titleSmall.copy(fontFamily = BodyFont, fontWeight = FontWeight.SemiBold),
    bodyLarge = base.bodyLarge.copy(fontFamily = BodyFont, letterSpacing = 0.1.sp),
    bodyMedium = base.bodyMedium.copy(fontFamily = BodyFont, letterSpacing = 0.1.sp),
    bodySmall = base.bodySmall.copy(fontFamily = BodyFont, letterSpacing = 0.2.sp),
    labelLarge = base.labelLarge.copy(fontFamily = BodyFont, fontWeight = FontWeight.SemiBold),
    labelMedium = base.labelMedium.copy(fontFamily = BodyFont, fontWeight = FontWeight.SemiBold),
    labelSmall = base.labelSmall.copy(fontFamily = BodyFont, fontWeight = FontWeight.Medium, letterSpacing = 0.3.sp),
)

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(14.dp),
    small = RoundedCornerShape(16.dp),
    medium = RoundedCornerShape(20.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(30.dp),
)

@Composable
fun CarrotTheme(themeMode: Int = 1, content: @Composable () -> Unit) {
    val dark = when (themeMode) {
        1 -> false
        2 -> true
        else -> isSystemInDarkTheme()
    }
    CompositionLocalProvider(LocalBento provides if (dark) DarkBento else LightBento) {
        MaterialTheme(
            colorScheme = if (dark) DarkColors else LightColors,
            typography = AppTypography,
            shapes = AppShapes,
            content = content,
        )
    }
}

/** Note card colors (index stored in Note.color). Text on them is always dark. */
val NoteColors = listOf(
    Color(0x00000000),
    Color(0xFFFFE3D1),
    Color(0xFFFFE58F),
    Color(0xFFC7F0D8),
    Color(0xFFCFE6FF),
    Color(0xFFE6DEFF),
    Color(0xFFFFD6DE),
)
