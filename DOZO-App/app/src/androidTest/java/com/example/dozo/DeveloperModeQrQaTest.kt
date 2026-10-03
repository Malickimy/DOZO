package com.example.dozo

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.dozo.ui.QrDisplayScreen
import com.example.dozo.ui.QrRenderer
import com.example.dozo.ui.theme.DozoTheme
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Native coverage for the app-only developer-mode QR indicator: when enabled it
 * labels the displayed QR as `dynamic` or `static fallback` according to the
 * resolved [QrSource], and stays hidden when disabled or the source is unknown.
 */
@RunWith(AndroidJUnit4::class)
class DeveloperModeQrQaTest {

    @get:Rule
    val composeRule = createComposeRule()

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
    }

    @Test
    fun dynamicSourceLabelIsShownWhenDeveloperModeOn() {
        show(developerMode = true, source = QrSource.PRIMARY)

        composeRule.onNodeWithText(context.getString(R.string.qr_source_dynamic))
            .assertIsDisplayed()
    }

    @Test
    fun staticFallbackLabelIsShownWhenDeveloperModeOn() {
        show(developerMode = true, source = QrSource.STATIC_REVIEW_URL)

        composeRule.onNodeWithText(context.getString(R.string.qr_source_static_fallback))
            .assertIsDisplayed()
    }

    @Test
    fun labelsAreAbsentWhenDeveloperModeOff() {
        show(developerMode = false, source = QrSource.PRIMARY)

        composeRule.onNodeWithText(context.getString(R.string.qr_source_dynamic))
            .assertDoesNotExist()
        composeRule.onNodeWithText(context.getString(R.string.qr_source_static_fallback))
            .assertDoesNotExist()
    }

    @Test
    fun labelsAreAbsentWhenSourceIsUnknown() {
        show(developerMode = true, source = null)

        composeRule.onNodeWithText(context.getString(R.string.qr_source_dynamic))
            .assertDoesNotExist()
        composeRule.onNodeWithText(context.getString(R.string.qr_source_static_fallback))
            .assertDoesNotExist()
    }

    private fun show(developerMode: Boolean, source: QrSource?) {
        composeRule.setContent {
            DozoTheme(darkTheme = false) {
                QrDisplayScreen(
                    bitmap = QrRenderer.render("https://example.com/r/TXN-1"),
                    txnId = "TXN-1",
                    timeoutSeconds = 15,
                    autoClose = false,
                    merchantName = "Sklep Testowy",
                    promptText = null,
                    developerMode = developerMode,
                    qrSource = source,
                    onDismiss = {}
                )
            }
        }
    }
}
