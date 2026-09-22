package com.example.dozo

import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale

class MoneyFormatTest {

    @Test
    fun formatsPlnUsingPolishNumberFormat() {
        val formatted = MoneyFormat.formatPln(1999, Locale.forLanguageTag("pl-PL"))
        assertTrue("expected 19,99 in: $formatted", formatted.contains("19,99"))
        assertTrue("expected zł in: $formatted", formatted.contains("zł"))
    }

    @Test
    fun formatsWholeAmounts() {
        val formatted = MoneyFormat.formatPln(500, Locale.forLanguageTag("pl-PL"))
        assertTrue("expected 5,00 in: $formatted", formatted.contains("5,00"))
    }

    @Test
    fun formatsZero() {
        val formatted = MoneyFormat.formatPln(0, Locale.forLanguageTag("pl-PL"))
        assertTrue("expected 0,00 in: $formatted", formatted.contains("0,00"))
    }

    @Test
    fun alwaysUsesPlnRegardlessOfLocale() {
        val formatted = MoneyFormat.formatPln(1999, Locale.US)
        assertTrue("expected 19.99 in: $formatted", formatted.contains("19.99"))
        assertTrue("expected PLN in: $formatted", formatted.contains("PLN"))
    }
}
