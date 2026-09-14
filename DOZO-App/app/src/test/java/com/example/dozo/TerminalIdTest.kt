package com.example.dozo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TerminalIdTest {

    @Test
    fun uppercasesAndStripsNonAlphanumeric() {
        assertEquals("DX8000SN000123", TerminalId.derive("DX8000-SN-000123"))
    }

    @Test
    fun truncatesToSixteenCharacters() {
        assertEquals("ABCDEF0123456789", TerminalId.derive("abcdef0123456789extra"))
    }

    @Test
    fun padsShortSeedsToEight() {
        assertEquals("ABC00000", TerminalId.derive("abc"))
    }

    @Test
    fun padsEmptySeedToEightZeros() {
        assertEquals("00000000", TerminalId.derive(""))
    }

    @Test
    fun stripsSeparatorsAndSymbols() {
        assertEquals("A1B2C3D4", TerminalId.derive("a_1-b2 c3.d4"))
    }

    @Test
    fun derivedIdMatchesServerFormat() {
        val id = TerminalId.derive("DX8000-SN-000123")
        assertTrue(id.matches(Regex("^[A-Za-z0-9_-]{8,64}$")))
    }
}
