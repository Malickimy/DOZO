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

    fun applyClaimed(
        context: Context,
        terminalId: String,
        apiToken: String,
        redirectBaseUrl: String
    ) {
        edit(context)
            .putString(DozoContract.KEY_TERMINAL_ID, terminalId)
            .putString(DozoContract.KEY_API_TOKEN, apiToken)
            .putString(DozoContract.KEY_REDIRECT_BASE_URL, redirectBaseUrl)
            .putBoolean(DozoContract.KEY_ACTIVATED, true)
            .apply()
    }

    fun wipe(context: Context) {
        edit(context)
            .remove(DozoContract.KEY_PAIRING_CODE)
            .remove(DozoContract.KEY_TERMINAL_ID)
            .remove(DozoContract.KEY_API_TOKEN)
            .putBoolean(DozoContract.KEY_ACTIVATED, false)
            .apply()
    }

    fun clampTimeoutSeconds(value: Int): Int =
        value.coerceIn(
            DozoContract.MIN_DISPLAY_TIMEOUT_SECONDS,
            DozoContract.MAX_DISPLAY_TIMEOUT_SECONDS
        )

    private fun prefs(context: Context) =
        context.getSharedPreferences(DozoContract.PREFS_NAME, Context.MODE_PRIVATE)

    private fun edit(context: Context) = prefs(context).edit()
}
