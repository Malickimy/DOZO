package com.example.papier.ui

import androidx.compose.ui.graphics.ImageBitmap

sealed interface UiState {
    data object Idle : UiState

    data class DisplayQr(
        val bitmap: ImageBitmap,
        val txnId: String,
        val amountCents: Int? = null
    ) : UiState

    data class Outcome(
        val kind: OutcomeKind,
        val txnId: String,
        val amountCents: Int? = null,
        val reason: String? = null
    ) : UiState
}

enum class OutcomeKind { CANCELED, REFUSED }
