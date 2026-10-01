package com.example.dozo.ui.theme

import androidx.compose.foundation.shape.CornerSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Plain JVM guard for the dashboard-aligned theme: brand colors resolve to the
 * PR #59 tokens in both schemes, the shapes use the 15dp base radius, and the
 * reduced-motion gate zeroes every duration.
 */
class ThemeTokensTest {

    @Test
    fun brandTokensMatchDashboardPalette() {
        assertEquals(0xFFFFFCEA.toInt(), Cream.toArgb())
        assertEquals(0xFF141414.toInt(), Ink.toArgb())
        assertEquals(0xFFB7FF8D.toInt(), Lime.toArgb())
        assertEquals(0xFFE1E1E1.toInt(), G2.toArgb())
        assertEquals(0xFF888888.toInt(), G1.toArgb())
    }

    @Test
    fun lightSchemeMapsCreamInkAndLime() {
        assertEquals(Cream.toArgb(), LightColorScheme.background.toArgb())
        assertEquals(Ink.toArgb(), LightColorScheme.onBackground.toArgb())
        assertEquals(Lime.toArgb(), LightColorScheme.primary.toArgb())
        assertEquals(Ink.toArgb(), LightColorScheme.onPrimary.toArgb())
        assertEquals(G2.toArgb(), LightColorScheme.outline.toArgb())
        assertEquals(G1.toArgb(), LightColorScheme.onSurfaceVariant.toArgb())
        assertEquals(LightSurface.toArgb(), LightColorScheme.surface.toArgb())
    }

    @Test
    fun darkSchemeMapsInkCreamAndLime() {
        assertEquals(Ink.toArgb(), DarkColorScheme.background.toArgb())
        assertEquals(Cream.toArgb(), DarkColorScheme.onBackground.toArgb())
        assertEquals(Lime.toArgb(), DarkColorScheme.primary.toArgb())
        assertEquals(DarkLine.toArgb(), DarkColorScheme.outline.toArgb())
        assertEquals(DarkSurface.toArgb(), DarkColorScheme.surface.toArgb())
    }

    @Test
    fun shapesUseDashboardRadius() {
        assertEquals(
            CornerSize(DozoCornerRadius),
            (DozoShapes.medium as RoundedCornerShape).topStart
        )
        assertEquals(
            CornerSize(DozoCornerRadius),
            (DozoShapes.large as RoundedCornerShape).topStart
        )
        assertEquals(RoundedCornerShape(percent = 50), PillShape)
    }

    @Test
    fun motionSpecMatchesDashboardDurations() {
        val motion = motionSpecFor(1f)
        assertEquals(600, motion.growMillis)
        assertEquals(1400, motion.blinkMillis)
        assertEquals(200, motion.fadeMillis)
        assertEquals(300, motion.slideMillis)
        assertEquals(24.dp, DozoMotionSpec.SlideOffset)
    }

    @Test
    fun reducedMotionGateZeroesEveryDuration() {
        val reduced = motionSpecFor(0f)
        assertTrue(reduced.isReducedMotion)
        assertEquals(0, reduced.growMillis)
        assertEquals(0, reduced.blinkMillis)
        assertEquals(0, reduced.fadeMillis)
        assertEquals(0, reduced.slideMillis)
    }

    @Test
    fun titleTrackingMatchesDashboardHeadings() {
        // Dashboard headings/card titles use -0.02em (`h1..h3`, `.mini__title`,
        // `.auth__kicker`); there is no -0.01em title role in PR #59.
        val expected = (-0.02).em
        assertEquals(expected, Typography.titleLarge.letterSpacing)
        assertEquals(expected, Typography.titleMedium.letterSpacing)
        assertEquals(expected, Typography.titleSmall.letterSpacing)
    }

    @Test
    fun focusOutlineMatchesDashboardFocusVisible() {
        // Dashboard `:focus-visible`: `outline: 3px solid var(--fg); outline-offset: 3px`.
        assertEquals(3.dp, FocusOutlineWidth)
        assertEquals(3.dp, FocusOutlineOffset)
    }
}
