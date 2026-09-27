package com.example.dozo

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * App Sprint 5 (#58): a `401` must invalidate the stored token so the next launch
 * re-pairs through the setup code. The background workers and `MainActivity`
 * share this decision.
 */
class AuthRecoveryTest {

    @Test
    fun unauthorizedHeartbeatClearsToken() {
        assertTrue(AuthRecovery.shouldClearToken(HeartbeatResult.Unauthorized))
    }

    @Test
    fun otherHeartbeatResultsKeepToken() {
        assertFalse(AuthRecovery.shouldClearToken(HeartbeatResult.Ok))
        assertFalse(AuthRecovery.shouldClearToken(HeartbeatResult.Failed))
    }

    @Test
    fun unauthorizedConfigClearsToken() {
        assertTrue(AuthRecovery.shouldClearToken(ConfigResult.Unauthorized))
    }

    @Test
    fun otherConfigResultsKeepToken() {
        assertFalse(AuthRecovery.shouldClearToken(ConfigResult.NotFound))
        assertFalse(AuthRecovery.shouldClearToken(ConfigResult.Failed))
        assertFalse(
            AuthRecovery.shouldClearToken(
                ConfigResult.Success(
                    TerminalConfig(
                        terminalId = "T1",
                        merchantId = "demo-merchant",
                        googlePlaceId = null,
                        label = null,
                        active = true,
                        displayEnabled = true,
                        displayTimeoutSeconds = 15,
                        redirectBaseUrl = "https://track.papier.app"
                    )
                )
            )
        )
    }
}
