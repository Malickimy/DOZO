package com.example.papier.ui

import android.graphics.BitmapFactory
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import qrcode.QRCode

object QrRenderer {
    private const val DEFAULT_SIZE_PX = 640
    private const val QUIET_ZONE_MODULES = 4

    fun render(url: String, sizePx: Int = DEFAULT_SIZE_PX): ImageBitmap {
        val probe = QRCode.ofSquares().build(url)
        val modules = (probe.computedSize / probe.squareSize).coerceAtLeast(1)
        val squareSize = (sizePx / (modules + 2 * QUIET_ZONE_MODULES)).coerceAtLeast(1)
        val margin = QUIET_ZONE_MODULES * squareSize
        val canvasSize = squareSize * (modules + 2 * QUIET_ZONE_MODULES)
        val png = QRCode.ofSquares()
            .withSize(squareSize)
            .withCanvasSize(canvasSize)
            .withMargin(margin)
            .build(url)
            .render()
            .getBytes()
        return BitmapFactory.decodeByteArray(png, 0, png.size).asImageBitmap()
    }
}
