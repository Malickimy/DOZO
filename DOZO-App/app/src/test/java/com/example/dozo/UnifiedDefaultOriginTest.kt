package com.example.dozo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * #95: a fresh install must target the single unified backend origin. The retired
 * connector port `:3001` and the emulator-only loopback address `10.0.2.2` are
 * verification conveniences, never shipped defaults.
 */
class UnifiedDefaultOriginTest {

    private val unifiedOrigin = "http://130.162.185.144:3000"

    private val shippedDefaults
        get() = listOf(DozoContract.DEFAULT_API_BASE_URL, DozoContract.DEFAULT_REDIRECT_BASE_URL)

    @Test
    fun bothDefaultsAreTheUnifiedOrigin() {
        assertEquals(unifiedOrigin, DozoContract.DEFAULT_API_BASE_URL)
        assertEquals(unifiedOrigin, DozoContract.DEFAULT_REDIRECT_BASE_URL)
        assertEquals(
            "api and redirect defaults must not drift apart",
            DozoContract.DEFAULT_API_BASE_URL,
            DozoContract.DEFAULT_REDIRECT_BASE_URL
        )
    }

    @Test
    fun defaultsUseTheUnifiedBackendPort() {
        shippedDefaults.forEach { url ->
            assertTrue("expected port :3000 on $url", url.endsWith(":3000"))
        }
    }

    @Test
    fun noDefaultUsesRetiredConnectorPort() {
        shippedDefaults.forEach { url ->
            assertFalse("retired connector port :3001 shipped in $url", url.contains(":3001"))
        }
    }

    @Test
    fun noDefaultTargetsEmulatorLoopback() {
        shippedDefaults.forEach { url ->
            assertFalse("emulator-only loopback shipped as a default: $url", url.contains("10.0.2.2"))
        }
    }
}
