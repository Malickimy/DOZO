package com.example.dozo

import org.junit.Assert.assertEquals
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
    fun canceledStatusIsSilent() {
        val result = IntentMapper.map(
            PaymentIntent(status = "CANCELED", txnId = "TXN-2", amountCents = 500, reason = "Cashier void"),
            baseUrl
        )
        assertEquals(MappedState.Silent, result)
    }

    @Test
    fun refusedStatusIsSilent() {
        val result = IntentMapper.map(
            PaymentIntent(status = "REFUSED", txnId = "TXN-3", reason = "Insufficient funds"),
            baseUrl
        )
        assertEquals(MappedState.Silent, result)
    }

    @Test
    fun unknownStatusIsSilent() {
        val result = IntentMapper.map(
            PaymentIntent(status = "SOMETHING_ELSE", reviewUrl = reviewUrl),
            baseUrl
        )
        assertEquals(MappedState.Silent, result)
    }

    @Test
    fun reviewUrlAloneIsNotApproval() {
        val result = IntentMapper.map(
            PaymentIntent(reviewUrl = reviewUrl),
            baseUrl
        )
        assertEquals(MappedState.Idle, result)
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
    fun canceledActionIsSilent() {
        val result = IntentMapper.map(
            PaymentIntent(action = DozoContract.ACTION_INGENICO_CANCELED, txnId = "TXN-4"),
            baseUrl
        )
        assertEquals(MappedState.Silent, result)
    }

    @Test
    fun refusedActionIsSilent() {
        val result = IntentMapper.map(
            PaymentIntent(action = DozoContract.ACTION_FISERV_REFUSED, txnId = "TXN-5"),
            baseUrl
        )
        assertEquals(MappedState.Silent, result)
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
    fun approvedActionWithoutUrlFallsBackToDefault() {
        val result = IntentMapper.map(
            PaymentIntent(action = DozoContract.ACTION_FISERV),
            baseUrl
        ) as MappedState.Approved
        assertEquals(DozoContract.DEFAULT_REVIEW_URL, result.payload)
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
    fun nonApprovalIsSilentEvenWithTerminalIdAndUrl() {
        val canceled = IntentMapper.map(
            PaymentIntent(status = "CANCELED", terminalId = "T-123", reviewUrl = reviewUrl),
            baseUrl
        )
        val refused = IntentMapper.map(
            PaymentIntent(status = "REFUSED", terminalId = "T-123", reviewUrl = reviewUrl),
            baseUrl
        )
        assertEquals(MappedState.Silent, canceled)
        assertEquals(MappedState.Silent, refused)
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
    fun missingTxnIdOnApprovedFallsBackToDefault() {
        val result = IntentMapper.map(
            PaymentIntent(status = "APPROVED"),
            baseUrl
        ) as MappedState.Approved
        assertEquals(DozoContract.DEFAULT_TXN_ID, result.txnId)
    }

    @Test
    fun resultCodesMatchContract() {
        assertEquals(1, RESULT_APPROVED)
    }

    @Test
    fun idleLaunchShowsIdle() {
        assertEquals(
            LaunchDecision.ShowIdle,
            launchDecisionFor(MappedState.Idle, activated = true)
        )
        assertEquals(
            LaunchDecision.ShowIdle,
            launchDecisionFor(MappedState.Idle, activated = false)
        )
    }

    @Test
    fun approvedAndActivatedShowsQr() {
        assertEquals(
            LaunchDecision.ShowQr,
            launchDecisionFor(MappedState.Approved("p", "t", null), activated = true)
        )
    }

    @Test
    fun approvedAndInactiveStillExitsApproved() {
        assertEquals(
            LaunchDecision.ExitApproved,
            launchDecisionFor(MappedState.Approved("p", "t", null), activated = false)
        )
    }

    @Test
    fun silentAlwaysExitsSilently() {
        assertEquals(
            LaunchDecision.ExitSilent,
            launchDecisionFor(MappedState.Silent, activated = true)
        )
        assertEquals(
            LaunchDecision.ExitSilent,
            launchDecisionFor(MappedState.Silent, activated = false)
        )
    }

    @Test
    fun everyCanceledAndRefusedActionIsSilent() {
        val silentActions = listOf(
            DozoContract.ACTION_FISERV_CANCELED,
            DozoContract.ACTION_INGENICO_CANCELED,
            DozoContract.ACTION_FISERV_REFUSED,
            DozoContract.ACTION_INGENICO_REFUSED
        )
        silentActions.forEach { action ->
            assertEquals(
                action,
                MappedState.Silent,
                IntentMapper.map(PaymentIntent(action = action, reviewUrl = reviewUrl), baseUrl)
            )
        }
    }

    @Test
    fun blankStatusWithCanceledActionIsSilent() {
        val result = IntentMapper.map(
            PaymentIntent(
                action = DozoContract.ACTION_FISERV_CANCELED,
                status = "   ",
                txnId = "TXN-6",
                reviewUrl = reviewUrl
            ),
            baseUrl
        )
        assertEquals(MappedState.Silent, result)
    }

    @Test
    fun blankStatusWithRefusedActionIsSilent() {
        val result = IntentMapper.map(
            PaymentIntent(
                action = DozoContract.ACTION_INGENICO_REFUSED,
                status = "",
                reviewUrl = reviewUrl
            ),
            baseUrl
        )
        assertEquals(MappedState.Silent, result)
    }

    @Test
    fun blankStatusWithNoActionIsIdle() {
        assertEquals(
            MappedState.Idle,
            IntentMapper.map(PaymentIntent(status = "   ", reviewUrl = reviewUrl), baseUrl)
        )
    }

    @Test
    fun unknownStatusOverridesApprovedAction() {
        val result = IntentMapper.map(
            PaymentIntent(
                action = DozoContract.ACTION_FISERV,
                status = "PENDING",
                reviewUrl = reviewUrl
            ),
            baseUrl
        )
        assertEquals(MappedState.Silent, result)
    }

    @Test
    fun approvedStatusOverridesCanceledAction() {
        val result = IntentMapper.map(
            PaymentIntent(
                action = DozoContract.ACTION_FISERV_CANCELED,
                status = "APPROVED",
                reviewUrl = reviewUrl,
                txnId = "TXN-7"
            ),
            baseUrl
        )
        assertEquals(MappedState.Approved(reviewUrl, "TXN-7", null), result)
    }

    @Test
    fun canceledStatusOverridesApprovedAction() {
        val result = IntentMapper.map(
            PaymentIntent(
                action = DozoContract.ACTION_INGENICO,
                status = "CANCELED",
                reviewUrl = reviewUrl
            ),
            baseUrl
        )
        assertEquals(MappedState.Silent, result)
    }

    @Test
    fun canceledAndRefusedStatusAreCaseInsensitive() {
        assertEquals(
            MappedState.Silent,
            IntentMapper.map(PaymentIntent(status = "canceled", reviewUrl = reviewUrl), baseUrl)
        )
        assertEquals(
            MappedState.Silent,
            IntentMapper.map(PaymentIntent(status = " refused ", reviewUrl = reviewUrl), baseUrl)
        )
    }

    @Test
    fun reviewUrlWithCanceledActionIsSilent() {
        val result = IntentMapper.map(
            PaymentIntent(action = DozoContract.ACTION_INGENICO_CANCELED, reviewUrl = reviewUrl),
            baseUrl
        )
        assertEquals(MappedState.Silent, result)
    }

    @Test
    fun reviewUrlWithUnknownStatusIsSilent() {
        val result = IntentMapper.map(
            PaymentIntent(status = "DECLINED", reviewUrl = reviewUrl),
            baseUrl
        )
        assertEquals(MappedState.Silent, result)
    }

    @Test
    fun launcherActionWithoutStatusIsIdle() {
        assertEquals(
            MappedState.Idle,
            IntentMapper.map(
                PaymentIntent(action = "android.intent.action.MAIN", reviewUrl = reviewUrl),
                baseUrl
            )
        )
    }

    @Test
    fun blankReviewUrlFallsBackToDefault() {
        val result = IntentMapper.map(
            PaymentIntent(status = "APPROVED", reviewUrl = "   "),
            baseUrl
        ) as MappedState.Approved
        assertEquals(DozoContract.DEFAULT_REVIEW_URL, result.payload)
    }

    @Test
    fun blankTerminalIdWithoutReviewUrlUsesDefault() {
        val result = IntentMapper.map(
            PaymentIntent(status = "APPROVED", terminalId = "   "),
            baseUrl
        ) as MappedState.Approved
        assertEquals(DozoContract.DEFAULT_REVIEW_URL, result.payload)
    }

    @Test
    fun blankTxnIdOnApprovedFallsBackToDefault() {
        val result = IntentMapper.map(
            PaymentIntent(status = "APPROVED", txnId = "   "),
            baseUrl
        ) as MappedState.Approved
        assertEquals(DozoContract.DEFAULT_TXN_ID, result.txnId)
    }

    @Test
    fun approvedWithoutAmountHasNullAmount() {
        val result = IntentMapper.map(
            PaymentIntent(status = "APPROVED", reviewUrl = reviewUrl),
            baseUrl
        ) as MappedState.Approved
        assertEquals(null, result.amountCents)
    }

    @Test
    fun approvedWithNegativeAmountIsPreserved() {
        val result = IntentMapper.map(
            PaymentIntent(status = "APPROVED", reviewUrl = reviewUrl, amountCents = -1),
            baseUrl
        ) as MappedState.Approved
        assertEquals(-1, result.amountCents)
    }
}
