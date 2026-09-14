package com.example.dozo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PinTest {

    @Test
    fun acceptsMatchingPin() {
        assertTrue(Pin.isValid("0000", "0000"))
    }

    @Test
    fun rejectsMismatchedPin() {
        assertFalse(Pin.isValid("1234", "0000"))
    }

    @Test
    fun rejectsDifferentLengthPin() {
        assertFalse(Pin.isValid("12345", "0000"))
    }

    @Test
    fun appendBuildsPinInOrder() {
        var pin = ""
        listOf('1', '2', '3', '4').forEach { pin = Pin.append(pin, it) }
        assertEquals("1234", pin)
    }

    @Test
    fun appendStopsAtMaximumLength() {
        assertEquals("1234", Pin.append("1234", '5'))
    }

    @Test
    fun appendIgnoresNonDigits() {
        assertEquals("1", Pin.append("1", 'a'))
    }
}
