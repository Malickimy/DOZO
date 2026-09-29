package com.example.dozo

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.dozo.ui.SettingsScreen
import com.example.dozo.ui.theme.DozoTheme
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

/**
 * Sprint 3 task 5 native coverage: the settings Połączenie tab renders the last
 * heartbeat / config-sync timestamp and outcome, and "never" when absent. Renders
 * `SettingsScreen` directly (no PIN navigation) with fixed snapshots.
 */
@RunWith(AndroidJUnit4::class)
class ConnectionStatusDisplayTest {

    @get:Rule
    val composeRule = createComposeRule()

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
    }

    @Test
    fun connectionTabShowsRecordedHeartbeatAndConfigSync() {
        val at = Instant.parse("2026-09-29T14:30:00Z").toEpochMilli()
        showScreen(
            heartbeat = ConnectionStatus.Snapshot(at, ConnectionStatus.Outcome.SUCCESS),
            config = ConnectionStatus.Snapshot(at, ConnectionStatus.Outcome.UNAUTHORIZED)
        )

        composeRule.onNodeWithText(string(R.string.settings_connection_last_heartbeat))
            .assertIsDisplayed()
        composeRule.onNodeWithText(statusText(at, R.string.settings_connection_result_success))
            .assertExists()
        composeRule.onNodeWithText(string(R.string.settings_connection_last_config_sync))
            .assertExists()
        composeRule.onNodeWithText(statusText(at, R.string.settings_connection_result_unauthorized))
            .assertExists()
    }

    @Test
    fun connectionTabShowsNeverWhenNoRunRecorded() {
        showScreen(heartbeat = ConnectionStatus.Never, config = ConnectionStatus.Never)

        composeRule.onNodeWithText(string(R.string.settings_connection_last_heartbeat))
            .assertIsDisplayed()
        // Both rows fall back to "never".
        assertEquals(
            2,
            composeRule.onAllNodesWithText(string(R.string.settings_connection_never))
                .fetchSemanticsNodes().size
        )
    }

    private fun showScreen(
        heartbeat: ConnectionStatus.Snapshot,
        config: ConnectionStatus.Snapshot
    ) {
        composeRule.setContent {
            DozoTheme {
                SettingsScreen(
                    initialApiBaseUrl = "",
                    initialRedirectBaseUrl = "",
                    initialMerchantId = "",
                    initialTerminalId = "",
                    initialApiToken = "",
                    initialMerchantName = "",
                    initialPromptText = "",
                    initialDisplayEnabled = true,
                    initialActivated = true,
                    initialAutoCloseEnabled = false,
                    initialTimeoutSeconds = 15,
                    initialLanguage = Language.SYSTEM,
                    onApiBaseUrlChange = {},
                    onRedirectBaseUrlChange = {},
                    onMerchantIdChange = {},
                    onTerminalIdChange = {},
                    onApiTokenChange = {},
                    onMerchantNameChange = {},
                    onPromptTextChange = {},
                    onDisplayEnabledChange = {},
                    onActivatedChange = {},
                    onAutoCloseEnabledChange = {},
                    onTimeoutSecondsChange = {},
                    onLanguageChange = {},
                    manualStatus = null,
                    lastHeartbeat = heartbeat,
                    lastConfigSync = config,
                    onSyncNow = {},
                    onSendHeartbeatNow = {},
                    onEnterSetupCode = {},
                    onChangePin = {},
                    onUnpair = {},
                    onBack = {}
                )
            }
        }
        composeRule.onNodeWithText(string(R.string.settings_tab_connection)).performClick()
    }

    private fun statusText(atMillis: Long, outcomeRes: Int): String = context.getString(
        R.string.settings_connection_status,
        ConnectionStatus.formatTimestamp(atMillis, Locale.getDefault(), ZoneId.systemDefault()),
        string(outcomeRes)
    )

    private fun string(resId: Int): String = context.getString(resId)
}
