package com.example.dozo

import androidx.compose.ui.graphics.toPixelMap
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.dozo.ui.QrRenderer
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Pins the QR quiet-zone geometry. The QR library's `withMargin()` already grows
 * the canvas by 2 * margin, so passing a canvas that includes the quiet zone
 * doubled the right/bottom margin and pushed the code off-center (PR #80
 * regression). These assert the dark modules sit with equal margins.
 */
@RunWith(AndroidJUnit4::class)
class QrRendererQaTest {

    @Test
    fun quietZoneIsSymmetricAroundTheCode() {
        val bitmap = QrRenderer.render("https://example.com/r/TXN-1")
        val pixels = bitmap.toPixelMap()

        var minX = Int.MAX_VALUE
        var maxX = -1
        var minY = Int.MAX_VALUE
        var maxY = -1
        for (y in 0 until pixels.height) {
            for (x in 0 until pixels.width) {
                val color = pixels[x, y]
                val dark = color.alpha > 0.5f && color.red < 0.5f
                if (dark) {
                    minX = min(minX, x)
                    maxX = max(maxX, x)
                    minY = min(minY, y)
                    maxY = max(maxY, y)
                }
            }
        }

        assertTrue("QR modules not found", maxX >= 0 && maxY >= 0)

        val left = minX
        val right = pixels.width - 1 - maxX
        val top = minY
        val bottom = pixels.height - 1 - maxY

        // One module is roughly width / (modules + 8); 5% is under two modules.
        val tolerance = (pixels.width * 0.05f).toInt().coerceAtLeast(4)
        assertTrue(
            "Left margin $left and right margin $right differ by more than $tolerance",
            abs(left - right) <= tolerance
        )
        assertTrue(
            "Top margin $top and bottom margin $bottom differ by more than $tolerance",
            abs(top - bottom) <= tolerance
        )
        assertTrue("QR should keep a quiet zone on the left, was $left", left > 0)
        assertTrue("QR should keep a quiet zone on the top, was $top", top > 0)
    }
}
