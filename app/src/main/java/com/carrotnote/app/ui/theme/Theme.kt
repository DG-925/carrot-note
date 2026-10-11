package com.carrotnote.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

val Carrot = Color(0xFFFF7A1A)
val CarrotDark = Color(0xFFE0600A)
val Leaf = Color(0xFF43A047)
val IncomeGreen = Color(0xFF2E9E5B)
val ExpenseRed = Color(0xFFE5484D)

private val LightColors = lightColorScheme(
    primary = Color(0xFFE8650A),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFDCC4),
    onPrimaryContainer = Color(0xFF341100),
    secondary = Color(0xFF3F8F4A),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFD5EFD3),
    onSecondaryContainer = Color(0xFF0B2E12),
    tertiary = Color(0xFF7A5BC4),
    tertiaryContainer = Color(0xFFE9DDFF),
    background = Color(0xFFFFFBF7),
    onBackground = Color(0xFF221A15),
    surface = Color(0xFFFFFBF7),
    onSurface = Color(0xFF221A15),
    surfaceVariant = Color(0xFFF4E6DB),
    onSurfaceVariant = Color(0xFF53443A),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFFFF5EE),
    surfaceContainer = Color(0xFFFCEFE6),
    surfaceContainerHigh = Color(0xFFF7E9DF),
    surfaceContainerHighest = Color(0xFFF1E3D8),
    outline = Color(0xFF85736A),
    outlineVariant = Color(0xFFD8C2B5),
    error = Color(0xFFBA1A1A),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFFFB68A),
    onPrimary = Color(0xFF552000),
    primaryContainer = Color(0xFF7A3200),
    onPrimaryContainer = Color(0xFFFFDCC4),
    secondary = Color(0xFF9AD596),
    onSecondary = Color(0xFF00390F),
    secondaryContainer = Color(0xFF235229),
    onSecondaryContainer = Color(0xFFD5EFD3),
    tertiary = Color(0xFFCFBCFF),
    tertiaryContainer = Color(0xFF4F3D86),
    background = Color(0xFF1A1410),
    onBackground = Color(0xFFF0DFD5),
    surface = Color(0xFF1A1410),
    onSurface = Color(0xFFF0DFD5),
    surfaceVariant = Color(0xFF53443A),
    onSurfaceVariant = Color(0xFFD8C2B5),
    surfaceContainerLowest = Color(0xFF140F0B),
    surfaceContainerLow = Color(0xFF221B16),
    surfaceContainer = Color(0xFF271F1A),
    surfaceContainerHigh = Color(0xFF322924),
    surfaceContainerHighest = Color(0xFF3D342E),
    outline = Color(0xFFA08D82),
    outlineVariant = Color(0xFF53443A),
)

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

@Composable
fun CarrotTheme(themeMode: Int = 0, content: @Composable () -> Unit) {
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
