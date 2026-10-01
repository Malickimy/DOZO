package com.example.dozo.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.DrawStyle
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Hard (non-blurred) offset shadow — the lime blocks behind elements in the
 * dashboard. Compose's `Modifier.shadow` cannot offset, so the shape is drawn
 * behind the content instead. Leave padding around the element so the offset
 * does not get clipped by its parent.
 */
fun Modifier.hardShadow(
    color: Color,
    offsetX: Dp,
    offsetY: Dp,
    shape: Shape = RoundedCornerShape(DozoCornerRadius),
): Modifier = drawBehind {
    if (offsetX == 0.dp && offsetY == 0.dp) return@drawBehind
    val outline = shape.createOutline(size, layoutDirection, this)
    translate(offsetX.toPx(), offsetY.toPx()) {
        drawOutlineShape(outline, color)
    }
}

/** Dashboard shadow variants: 8 / 6 / 4 dp, all brand lime. */
val ShadowOffsetLarge = 8.dp
val ShadowOffsetMedium = 6.dp
val ShadowOffsetSmall = 4.dp

fun Modifier.limeShadowLarge(
    shape: Shape = RoundedCornerShape(DozoCornerRadius),
): Modifier = hardShadow(Lime, ShadowOffsetLarge, ShadowOffsetLarge, shape)

fun Modifier.limeShadowMedium(
    shape: Shape = RoundedCornerShape(DozoCornerRadius),
): Modifier = hardShadow(Lime, ShadowOffsetMedium, ShadowOffsetMedium, shape)

fun Modifier.limeShadowSmall(
    shape: Shape = RoundedCornerShape(DozoCornerRadius),
): Modifier = hardShadow(Lime, ShadowOffsetSmall, ShadowOffsetSmall, shape)

/**
 * Focus-visible outline: a 3dp solid border drawn 3dp outside the element.
 * Mirrors the dashboard's `:focus-visible` treatment when [focused] is true.
 */
fun Modifier.focusOutline(
    focused: Boolean,
    color: Color,
    shape: Shape = RoundedCornerShape(DozoCornerRadius),
    width: Dp = 3.dp,
    offset: Dp = 3.dp,
): Modifier = if (!focused) {
    this
} else {
    drawWithContent {
        drawContent()
        val delta = offset.toPx()
        val outline = shape.createOutline(
            Size(size.width + delta * 2, size.height + delta * 2),
            layoutDirection,
            this
        )
        translate(-delta, -delta) {
            drawOutlineShape(outline, color, Stroke(width.toPx()))
        }
    }
}

/**
 * Draws an [Outline] without relying on the `drawOutline` extension (whose
 * availability differs across Compose versions). Our shapes are rectangular or
 * rounded, which covers the theme's 15dp / pill radii.
 */
private fun DrawScope.drawOutlineShape(
    outline: Outline,
    color: Color,
    style: DrawStyle = Fill,
) {
    when (outline) {
        is Outline.Rectangle -> drawRect(
            color = color,
            topLeft = outline.rect.topLeft,
            size = outline.rect.size,
            style = style,
        )
        is Outline.Rounded -> {
            val round = outline.roundRect
            drawRoundRect(
                color = color,
                topLeft = Offset(round.left, round.top),
                size = Size(round.width, round.height),
                cornerRadius = round.topLeftCornerRadius,
                style = style,
            )
        }
        is Outline.Generic -> drawPath(
            path = outline.path,
            color = color,
            style = style,
        )
    }
}
