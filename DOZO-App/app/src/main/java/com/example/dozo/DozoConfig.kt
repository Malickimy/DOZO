package com.example.dozo

import android.content.Context

object DozoConfig {

    fun isActivated(context: Context): Boolean {
        val prefs = prefs(context)
        return prefs.getBoolean(DozoContract.KEY_ACTIVATED, true) &&
            prefs.getBoolean(DozoContract.KEY_DISPLAY_ENABLED, true)
    }

    fun isDisplayEnabled(context: Context): Boolean =
        prefs(context).getBoolean(DozoContract.KEY_DISPLAY_ENABLED, true)

    fun isActivationEnabled(context: Context): Boolean =
        prefs(context).getBoolean(DozoContract.KEY_ACTIVATED, true)

    fun redirectBaseUrl(context: Context): String =
        prefs(context).getString(DozoContract.KEY_REDIRECT_BASE_URL, null)
            ?.takeIf { it.isNotBlank() }
            ?: DozoContract.DEFAULT_REDIRECT_BASE_URL

    fun displayTimeoutSeconds(context: Context): Int =
        clampTimeoutSeconds(
            prefs(context).getInt(
                DozoContract.KEY_DISPLAY_TIMEOUT_SECONDS,
                DozoContract.DEFAULT_DISPLAY_TIMEOUT_SECONDS
            )
        )

    fun isAutoCloseEnabled(context: Context): Boolean =
        prefs(context).getBoolean(DozoContract.KEY_AUTO_CLOSE, true)

    fun apiBaseUrl(context: Context): String =
        prefs(context).getString(DozoContract.KEY_API_BASE_URL, null)
            ?.takeIf { it.isNotBlank() }
            ?: DozoContract.DEFAULT_API_BASE_URL

    fun apiToken(context: Context): String =
        prefs(context).getString(DozoContract.KEY_API_TOKEN, null)
            ?.takeIf { it.isNotBlank() }
            ?: DozoContract.DEFAULT_API_TOKEN

    fun terminalId(context: Context): String? =
        prefs(context).getString(DozoContract.KEY_TERMINAL_ID, null)
            ?.takeIf { it.isNotBlank() }

    fun merchantId(context: Context): String =
        prefs(context).getString(DozoContract.KEY_MERCHANT_ID, null)
            ?.takeIf { it.isNotBlank() }
            ?: DozoContract.DEFAULT_MERCHANT_ID

    fun language(context: Context): String =
        SettingsPersistence.normalizeLanguage(prefs(context).getString(DozoContract.KEY_LANGUAGE, null))

    fun merchantName(context: Context): String? =
        prefs(context).getString(DozoContract.KEY_MERCHANT_NAME, null)
            ?.takeIf { it.isNotBlank() }

    fun promptText(context: Context): String? =
        prefs(context).getString(DozoContract.KEY_PROMPT_TEXT, null)
            ?.takeIf { it.isNotBlank() }

    fun pairingCode(context: Context): String? =
        prefs(context).getString(DozoContract.KEY_PAIRING_CODE, null)
            ?.takeIf { it.isNotBlank() }

    fun pin(context: Context): String =
        prefs(context).getString(DozoContract.KEY_PIN, null)
            ?.takeIf { it.isNotBlank() }
            ?: DozoContract.DEFAULT_PIN

    fun googlePlaceId(context: Context): String? =
        prefs(context).getString(DozoContract.KEY_GOOGLE_PLACE_ID, null)
            ?.takeIf { it.isNotBlank() }

    fun staticReviewUrl(context: Context): String? =
        prefs(context).getString(DozoContract.KEY_STATIC_REVIEW_URL, null)
            ?.takeIf { it.isNotBlank() }

    fun setActivated(context: Context, value: Boolean) {
        edit(context).putBoolean(DozoContract.KEY_ACTIVATED, value).apply()
    }

    fun setDisplayEnabled(context: Context, value: Boolean) {
        edit(context).putBoolean(DozoContract.KEY_DISPLAY_ENABLED, value).apply()
    }

    fun setDisplayTimeoutSeconds(context: Context, value: Int) {
        edit(context)
            .putInt(DozoContract.KEY_DISPLAY_TIMEOUT_SECONDS, clampTimeoutSeconds(value))
            .apply()
    }

    fun setAutoCloseEnabled(context: Context, value: Boolean) {
        edit(context).putBoolean(DozoContract.KEY_AUTO_CLOSE, value).apply()
    }

    fun setRedirectBaseUrl(context: Context, value: String) {
        edit(context).putString(DozoContract.KEY_REDIRECT_BASE_URL, value).apply()
    }

    fun setApiBaseUrl(context: Context, value: String) {
        edit(context).putString(DozoContract.KEY_API_BASE_URL, value).apply()
    }

    fun setTerminalId(context: Context, value: String) {
        edit(context).putString(DozoContract.KEY_TERMINAL_ID, value).apply()
    }

    fun setMerchantId(context: Context, value: String) {
        edit(context).putString(DozoContract.KEY_MERCHANT_ID, value).apply()
    }

    fun setApiToken(context: Context, value: String) {
        edit(context).putString(DozoContract.KEY_API_TOKEN, value).apply()
    }

    fun setLanguage(context: Context, value: String) {
        val normalized = SettingsPersistence.normalizeLanguage(value)
        edit(context).putString(DozoContract.KEY_LANGUAGE, normalized).apply()
    }

    fun setMerchantName(context: Context, value: String) {
        edit(context).putString(DozoContract.KEY_MERCHANT_NAME, value).apply()
    }

    fun setPromptText(context: Context, value: String) {
        edit(context).putString(DozoContract.KEY_PROMPT_TEXT, value).apply()
    }

    fun setPairingCode(context: Context, value: String) {
        edit(context).putString(DozoContract.KEY_PAIRING_CODE, value).apply()
    }

    fun setPin(context: Context, value: String) {
        edit(context).putString(DozoContract.KEY_PIN, value).apply()
    }

    fun setGooglePlaceId(context: Context, value: String) {
        edit(context).putString(DozoContract.KEY_GOOGLE_PLACE_ID, value).apply()
    }

    fun setStaticReviewUrl(context: Context, value: String) {
        edit(context).putString(DozoContract.KEY_STATIC_REVIEW_URL, value).apply()
    }

    fun applyClaimed(
        context: Context,
        terminalId: String,
        apiToken: String,
        redirectBaseUrl: String,
        googlePlaceId: String? = null,
        staticReviewUrl: String? = null
    ) {
        edit(context)
            .putString(DozoContract.KEY_TERMINAL_ID, terminalId)
            .putString(DozoContract.KEY_API_TOKEN, apiToken)
            .putString(DozoContract.KEY_REDIRECT_BASE_URL, redirectBaseUrl)
            .putBoolean(DozoContract.KEY_ACTIVATED, true)
            .apply()
        googlePlaceId?.takeIf { it.isNotBlank() }?.let { setGooglePlaceId(context, it) }
        staticReviewUrl?.takeIf { it.isNotBlank() }?.let { setStaticReviewUrl(context, it) }
    }

    /**
     * Persists the last-known server config (App Sprint 4). Only the contract
     * keys are written; the QR base has `/r/{id}` stripped when present.
     */
    fun applyRemoteConfig(context: Context, config: TerminalConfig, terminalId: String) {
        edit(context)
            .putBoolean(DozoContract.KEY_DISPLAY_ENABLED, config.displayEnabled)
            .putInt(
                DozoContract.KEY_DISPLAY_TIMEOUT_SECONDS,
                clampTimeoutSeconds(config.displayTimeoutSeconds)
            )
            .putString(
                DozoContract.KEY_REDIRECT_BASE_URL,
                deriveRedirectBaseUrl(config.redirectBaseUrl, terminalId)
            )
            .apply()
        config.googlePlaceId?.takeIf { it.isNotBlank() }?.let { setGooglePlaceId(context, it) }
        config.staticReviewUrl?.takeIf { it.isNotBlank() }?.let { setStaticReviewUrl(context, it) }
    }

    fun wipe(context: Context) {
        edit(context)
            .remove(DozoContract.KEY_PAIRING_CODE)
            .remove(DozoContract.KEY_TERMINAL_ID)
            .remove(DozoContract.KEY_API_TOKEN)
            .remove(DozoContract.KEY_GOOGLE_PLACE_ID)
            .remove(DozoContract.KEY_STATIC_REVIEW_URL)
            .putBoolean(DozoContract.KEY_ACTIVATED, false)
            .apply()
    }

    fun clampTimeoutSeconds(value: Int): Int =
        SettingsPersistence.clampTimeoutSeconds(value)

    private fun prefs(context: Context) =
        context.getSharedPreferences(DozoContract.PREFS_NAME, Context.MODE_PRIVATE)

    private fun edit(context: Context) = prefs(context).edit()
}
