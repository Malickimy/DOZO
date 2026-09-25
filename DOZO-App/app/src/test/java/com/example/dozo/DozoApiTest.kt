package com.example.dozo

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DozoApiTest {

    @Test
    fun registerParsesAllFields() {
        val body = """
            {"code":"ABCD2345","terminal_id":"DX8000SN000123",
             "expires_at":"2026-01-01T00:05:00.000Z","expires_in_seconds":300}
        """.trimIndent()
        val result = parseRegister(body)
        assertEquals("ABCD2345", result.code)
        assertEquals("DX8000SN000123", result.terminalId)
        assertEquals("2026-01-01T00:05:00.000Z", result.expiresAt)
        assertEquals(300, result.expiresInSeconds)
    }

    @Test
    fun pairStatusPending() {
        val body = """
            {"status":"pending","code":"ABCD2345","expires_at":"2026-01-01T00:05:00.000Z"}
        """.trimIndent()
        val result = parsePairStatus(202, body) as PairStatusResult.Pending
        assertEquals("ABCD2345", result.code)
        assertEquals("2026-01-01T00:05:00.000Z", result.expiresAt)
    }

    @Test
    fun pairStatusClaimedParsesStore() {
        val body = """
            {"status":"claimed","api_token":"tok","store":{
              "terminal_id":"DX8000SN000123","merchant_id":"demo-merchant",
              "google_place_id":"ChIJ","label":"Till 1",
              "redirect_url":"https://track.papier.app/r/DX8000SN000123"}}
        """.trimIndent()
        val result = parsePairStatus(200, body) as PairStatusResult.Claimed
        assertEquals("tok", result.apiToken)
        assertEquals("DX8000SN000123", result.store.terminalId)
        assertEquals("demo-merchant", result.store.merchantId)
        assertEquals("ChIJ", result.store.googlePlaceId)
        assertEquals("Till 1", result.store.label)
        assertEquals("https://track.papier.app/r/DX8000SN000123", result.store.redirectUrl)
    }

    @Test
    fun pairStatusExpired() {
        val result = parsePairStatus(410, """{"status":"expired","code":"ABCD2345"}""")
        assertTrue(result is PairStatusResult.Expired)
        assertEquals("ABCD2345", (result as PairStatusResult.Expired).code)
    }

    @Test
    fun pairStatusUnknown() {
        val result = parsePairStatus(404, """{"status":"unknown","code":"ABCD2345"}""")
        assertEquals(PairStatusResult.Unknown, result)
    }

    @Test
    fun pairStatusUnknownEvenWithoutBody() {
        assertEquals(PairStatusResult.Unknown, parsePairStatus(404, ""))
    }

    @Test
    fun heartbeatParsesOk() {
        assertTrue(parseHeartbeat("""{"ok":true,"terminal_id":"DX8000SN000123"}"""))
    }

    @Test
    fun heartbeatParsesFailure() {
        assertFalse(parseHeartbeat("""{"ok":false}"""))
    }

    @Test
    fun heartbeatInvalidJsonIsFalse() {
        assertFalse(parseHeartbeat("not json"))
    }

    @Test
    fun heartbeatOkMapsToOkResult() {
        assertEquals(
            HeartbeatResult.Ok,
            parseHeartbeatResult(200, """{"ok":true,"terminal_id":"DX8000SN000123"}""")
        )
    }

    @Test
    fun heartbeatUnauthorizedMapsToUnauthorizedResult() {
        assertEquals(
            HeartbeatResult.Unauthorized,
            parseHeartbeatResult(401, """{"error":"unauthorized"}""")
        )
    }

    @Test
    fun heartbeatServerErrorMapsToFailedResult() {
        assertEquals(HeartbeatResult.Failed, parseHeartbeatResult(500, ""))
    }

    @Test
    fun missingOptionalStoreFieldsBecomeNull() {
        val store = parseStore(
            JSONObject("""{"terminal_id":"DX8000SN000123","merchant_id":"m","redirect_url":"u"}""")
        )
        assertNull(store.googlePlaceId)
        assertNull(store.label)
        assertEquals("u", store.redirectUrl)
    }

    @Test
    fun terminalConfigParsesAllFields() {
        val body = """
            {"terminal_id":"DEMOTERM01","merchant_id":"demo-merchant",
             "google_place_id":"ChIJ","label":"Demo terminal","active":true,
             "display_enabled":true,"display_timeout_seconds":15,
             "redirect_base_url":"http://130.162.185.144:3000",
             "static_review_url":"https://search.google.com/local/writereview?placeid=ChIJ"}
        """.trimIndent()
        val config = parseTerminalConfig(body)!!
        assertEquals("DEMOTERM01", config.terminalId)
        assertEquals("demo-merchant", config.merchantId)
        assertEquals("ChIJ", config.googlePlaceId)
        assertEquals("Demo terminal", config.label)
        assertTrue(config.active)
        assertTrue(config.displayEnabled)
        assertEquals(15, config.displayTimeoutSeconds)
        assertEquals("http://130.162.185.144:3000", config.redirectBaseUrl)
        assertEquals(
            "https://search.google.com/local/writereview?placeid=ChIJ",
            config.staticReviewUrl
        )
    }

    @Test
    fun terminalConfigWithoutStaticReviewUrlIsNull() {
        val config = parseTerminalConfig("""{"terminal_id":"T1"}""")!!
        assertNull(config.staticReviewUrl)
    }

    @Test
    fun terminalConfigHandlesIntegerBooleans() {
        val body = """
            {"terminal_id":"T1","display_enabled":0,"active":1,"display_timeout_seconds":30}
        """.trimIndent()
        val config = parseTerminalConfig(body)!!
        assertFalse(config.displayEnabled)
        assertTrue(config.active)
        assertEquals(30, config.displayTimeoutSeconds)
    }

    @Test
    fun terminalConfigWithoutIdIsNull() {
        assertNull(parseTerminalConfig("""{"merchant_id":"m"}"""))
    }

    @Test
    fun terminalConfigInvalidJsonIsNull() {
        assertNull(parseTerminalConfig("not json"))
    }

    @Test
    fun redirectBaseUrlStripsTerminalSuffix() {
        assertEquals(
            "https://track.papier.app",
            deriveRedirectBaseUrl("https://track.papier.app/r/DX8000SN000123", "DX8000SN000123")
        )
    }

    @Test
    fun redirectBaseUrlKeepsValueWhenSuffixAbsent() {
        assertEquals(
            "https://track.papier.app",
            deriveRedirectBaseUrl("https://track.papier.app", "DX8000SN000123")
        )
    }
}
