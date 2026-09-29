package com.example.dozo

import android.content.Context
import android.content.Intent
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Sprint 4 DoD (app side): a dashboard-pushed config is applied at launch, showing
 * the "Aktualizowanie ustawień…" overlay and then the "Ustawienia zaktualizowane z
 * panelu" popup. A local stub stands in for the dashboard backend (the live server +
 * dashboard e2e cannot run from this worktree) and returns `display_enabled:false`,
 * the same payload a dashboard toggle produces.
 *
 * The popup is a platform `Toast`, which is not part of the Compose tree; this test
 * asserts the overlay + persisted config, and the Toast is covered by the documented
 * emulator steps (see the task report). A UiAutomator probe was tried and could not
 * see the API 29 toast, so it was dropped rather than left flaky.
 */
@RunWith(AndroidJUnit4::class)
class RemoteConfigApplyTest {

    @get:Rule
    val composeRule = createEmptyComposeRule()

    private lateinit var context: Context
    private lateinit var server: LocalHttpServer

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        server = LocalHttpServer(status = 200, body = CONFIG_JSON)
        prefs().edit()
            .remove(DozoContract.KEY_LANGUAGE)
            .remove(DozoContract.KEY_STATIC_REVIEW_URL)
            .remove(DozoContract.KEY_GOOGLE_PLACE_ID)
            .putString(DozoContract.KEY_TERMINAL_ID, TERMINAL_ID)
            .putString(DozoContract.KEY_API_TOKEN, STORED_TOKEN)
            .putString(DozoContract.KEY_API_BASE_URL, server.baseUrl)
            .putBoolean(DozoContract.KEY_ACTIVATED, true)
            // Start from "enabled" so a false assertion proves the dashboard won.
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
            .remove(DozoContract.KEY_GOOGLE_PLACE_ID)
            .remove(DozoContract.KEY_STATIC_REVIEW_URL)
            .putBoolean(DozoContract.KEY_ACTIVATED, true)
            .putBoolean(DozoContract.KEY_DISPLAY_ENABLED, true)
            .commit()
    }

    @Test
    fun dashboardConfigShowsOverlayThenApplies() {
        assertTrue("precondition: display starts enabled", DozoConfig.isDisplayEnabled(context))

        val scenario = ActivityScenario.launchActivityForResult<MainActivity>(
            Intent(context, MainActivity::class.java)
        )

        val updating = context.getString(R.string.settings_updating)

        // The overlay is shown while the remote config is applied.
        composeRule.waitUntil(timeoutMillis = 5_000) { hasNode(updating) }
        assertTrue("overlay text must be on screen", hasNode(updating))

        // Overlay goes away and the dashboard value is persisted.
        composeRule.waitUntil(timeoutMillis = 5_000) { !hasNode(updating) }
        assertFalse("dashboard config must win", DozoConfig.isDisplayEnabled(context))
        assertEquals(20, DozoConfig.displayTimeoutSeconds(context))
        assertTrue("config endpoint must have been called", server.requestCount >= 1)

        scenario.close()
    }

    private fun hasNode(text: String): Boolean =
        composeRule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()

    private fun prefs() =
        context.getSharedPreferences(DozoContract.PREFS_NAME, Context.MODE_PRIVATE)

    private companion object {
        const val TERMINAL_ID = "QA-TERM-CONFIG"
        const val STORED_TOKEN = "qa-config-token"
        const val CONFIG_JSON =
            """{"terminal_id":"QA-TERM-CONFIG","merchant_id":"demo-merchant",""" +
                """"google_place_id":"ChIJQA","label":"QA","active":true,""" +
                """"display_enabled":false,"display_timeout_seconds":20,""" +
                """"redirect_base_url":"http://127.0.0.1:1",""" +
                """"static_review_url":"https://example.test/qa-review"}"""
    }
}
