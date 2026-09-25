package com.example.dozo

/**
 * Pure rules behind the `dozo_prefs` settings. Kept free of Android types so the
 * persistence mapping can be unit-tested on the JVM (no Robolectric).
 */
object SettingsPersistence {

    data class RedeemPrefs(
        val terminalId: String,
        val apiToken: String,
        val redirectBaseUrl: String,
        val googlePlaceId: String? = null,
        val staticReviewUrl: String? = null
    )

    /**
     * Maps a model-B `POST /api/terminals/redeem` success into the values written to
     * `dozo_prefs`. `terminal_id` comes from `store.terminal_id`; the QR redirect base
     * is derived from `store.redirect_url`.
     */
    fun redeemPrefs(apiToken: String, store: StoreConfig): RedeemPrefs = RedeemPrefs(
        terminalId = store.terminalId,
        apiToken = apiToken,
        redirectBaseUrl = deriveRedirectBaseUrl(store.redirectUrl, store.terminalId),
        googlePlaceId = store.googlePlaceId,
        staticReviewUrl = store.staticReviewUrl
    )

    fun normalizeLanguage(value: String?): String =
        if (Language.isSupported(value)) value!! else Language.DEFAULT

    fun clampTimeoutSeconds(value: Int): Int =
        value.coerceIn(
            DozoContract.MIN_DISPLAY_TIMEOUT_SECONDS,
            DozoContract.MAX_DISPLAY_TIMEOUT_SECONDS
        )
}
