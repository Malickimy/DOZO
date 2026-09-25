package com.example.dozo

data class PaymentIntent(
    val action: String? = null,
    val status: String? = null,
    val reviewUrl: String? = null,
    val txnId: String? = null,
    val amountCents: Int? = null,
    val reason: String? = null,
    val merchantId: String? = null,
    val terminalId: String? = null
)

sealed interface MappedState {
    data object Idle : MappedState

    data class Approved(
        val payload: String,
        val txnId: String,
        val amountCents: Int?
    ) : MappedState

    data object Silent : MappedState
}

sealed interface LaunchDecision {
    data object ShowIdle : LaunchDecision
    data object ShowQr : LaunchDecision
    data object ExitApproved : LaunchDecision
    data object ExitSilent : LaunchDecision
}

fun launchDecisionFor(mapped: MappedState, activated: Boolean): LaunchDecision = when (mapped) {
    is MappedState.Idle -> LaunchDecision.ShowIdle
    is MappedState.Approved ->
        if (activated) LaunchDecision.ShowQr else LaunchDecision.ExitApproved
    is MappedState.Silent -> LaunchDecision.ExitSilent
}


object IntentMapper {

    fun map(
        intent: PaymentIntent,
        redirectBaseUrl: String,
        staticReviewUrl: String? = null,
        googlePlaceId: String? = null,
        serverHealthy: Boolean = true
    ): MappedState {
        val txnId = intent.txnId?.takeIf { it.isNotBlank() } ?: DozoContract.DEFAULT_TXN_ID
        val amountCents = intent.amountCents
        val reviewUrl = intent.reviewUrl?.takeIf { it.isNotBlank() }
        val terminalId = intent.terminalId?.takeIf { it.isNotBlank() }

        fun approved(): MappedState.Approved = MappedState.Approved(
            payload = payloadFor(
                terminalId = terminalId,
                reviewUrl = reviewUrl,
                redirectBaseUrl = redirectBaseUrl,
                staticReviewUrl = staticReviewUrl,
                googlePlaceId = googlePlaceId,
                serverHealthy = serverHealthy
            ),
            txnId = txnId,
            amountCents = amountCents
        )

        val status = intent.status?.trim()?.takeIf { it.isNotEmpty() }?.uppercase()
        if (status != null) {
            return when (status) {
                DozoContract.STATUS_APPROVED -> approved()
                else -> MappedState.Silent
            }
        }

        return when (intent.action) {
            DozoContract.ACTION_FISERV,
            DozoContract.ACTION_INGENICO -> approved()
            DozoContract.ACTION_FISERV_CANCELED,
            DozoContract.ACTION_INGENICO_CANCELED,
            DozoContract.ACTION_FISERV_REFUSED,
            DozoContract.ACTION_INGENICO_REFUSED -> MappedState.Silent
            else -> MappedState.Idle
        }
    }

    private fun payloadFor(
        terminalId: String?,
        reviewUrl: String?,
        redirectBaseUrl: String,
        staticReviewUrl: String?,
        googlePlaceId: String?,
        serverHealthy: Boolean
    ): String {
        val primaryUrl = terminalId?.let { "$redirectBaseUrl/r/$it" }
        return QrPayloadResolver.resolve(
            primaryUrl = primaryUrl,
            serverHealthy = serverHealthy,
            staticReviewUrl = staticReviewUrl,
            googlePlaceId = googlePlaceId,
            intentReviewUrl = reviewUrl
        )
    }
}
