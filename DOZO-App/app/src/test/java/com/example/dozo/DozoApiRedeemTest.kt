package com.example.dozo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DozoApiRedeemTest {

    @Test
    fun redeemSuccessParsesTokenAndStore() {
        val body = """
            {"status":"redeemed","api_token":"tok-123","store":{
              "terminal_id":"DX8000SN000123","merchant_id":"demo-merchant",
              "google_place_id":"ChIJ","label":"Till 1",
              "redirect_url":"https://track.papier.app/r/DX8000SN000123"}}
        """.trimIndent()
        val result = parseRedeem(200, body) as RedeemResult.Success
        assertEquals("tok-123", result.apiToken)
        assertEquals("DX8000SN000123", result.store.terminalId)
        assertEquals("demo-merchant", result.store.merchantId)
        assertEquals("Till 1", result.store.label)
        assertEquals("https://track.papier.app/r/DX8000SN000123", result.store.redirectUrl)
    }

    @Test
    fun redeemInvalidCodeIsInvalid() {
        assertEquals(RedeemResult.Invalid, parseRedeem(400, """{"error":"invalid_code"}"""))
    }

    @Test
    fun redeemUnknownCodeIsUnknown() {
        assertEquals(RedeemResult.Unknown, parseRedeem(404, """{"error":"unknown_code"}"""))
    }

    @Test
    fun redeemExpiredCodeIsExpired() {
        assertEquals(RedeemResult.Expired, parseRedeem(410, """{"error":"expired_code"}"""))
    }

    @Test
    fun redeemReusedCodeIsAlreadyRedeemed() {
        assertEquals(
            RedeemResult.AlreadyRedeemed,
            parseRedeem(410, """{"error":"redeemed_code"}""")
        )
    }

    @Test
    fun redeemUnexpectedResponseIsFailed() {
        assertEquals(RedeemResult.Failed, parseRedeem(500, """{"error":"boom"}"""))
    }

    @Test
    fun configResponseOkParsesConfig() {
        val body = """{"terminal_id":"T1","merchant_id":"m","display_enabled":true}"""
        assertTrue(parseConfigResponse(200, body) is ConfigResult.Success)
    }

    @Test
    fun configResponseUnauthorizedIsScaffolded() {
        assertEquals(ConfigResult.Unauthorized, parseConfigResponse(401, """{"error":"unauthorized"}"""))
    }

    @Test
    fun configResponseNotFound() {
        assertEquals(ConfigResult.NotFound, parseConfigResponse(404, """{"error":"unknown_terminal"}"""))
    }

    @Test
    fun configResponseServerErrorIsFailed() {
        assertEquals(ConfigResult.Failed, parseConfigResponse(500, ""))
    }
}
