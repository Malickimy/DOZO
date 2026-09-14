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
             "redirect_base_url":"http://130.162.185.144:3000"}
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

    @Test
    fun registersParsesAllFields() {
        val body = """
            [{"label":"Front counter","terminal_id":"TERM0001","active":true,
              "last_seen":"2026-01-01T05:00:00.000Z"},
             {"label":"Back counter","terminal_id":"TERM0002","active":false,"last_seen":null}]
        """.trimIndent()
        val registers = parseRegisters(body)
        assertEquals(2, registers.size)
        assertEquals("Front counter", registers[0].label)
        assertEquals("TERM0001", registers[0].terminalId)
        assertTrue(registers[0].active)
        assertEquals("2026-01-01T05:00:00.000Z", registers[0].lastSeen)
        assertEquals("Back counter", registers[1].label)
        assertFalse(registers[1].active)
        assertNull(registers[1].lastSeen)
    }

    @Test
    fun registersHandlesIntegerBooleansAndMissingLastSeen() {
        val body = """[{"label":"Till","terminal_id":"TERM0001","active":1}]"""
        val registers = parseRegisters(body)
        assertEquals(1, registers.size)
        assertTrue(registers[0].active)
        assertNull(registers[0].lastSeen)
    }

    @Test
    fun registersSkipsEntriesWithoutTerminalId() {
        val body = """[{"label":"No id","active":true},{"terminal_id":"TERM0001","label":"Ok"}]"""
        val registers = parseRegisters(body)
        assertEquals(1, registers.size)
        assertEquals("TERM0001", registers[0].terminalId)
    }

    @Test
    fun registersInvalidJsonIsEmpty() {
        assertTrue(parseRegisters("not json").isEmpty())
    }

    @Test
    fun adoptedConfigParsesConfigShape() {
        val body = """
            {"terminal_id":"NEWTERM99","merchant_id":"M1","google_place_id":"ChIJ",
             "label":"Front counter","active":true,"display_enabled":true,
             "display_timeout_seconds":15,"redirect_base_url":"http://localhost:3000"}
        """.trimIndent()
        val config = parseAdoptedConfig(body)!!
        assertEquals("NEWTERM99", config.terminalId)
        assertEquals("M1", config.merchantId)
        assertEquals("Front counter", config.label)
        assertTrue(config.active)
        assertEquals("http://localhost:3000", config.redirectBaseUrl)
    }

    @Test
    fun adoptedConfigWithoutIdIsNull() {
        assertNull(parseAdoptedConfig("""{"merchant_id":"M1"}"""))
    }
}
