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

    /** App-only developer mode: surfaces the [QrSource] behind the review QR. */
    fun isDeveloperMode(context: Context): Boolean =
        prefs(context).getBoolean(DozoContract.KEY_DEVELOPER_MODE, false)

    /** QR reveal animation toggle; defaults ON so the reveal plays out of the box. */
    fun isQrAnimationEnabled(context: Context): Boolean =
        SettingsPersistence.normalizeQrAnimation(
            prefs(context).getBoolean(DozoContract.KEY_QR_ANIMATION, true)
        )

    /** Persisted accent token (see [AccentToken]); always normalised to a preset. */
    fun accentToken(context: Context): String =
        SettingsPersistence.normalizeAccent(
            prefs(context).getString(DozoContract.KEY_ACCENT, null)
        )

    fun apiBaseUrl(context: Context): String =
        prefs(context).getString(DozoContract.KEY_API_BASE_URL, null)
            ?.takeIf { it.isNotBlank() }
            ?: DozoContract.DEFAULT_API_BASE_URL

    fun apiToken(context: Context): String =
        prefs(context).getString(DozoContract.KEY_API_TOKEN, null)
            ?.takeIf { it.isNotBlank() }
            ?: DozoContract.DEFAULT_API_TOKEN

    /** True only when a token has actually been persisted (R6 re-pair signal). */
    fun hasStoredApiToken(context: Context): Boolean =
        ApiTokenGate.hasStored(prefs(context).getString(DozoContract.KEY_API_TOKEN, null))

    /**
     * #58: background/manual API calls skip silently when `terminal_id` or a
     * persisted token is absent. `DozoContract.DEFAULT_API_TOKEN` is a non-blank
     * placeholder, so the old `apiToken().isBlank()` guard can never detect an
     * unpaired terminal; this gates on the stored token instead.
     */
    fun shouldSkipApiCall(context: Context): Boolean =
        ApiTokenGate.shouldSkip(terminalId(context), hasStoredApiToken(context))

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

    fun lastHeartbeat(context: Context): ConnectionStatus.Snapshot =
        readSnapshot(
            context,
            DozoContract.KEY_LAST_HEARTBEAT_AT,
            DozoContract.KEY_LAST_HEARTBEAT_RESULT
        )

    fun lastConfigSync(context: Context): ConnectionStatus.Snapshot =
        readSnapshot(
            context,
            DozoContract.KEY_LAST_CONFIG_SYNC_AT,
            DozoContract.KEY_LAST_CONFIG_SYNC_RESULT
        )

    /** Records the outcome of a real heartbeat attempt (skip included). */
    fun recordHeartbeat(context: Context, outcome: ConnectionStatus.Outcome) {
        writeSnapshot(
            context,
            DozoContract.KEY_LAST_HEARTBEAT_AT,
            DozoContract.KEY_LAST_HEARTBEAT_RESULT,
            outcome
        )
    }

    /** Records the outcome of a real config-sync attempt (skip included). */
    fun recordConfigSync(context: Context, outcome: ConnectionStatus.Outcome) {
        writeSnapshot(
            context,
            DozoContract.KEY_LAST_CONFIG_SYNC_AT,
            DozoContract.KEY_LAST_CONFIG_SYNC_RESULT,
            outcome
        )
    }

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

    fun setDeveloperMode(context: Context, value: Boolean) {
        edit(context).putBoolean(DozoContract.KEY_DEVELOPER_MODE, value).apply()
    }

    fun setQrAnimationEnabled(context: Context, value: Boolean) {
        edit(context).putBoolean(DozoContract.KEY_QR_ANIMATION, value).apply()
    }

    fun setAccentToken(context: Context, value: String) {
        val normalized = SettingsPersistence.normalizeAccent(value)
        edit(context).putString(DozoContract.KEY_ACCENT, normalized).apply()
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

    /** R6: a `401` invalidates the per-terminal token, forcing a re-pair. */
    fun clearApiToken(context: Context) {
        edit(context).remove(DozoContract.KEY_API_TOKEN).apply()
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
            .remove(DozoContract.KEY_TERMINAL_ID)
            .remove(DozoContract.KEY_API_TOKEN)
            .remove(DozoContract.KEY_GOOGLE_PLACE_ID)
            .remove(DozoContract.KEY_STATIC_REVIEW_URL)
            .putBoolean(DozoContract.KEY_ACTIVATED, false)
            .apply()
    }

    fun clampTimeoutSeconds(value: Int): Int =
        SettingsPersistence.clampTimeoutSeconds(value)

    private fun readSnapshot(
        context: Context,
        atKey: String,
        outcomeKey: String
    ): ConnectionStatus.Snapshot {
        val prefs = prefs(context)
        val at = prefs.getLong(atKey, 0L)
        val outcome = ConnectionStatus.outcomeFromName(prefs.getString(outcomeKey, null))
        return if (at > 0L && outcome != null) {
            ConnectionStatus.Snapshot(atMillis = at, outcome = outcome)
        } else {
            ConnectionStatus.Never
        }
    }

    private fun writeSnapshot(
        context: Context,
        atKey: String,
        outcomeKey: String,
        outcome: ConnectionStatus.Outcome,
        atMillis: Long = System.currentTimeMillis()
    ) {
        edit(context)
            .putLong(atKey, atMillis)
            .putString(outcomeKey, outcome.name)
            .apply()
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences(DozoContract.PREFS_NAME, Context.MODE_PRIVATE)

    private fun edit(context: Context) = prefs(context).edit()
}

/**
 * #58: `DozoContract.DEFAULT_API_TOKEN` is a non-blank placeholder, so
 * `DozoConfig.apiToken(...).isBlank()` can never distinguish a paired terminal
 * from an unpaired one. The request paths gate on the *persisted* token instead.
 * Pure so the skip decision is JVM-testable without a `Context`/Robolectric.
 */
object ApiTokenGate {

    fun hasStored(storedToken: String?): Boolean = !storedToken.isNullOrBlank()

    fun shouldSkip(terminalId: String?, hasStoredToken: Boolean): Boolean =
        terminalId.isNullOrBlank() || !hasStoredToken
}
