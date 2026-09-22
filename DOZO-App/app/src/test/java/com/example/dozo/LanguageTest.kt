package com.example.dozo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LanguageTest {

    @Test
    fun systemPreferenceMapsToNoLocaleOverride() {
        assertNull(Language.localeTag(Language.SYSTEM))
        assertNull(Language.localeTag(null))
    }

    @Test
    fun polishAndEnglishPreferencesMapToTheirTags() {
        assertEquals("pl", Language.localeTag(Language.PL))
        assertEquals("en", Language.localeTag(Language.EN))
    }

    @Test
    fun unknownPreferenceFallsBackToNoOverride() {
        assertNull(Language.localeTag("de"))
        assertNull(Language.localeTag(""))
    }

    @Test
    fun supportedPreferencesAreRecognised() {
        assertTrue(Language.isSupported(Language.SYSTEM))
        assertTrue(Language.isSupported(Language.PL))
        assertTrue(Language.isSupported(Language.EN))
    }

    @Test
    fun unsupportedPreferencesAreRejected() {
        assertFalse(Language.isSupported("de"))
        assertFalse(Language.isSupported(null))
        assertFalse(Language.isSupported(""))
    }
}
