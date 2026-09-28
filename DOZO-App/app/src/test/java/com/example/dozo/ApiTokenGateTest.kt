package com.example.dozo

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * #58: `DozoContract.DEFAULT_API_TOKEN` is non-blank, so the old
 * `apiToken().isBlank()` guards could never skip an unpaired terminal. The
 * request paths now gate on the persisted token ([DozoConfig.hasStoredApiToken]),
 * so this covers the no-stored-token skip and the `401` → `clearApiToken()` path
 * that the placeholder used to undo.
 */
class ApiTokenGateTest {

    @Test
    fun storedTokenIsRecognised() {
        assertTrue(ApiTokenGate.hasStored("tok-123"))
    }

    @Test
    fun absentOrBlankStoredTokenIsNotAStoredToken() {
        assertFalse(ApiTokenGate.hasStored(null))
        assertFalse(ApiTokenGate.hasStored(""))
        assertFalse(ApiTokenGate.hasStored("   "))
    }

    @Test
    fun skipsWhenNoStoredToken() {
        assertTrue(ApiTokenGate.shouldSkip("TERM1", hasStoredToken = false))
    }

    @Test
    fun proceedsWithTerminalIdAndStoredToken() {
        assertFalse(ApiTokenGate.shouldSkip("TERM1", hasStoredToken = true))
    }

    @Test
    fun skipsWhenTerminalIdIsAbsent() {
        assertTrue(ApiTokenGate.shouldSkip(null, hasStoredToken = true))
        assertTrue(ApiTokenGate.shouldSkip("  ", hasStoredToken = true))
    }

    @Test
    fun clearedTokenStaysClearedEvenThoughDefaultPlaceholderIsNonBlank() {
        // Regression for #58: clearApiToken() removes the key, but apiToken() then
        // returns the non-blank DEFAULT_API_TOKEN, so an isBlank() gate is always
        // false and the next call would re-send the placeholder.
        assertFalse(DozoContract.DEFAULT_API_TOKEN.isBlank())

        val storedTokenAfterClear: String? = null
        assertFalse(ApiTokenGate.hasStored(storedTokenAfterClear))
        assertTrue(
            "a 401-cleared token must not be undone by the placeholder default",
            ApiTokenGate.shouldSkip(
                "TERM1",
                hasStoredToken = ApiTokenGate.hasStored(storedTokenAfterClear)
            )
        )
    }
}
