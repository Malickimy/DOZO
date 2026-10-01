package com.example.dozo.ui.theme

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Verifies the bundled Google Fonts subsets actually carry the Latin + Polish
 * diacritics the UI needs — parsing the `cmap` table directly, so no Android or
 * AWT runtime is involved.
 */
class FontSubsetTest {

    private val fontDir: File = findFontDir()

    private val required = "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ" +
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" +
        " .,-:;!?%()[]…·"

    private fun findFontDir(): File {
        var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        repeat(5) {
            val candidates = listOf(
                File(dir, "src/main/res/font"),
                File(dir, "app/src/main/res/font")
            )
            candidates.firstOrNull { File(it, "huninn_regular.ttf").isFile }?.let { return it }
            dir = dir?.parentFile
        }
        throw AssertionError(
            "Could not locate src/main/res/font from ${System.getProperty("user.dir")}"
        )
    }

    @Test
    fun huninnSubsetCoversLatinAndPolishDiacritics() {
        assertCovers("huninn_regular.ttf")
    }

    @Test
    fun unboundedSubsetsCoverLatinAndPolishDiacritics() {
        assertCovers("unbounded_medium.ttf")
        assertCovers("unbounded_bold.ttf")
    }

    private fun assertCovers(fileName: String) {
        val bytes = File(fontDir, fileName).readBytes()
        assertTrue("$fileName has no cmap", hasCmap(bytes))
        val missing = required.map { it.code }
            .filter { !hasGlyph(bytes, it) }
            .map { "U+%04X('%c')".format(it, it) }
        assertTrue("$fileName is missing glyphs: ${missing.joinToString()}", missing.isEmpty())
    }

    // --- Minimal TrueType cmap reader -------------------------------------

    private fun hasCmap(bytes: ByteArray): Boolean {
        val buf = ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN)
        val numTables = u16(buf, 4)
        for (i in 0 until numTables) {
            val rec = 12 + i * 16
            if (tag(bytes, rec) == "cmap") return true
        }
        return false
    }

    private fun hasGlyph(bytes: ByteArray, codePoint: Int): Boolean {
        val buf = ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN)
        var cmapOffset = -1
        for (i in 0 until u16(buf, 4)) {
            val rec = 12 + i * 16
            if (tag(bytes, rec) == "cmap") {
                cmapOffset = u32(buf, rec + 8)
                break
            }
        }
        if (cmapOffset < 0) return false

        val numSubtables = u16(buf, cmapOffset + 2)
        var bestSubtable = -1
        var bestScore = -1
        for (i in 0 until numSubtables) {
            val rec = cmapOffset + 4 + i * 8
            val platform = u16(buf, rec)
            val encoding = u16(buf, rec + 2)
            val sub = cmapOffset + u32(buf, rec + 4)
            val format = u16(buf, sub)
            if (format != 4 && format != 12) continue
            val score = when {
                platform == 3 && encoding == 10 -> 3
                platform == 3 && encoding == 1 -> 2
                platform == 0 -> 1
                else -> 0
            }
            if (score > bestScore) {
                bestScore = score
                bestSubtable = sub
            }
        }
        if (bestSubtable < 0) return false

        return when (u16(buf, bestSubtable)) {
            4 -> format4(buf, bestSubtable, codePoint)
            12 -> format12(buf, bestSubtable, codePoint)
            else -> false
        }
    }

    private fun format4(buf: ByteBuffer, off: Int, codePoint: Int): Boolean {
        val segCount = u16(buf, off + 6) / 2
        val endCodes = off + 14
        val startCodes = endCodes + segCount * 2 + 2
        val idDeltas = startCodes + segCount * 2
        val idRangeOffsets = idDeltas + segCount * 2
        for (i in 0 until segCount) {
            val end = u16(buf, endCodes + i * 2)
            if (codePoint > end) continue
            val start = u16(buf, startCodes + i * 2)
            if (codePoint < start) return false
            val idDelta = u16(buf, idDeltas + i * 2)
            val rangeOffset = u16(buf, idRangeOffsets + i * 2)
            if (rangeOffset == 0) return ((codePoint + idDelta) and 0xFFFF) != 0
            val glyphAddr = idRangeOffsets + i * 2 + rangeOffset + (codePoint - start) * 2
            var glyph = u16(buf, glyphAddr)
            if (glyph != 0) glyph = (glyph + idDelta) and 0xFFFF
            return glyph != 0
        }
        return false
    }

    private fun format12(buf: ByteBuffer, off: Int, codePoint: Int): Boolean {
        val nGroups = u32(buf, off + 12)
        val groups = off + 16
        for (i in 0 until nGroups) {
            val g = groups + i * 12
            if (codePoint >= u32(buf, g) && codePoint <= u32(buf, g + 4)) return true
        }
        return false
    }

    private fun u16(buf: ByteBuffer, offset: Int): Int = buf.getShort(offset).toInt() and 0xFFFF

    private fun u32(buf: ByteBuffer, offset: Int): Int = buf.getInt(offset)

    private fun tag(bytes: ByteArray, offset: Int): String =
        String(bytes, offset, 4, Charsets.US_ASCII)
}
