package com.example.dozo

import android.content.Context
import android.content.SharedPreferences
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * #95 native coverage for the resolved defaults: `DozoConfig` needs a real `Context`
 * (no Robolectric in this project), so this file exercises the SharedPreferences
 * fallback and the user-override path on a device/emulator.
 *
 * `UnifiedDefaultOriginTest` guards the shipped constants on the JVM; this file proves
 * an empty prefs store resolves to the same unified origin and a stored non-blank value
 * still wins.
 */
@RunWith(AndroidJUnit4::class)
class DefaultOriginResolutionTest {

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        // Simulate a fresh install: no persisted configuration at all.
        prefs().edit().clear().commit()
    }

    @After
    fun tearDown() {
        prefs().edit().clear().commit()
    }

    @Test
    fun freshInstallResolvesBothKeysToUnifiedOrigin() {
        assertEquals(UNIFIED_ORIGIN, DozoConfig.apiBaseUrl(context))
        assertEquals(UNIFIED_ORIGIN, DozoConfig.redirectBaseUrl(context))
    }

    @Test
    fun storedOverrideWinsOverDefaultForBothKeys() {
        prefs().edit()
            .putString(DozoContract.KEY_API_BASE_URL, EMULATOR_ORIGIN)
            .putString(DozoContract.KEY_REDIRECT_BASE_URL, EMULATOR_ORIGIN)
            .commit()

        assertEquals(EMULATOR_ORIGIN, DozoConfig.apiBaseUrl(context))
        assertEquals(EMULATOR_ORIGIN, DozoConfig.redirectBaseUrl(context))
    }

    @Test
    fun blankStoredValuesFallBackToUnifiedOrigin() {
        prefs().edit()
            .putString(DozoContract.KEY_API_BASE_URL, "   ")
            .putString(DozoContract.KEY_REDIRECT_BASE_URL, "")
            .commit()

        assertEquals(UNIFIED_ORIGIN, DozoConfig.apiBaseUrl(context))
        assertEquals(UNIFIED_ORIGIN, DozoConfig.redirectBaseUrl(context))
    }

    private fun prefs(): SharedPreferences =
        context.getSharedPreferences(DozoContract.PREFS_NAME, Context.MODE_PRIVATE)

    private companion object {
        const val UNIFIED_ORIGIN = "http://130.162.185.144:3000"
        const val EMULATOR_ORIGIN = "http://10.0.2.2:3000"
    }
}
