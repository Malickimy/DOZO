package com.example.dozo.mockpay

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

// DOZO brand tokens (mirrors DOZO-Dashboard PR #59). The standalone :mockpay
// module cannot depend on :app, so this is a compact local copy of the palette.
private val Cream = Color(0xFFFFFCEA)
private val Ink = Color(0xFF141414)
private val Lime = Color(0xFFB7FF8D)
private val G2 = Color(0xFFE1E1E1)
private val G1 = Color(0xFF888888)
private val LightSurface = Color(0x8CE1E1E1)

private val DisplayFontFamily = FontFamily(
    Font(R.font.unbounded_medium, FontWeight.Medium),
    Font(R.font.unbounded_bold, FontWeight.Bold),
)

private val TextFontFamily = FontFamily(Font(R.font.huninn_regular, FontWeight.Normal))

private val DozoShapes = Shapes(
    medium = RoundedCornerShape(15.dp),
    large = RoundedCornerShape(15.dp),
)

private val DozoTypography = Typography(
    headlineMedium = TextStyle(
        fontFamily = DisplayFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,
        lineHeight = 36.sp,
        letterSpacing = (-0.02).em,
    ),
    titleMedium = TextStyle(
        fontFamily = DisplayFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        letterSpacing = (-0.02).em,
    ),
    bodyLarge = TextStyle(
        fontFamily = TextFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.5.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = TextFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.25.sp,
    ),
)

private val LightColors = lightColorScheme(
    primary = Lime,
    onPrimary = Ink,
    secondary = G1,
    onSecondary = Cream,
    background = Cream,
    onBackground = Ink,
    surface = LightSurface,
    onSurface = Ink,
    surfaceVariant = G2,
    onSurfaceVariant = G1,
    outline = G2,
    outlineVariant = G2,
)

private val DarkColors = darkColorScheme(
    primary = Lime,
    onPrimary = Ink,
    secondary = G1,
    onSecondary = Cream,
    background = Ink,
    onBackground = Cream,
    surface = Color(0x12E1E1E1),
    onSurface = Cream,
    surfaceVariant = Color(0x29E1E1E1),
    onSurfaceVariant = G1,
    outline = Color(0x29E1E1E1),
    outlineVariant = Color(0x29E1E1E1),
)

@Composable
fun DozoTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = DozoTypography,
        shapes = DozoShapes,
        content = content,
    )
}
