package com.example.dozo

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.ListenableWorker
import androidx.work.testing.TestListenableWorkerBuilder
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Sprint 5 / R6 native coverage: both background workers short-circuit on
 * `DozoConfig.shouldSkipApiCall()` — no stored `api_token` means no network call
 * (the `DEFAULT_API_TOKEN` placeholder must not defeat the guard, #58). With a
 * stored token the worker does call the server. Uses the WorkManager test harness
 * (`TestListenableWorkerBuilder`) so `doWork()` runs for real.
 */
@RunWith(AndroidJUnit4::class)
class WorkerTokenSkipTest {

    private lateinit var context: Context
    private lateinit var server: LocalHttpServer

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        server = LocalHttpServer(status = 200, body = CONFIG_JSON)
        prefs().edit()
            .remove(DozoContract.KEY_LANGUAGE)
            .putString(DozoContract.KEY_TERMINAL_ID, TERMINAL_ID)
            .putString(DozoContract.KEY_API_BASE_URL, server.baseUrl)
            .putBoolean(DozoContract.KEY_ACTIVATED, true)
            .putBoolean(DozoContract.KEY_DISPLAY_ENABLED, true)
            .commit()
    }

    @After
    fun tearDown() {
        server.close()
        prefs().edit()
            .remove(DozoContract.KEY_LANGUAGE)
            .remove(DozoContract.KEY_API_TOKEN)
            .remove(DozoContract.KEY_TERMINAL_ID)
            .remove(DozoContract.KEY_API_BASE_URL)
            .putBoolean(DozoContract.KEY_ACTIVATED, true)
            .putBoolean(DozoContract.KEY_DISPLAY_ENABLED, true)
            .commit()
    }

    @Test
    fun heartbeatSkipsWithoutStoredToken() {
        clearStoredToken()
        val result = runBlocking { heartbeat().doWork() }
        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals("no stored token must skip the network", 0, server.requestCount)
    }

    @Test
    fun configSyncSkipsWithoutStoredToken() {
        clearStoredToken()
        val result = runBlocking { configSync().doWork() }
        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals("no stored token must skip the network", 0, server.requestCount)
    }

    @Test
    fun heartbeatCallsServerWhenTokenIsStored() {
        storeToken()
        val result = runBlocking { heartbeat().doWork() }
        assertEquals(ListenableWorker.Result.success(), result)
        assertTrue("a stored token must reach the server", server.requestCount >= 1)
    }

    @Test
    fun configSyncCallsServerWhenTokenIsStored() {
        storeToken()
        val result = runBlocking { configSync().doWork() }
        assertEquals(ListenableWorker.Result.success(), result)
        assertTrue("a stored token must reach the server", server.requestCount >= 1)
    }

    private fun heartbeat(): HeartbeatWorker =
        TestListenableWorkerBuilder<HeartbeatWorker>(context).build()

    private fun configSync(): ConfigSyncWorker =
        TestListenableWorkerBuilder<ConfigSyncWorker>(context).build()

    private fun clearStoredToken() {
        prefs().edit().remove(DozoContract.KEY_API_TOKEN).commit()
    }

    private fun storeToken() {
        prefs().edit().putString(DozoContract.KEY_API_TOKEN, STORED_TOKEN).commit()
    }

    private fun prefs() =
        context.getSharedPreferences(DozoContract.PREFS_NAME, Context.MODE_PRIVATE)

    private companion object {
        const val TERMINAL_ID = "QA-TERM-WORKER"
        const val STORED_TOKEN = "qa-worker-token"
        const val CONFIG_JSON =
            """{"terminal_id":"QA-TERM-WORKER","merchant_id":"m","active":true,""" +
                """"display_enabled":true,"display_timeout_seconds":15,""" +
                """"redirect_base_url":"http://127.0.0.1"}"""
    }
}
