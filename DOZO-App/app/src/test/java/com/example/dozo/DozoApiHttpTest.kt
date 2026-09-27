package com.example.dozo

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.net.InetSocketAddress
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Transport-level coverage for `DozoApi` (#58). The parser tests in
 * `DozoApiRedeemTest`/`DozoApiTest` cover response shapes; this proves what the app
 * actually puts on the wire: the `X-Api-Token` header and the model-B redeem body.
 */
class DozoApiHttpTest {

    private lateinit var server: HttpServer
    private val requests = CopyOnWriteArrayList<Captured>()

    private data class Captured(
        val method: String,
        val path: String,
        val apiToken: String?,
        val contentType: String?,
        val body: String
    )

    @Before
    fun startServer() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/") { exchange -> handle(exchange) }
            start()
        }
    }

    @After
    fun stopServer() {
        server.stop(0)
    }

    private fun baseUrl(): String = "http://127.0.0.1:${server.address.port}"

    private fun handle(exchange: HttpExchange) {
        val body = exchange.requestBody.use { it.readBytes() }.toString(Charsets.UTF_8)
        requests += Captured(
            method = exchange.requestMethod,
            path = exchange.requestURI.path,
            apiToken = exchange.requestHeaders.getFirst("X-Api-Token"),
            contentType = exchange.requestHeaders.getFirst("Content-Type"),
            body = body
        )
        val (status, json) = when (exchange.requestURI.path) {
            "/api/terminals/redeem" -> 200 to REDEEM_OK
            "/api/heartbeat" -> 200 to """{"ok":true}"""
            else -> 401 to """{"error":"unauthorized"}"""
        }
        val bytes = json.toByteArray(Charsets.UTF_8)
        exchange.responseHeaders.add("Content-Type", "application/json")
        exchange.sendResponseHeaders(status, bytes.size.toLong())
        exchange.responseBody.use { it.write(bytes) }
    }

    @Test
    fun redeemSendsApiTokenHeaderAndUppercasedCode() = runBlocking {
        val result = DozoApi(baseUrl(), "tok-123").redeem(" abcd2345 ", "SERIAL-1")

        val success = result as RedeemResult.Success
        assertEquals("tok-123", success.apiToken)
        assertEquals("DX8000SN000123", success.store.terminalId)

        val request = requests.single()
        assertEquals("POST", request.method)
        assertEquals("/api/terminals/redeem", request.path)
        assertEquals("tok-123", request.apiToken)
        assertEquals("application/json", request.contentType)
        assertTrue(request.body.contains("\"code\":\"ABCD2345\""))
        assertTrue(request.body.contains("\"device_serial\":\"SERIAL-1\""))
    }

    @Test
    fun configSendsApiTokenHeaderAnd401TriggersRepair() = runBlocking {
        val result = DozoApi(baseUrl(), "tok-abc").config("TERM1")

        assertEquals(ConfigResult.Unauthorized, result)
        assertTrue("a 401 must clear the stored token", AuthRecovery.shouldClearToken(result))

        val request = requests.single()
        assertEquals("GET", request.method)
        assertEquals("/api/terminals/TERM1/config", request.path)
        assertEquals("tok-abc", request.apiToken)
    }

    @Test
    fun heartbeatSendsApiTokenHeader() = runBlocking {
        val result = DozoApi(baseUrl(), "tok-hb").heartbeat("TERM1")

        assertEquals(HeartbeatResult.Ok, result)

        val request = requests.single()
        assertEquals("POST", request.method)
        assertEquals("/api/heartbeat", request.path)
        assertEquals("tok-hb", request.apiToken)
        assertTrue(request.body.contains("\"terminal_id\":\"TERM1\""))
    }

    private companion object {
        val REDEEM_OK = """
            {"status":"redeemed","api_token":"tok-123","store":{
              "terminal_id":"DX8000SN000123","merchant_id":"demo-merchant",
              "google_place_id":"ChIJ","label":"Till 1",
              "redirect_url":"https://track.papier.app/r/DX8000SN000123"}}
        """.trimIndent()
    }
}
