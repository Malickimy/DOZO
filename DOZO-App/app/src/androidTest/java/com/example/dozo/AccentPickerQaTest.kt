package com.example.dozo

import android.content.Context
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.dozo.ui.SettingsScreen
import com.example.dozo.ui.theme.DozoTheme
import com.example.dozo.ui.theme.Lime
import com.example.dozo.ui.theme.Sky
import com.example.dozo.ui.theme.accentColor
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Native coverage for the Screen-tab accent dropdown (PR #80): opening the
 * dropdown on the default Screen tab and picking a preset recolours
 * `MaterialTheme.primary` live (accent state is hoisted by the caller, as in
 * `MainActivity`).
 */
@RunWith(AndroidJUnit4::class)
class AccentPickerQaTest {

    @get:Rule
    val composeRule = createComposeRule()

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
    }

    @Test
    fun selectingAccentFromDropdownRecolorsPrimary() {
        val selected = mutableStateOf(AccentToken.LIME)
        var primary = 0
        composeRule.setContent {
            DozoTheme(darkTheme = false, accent = accentColor(selected.value)) {
                primary = MaterialTheme.colorScheme.primary.toArgb()
                SettingsScreen(
                    initialApiBaseUrl = "",
                    initialRedirectBaseUrl = "",
                    initialMerchantId = "",
                    initialTerminalId = "",
                    initialApiToken = "",
                    initialMerchantName = "",
                    initialPromptText = "",
                    initialDisplayEnabled = true,
                    initialAutoCloseEnabled = false,
                    initialTimeoutSeconds = 15,
                    initialLanguage = Language.SYSTEM,
                    initialAccent = selected.value,
                    onApiBaseUrlChange = {},
                    onRedirectBaseUrlChange = {},
                    onMerchantIdChange = {},
                    onTerminalIdChange = {},
                    onApiTokenChange = {},
                    onMerchantNameChange = {},
                    onPromptTextChange = {},
                    onDisplayEnabledChange = {},
                    onAutoCloseEnabledChange = {},
                    onTimeoutSecondsChange = {},
                    onLanguageChange = {},
                    onAccentChange = { selected.value = it },
                    manualStatus = null,
                    lastHeartbeat = ConnectionStatus.Never,
                    lastConfigSync = ConnectionStatus.Never,
                    onSyncNow = {},
                    onSendHeartbeatNow = {},
                    onEnterSetupCode = {},
                    onChangePin = {},
                    onUnpair = {},
                    onBack = {}
                )
            }
        }
        composeRule.waitForIdle()
        assertEquals("default accent is lime", Lime.toArgb(), primary)

        // The Screen tab is the default, so the dropdown is visible. Its field
        // shows the current preset name; open it and pick Sky from the menu.
        // (The menu opens downward — verified on the emulator; popup node
        // coordinates are window-local so they can't be asserted here.)
        val limeLabel = string(R.string.settings_accent_lime)
        val skyLabel = string(R.string.settings_accent_sky)
        composeRule.onNodeWithText(limeLabel, substring = true).performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithText(skyLabel, substring = true).performClick()
        composeRule.waitForIdle()

        assertEquals(AccentToken.SKY, selected.value)
        assertEquals("primary must follow the picked accent", Sky.toArgb(), primary)
    }

    private fun string(resId: Int): String = context.getString(resId)
}
