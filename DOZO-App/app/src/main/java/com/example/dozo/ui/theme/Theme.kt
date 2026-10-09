package com.example.dozo.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Dashboard-aligned light scheme.
 *
 * Mapping (DOZO-Dashboard PR #59): bg→background/surface roles,
 * fg→onBackground/onSurface, lime→primary, g2→outline/outlineVariant,
 * g1→secondary/onSurfaceVariant.
 */
internal val LightColorScheme = lightColorScheme(
    primary = Lime,
    onPrimary = Ink,
    primaryContainer = Lime,
    onPrimaryContainer = Ink,
    inversePrimary = Lime,
    secondary = G1,
    onSecondary = Cream,
    secondaryContainer = G2,
    onSecondaryContainer = Ink,
    tertiary = Lime,
    onTertiary = Ink,
    tertiaryContainer = Lime,
    onTertiaryContainer = Ink,
    background = Cream,
    onBackground = Ink,
    surface = LightSurface,
    onSurface = Ink,
    surfaceVariant = G2,
    onSurfaceVariant = G1,
    surfaceTint = Lime,
    surfaceDim = G2,
    surfaceBright = Cream,
    surfaceContainerLowest = Cream,
    surfaceContainerLow = Cream,
    surfaceContainer = LightSurface,
    surfaceContainerHigh = LightSurface,
    surfaceContainerHighest = G2,
    inverseSurface = Ink,
    inverseOnSurface = Cream,
    outline = G2,
    outlineVariant = G2,
    scrim = Ink,
    error = LightError,
    onError = Cream,
    errorContainer = LightError,
    onErrorContainer = Cream,
)

/**
 * Dashboard-aligned dark scheme: bg=ink, fg=cream, line=rgba(225,225,225,.16),
 * surface=rgba(225,225,225,.07).
 */
internal val DarkColorScheme = darkColorScheme(
    primary = Lime,
    onPrimary = Ink,
    primaryContainer = Lime,
    onPrimaryContainer = Ink,
    inversePrimary = Lime,
    secondary = G1,
    onSecondary = Cream,
    secondaryContainer = DarkLine,
    onSecondaryContainer = Cream,
    tertiary = Lime,
    onTertiary = Ink,
    tertiaryContainer = Lime,
    onTertiaryContainer = Ink,
    background = Ink,
    onBackground = Cream,
    surface = DarkSurface,
    onSurface = Cream,
    surfaceVariant = DarkLine,
    onSurfaceVariant = G1,
    surfaceTint = Lime,
    surfaceDim = Ink,
    surfaceBright = DarkLine,
    surfaceContainerLowest = Ink,
    surfaceContainerLow = Ink,
    surfaceContainer = DarkSurface,
    surfaceContainerHigh = DarkSurface,
    surfaceContainerHighest = DarkLine,
    inverseSurface = Cream,
    inverseOnSurface = Ink,
    outline = DarkLine,
    outlineVariant = DarkLine,
    scrim = Ink,
    error = DarkError,
    onError = Ink,
    errorContainer = DarkError,
    onErrorContainer = Ink,
)

/**
 * DOZO theme. Brand colors always apply — dynamic (Material You) color is
 * intentionally not used so the cream/ink palette is consistent on every
 * terminal. [accent] swaps the lime brand role for a preset pastel at runtime
 * (Settings → System); the default keeps the dashboard-aligned lime.
 */
@Composable
fun DozoTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    accent: Color = Lime,
    content: @Composable () -> Unit
) {
    val base = if (darkTheme) DarkColorScheme else LightColorScheme
    val colorScheme = base.copy(
        primary = accent,
        primaryContainer = accent,
        inversePrimary = accent,
        tertiary = accent,
        tertiaryContainer = accent,
        surfaceTint = accent,
    )
    ProvideDozoMotion {
        CompositionLocalProvider(LocalDozoAccent provides accent) {
            MaterialTheme(
                colorScheme = colorScheme,
                typography = Typography,
                shapes = DozoShapes,
                content = content
            )
        }
    }
}

/** Active preset accent, defaulting to the brand [Lime] outside a [DozoTheme]. */
val LocalDozoAccent = compositionLocalOf { Lime }
