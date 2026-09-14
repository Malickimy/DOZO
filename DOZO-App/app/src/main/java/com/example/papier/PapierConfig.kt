package com.example.papier

import android.content.Context

object PapierConfig {

    fun isActivated(context: Context): Boolean {
        val prefs = prefs(context)
        return prefs.getBoolean(PapierContract.KEY_ACTIVATED, true) &&
            prefs.getBoolean(PapierContract.KEY_DISPLAY_ENABLED, true)
    }

    fun isDisplayEnabled(context: Context): Boolean =
        prefs(context).getBoolean(PapierContract.KEY_DISPLAY_ENABLED, true)

    fun isActivationEnabled(context: Context): Boolean =
        prefs(context).getBoolean(PapierContract.KEY_ACTIVATED, true)

    fun redirectBaseUrl(context: Context): String =
        prefs(context).getString(PapierContract.KEY_REDIRECT_BASE_URL, null)
            ?.takeIf { it.isNotBlank() }
            ?: PapierContract.DEFAULT_REDIRECT_BASE_URL

    fun displayTimeoutSeconds(context: Context): Int =
        clampTimeoutSeconds(
            prefs(context).getInt(
                PapierContract.KEY_DISPLAY_TIMEOUT_SECONDS,
                PapierContract.DEFAULT_DISPLAY_TIMEOUT_SECONDS
            )
        )

    fun apiBaseUrl(context: Context): String =
        prefs(context).getString(PapierContract.KEY_API_BASE_URL, null)
            ?.takeIf { it.isNotBlank() }
            ?: PapierContract.DEFAULT_API_BASE_URL

    fun apiToken(context: Context): String =
        prefs(context).getString(PapierContract.KEY_API_TOKEN, null)
            ?.takeIf { it.isNotBlank() }
            ?: PapierContract.DEFAULT_API_TOKEN

    fun terminalId(context: Context): String? =
        prefs(context).getString(PapierContract.KEY_TERMINAL_ID, null)
            ?.takeIf { it.isNotBlank() }

    fun merchantId(context: Context): String =
        prefs(context).getString(PapierContract.KEY_MERCHANT_ID, null)
            ?.takeIf { it.isNotBlank() }
            ?: PapierContract.DEFAULT_MERCHANT_ID

    fun pairingCode(context: Context): String? =
        prefs(context).getString(PapierContract.KEY_PAIRING_CODE, null)
            ?.takeIf { it.isNotBlank() }

    fun pin(context: Context): String =
        prefs(context).getString(PapierContract.KEY_PIN, null)
            ?.takeIf { it.isNotBlank() }
            ?: PapierContract.DEFAULT_PIN

    fun setActivated(context: Context, value: Boolean) {
        edit(context).putBoolean(PapierContract.KEY_ACTIVATED, value).apply()
    }

    fun setDisplayEnabled(context: Context, value: Boolean) {
        edit(context).putBoolean(PapierContract.KEY_DISPLAY_ENABLED, value).apply()
    }

    fun setDisplayTimeoutSeconds(context: Context, value: Int) {
        edit(context)
            .putInt(PapierContract.KEY_DISPLAY_TIMEOUT_SECONDS, clampTimeoutSeconds(value))
            .apply()
    }

    fun setRedirectBaseUrl(context: Context, value: String) {
        edit(context).putString(PapierContract.KEY_REDIRECT_BASE_URL, value).apply()
    }

    fun setApiBaseUrl(context: Context, value: String) {
        edit(context).putString(PapierContract.KEY_API_BASE_URL, value).apply()
    }

    fun setTerminalId(context: Context, value: String) {
        edit(context).putString(PapierContract.KEY_TERMINAL_ID, value).apply()
    }

    fun setMerchantId(context: Context, value: String) {
        edit(context).putString(PapierContract.KEY_MERCHANT_ID, value).apply()
    }

    fun setApiToken(context: Context, value: String) {
        edit(context).putString(PapierContract.KEY_API_TOKEN, value).apply()
    }

    fun setPairingCode(context: Context, value: String) {
        edit(context).putString(PapierContract.KEY_PAIRING_CODE, value).apply()
    }

    fun setPin(context: Context, value: String) {
        edit(context).putString(PapierContract.KEY_PIN, value).apply()
    }

    fun applyClaimed(
        context: Context,
        terminalId: String,
        apiToken: String,
        redirectBaseUrl: String
    ) {
        edit(context)
            .putString(PapierContract.KEY_TERMINAL_ID, terminalId)
            .putString(PapierContract.KEY_API_TOKEN, apiToken)
            .putString(PapierContract.KEY_REDIRECT_BASE_URL, redirectBaseUrl)
            .putBoolean(PapierContract.KEY_ACTIVATED, true)
            .apply()
    }

    fun wipe(context: Context) {
        edit(context)
            .remove(PapierContract.KEY_PAIRING_CODE)
            .remove(PapierContract.KEY_TERMINAL_ID)
            .remove(PapierContract.KEY_API_TOKEN)
            .putBoolean(PapierContract.KEY_ACTIVATED, false)
            .apply()
    }

    fun clampTimeoutSeconds(value: Int): Int =
        value.coerceIn(
            PapierContract.MIN_DISPLAY_TIMEOUT_SECONDS,
            PapierContract.MAX_DISPLAY_TIMEOUT_SECONDS
        )

    private fun prefs(context: Context) =
        context.getSharedPreferences(PapierContract.PREFS_NAME, Context.MODE_PRIVATE)

    private fun edit(context: Context) = prefs(context).edit()
}
