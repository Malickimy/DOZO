package com.example.dozo

import android.content.Context
import android.content.Intent
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HandoffResultTest {

    @get:Rule
    val composeRule = createEmptyComposeRule()

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        prefs().edit()
            .putBoolean(DozoContract.KEY_ACTIVATED, true)
            .putBoolean(DozoContract.KEY_DISPLAY_ENABLED, true)
            .commit()
    }

    @After
    fun tearDown() {
        prefs().edit()
            .putBoolean(DozoContract.KEY_ACTIVATED, true)
            .putBoolean(DozoContract.KEY_DISPLAY_ENABLED, true)
            .commit()
    }

    @Test
    fun canceledStatusExitsCanceled() {
        assertEquals(0, launchResult(status = "CANCELED"))
    }

    @Test
    fun refusedStatusExitsCanceled() {
        assertEquals(0, launchResult(status = "REFUSED"))
    }

    @Test
    fun unknownStatusExitsCanceled() {
        assertEquals(0, launchResult(status = "PENDING"))
    }

    @Test
    fun canceledActionWithoutStatusExitsCanceled() {
        assertEquals(
            0,
            launchResult(action = DozoContract.ACTION_INGENICO_CANCELED)
        )
    }

    @Test
    fun refusedActionWithoutStatusExitsCanceled() {
        assertEquals(
            0,
            launchResult(action = DozoContract.ACTION_FISERV_REFUSED)
        )
    }

    @Test
    fun approvedWithDisplayDisabledStillExitsApproved() {
        prefs().edit().putBoolean(DozoContract.KEY_DISPLAY_ENABLED, false).commit()
        assertEquals(1, launchResult(status = "APPROVED"))
    }

    @Test
    fun approvedWithActivationDisabledStillExitsApproved() {
        prefs().edit().putBoolean(DozoContract.KEY_ACTIVATED, false).commit()
        assertEquals(1, launchResult(status = "APPROVED"))
    }

    @Test
    fun approvedAndActivatedShowsQr() {
        val scenario = ActivityScenario.launchActivityForResult<MainActivity>(
            handoffIntent(status = "APPROVED", txnId = "TXN-QR")
        )
        assertEquals(Lifecycle.State.RESUMED, scenario.state)
        composeRule.onNodeWithText("Payment approved").assertIsDisplayed()
        composeRule.onNodeWithText("Transaction TXN-QR").assertIsDisplayed()
        scenario.close()
    }

    private fun launchResult(
        status: String? = null,
        action: String? = null
    ): Int? {
        val scenario = ActivityScenario.launchActivityForResult<MainActivity>(
            handoffIntent(status = status, action = action)
        )
        val result = scenario.getResult()
        scenario.close()
        return result?.resultCode
    }

    private fun handoffIntent(
        status: String? = null,
        action: String? = null,
        txnId: String? = null
    ): Intent = Intent(context, MainActivity::class.java).apply {
        action?.let { this.action = it }
        status?.let { putExtra(DozoContract.EXTRA_STATUS, it) }
        txnId?.let { putExtra(DozoContract.EXTRA_TXN_ID, it) }
    }

    private fun prefs() =
        context.getSharedPreferences(DozoContract.PREFS_NAME, Context.MODE_PRIVATE)
}
