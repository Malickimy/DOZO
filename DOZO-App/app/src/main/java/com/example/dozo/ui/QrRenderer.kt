package com.example.dozo.ui

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
        // withMargin() both offsets the code and grows the canvas by 2 * margin,
        // so the canvas must be the code-only size. Passing a canvas that already
        // includes the quiet zone doubles the right/bottom margin and pushes the
        // code off-center.
        val qrCanvasSize = squareSize * modules
        val png = QRCode.ofSquares()
            .withSize(squareSize)
            .withCanvasSize(qrCanvasSize)
            .withMargin(margin)
            .build(url)
            .render()
            .getBytes()
        return BitmapFactory.decodeByteArray(png, 0, png.size).asImageBitmap()
    }
}
