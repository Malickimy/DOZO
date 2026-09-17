package com.example.dozo.ui

import androidx.compose.ui.graphics.ImageBitmap

sealed interface UiState {
    data object Idle : UiState

    data class DisplayQr(
        val bitmap: ImageBitmap,
        val txnId: String
    ) : UiState
}
