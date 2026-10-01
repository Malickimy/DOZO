package com.example.dozo.ui

import androidx.compose.animation.animateColor
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.dozo.ui.theme.DozoMotionSpec
import com.example.dozo.ui.theme.PillShape
import com.example.dozo.ui.theme.dozoMotion
import com.example.dozo.ui.theme.limeShadowSmall

/**
 * Blinking live/status indicator: background line ↔ lime, 1.4s infinite.
 * Honours the reduced-motion gate by holding the lime color.
 */
@Composable
fun BlinkingStatusIndicator(
    modifier: Modifier = Modifier,
    width: Dp = 72.dp,
    height: Dp = 6.dp,
) {
    val motion = dozoMotion()
    val color = if (motion.isReducedMotion) {
        MaterialTheme.colorScheme.primary
    } else {
        val transition = rememberInfiniteTransition(label = "dozo-blink")
        val animated by transition.animateColor(
            initialValue = MaterialTheme.colorScheme.outline,
            targetValue = MaterialTheme.colorScheme.primary,
            animationSpec = infiniteRepeatable(
                animation = tween(motion.blinkMillis, easing = DozoMotionSpec.Easing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "dozo-blink-color",
        )
        animated
    }
    Box(
        modifier = modifier
            .size(width = width, height = height)
            .clip(PillShape)
            .background(color)
    )
}

/**
 * Countdown/progress bar using the shared motion spec: the lime fill grows
 * scale-x 0→1 over 0.6s and tracks the current value.
 */
@Composable
fun DozoProgressBar(
    progress: Float,
    modifier: Modifier = Modifier,
) {
    val motion = dozoMotion()
    val target = progress.coerceIn(0f, 1f)
    var appeared by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { appeared = true }

    val growScale by animateFloatAsState(
        targetValue = if (appeared) 1f else 0f,
        animationSpec = tween(motion.growMillis, easing = DozoMotionSpec.Easing),
        label = "dozo-grow",
    )
    val animatedProgress by animateFloatAsState(
        targetValue = target,
        animationSpec = tween(motion.growMillis, easing = DozoMotionSpec.Easing),
        label = "dozo-progress",
    )

    Box(
        modifier = modifier
            .height(8.dp)
            .clip(PillShape)
            .background(MaterialTheme.colorScheme.outline)
    ) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .fillMaxWidth(animatedProgress)
                .graphicsLayer {
                    scaleX = growScale
                    transformOrigin = TransformOrigin(0f, 0.5f)
                }
                .clip(PillShape)
                .background(MaterialTheme.colorScheme.primary)
        )
    }
}

/** Small ink brand block with the hard lime offset shadow. */
@Composable
fun BrandMark(
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
) {
    Box(
        modifier = modifier
            .limeShadowSmall(RoundedCornerShape(12.dp))
            .size(size)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.onBackground)
    )
}
