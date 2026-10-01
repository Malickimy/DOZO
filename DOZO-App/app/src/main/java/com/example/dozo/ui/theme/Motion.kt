package com.example.dozo.ui.theme

import android.provider.Settings
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Shared motion spec for the dashboard-aligned design language (PR #59).
 *
 * Durations are milliseconds. A system animator scale of 0 ("remove animations")
 * collapses every duration to zero — the Compose equivalent of
 * `prefers-reduced-motion`.
 */
data class DozoMotionSpec(
    val growMillis: Int = GROW_MILLIS,
    val blinkMillis: Int = BLINK_MILLIS,
    val fadeMillis: Int = FADE_MILLIS,
    val slideMillis: Int = SLIDE_MILLIS,
) {
    val isReducedMotion: Boolean
        get() = growMillis == 0 && blinkMillis == 0 && fadeMillis == 0 && slideMillis == 0

    companion object {
        const val GROW_MILLIS = 600
        const val BLINK_MILLIS = 1400
        const val FADE_MILLIS = 200
        const val SLIDE_MILLIS = 300

        /** Easing shared by every animated element. */
        val Easing: Easing = CubicBezierEasing(0.2f, 0.8f, 0.2f, 1f)

        /** Horizontal enter offset for screen/overlay transitions. */
        val SlideOffset: Dp = 24.dp

        val Reduced = DozoMotionSpec(0, 0, 0, 0)
    }
}

/** Pure mapping so the reduced-motion gate is unit-testable without Android. */
fun motionSpecFor(animatorDurationScale: Float): DozoMotionSpec =
    if (animatorDurationScale == 0f) DozoMotionSpec.Reduced else DozoMotionSpec()

val LocalDozoMotion = compositionLocalOf { DozoMotionSpec() }

@Composable
fun ProvideDozoMotion(content: @Composable () -> Unit) {
    val context = LocalContext.current
    val scale = Settings.Global.getFloat(
        context.contentResolver,
        Settings.Global.ANIMATOR_DURATION_SCALE,
        1f
    )
    CompositionLocalProvider(
        LocalDozoMotion provides motionSpecFor(scale),
        content = content
    )
}

@Composable
@ReadOnlyComposable
fun dozoMotion(): DozoMotionSpec = LocalDozoMotion.current

/**
 * Fade + 24dp slide-in for a screen or overlay. [key] resets the transition so a
 * change (e.g. navigating between screens) replays the enter animation.
 */
@Composable
fun DozoScreenEnter(
    key: Any?,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    val motion = dozoMotion()
    val offsetPx = with(LocalDensity.current) { DozoMotionSpec.SlideOffset.roundToPx() }
    var shown by remember(key) { mutableStateOf(false) }
    LaunchedEffect(key) { shown = true }
    AnimatedVisibility(
        visible = shown,
        modifier = modifier,
        enter = fadeIn(animationSpec = tween(motion.fadeMillis)) +
            slideInHorizontally(animationSpec = tween(motion.slideMillis)) { offsetPx },
        exit = ExitTransition.None,
    ) {
        content()
    }
}
