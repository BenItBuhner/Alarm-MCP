package dev.alarmmcp.android.ui

import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import dev.alarmmcp.android.Intensity

val Ink = Color(0xFF07080B)
val Panel = Color(0xFF101218)
val Amber = Color(0xFFE8A13A)
val Muted = Color(0xFF8B90A0)
val Good = Color(0xFF34D399)
val Bad = Color(0xFFF87171)

fun intensityColor(intensity: Intensity): Color = when (intensity) {
    Intensity.GENTLE -> Color(0xFF60A5FA)
    Intensity.NORMAL -> Amber
    Intensity.URGENT -> Color(0xFFEF4444)
}

fun alarmBackground(intensity: Intensity): Color = when (intensity) {
    Intensity.URGENT -> Color(0xFF1A0C0E)
    else -> Ink
}

@Composable
fun AlarmMcpTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Amber,
            onPrimary = Ink,
            background = Ink,
            onBackground = Color.White,
            surface = Panel,
            onSurface = Color.White,
            surfaceVariant = Panel,
            onSurfaceVariant = Muted,
            error = Bad,
        ),
    ) {
        CompositionLocalProvider(LocalContentColor provides Color.White, content = content)
    }
}
