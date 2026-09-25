package com.example.dozo

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.KeyEvent
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.lifecycleScope
import com.example.dozo.ui.IdleScreen
import com.example.dozo.ui.PairingScreen
import com.example.dozo.ui.PinScreen
import com.example.dozo.ui.QrDisplayScreen
import com.example.dozo.ui.QrRenderer
import com.example.dozo.ui.SettingsScreen
import com.example.dozo.ui.SetupCodeScreen
import com.example.dozo.ui.UiState
import com.example.dozo.ui.UpdatingOverlay
import com.example.dozo.ui.theme.DozoTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private sealed interface AppScreen {
    data object Payment : AppScreen
    data object Pin : AppScreen
    data object SetPin : AppScreen
    data object Settings : AppScreen
    data object SetupCode : AppScreen
    data object Pairing : AppScreen
}

class MainActivity : ComponentActivity() {

    private var uiState by mutableStateOf<UiState>(UiState.Idle)
    private var appScreen by mutableStateOf<AppScreen>(AppScreen.Payment)
    private var displayTimeoutSeconds by mutableIntStateOf(
        DozoContract.DEFAULT_DISPLAY_TIMEOUT_SECONDS
    )
    private var manualStatus by mutableStateOf<String?>(null)
    private var remoteApplying by mutableStateOf(false)
    private var pendingRemoteConfig by mutableStateOf<TerminalConfig?>(null)
    private var approvedPending by mutableStateOf(false)

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(LocaleManager.wrap(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val mapped = handleLaunch() ?: return
        enableEdgeToEdge()
        displayTimeoutSeconds = DozoConfig.displayTimeoutSeconds(this)
        if (mapped is MappedState.Approved) {
            approvedPending = true
            lifecycleScope.launch { showApprovedQr(mapped) }
        } else {
            uiState = mapped.toUiState()
        }
        setContent {
            DozoTheme {
                if (remoteApplying) {
                    UpdatingOverlay()
                } else {
                when (appScreen) {
                    AppScreen.Payment -> when (val state = uiState) {
                        is UiState.Idle -> IdleScreen(
                            onOpenSettings = { appScreen = AppScreen.Pin }
                        )
                        is UiState.DisplayQr -> QrDisplayScreen(
                            bitmap = state.bitmap,
                            txnId = state.txnId,
                            timeoutSeconds = displayTimeoutSeconds,
                            autoClose = DozoConfig.isAutoCloseEnabled(this),
                            merchantName = DozoConfig.merchantName(this),
                            promptText = DozoConfig.promptText(this),
                            onDismiss = {
                                applyPendingRemoteConfigIfAny()
                                closeAndFinish(RESULT_APPROVED)
                            }
                        )
                    }
                    AppScreen.Pin -> PinScreen(
                        title = stringResource(R.string.pin_enter),
                        expectedPin = DozoConfig.pin(this),
                        onComplete = { appScreen = AppScreen.Settings },
                        onCancel = { appScreen = AppScreen.Payment }
                    )
                    AppScreen.SetPin -> PinScreen(
                        title = stringResource(R.string.pin_new),
                        expectedPin = null,
                        onComplete = {
                            DozoConfig.setPin(this, it)
                            appScreen = AppScreen.Settings
                        },
                        onCancel = { appScreen = AppScreen.Settings }
                    )
                    AppScreen.Settings -> SettingsScreen(
                        initialApiBaseUrl = DozoConfig.apiBaseUrl(this),
                        initialRedirectBaseUrl = DozoConfig.redirectBaseUrl(this),
                        initialMerchantId = DozoConfig.merchantId(this),
                        initialTerminalId = DozoConfig.terminalId(this).orEmpty(),
                        initialApiToken = DozoConfig.apiToken(this),
                        initialMerchantName = DozoConfig.merchantName(this).orEmpty(),
                        initialPromptText = DozoConfig.promptText(this).orEmpty(),
                        initialDisplayEnabled = DozoConfig.isDisplayEnabled(this),
                        initialActivated = DozoConfig.isActivationEnabled(this),
                        initialAutoCloseEnabled = DozoConfig.isAutoCloseEnabled(this),
                        initialTimeoutSeconds = DozoConfig.displayTimeoutSeconds(this),
                        initialLanguage = DozoConfig.language(this),
                        onApiBaseUrlChange = { DozoConfig.setApiBaseUrl(this, it) },
                        onRedirectBaseUrlChange = { DozoConfig.setRedirectBaseUrl(this, it) },
                        onMerchantIdChange = { DozoConfig.setMerchantId(this, it) },
                        onTerminalIdChange = { DozoConfig.setTerminalId(this, it) },
                        onApiTokenChange = { DozoConfig.setApiToken(this, it) },
                        onMerchantNameChange = { DozoConfig.setMerchantName(this, it) },
                        onPromptTextChange = { DozoConfig.setPromptText(this, it) },
                        onDisplayEnabledChange = { DozoConfig.setDisplayEnabled(this, it) },
                        onActivatedChange = { DozoConfig.setActivated(this, it) },
                        onAutoCloseEnabledChange = { DozoConfig.setAutoCloseEnabled(this, it) },
                        onTimeoutSecondsChange = { DozoConfig.setDisplayTimeoutSeconds(this, it) },
                        onLanguageChange = { DozoConfig.setLanguage(this, it) },
                        manualStatus = manualStatus,
                        onSyncNow = { syncConfigNow() },
                        onSendHeartbeatNow = { sendHeartbeatNow() },
                        onEnterSetupCode = { appScreen = AppScreen.SetupCode },
                        onChangePin = { appScreen = AppScreen.SetPin },
                        onUnpair = {
                            DozoConfig.wipe(this)
                            appScreen = AppScreen.Payment
                        },
                        onBack = { appScreen = AppScreen.Payment }
                    )
                    AppScreen.SetupCode -> SetupCodeScreen(
                        apiBaseUrl = DozoConfig.apiBaseUrl(this),
                        apiToken = DozoConfig.apiToken(this),
                        deviceSerial = deviceSerial(),
                        onRedeemed = { apiToken, store ->
                            val prefs = SettingsPersistence.redeemPrefs(apiToken, store)
                            DozoConfig.applyClaimed(
                                this,
                                prefs.terminalId,
                                prefs.apiToken,
                                prefs.redirectBaseUrl,
                                prefs.googlePlaceId,
                                prefs.staticReviewUrl
                            )
                            appScreen = AppScreen.Settings
                        },
                        onCancel = { appScreen = AppScreen.Settings }
                    )
                    AppScreen.Pairing -> PairingScreen(
                        apiBaseUrl = DozoConfig.apiBaseUrl(this),
                        apiToken = DozoConfig.apiToken(this),
                        deviceSerial = deviceSerial(),
                        merchantId = DozoConfig.merchantId(this),
                        terminalId = ensureTerminalId(),
                        onRegistered = {
                            DozoConfig.setPairingCode(this, it.code)
                            DozoConfig.setTerminalId(this, it.terminalId)
                        },
                        onPaired = { claimed ->
                            DozoConfig.applyClaimed(
                                this,
                                claimed.store.terminalId,
                                claimed.apiToken,
                                deriveRedirectBaseUrl(
                                    claimed.store.redirectUrl,
                                    claimed.store.terminalId
                                ),
                                claimed.store.googlePlaceId,
                                claimed.store.staticReviewUrl
                            )
                            appScreen = AppScreen.Settings
                        },
                        onCancel = { appScreen = AppScreen.Settings }
                    )
                }
                }
            }
        }
        pullRemoteConfigAtLaunch()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val mapped = handleLaunch() ?: return
        displayTimeoutSeconds = DozoConfig.displayTimeoutSeconds(this)
        appScreen = AppScreen.Payment
        if (mapped is MappedState.Approved) {
            approvedPending = true
            lifecycleScope.launch { showApprovedQr(mapped) }
        } else {
            approvedPending = false
            uiState = mapped.toUiState()
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE) {
            closeAndFinish(currentResultCode())
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun handleLaunch(): MappedState? {
        val mapped = IntentMapper.map(intent.toPaymentIntent(), DozoConfig.redirectBaseUrl(this))
        return when (launchDecisionFor(mapped, isActivated())) {
            LaunchDecision.ExitApproved -> {
                closeAndFinish(RESULT_APPROVED)
                null
            }
            LaunchDecision.ExitSilent -> {
                closeAndFinish(RESULT_CANCELED)
                null
            }
            LaunchDecision.ShowIdle, LaunchDecision.ShowQr -> mapped
        }
    }

    private fun isActivated(): Boolean = DozoConfig.isActivated(this)

    private fun deviceSerial(): String =
        Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID).orEmpty()

    private fun ensureTerminalId(): String {
        DozoConfig.terminalId(this)?.let { return it }
        val derived = TerminalId.derive(deviceSerial())
        DozoConfig.setTerminalId(this, derived)
        return derived
    }

    private fun syncConfigNow() {
        val terminalId = DozoConfig.terminalId(this)
        val apiToken = DozoConfig.apiToken(this)
        if (terminalId.isNullOrBlank() || apiToken.isBlank()) {
            manualStatus = getString(R.string.status_not_configured)
            return
        }
        manualStatus = getString(R.string.status_syncing)
        lifecycleScope.launch {
            manualStatus = try {
                when (val result = DozoApi(DozoConfig.apiBaseUrl(this@MainActivity), apiToken)
                    .config(terminalId)) {
                    is ConfigResult.Success -> {
                        val config = result.config
                        DozoConfig.applyRemoteConfig(this@MainActivity, config, terminalId)
                        getString(R.string.status_sync_done)
                    }
                    ConfigResult.NotFound -> getString(R.string.status_terminal_not_found)
                    // TODO(R6): on 401 clear api_token and route to pairing once Server Sprint 7 lands.
                    ConfigResult.Unauthorized -> getString(R.string.status_sync_failed)
                    ConfigResult.Failed -> getString(R.string.status_sync_failed)
                }
            } catch (_: Exception) {
                getString(R.string.status_sync_failed)
            }
        }
    }

    private fun sendHeartbeatNow() {
        val terminalId = DozoConfig.terminalId(this)
        val apiToken = DozoConfig.apiToken(this)
        if (terminalId.isNullOrBlank() || apiToken.isBlank()) {
            manualStatus = getString(R.string.status_not_configured)
            return
        }
        manualStatus = getString(R.string.status_sending_heartbeat)
        lifecycleScope.launch {
            manualStatus = try {
                val ok = DozoApi(DozoConfig.apiBaseUrl(this@MainActivity), apiToken)
                    .heartbeat(terminalId)
                if (ok) getString(R.string.status_heartbeat_sent) else getString(R.string.status_heartbeat_failed)
            } catch (_: Exception) {
                getString(R.string.status_heartbeat_failed)
            }
        }
    }

    private suspend fun showApprovedQr(state: MappedState.Approved) {
        val paymentIntent = intent.toPaymentIntent()
        val healthy = runCatching {
            DozoApi(DozoConfig.redirectBaseUrl(this), "")
                .health(DozoContract.HEALTH_PROBE_TIMEOUT_MS)
        }.getOrDefault(false)
        val payload = resolveApprovedPayload(paymentIntent, healthy)
        uiState = UiState.DisplayQr(QrRenderer.render(payload), state.txnId)
        approvedPending = false
    }

    private fun resolveApprovedPayload(paymentIntent: PaymentIntent, serverHealthy: Boolean): String {
        val terminalId = paymentIntent.terminalId?.takeIf { it.isNotBlank() }
        val primaryUrl = terminalId?.let { "${DozoConfig.redirectBaseUrl(this)}/r/$it" }
        return QrPayloadResolver.resolve(
            primaryUrl = primaryUrl,
            serverHealthy = serverHealthy,
            staticReviewUrl = DozoConfig.staticReviewUrl(this),
            googlePlaceId = DozoConfig.googlePlaceId(this),
            intentReviewUrl = paymentIntent.reviewUrl?.takeIf { it.isNotBlank() }
        )
    }

    private fun pullRemoteConfigAtLaunch() {
        val terminalId = DozoConfig.terminalId(this)
        val apiToken = DozoConfig.apiToken(this)
        if (terminalId.isNullOrBlank() || apiToken.isBlank()) return
        lifecycleScope.launch {
            val result = runCatching {
                DozoApi(DozoConfig.apiBaseUrl(this@MainActivity), apiToken).config(terminalId)
            }.getOrNull()
            when (result) {
                is ConfigResult.Success -> onRemoteConfig(result.config)
                ConfigResult.Unauthorized -> Unit
                else -> Unit
            }
        }
    }

    private fun onRemoteConfig(config: TerminalConfig) {
        val qrDisplayed = approvedPending || uiState is UiState.DisplayQr
        if (RemoteConfigPolicy.decide(qrDisplayed) == RemoteApplyDecision.Postpone) {
            pendingRemoteConfig = config
            return
        }
        applyRemoteConfigNow(config)
    }

    private fun applyRemoteConfigNow(config: TerminalConfig) {
        remoteApplying = true
        DozoConfig.applyRemoteConfig(this, config, DozoConfig.terminalId(this).orEmpty())
        lifecycleScope.launch {
            delay(REMOTE_APPLY_OVERLAY_MS)
            remoteApplying = false
            Toast.makeText(
                this@MainActivity,
                R.string.settings_updated_from_dashboard,
                Toast.LENGTH_SHORT
            ).show()
        }
    }

    private fun applyPendingRemoteConfigIfAny() {
        val pending = pendingRemoteConfig ?: return
        pendingRemoteConfig = null
        DozoConfig.applyRemoteConfig(this, pending, DozoConfig.terminalId(this).orEmpty())
    }

    private fun currentResultCode(): Int =
        if (approvedPending || uiState is UiState.DisplayQr) RESULT_APPROVED else RESULT_CANCELED

    private fun closeAndFinish(code: Int) {
        setResult(code)
        finish()
    }
}

private const val REMOTE_APPLY_OVERLAY_MS = 600L

private fun MappedState.toUiState(): UiState = when (this) {
    is MappedState.Idle -> UiState.Idle
    is MappedState.Approved -> UiState.DisplayQr(
        bitmap = QrRenderer.render(payload),
        txnId = txnId
    )
    is MappedState.Silent -> UiState.Idle
}

private fun Intent?.toPaymentIntent(): PaymentIntent = PaymentIntent(
    action = this?.action,
    status = this?.getStringExtra(DozoContract.EXTRA_STATUS),
    reviewUrl = this?.getStringExtra(DozoContract.EXTRA_REVIEW_URL),
    txnId = this?.getStringExtra(DozoContract.EXTRA_TXN_ID),
    amountCents = this?.let {
        if (it.hasExtra(DozoContract.EXTRA_AMOUNT_CENTS)) {
            it.getIntExtra(DozoContract.EXTRA_AMOUNT_CENTS, 0)
        } else {
            null
        }
    },
    reason = this?.getStringExtra(DozoContract.EXTRA_REASON),
    merchantId = this?.getStringExtra(DozoContract.EXTRA_MERCHANT_ID),
    terminalId = this?.getStringExtra(DozoContract.EXTRA_TERMINAL_ID)
)
