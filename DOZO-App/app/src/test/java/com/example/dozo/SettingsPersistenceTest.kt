package com.example.dozo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guards the `dozo_prefs` persistence rules from App Sprint 3: the pref keys must not be
 * renamed, the settings values are normalised, and a model-B redeem maps into the exact
 * keys the rest of the app reads.
 */
class SettingsPersistenceTest {

    @Test
    fun prefKeysAreStableAndUnique() {
        val expected = mapOf(
            DozoContract.KEY_ACTIVATED to "activated",
            DozoContract.KEY_DISPLAY_ENABLED to "display_enabled",
            DozoContract.KEY_REDIRECT_BASE_URL to "redirect_base_url",
            DozoContract.KEY_DISPLAY_TIMEOUT_SECONDS to "display_timeout_seconds",
            DozoContract.KEY_API_BASE_URL to "api_base_url",
            DozoContract.KEY_API_TOKEN to "api_token",
            DozoContract.KEY_TERMINAL_ID to "terminal_id",
            DozoContract.KEY_MERCHANT_ID to "merchant_id",
            DozoContract.KEY_MERCHANT_NAME to "merchant_name",
            DozoContract.KEY_PROMPT_TEXT to "prompt_text",
            DozoContract.KEY_LANGUAGE to "language",
            DozoContract.KEY_PAIRING_CODE to "pairing_code",
            DozoContract.KEY_PIN to "pin",
            DozoContract.KEY_AUTO_CLOSE to "auto_close_enabled"
        )
        assertEquals("dozo_prefs", DozoContract.PREFS_NAME)
        expected.forEach { (constant, literal) ->
            assertEquals("pref key renamed", literal, constant)
        }
        assertEquals("duplicate pref key", expected.size, expected.keys.toSet().size)
    }

    @Test
    fun redeemPrefsMapIntoExistingKeys() {
        val store = StoreConfig(
            terminalId = "DX8000SN000123",
            merchantId = "demo-merchant",
            googlePlaceId = "ChIJ",
            label = "Till 1",
            redirectUrl = "https://track.papier.app/r/DX8000SN000123"
        )
        val prefs = SettingsPersistence.redeemPrefs("tok-123", store)
        assertEquals("DX8000SN000123", prefs.terminalId)
        assertEquals("tok-123", prefs.apiToken)
        assertEquals("https://track.papier.app", prefs.redirectBaseUrl)
    }

    @Test
    fun normalizeLanguageFallsBackToSystem() {
        assertEquals(Language.SYSTEM, SettingsPersistence.normalizeLanguage(null))
        assertEquals(Language.SYSTEM, SettingsPersistence.normalizeLanguage("de"))
        assertEquals(Language.PL, SettingsPersistence.normalizeLanguage(Language.PL))
        assertEquals(Language.EN, SettingsPersistence.normalizeLanguage(Language.EN))
    }

    @Test
    fun clampTimeoutSecondsBoundsToContractRange() {
        assertEquals(5, SettingsPersistence.clampTimeoutSeconds(0))
        assertEquals(5, SettingsPersistence.clampTimeoutSeconds(5))
        assertEquals(15, SettingsPersistence.clampTimeoutSeconds(15))
        assertEquals(30, SettingsPersistence.clampTimeoutSeconds(30))
        assertEquals(30, SettingsPersistence.clampTimeoutSeconds(999))
        assertTrue(SettingsPersistence.clampTimeoutSeconds(-1) == DozoContract.MIN_DISPLAY_TIMEOUT_SECONDS)
    }
}
