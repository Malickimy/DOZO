package com.example.dozo

import com.example.dozo.ui.OutcomeKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class IntentMapperTest {

    private val reviewUrl = "https://g.page/r/REAL/review"
    private val baseUrl = "https://track.papier.app"

    @Test
    fun approvedStatusDrawsQr() {
        val result = IntentMapper.map(
            PaymentIntent(status = "APPROVED", reviewUrl = reviewUrl, txnId = "TXN-1", amountCents = 1999),
            baseUrl
        )
        assertEquals(MappedState.Approved(reviewUrl, "TXN-1", 1999), result)
    }

    @Test
    fun approvedStatusIsCaseInsensitiveAndTrims() {
        val result = IntentMapper.map(
            PaymentIntent(status = "  approved ", reviewUrl = reviewUrl),
            baseUrl
        )
        assertTrue(result is MappedState.Approved)
    }

    @Test
    fun approvedStatusWithoutUrlFallsBackToDefault() {
        val result = IntentMapper.map(
            PaymentIntent(status = "APPROVED"),
            baseUrl
        ) as MappedState.Approved
        assertEquals(DozoContract.DEFAULT_REVIEW_URL, result.payload)
    }

    @Test
    fun canceledStatusMapsToCanceledOutcome() {
        val result = IntentMapper.map(
            PaymentIntent(status = "CANCELED", txnId = "TXN-2", amountCents = 500, reason = "Cashier void"),
            baseUrl
        )
        assertEquals(
            MappedState.NonApproval(OutcomeKind.CANCELED, "TXN-2", 500, "Cashier void"),
            result
        )
    }

    @Test
    fun refusedStatusMapsToRefusedOutcome() {
        val result = IntentMapper.map(
            PaymentIntent(status = "REFUSED", txnId = "TXN-3", reason = "Insufficient funds"),
            baseUrl
        )
        assertEquals(
            MappedState.NonApproval(OutcomeKind.REFUSED, "TXN-3", null, "Insufficient funds"),
            result
        )
    }

    @Test
    fun unknownStatusNeverDrawsQr() {
        val result = IntentMapper.map(
            PaymentIntent(status = "SOMETHING_ELSE", reviewUrl = reviewUrl),
            baseUrl
        )
        assertTrue(result is MappedState.NonApproval)
    }

    @Test
    fun blankStatusFallsBackToAction() {
        val result = IntentMapper.map(
            PaymentIntent(
                action = DozoContract.ACTION_FISERV,
                status = "   ",
                reviewUrl = reviewUrl
            ),
            baseUrl
        )
        assertTrue(result is MappedState.Approved)
    }

    @Test
    fun canceledActionMapsToCanceledOutcome() {
        val result = IntentMapper.map(
            PaymentIntent(action = DozoContract.ACTION_INGENICO_CANCELED, txnId = "TXN-4"),
            baseUrl
        )
        assertEquals(MappedState.NonApproval(OutcomeKind.CANCELED, "TXN-4", null, null), result)
    }

    @Test
    fun refusedActionMapsToRefusedOutcome() {
        val result = IntentMapper.map(
            PaymentIntent(action = DozoContract.ACTION_FISERV_REFUSED, txnId = "TXN-5"),
            baseUrl
        )
        assertEquals(MappedState.NonApproval(OutcomeKind.REFUSED, "TXN-5", null, null), result)
    }

    @Test
    fun approvedActionMapsToQr() {
        val result = IntentMapper.map(
            PaymentIntent(action = DozoContract.ACTION_INGENICO, reviewUrl = reviewUrl),
            baseUrl
        )
        assertTrue(result is MappedState.Approved)
    }

    @Test
    fun reviewUrlAloneMapsToQr() {
        val result = IntentMapper.map(
            PaymentIntent(reviewUrl = reviewUrl),
            baseUrl
        ) as MappedState.Approved
        assertEquals(reviewUrl, result.payload)
    }

    @Test
    fun terminalIdBuildsRedirectPayload() {
        val result = IntentMapper.map(
            PaymentIntent(status = "APPROVED", terminalId = "T-123", reviewUrl = reviewUrl),
            baseUrl
        ) as MappedState.Approved
        assertEquals("$baseUrl/r/T-123", result.payload)
    }

    @Test
    fun noTerminalIdUsesReviewUrl() {
        val result = IntentMapper.map(
            PaymentIntent(status = "APPROVED", reviewUrl = reviewUrl),
            baseUrl
        ) as MappedState.Approved
        assertEquals(reviewUrl, result.payload)
    }

    @Test
    fun neitherTerminalIdNorReviewUrlUsesDefault() {
        val result = IntentMapper.map(
            PaymentIntent(status = "APPROVED"),
            baseUrl
        ) as MappedState.Approved
        assertEquals(DozoContract.DEFAULT_REVIEW_URL, result.payload)
    }

    @Test
    fun blankTerminalIdFallsBackToReviewUrl() {
        val result = IntentMapper.map(
            PaymentIntent(status = "APPROVED", terminalId = "   ", reviewUrl = reviewUrl),
            baseUrl
        ) as MappedState.Approved
        assertEquals(reviewUrl, result.payload)
    }

    @Test
    fun nonApprovalNeverBuildsPayload() {
        val canceled = IntentMapper.map(
            PaymentIntent(status = "CANCELED", terminalId = "T-123", reviewUrl = reviewUrl),
            baseUrl
        )
        val refused = IntentMapper.map(
            PaymentIntent(status = "REFUSED", terminalId = "T-123", reviewUrl = reviewUrl),
            baseUrl
        )
        assertTrue(canceled is MappedState.NonApproval)
        assertTrue(refused is MappedState.NonApproval)
    }

    @Test
    fun displayTimeoutIsClamped() {
        assertEquals(
            DozoContract.MIN_DISPLAY_TIMEOUT_SECONDS,
            DozoConfig.clampTimeoutSeconds(0)
        )
        assertEquals(
            DozoContract.MIN_DISPLAY_TIMEOUT_SECONDS,
            DozoConfig.clampTimeoutSeconds(DozoContract.MIN_DISPLAY_TIMEOUT_SECONDS - 1)
        )
        assertEquals(15, DozoConfig.clampTimeoutSeconds(15))
        assertEquals(
            DozoContract.MAX_DISPLAY_TIMEOUT_SECONDS,
            DozoConfig.clampTimeoutSeconds(99)
        )
    }

    @Test
    fun noStatusAndNoActionIsIdle() {
        assertEquals(MappedState.Idle, IntentMapper.map(PaymentIntent(), baseUrl))
    }

    @Test
    fun missingTxnIdFallsBackToDefault() {
        val result = IntentMapper.map(
            PaymentIntent(status = "REFUSED"),
            baseUrl
        ) as MappedState.NonApproval
        assertEquals(DozoContract.DEFAULT_TXN_ID, result.txnId)
    }

    @Test
    fun blankReasonBecomesNull() {
        val result = IntentMapper.map(
            PaymentIntent(status = "CANCELED", reason = "   "),
            baseUrl
        ) as MappedState.NonApproval
        assertNull(result.reason)
    }

    @Test
    fun resultCodesMatchContract() {
        assertEquals(1, RESULT_APPROVED)
        assertEquals(2, RESULT_CANCELED)
        assertEquals(3, RESULT_REFUSED)
    }

    @Test
    fun approvedDismissalMapsToApprovedCode() {
        assertEquals(RESULT_APPROVED, DozoContract.resultCodeFor(null))
    }

    @Test
    fun canceledOutcomeMapsToCanceledCode() {
        assertEquals(RESULT_CANCELED, DozoContract.resultCodeFor(OutcomeKind.CANCELED))
    }

    @Test
    fun refusedOutcomeMapsToRefusedCode() {
        assertEquals(RESULT_REFUSED, DozoContract.resultCodeFor(OutcomeKind.REFUSED))
    }

    @Test
    fun nonApprovalExitsSilentlyOnlyInRelease() {
        val canceled = IntentMapper.map(PaymentIntent(status = "CANCELED"), baseUrl)
        assertTrue(canceled.requiresSilentExit(isDebug = false))
        assertEquals(false, canceled.requiresSilentExit(isDebug = true))
    }

    @Test
    fun approvalNeverExitsSilently() {
        val approved = IntentMapper.map(PaymentIntent(status = "APPROVED"), baseUrl)
        assertEquals(false, approved.requiresSilentExit(isDebug = false))
        assertEquals(false, approved.requiresSilentExit(isDebug = true))
    }
}
