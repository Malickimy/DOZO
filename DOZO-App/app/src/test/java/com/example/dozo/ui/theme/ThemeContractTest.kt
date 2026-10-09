package com.example.dozo.ui.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Contract guard for the dashboard-aligned theme: parts of the PR #59 token set
 * that [ThemeTokensTest] does not exercise — the full light/dark scheme role
 * mapping, the alpha-composited tokens, the easing curve, the hard-shadow
 * offsets and the Unbounded/Huninn type-scale wiring.
 *
 * Grounded in DOZO-Dashboard `feat/dashboard-redesign` (PR #59),
 * `src/index.css` / `index.html`.
 */
class ThemeContractTest {

    // ---- alpha-composited tokens (dashboard rgba values) ----

    @Test
    fun alphaCompositedTokensMatchDashboardRgba() {
        assertEquals(0xBD141414.toInt(), InkMuted.toArgb()) // rgba(20,20,20,.74)
        assertEquals(0xBDFFFCEA.toInt(), CreamMuted.toArgb()) // rgba(255,252,234,.74)
        assertEquals(0x8CE1E1E1.toInt(), LightSurface.toArgb()) // rgba(225,225,225,.55)
        assertEquals(0x29E1E1E1.toInt(), DarkLine.toArgb()) // rgba(225,225,225,.16)
        assertEquals(0x12E1E1E1.toInt(), DarkSurface.toArgb()) // rgba(225,225,225,.07)
    }

    // ---- full scheme role mapping ----

    @Test
    fun lightSchemeMapsEveryBrandRole() {
        assertEquals(Cream.toArgb(), LightColorScheme.background.toArgb())
        assertEquals(Ink.toArgb(), LightColorScheme.onBackground.toArgb())
        assertEquals(Lime.toArgb(), LightColorScheme.primary.toArgb())
        assertEquals(Ink.toArgb(), LightColorScheme.onPrimary.toArgb())
        assertEquals(G1.toArgb(), LightColorScheme.secondary.toArgb())
        assertEquals(G2.toArgb(), LightColorScheme.surfaceVariant.toArgb())
        assertEquals(G1.toArgb(), LightColorScheme.onSurfaceVariant.toArgb())
        assertEquals(G2.toArgb(), LightColorScheme.outlineVariant.toArgb())
        assertEquals(Lime.toArgb(), LightColorScheme.surfaceTint.toArgb())
        assertEquals(Ink.toArgb(), LightColorScheme.inverseSurface.toArgb())
        assertEquals(Cream.toArgb(), LightColorScheme.inverseOnSurface.toArgb())
    }

    @Test
    fun darkSchemeMapsEveryBrandRole() {
        assertEquals(Ink.toArgb(), DarkColorScheme.background.toArgb())
        assertEquals(Cream.toArgb(), DarkColorScheme.onBackground.toArgb())
        assertEquals(Lime.toArgb(), DarkColorScheme.primary.toArgb())
        assertEquals(Ink.toArgb(), DarkColorScheme.onPrimary.toArgb())
        assertEquals(G1.toArgb(), DarkColorScheme.secondary.toArgb())
        assertEquals(DarkLine.toArgb(), DarkColorScheme.surfaceVariant.toArgb())
        assertEquals(G1.toArgb(), DarkColorScheme.onSurfaceVariant.toArgb())
        assertEquals(DarkLine.toArgb(), DarkColorScheme.outlineVariant.toArgb())
        assertEquals(Lime.toArgb(), DarkColorScheme.surfaceTint.toArgb())
        assertEquals(Cream.toArgb(), DarkColorScheme.inverseSurface.toArgb())
        assertEquals(Ink.toArgb(), DarkColorScheme.inverseOnSurface.toArgb())
    }

    // ---- motion easing ----

    @Test
    fun easingIsTheDashboardCubicBezier() {
        val easing = DozoMotionSpec.Easing
        assertTrue("expected CubicBezierEasing", easing is CubicBezierEasing)
        val bezier = easing as CubicBezierEasing
        assertEquals(0.2f, privateFloat(bezier, "a"), 0f)
        assertEquals(0.8f, privateFloat(bezier, "b"), 0f)
        assertEquals(0.2f, privateFloat(bezier, "c"), 0f)
        assertEquals(1f, privateFloat(bezier, "d"), 0f)
        // Endpoints pin the curve to the unit square, like the CSS timing function.
        assertEquals(0f, easing.transform(0f), 1e-4f)
        assertEquals(1f, easing.transform(1f), 1e-4f)
    }

    @Test
    fun defaultMotionIsActiveAndNonReduced() {
        val active = motionSpecFor(0.5f)
        assertFalse(active.isReducedMotion)
        assertEquals(DozoMotionSpec(), active)
        assertEquals(DozoMotionSpec(0, 0, 0, 0), DozoMotionSpec.Reduced)
    }

    // ---- hard offset shadow ----

    @Test
    fun hardShadowOffsetsMatchDashboardVariants() {
        assertEquals(8.dp, ShadowOffsetLarge)
        assertEquals(6.dp, ShadowOffsetMedium)
        assertEquals(4.dp, ShadowOffsetSmall)
    }

    @Test
    fun hardShadowBuildsWithAnExplicitColor() {
        // `limeShadow*` now read LocalDozoAccent and are @Composable; the base
        // builder stays plain, so it can still be asserted without Android graphics.
        assertNotNull(Modifier.hardShadow(Lime, ShadowOffsetSmall, ShadowOffsetSmall))
    }

    // ---- shapes ----

    @Test
    fun radiusAndPillMatchDashboard() {
        assertEquals(15.dp, DozoCornerRadius)
        assertEquals(RoundedCornerShape(15.dp), DozoShapes.medium)
        assertEquals(RoundedCornerShape(15.dp), DozoShapes.large)
        assertEquals(RoundedCornerShape(percent = 50), PillShape)
    }

    // ---- typography wiring ----

    @Test
    fun displayHeadlineAndTitleUseUnbounded() {
        val t = Typography
        listOf(
            t.displayLarge, t.displayMedium, t.displaySmall,
            t.headlineLarge, t.headlineMedium, t.headlineSmall,
            t.titleLarge, t.titleMedium, t.titleSmall,
        ).forEach { assertSame("expected Unbounded display family", DisplayFontFamily, it.fontFamily) }
    }

    @Test
    fun bodyAndLabelUseHuninn() {
        val t = Typography
        listOf(
            t.bodyLarge, t.bodyMedium, t.bodySmall,
            t.labelLarge, t.labelMedium, t.labelSmall,
        ).forEach { assertSame("expected Huninn text family", TextFontFamily, it.fontFamily) }
    }

    @Test
    fun familiesBundleTheSpecifiedWeights() {
        assertEquals(setOf(FontWeight.Medium, FontWeight.Bold), weightsOf(DisplayFontFamily))
        assertEquals(setOf(FontWeight.Normal), weightsOf(TextFontFamily))
    }

    @Test
    fun headingTrackingIsNegativeTwoHundredthsEm() {
        val t = Typography
        val expected = (-0.02).em
        listOf(
            t.displayLarge, t.displayMedium, t.displaySmall,
            t.headlineLarge, t.headlineMedium, t.headlineSmall,
            t.titleLarge,
        ).forEach { assertEquals("heading tracking", expected, it.letterSpacing) }
    }

    private fun privateFloat(target: Any, name: String): Float {
        val field = target.javaClass.getDeclaredField(name)
        field.isAccessible = true
        return field.getFloat(target)
    }

    /** Reads the bundled fonts off the FontListFontFamily behind a FontFamily. */
    @Suppress("UNCHECKED_CAST")
    private fun weightsOf(family: FontFamily): Set<FontWeight> {
        val field = family.javaClass.getDeclaredField("fonts")
        field.isAccessible = true
        return (field.get(family) as List<Font>).map { it.weight }.toSet()
    }
}
