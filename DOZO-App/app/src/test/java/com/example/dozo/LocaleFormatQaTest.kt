package com.example.dozo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale

/**
 * QA edge-case coverage for the Sprint 2 Part B locale/currency scaffold.
 * Complements LanguageTest / MoneyFormatTest with the cases the author did not cover:
 * blank/whitespace/case variants, the DEFAULT constant, and negative/large/multi-locale money.
 */
class LocaleFormatQaTest {

    @Test
    fun defaultIsSystemAndSupported() {
        assertEquals(Language.SYSTEM, Language.DEFAULT)
        assertTrue(Language.isSupported(Language.DEFAULT))
    }

    @Test
    fun blankAndWhitespaceAreRejected() {
        // A stored blank/whitespace value must not be treated as a language.
        assertFalse(Language.isSupported(""))
        assertFalse(Language.isSupported(" "))
        assertFalse(Language.isSupported("  pl"))
        assertNull(Language.localeTag(""))
        assertNull(Language.localeTag(" "))
        assertNull(Language.localeTag("  pl"))
    }

    @Test
    fun preferenceIsCaseSensitive() {
        // Only the documented lowercase values are valid; uppercase normalises to default.
        assertFalse(Language.isSupported("PL"))
        assertFalse(Language.isSupported("EN"))
        assertFalse(Language.isSupported("SYSTEM"))
        assertNull(Language.localeTag("PL"))
    }

    @Test
    fun formatPlnUsesPlnAcrossLocales() {
        for (tag in listOf("pl-PL", "en-US", "de-DE")) {
            val formatted = MoneyFormat.formatPln(1999, Locale.forLanguageTag(tag))
            assertTrue(
                "[$tag] expected 19,99 or 19.99 in: $formatted",
                formatted.contains("19,99") || formatted.contains("19.99")
            )
            assertTrue(
                "[$tag] expected PLN or zł in: $formatted",
                formatted.contains("PLN") || formatted.contains("zł")
            )
        }
    }

    @Test
    fun negativeAmountsKeepSignAndTwoDecimals() {
        val pl = MoneyFormat.formatPln(-1999, Locale.forLanguageTag("pl-PL"))
        assertTrue("expected -19,99 in: $pl", pl.contains("19,99"))
        assertTrue("expected a leading minus in: $pl", pl.contains("-"))
    }

    @Test
    fun largeAmountsDoNotTruncate() {
        val cents = 123_456_789 // 1 234 567,89 PLN, well within Int range
        val pl = MoneyFormat.formatPln(cents, Locale.forLanguageTag("pl-PL"))
        assertTrue("expected 567,89 in: $pl", pl.contains("567,89"))
        val us = MoneyFormat.formatPln(cents, Locale.US)
        assertTrue("expected 1,234,567.89 in: $us", us.contains("1,234,567.89") || us.contains("1234567.89"))
    }

    @Test
    fun zeroIsAlwaysTwoDecimals() {
        assertTrue(MoneyFormat.formatPln(0, Locale.forLanguageTag("pl-PL")).contains("0,00"))
        assertTrue(MoneyFormat.formatPln(0, Locale.US).contains("0.00"))
    }
}
