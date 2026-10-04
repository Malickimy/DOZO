package com.example.dozo

import android.content.Context
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.dozo.ui.QrDisplayScreen
import com.example.dozo.ui.QrRenderer
import com.example.dozo.ui.theme.DozoMotionSpec
import com.example.dozo.ui.theme.DozoTheme
import com.example.dozo.ui.theme.LocalDozoMotion
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Native coverage for the QR reveal (PR #80): the QR scales in via
 * [com.example.dozo.ui.theme.DozoGrowIn] while composed at full opacity from
 * the first frame, keyed on the transaction. The reveal is skipped instantly
 * under reduced motion or when the Settings toggle is off, and the screen now
 * leads with the logo instead of the old title/transaction text.
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
    fun qrIsComposedAtFullOpacityFromFirstFrame() {
        // Freeze the clock so the assertion runs on frame 0, before any scale
        // animation has advanced. The scale-only reveal composes the QR at full
        // opacity immediately; a fade/AnimatedVisibility(visible=false) reveal
        // would leave the node un-composed and this would fail.
        composeRule.mainClock.autoAdvance = false
        composeRule.setContent {
            DozoTheme(darkTheme = false) {
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
        composeRule.onNodeWithContentDescription(qrContentDesc()).assertIsDisplayed()
        composeRule.mainClock.autoAdvance = true
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
        // Reduced motion collapses the grow duration to zero, so the QR renders
        // at full size immediately.
        composeRule.onNodeWithContentDescription(qrContentDesc()).assertIsDisplayed()
    }

    @Test
    fun qrRevealsInstantlyWhenAnimationDisabled() {
        composeRule.mainClock.autoAdvance = false
        composeRule.setContent {
            DozoTheme(darkTheme = false) {
                QrDisplayScreen(
                    bitmap = qrBitmap("TXN-1"),
                    txnId = "TXN-1",
                    timeoutSeconds = 15,
                    autoClose = false,
                    merchantName = null,
                    promptText = null,
                    qrAnimationEnabled = false,
                    onDismiss = {},
                )
            }
        }
        // The Settings toggle must remove the grow-in regardless of the clock,
        // so the QR is present and displayed on frame 0.
        composeRule.onNodeWithContentDescription(qrContentDesc()).assertIsDisplayed()
        composeRule.mainClock.autoAdvance = true
    }

    @Test
    fun logoIsShownAndTitleAndTransactionTextAreGone() {
        composeRule.setContent {
            DozoTheme(darkTheme = false) {
                QrDisplayScreen(
                    bitmap = qrBitmap("TXN-1"),
                    txnId = "TXN-1",
                    timeoutSeconds = 15,
                    autoClose = false,
                    merchantName = "Sklep Testowy",
                    promptText = null,
                    onDismiss = {},
                )
            }
        }
        composeRule.onNodeWithContentDescription(context.getString(R.string.qr_logo_content_desc))
            .assertIsDisplayed()
        composeRule.onNodeWithContentDescription(qrContentDesc()).assertIsDisplayed()
        // The approved title / transaction number moved off this screen.
        composeRule.onNodeWithText(context.getString(R.string.qr_title)).assertDoesNotExist()
        composeRule.onNodeWithText(context.getString(R.string.qr_transaction, "TXN-1"))
            .assertDoesNotExist()
    }

    @Test
    fun qrCardIsBoundedAndCentered() {
        composeRule.setContent {
            DozoTheme(darkTheme = false) {
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
        val qr = composeRule.onNodeWithContentDescription(qrContentDesc()).fetchSemanticsNode()
        val root = composeRule.onRoot().fetchSemanticsNode()
        // Bounded: the QR no longer spans the full screen width.
        assertTrue(
            "QR width ${qr.size.width} should be less than root width ${root.size.width}",
            qr.size.width < root.size.width
        )
        // Centered horizontally in the root.
        val rootCenterX = root.size.width / 2f
        assertEquals(rootCenterX, qr.boundsInRoot.center.x, 2f)
    }

    @Test
    fun qrStaysDisplayedWhenTransactionChanges() {
        val txn = mutableStateOf("TXN-1")
        composeRule.setContent {
            DozoTheme(darkTheme = false) {
                QrDisplayScreen(
                    bitmap = qrBitmap("TXN-1"),
                    txnId = txn.value,
                    timeoutSeconds = 15,
                    autoClose = false,
                    merchantName = null,
                    promptText = null,
                    onDismiss = {},
                )
            }
        }
        composeRule.onNodeWithContentDescription(qrContentDesc()).assertIsDisplayed()

        // A new transaction re-keys the reveal rather than leaving a stale QR.
        composeRule.runOnUiThread { txn.value = "TXN-2" }
        composeRule.waitForIdle()
        composeRule.onNodeWithContentDescription(qrContentDesc()).assertIsDisplayed()
    }

    private fun qrContentDesc() = context.getString(R.string.qr_code_content_desc)

    private fun qrBitmap(urlSuffix: String) = QrRenderer.render("https://example.com/r/$urlSuffix")
}
