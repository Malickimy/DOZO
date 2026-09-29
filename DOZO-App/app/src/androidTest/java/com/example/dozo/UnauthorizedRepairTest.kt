package com.example.dozo

import android.content.Context
import android.content.Intent
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Sprint 5 / R6 native coverage: a `401` from the dashboard config pull clears the
 * persisted per-terminal token and routes the terminal back to the setup-code
 * (re-pair) screen. Complements the pure `AuthRecoveryTest` / `ApiTokenGateTest`
 * by exercising `MainActivity.onUnauthorized()` end-to-end.
 */
@RunWith(AndroidJUnit4::class)
class UnauthorizedRepairTest {

    @get:Rule
    val composeRule = createEmptyComposeRule()

    private lateinit var context: Context
    private lateinit var server: LocalHttpServer

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        server = LocalHttpServer(
            status = 401,
            body = """{"error":"unauthorized"}"""
        )
        // A paired terminal: token present and terminal_id set, so the onCreate
        // "no stored token" guard does not fire and only the 401 can route away.
        prefs().edit()
            .remove(DozoContract.KEY_LANGUAGE)
            .putString(DozoContract.KEY_TERMINAL_ID, TERMINAL_ID)
            .putString(DozoContract.KEY_API_TOKEN, STORED_TOKEN)
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
    fun unauthorizedConfigPullClearsTokenAndOpensSetupCode() {
        assertTrue("precondition: token must be stored", DozoConfig.hasStoredApiToken(context))

        val scenario = ActivityScenario.launchActivityForResult<MainActivity>(
            Intent(context, MainActivity::class.java)
        )

        val title = context.getString(R.string.setup_code_title)
        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithText(title).fetchSemanticsNodes().isNotEmpty()
        }

        composeRule.onNodeWithText(title).assertIsDisplayed()
        assertFalse(
            "401 must clear the stored token so the workers stop retrying",
            DozoConfig.hasStoredApiToken(context)
        )
        assertFalse(prefs().contains(DozoContract.KEY_API_TOKEN))
        assertTrue(
            "terminal_id must survive the 401 so re-pair keeps the binding",
            DozoConfig.terminalId(context) == TERMINAL_ID
        )
        assertTrue("the config endpoint must have been called", server.requestCount >= 1)

        scenario.close()
    }

    private fun prefs() =
        context.getSharedPreferences(DozoContract.PREFS_NAME, Context.MODE_PRIVATE)

    private companion object {
        const val TERMINAL_ID = "QA-TERM-UNAUTH"
        const val STORED_TOKEN = "qa-stored-token"
    }
}
