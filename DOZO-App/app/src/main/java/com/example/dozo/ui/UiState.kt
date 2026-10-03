package com.example.dozo.ui

import androidx.compose.ui.graphics.ImageBitmap
import com.example.dozo.QrSource

sealed interface UiState {
    data object Idle : UiState

    data class DisplayQr(
        val bitmap: ImageBitmap,
        val txnId: String,
        val source: QrSource? = null
    ) : UiState
}
