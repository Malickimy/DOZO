package com.example.dozo

import android.content.Context
import android.content.SharedPreferences
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.ListenableWorker
import androidx.work.testing.TestListenableWorkerBuilder
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Sprint 3 task 5 native coverage for the Połączenie tab's recorded runs.
 *
 * `ConnectionStatusTest` covers the pure mapping/format rules; this file covers the
 * parts that need the Android runtime:
 *  - both workers record `SKIPPED` (not `FAILURE`) when no stored token short-circuits
 *    the call, and record `SUCCESS` / `UNAUTHORIZED` on the real network paths;
 *  - a `401` still clears the stored token (R6) *and* records `UNAUTHORIZED`;
 *  - `DozoConfig`'s persisted snapshot round-trips, and a partial/unknown record reads
 *    back as "never".
 */
@RunWith(AndroidJUnit4::class)
class ConnectionStatusRecordingTest {

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        // No token by default: the workers must short-circuit. Individual tests store
        // one when they need the network path.
        prefs().edit()
            .remove(DozoContract.KEY_LANGUAGE)
            .remove(DozoContract.KEY_API_TOKEN)
            .putString(DozoContract.KEY_TERMINAL_ID, TERMINAL_ID)
            .putBoolean(DozoContract.KEY_ACTIVATED, true)
            .putBoolean(DozoContract.KEY_DISPLAY_ENABLED, true)
            .clearStatusKeys()
            .commit()
    }

    @After
    fun tearDown() {
        prefs().edit()
            .remove(DozoContract.KEY_LANGUAGE)
            .remove(DozoContract.KEY_API_TOKEN)
            .remove(DozoContract.KEY_TERMINAL_ID)
            .remove(DozoContract.KEY_API_BASE_URL)
            .putBoolean(DozoContract.KEY_ACTIVATED, true)
            .putBoolean(DozoContract.KEY_DISPLAY_ENABLED, true)
            .clearStatusKeys()
            .commit()
    }

    // --- workers: no token -> SKIPPED, not FAILURE -----------------------------

    @Test
    fun heartbeatWithoutTokenRecordsSkipped() {
        withServer(200, HEARTBEAT_OK_JSON) { server ->
            val result = runBlocking { heartbeat().doWork() }
            assertEquals(ListenableWorker.Result.success(), result)
            assertEquals("no stored token must skip the network", 0, server.requestCount)
        }

        val snapshot = DozoConfig.lastHeartbeat(context)
        assertTrue("a skipped heartbeat run must still be recorded", snapshot.recorded)
        assertEquals(ConnectionStatus.Outcome.SKIPPED, snapshot.outcome)
        assertNotEquals(ConnectionStatus.Outcome.FAILURE, snapshot.outcome)
        assertTrue("recorded timestamp must be positive", snapshot.atMillis!! > 0L)
    }

    @Test
    fun configSyncWithoutTokenRecordsSkipped() {
        withServer(200, CONFIG_JSON) { server ->
            val result = runBlocking { configSync().doWork() }
            assertEquals(ListenableWorker.Result.success(), result)
            assertEquals("no stored token must skip the network", 0, server.requestCount)
        }

        val snapshot = DozoConfig.lastConfigSync(context)
        assertTrue("a skipped config-sync run must still be recorded", snapshot.recorded)
        assertEquals(ConnectionStatus.Outcome.SKIPPED, snapshot.outcome)
        assertNotEquals(ConnectionStatus.Outcome.FAILURE, snapshot.outcome)
    }

    // --- workers: real network paths record their outcome ----------------------

    @Test
    fun heartbeatWithStoredTokenRecordsSuccess() {
        storeToken()
        withServer(200, HEARTBEAT_OK_JSON) { server ->
            val result = runBlocking { heartbeat().doWork() }
            assertEquals(ListenableWorker.Result.success(), result)
            assertTrue("a stored token must reach the server", server.requestCount >= 1)
        }
        assertEquals(ConnectionStatus.Outcome.SUCCESS, DozoConfig.lastHeartbeat(context).outcome)
    }

    @Test
    fun configSyncWithStoredTokenRecordsSuccess() {
        storeToken()
        withServer(200, CONFIG_JSON) { server ->
            val result = runBlocking { configSync().doWork() }
            assertEquals(ListenableWorker.Result.success(), result)
            assertTrue("a stored token must reach the server", server.requestCount >= 1)
        }
        assertEquals(ConnectionStatus.Outcome.SUCCESS, DozoConfig.lastConfigSync(context).outcome)
    }

    @Test
    fun unauthorizedHeartbeatClearsTokenAndRecordsUnauthorized() {
        storeToken()
        withServer(401, UNAUTHORIZED_JSON) { server ->
            runBlocking { heartbeat().doWork() }
            assertTrue("the heartbeat endpoint must have been called", server.requestCount >= 1)
        }

        assertFalse(
            "a 401 must still clear the stored token (R6 re-pair)",
            DozoConfig.hasStoredApiToken(context)
        )
        assertEquals(
            "the cleared run must be recorded as UNAUTHORIZED",
            ConnectionStatus.Outcome.UNAUTHORIZED,
            DozoConfig.lastHeartbeat(context).outcome
        )
    }

    // --- DozoConfig persisted snapshot read ------------------------------------

    @Test
    fun clearApiTokenKeepsLastStatusKeys() {
        storeToken()
        DozoConfig.recordHeartbeat(context, ConnectionStatus.Outcome.UNAUTHORIZED)

        DozoConfig.clearApiToken(context)

        assertFalse(DozoConfig.hasStoredApiToken(context))
        assertEquals(
            "clearing the token must not wipe the recorded run",
            ConnectionStatus.Outcome.UNAUTHORIZED,
            DozoConfig.lastHeartbeat(context).outcome
        )
    }

    @Test
    fun partialOrUnknownPersistedRecordReadsAsNever() {
        // Round-trip through the public writers.
        DozoConfig.recordHeartbeat(context, ConnectionStatus.Outcome.SUCCESS)
        val recorded = DozoConfig.lastHeartbeat(context)
        assertTrue(recorded.recorded)
        assertEquals(ConnectionStatus.Outcome.SUCCESS, recorded.outcome)

        DozoConfig.recordConfigSync(context, ConnectionStatus.Outcome.SKIPPED)
        assertEquals(
            ConnectionStatus.Outcome.SKIPPED,
            DozoConfig.lastConfigSync(context).outcome
        )

        // Timestamp without an outcome -> never.
        prefs().edit()
            .putLong(DozoContract.KEY_LAST_HEARTBEAT_AT, 1_700_000_000_000L)
            .remove(DozoContract.KEY_LAST_HEARTBEAT_RESULT)
            .commit()
        assertEquals(ConnectionStatus.Never, DozoConfig.lastHeartbeat(context))

        // Outcome without a timestamp -> never.
        prefs().edit()
            .putString(DozoContract.KEY_LAST_HEARTBEAT_RESULT, "SUCCESS")
            .remove(DozoContract.KEY_LAST_HEARTBEAT_AT)
            .commit()
        assertEquals(ConnectionStatus.Never, DozoConfig.lastHeartbeat(context))

        // Unknown/legacy outcome name -> never.
        prefs().edit()
            .putLong(DozoContract.KEY_LAST_HEARTBEAT_AT, 1_700_000_000_000L)
            .putString(DozoContract.KEY_LAST_HEARTBEAT_RESULT, "legacy-value")
            .commit()
        assertEquals(ConnectionStatus.Never, DozoConfig.lastHeartbeat(context))

        // Zero timestamp sentinel -> never.
        prefs().edit()
            .putLong(DozoContract.KEY_LAST_HEARTBEAT_AT, 0L)
            .putString(DozoContract.KEY_LAST_HEARTBEAT_RESULT, "SUCCESS")
            .commit()
        assertEquals(ConnectionStatus.Never, DozoConfig.lastHeartbeat(context))
    }

    // --- helpers ---------------------------------------------------------------

    private fun heartbeat(): HeartbeatWorker =
        TestListenableWorkerBuilder<HeartbeatWorker>(context).build()

    private fun configSync(): ConfigSyncWorker =
        TestListenableWorkerBuilder<ConfigSyncWorker>(context).build()

    private fun storeToken() {
        prefs().edit().putString(DozoContract.KEY_API_TOKEN, STORED_TOKEN).commit()
    }

    private fun withServer(status: Int, body: String, block: (LocalHttpServer) -> Unit) {
        LocalHttpServer(status = status, body = body).use { server ->
            prefs().edit().putString(DozoContract.KEY_API_BASE_URL, server.baseUrl).commit()
            block(server)
        }
    }

    private fun SharedPreferences.Editor.clearStatusKeys(): SharedPreferences.Editor = apply {
        remove(DozoContract.KEY_LAST_HEARTBEAT_AT)
        remove(DozoContract.KEY_LAST_HEARTBEAT_RESULT)
        remove(DozoContract.KEY_LAST_CONFIG_SYNC_AT)
        remove(DozoContract.KEY_LAST_CONFIG_SYNC_RESULT)
    }

    private fun prefs() =
        context.getSharedPreferences(DozoContract.PREFS_NAME, Context.MODE_PRIVATE)

    private companion object {
        const val TERMINAL_ID = "QA-TERM-STATUS"
        const val STORED_TOKEN = "qa-status-token"
        const val HEARTBEAT_OK_JSON = """{"ok":true,"terminal_id":"QA-TERM-STATUS"}"""
        const val UNAUTHORIZED_JSON = """{"error":"unauthorized"}"""
        const val CONFIG_JSON =
            """{"terminal_id":"QA-TERM-STATUS","merchant_id":"demo-merchant",""" +
                """"active":true,"display_enabled":true,"display_timeout_seconds":15,""" +
                """"redirect_base_url":"http://127.0.0.1"}"""
    }
}
