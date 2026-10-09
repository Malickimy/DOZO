package com.example.dozo.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/** Dashboard base radius (15dp). */
val DozoCornerRadius = 15.dp

val DozoShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(DozoCornerRadius),
    large = RoundedCornerShape(DozoCornerRadius),
    extraLarge = RoundedCornerShape(24.dp),
)

/** Fully round "pill" shape (dashboard radius 999). */
val PillShape = RoundedCornerShape(percent = 50)
