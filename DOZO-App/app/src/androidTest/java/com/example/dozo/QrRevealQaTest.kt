package com.example.dozo

import android.content.Context
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.dozo.ui.QrDisplayScreen
import com.example.dozo.ui.QrRenderer
import com.example.dozo.ui.theme.DozoMotionSpec
import com.example.dozo.ui.theme.DozoTheme
import com.example.dozo.ui.theme.LocalDozoMotion
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Native coverage for the QR reveal (PR #80): the QR grows/fades in via
 * [com.example.dozo.ui.theme.DozoGrowIn], keyed on the transaction so a new
 * payment replays the reveal, and the reduced-motion gate collapses the
 * animation to an instant appear.
 */
@RunWith(AndroidJUnit4::class)
class QrRevealQaTest {

    @get:Rule
    val composeRule = createComposeRule()

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
    }

    @Test
    fun qrRevealsAndReplaysForKeyedTransactions() {
        val txn = mutableStateOf("TXN-1")
        composeRule.setContent {
            DozoTheme(darkTheme = false) {
                QrDisplayScreen(
                    bitmap = qrBitmap("TXN-1"),
                    txnId = txn.value,
                    timeoutSeconds = 15,
                    autoClose = false,
                    merchantName = "Sklep Testowy",
                    promptText = null,
                    onDismiss = {},
                )
            }
        }

        val qrContentDesc = context.getString(R.string.qr_code_content_desc)
        composeRule.onNodeWithContentDescription(qrContentDesc).assertIsDisplayed()
        composeRule.onNodeWithText(context.getString(R.string.qr_transaction, "TXN-1"))
            .assertIsDisplayed()

        // A new transaction must replay the reveal rather than leaving a stale QR.
        composeRule.runOnUiThread { txn.value = "TXN-2" }
        composeRule.waitForIdle()
        composeRule.onNodeWithText(context.getString(R.string.qr_transaction, "TXN-2"))
            .assertIsDisplayed()
        composeRule.onNodeWithContentDescription(qrContentDesc).assertIsDisplayed()
    }

    @Test
    fun qrRevealsInstantlyUnderReducedMotion() {
        composeRule.setContent {
            DozoTheme(darkTheme = false) {
                CompositionLocalProvider(LocalDozoMotion provides DozoMotionSpec.Reduced) {
                    QrDisplayScreen(
                        bitmap = qrBitmap("TXN-1"),
                        txnId = "TXN-1",
                        timeoutSeconds = 15,
                        autoClose = false,
                        merchantName = null,
                        promptText = null,
                        onDismiss = {},
                    )
                }
            }
        }
        // Reduced motion collapses the grow/fade durations to zero, so the QR is
        // present immediately (no animation frames to wait out).
        composeRule.onNodeWithContentDescription(context.getString(R.string.qr_code_content_desc))
            .assertIsDisplayed()
    }

    private fun qrBitmap(urlSuffix: String) = QrRenderer.render("https://example.com/r/$urlSuffix")
}
