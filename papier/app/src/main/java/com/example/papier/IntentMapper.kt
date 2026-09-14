package com.example.papier

import com.example.papier.ui.OutcomeKind

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

    data class NonApproval(
        val kind: OutcomeKind,
        val txnId: String,
        val amountCents: Int?,
        val reason: String?
    ) : MappedState
}

fun MappedState.requiresSilentExit(isDebug: Boolean): Boolean =
    this is MappedState.NonApproval && !isDebug

object IntentMapper {

    fun map(intent: PaymentIntent, redirectBaseUrl: String): MappedState {
        val txnId = intent.txnId?.takeIf { it.isNotBlank() } ?: PapierContract.DEFAULT_TXN_ID
        val amountCents = intent.amountCents
        val reason = intent.reason?.takeIf { it.isNotBlank() }
        val reviewUrl = intent.reviewUrl?.takeIf { it.isNotBlank() }
        val terminalId = intent.terminalId?.takeIf { it.isNotBlank() }

        fun approved(): MappedState.Approved = MappedState.Approved(
            payload = payloadFor(terminalId, reviewUrl, redirectBaseUrl),
            txnId = txnId,
            amountCents = amountCents
        )

        val status = intent.status?.trim()?.takeIf { it.isNotEmpty() }?.uppercase()
        if (status != null) {
            return when (status) {
                PapierContract.STATUS_APPROVED -> approved()
                PapierContract.STATUS_CANCELED -> MappedState.NonApproval(
                    kind = OutcomeKind.CANCELED,
                    txnId = txnId,
                    amountCents = amountCents,
                    reason = reason
                )
                else -> MappedState.NonApproval(
                    kind = OutcomeKind.REFUSED,
                    txnId = txnId,
                    amountCents = amountCents,
                    reason = reason
                )
            }
        }

        val action = intent.action
        return when {
            action == PapierContract.ACTION_FISERV_CANCELED ||
                action == PapierContract.ACTION_INGENICO_CANCELED -> MappedState.NonApproval(
                kind = OutcomeKind.CANCELED,
                txnId = txnId,
                amountCents = amountCents,
                reason = reason
            )
            action == PapierContract.ACTION_FISERV_REFUSED ||
                action == PapierContract.ACTION_INGENICO_REFUSED -> MappedState.NonApproval(
                kind = OutcomeKind.REFUSED,
                txnId = txnId,
                amountCents = amountCents,
                reason = reason
            )
            action == PapierContract.ACTION_FISERV ||
                action == PapierContract.ACTION_INGENICO ||
                reviewUrl != null -> approved()
            else -> MappedState.Idle
        }
    }

    private fun payloadFor(
        terminalId: String?,
        reviewUrl: String?,
        redirectBaseUrl: String
    ): String = when {
        terminalId != null -> "$redirectBaseUrl/r/$terminalId"
        reviewUrl != null -> reviewUrl
        else -> PapierContract.DEFAULT_REVIEW_URL
    }
}
