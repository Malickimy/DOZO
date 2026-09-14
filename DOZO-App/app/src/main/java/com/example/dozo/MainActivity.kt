package com.example.dozo

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import com.example.dozo.ui.AdoptScreen
import com.example.dozo.ui.IdleScreen
import com.example.dozo.ui.OutcomeScreen
import com.example.dozo.ui.PairingScreen
import com.example.dozo.ui.PinScreen
import com.example.dozo.ui.QrDisplayScreen
import com.example.dozo.ui.QrRenderer
import com.example.dozo.ui.SettingsScreen
import com.example.dozo.ui.UiState
import com.example.dozo.ui.theme.DozoTheme
import kotlinx.coroutines.launch

private sealed interface AppScreen {
    data object Payment : AppScreen
    data object Pin : AppScreen
    data object SetPin : AppScreen
    data object Settings : AppScreen
    data object Pairing : AppScreen
    data object Adopt : AppScreen
}

class MainActivity : ComponentActivity() {

    private var uiState by mutableStateOf<UiState>(UiState.Idle)
    private var appScreen by mutableStateOf<AppScreen>(AppScreen.Payment)
    private var displayTimeoutSeconds by mutableIntStateOf(
        DozoContract.DEFAULT_DISPLAY_TIMEOUT_SECONDS
    )
    private var manualStatus by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val mapped = mappedLaunchOrNull() ?: run {
            closeAndFinish(RESULT_CANCELED)
            return
        }
        enableEdgeToEdge()
        uiState = mapped.toUiState()
        displayTimeoutSeconds = DozoConfig.displayTimeoutSeconds(this)
        setContent {
            DozoTheme {
                when (appScreen) {
                    AppScreen.Payment -> when (val state = uiState) {
                        is UiState.Idle -> IdleScreen(
                            onOpenSettings = { appScreen = AppScreen.Pin }
                        )
                        is UiState.DisplayQr -> QrDisplayScreen(
                            bitmap = state.bitmap,
                            txnId = state.txnId,
                            amountCents = state.amountCents,
                            timeoutSeconds = displayTimeoutSeconds,
                            onDismiss = { closeAndFinish(RESULT_APPROVED) }
                        )
                        is UiState.Outcome -> OutcomeScreen(
                            kind = state.kind,
                            txnId = state.txnId,
                            amountCents = state.amountCents,
                            reason = state.reason,
                            onDismiss = {
                                closeAndFinish(DozoContract.resultCodeFor(state.kind))
                            }
                        )
                    }
                    AppScreen.Pin -> PinScreen(
                        title = "Enter PIN",
                        expectedPin = DozoConfig.pin(this),
                        onComplete = { appScreen = AppScreen.Settings },
                        onCancel = { appScreen = AppScreen.Payment }
                    )
                    AppScreen.SetPin -> PinScreen(
                        title = "New PIN",
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
                        initialDisplayEnabled = DozoConfig.isDisplayEnabled(this),
                        initialActivated = DozoConfig.isActivationEnabled(this),
                        initialTimeoutSeconds = DozoConfig.displayTimeoutSeconds(this),
                        onApiBaseUrlChange = { DozoConfig.setApiBaseUrl(this, it) },
                        onRedirectBaseUrlChange = { DozoConfig.setRedirectBaseUrl(this, it) },
                        onMerchantIdChange = { DozoConfig.setMerchantId(this, it) },
                        onTerminalIdChange = { DozoConfig.setTerminalId(this, it) },
                        onApiTokenChange = { DozoConfig.setApiToken(this, it) },
                        onDisplayEnabledChange = { DozoConfig.setDisplayEnabled(this, it) },
                        onActivatedChange = { DozoConfig.setActivated(this, it) },
                        onTimeoutSecondsChange = { DozoConfig.setDisplayTimeoutSeconds(this, it) },
                        manualStatus = manualStatus,
                        onSyncNow = { syncConfigNow() },
                        onSendHeartbeatNow = { sendHeartbeatNow() },
                        onGeneratePairingCode = { appScreen = AppScreen.Pairing },
                        onAdoptExistingRegister = { appScreen = AppScreen.Adopt },
                        onChangePin = { appScreen = AppScreen.SetPin },
                        onUnpair = {
                            DozoConfig.wipe(this)
                            appScreen = AppScreen.Payment
                        },
                        onBack = { appScreen = AppScreen.Payment }
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
                                )
                            )
                            appScreen = AppScreen.Settings
                        },
                        onCancel = { appScreen = AppScreen.Settings }
                    )
                    AppScreen.Adopt -> AdoptScreen(
                        apiBaseUrl = DozoConfig.apiBaseUrl(this),
                        apiToken = DozoConfig.apiToken(this),
                        merchantId = DozoConfig.merchantId(this),
                        terminalId = ensureTerminalId(),
                        onAdopted = { config ->
                            DozoConfig.setTerminalId(this, config.terminalId)
                            DozoConfig.setRedirectBaseUrl(
                                this,
                                deriveRedirectBaseUrl(config.redirectBaseUrl, config.terminalId)
                            )
                            DozoConfig.setActivated(this, true)
                            appScreen = AppScreen.Settings
                        },
                        onCancel = { appScreen = AppScreen.Settings }
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val mapped = mappedLaunchOrNull() ?: run {
            closeAndFinish(RESULT_CANCELED)
            return
        }
        uiState = mapped.toUiState()
        displayTimeoutSeconds = DozoConfig.displayTimeoutSeconds(this)
        appScreen = AppScreen.Payment
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE) {
            closeAndFinish(currentResultCode())
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun mappedLaunchOrNull(): MappedState? {
        val mapped = IntentMapper.map(intent.toPaymentIntent(), DozoConfig.redirectBaseUrl(this))
        if (mapped is MappedState.Idle) return mapped
        if (!isActivated()) return null
        if (mapped.requiresSilentExit(BuildConfig.DEBUG)) return null
        return mapped
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
            manualStatus = "Not configured"
            return
        }
        manualStatus = "Syncing…"
        lifecycleScope.launch {
            manualStatus = try {
                when (val result = DozoApi(DozoConfig.apiBaseUrl(this@MainActivity), apiToken)
                    .config(terminalId)) {
                    is ConfigResult.Success -> {
                        val config = result.config
                        DozoConfig.setDisplayEnabled(this@MainActivity, config.displayEnabled)
                        DozoConfig.setDisplayTimeoutSeconds(
                            this@MainActivity,
                            config.displayTimeoutSeconds
                        )
                        DozoConfig.setRedirectBaseUrl(
                            this@MainActivity,
                            deriveRedirectBaseUrl(config.redirectBaseUrl, terminalId)
                        )
                        "Config synced"
                    }
                    ConfigResult.NotFound -> "Terminal not found"
                    ConfigResult.Failed -> "Sync failed"
                }
            } catch (_: Exception) {
                "Sync failed"
            }
        }
    }

    private fun sendHeartbeatNow() {
        val terminalId = DozoConfig.terminalId(this)
        val apiToken = DozoConfig.apiToken(this)
        if (terminalId.isNullOrBlank() || apiToken.isBlank()) {
            manualStatus = "Not configured"
            return
        }
        manualStatus = "Sending heartbeat…"
        lifecycleScope.launch {
            manualStatus = try {
                val ok = DozoApi(DozoConfig.apiBaseUrl(this@MainActivity), apiToken)
                    .heartbeat(terminalId)
                if (ok) "Heartbeat sent" else "Heartbeat failed"
            } catch (_: Exception) {
                "Heartbeat failed"
            }
        }
    }

    private fun currentResultCode(): Int = when (val state = uiState) {
        is UiState.Idle -> RESULT_CANCELED
        is UiState.DisplayQr -> RESULT_APPROVED
        is UiState.Outcome -> DozoContract.resultCodeFor(state.kind)
    }

    private fun closeAndFinish(code: Int) {
        setResult(code)
        finish()
    }
}

private fun MappedState.toUiState(): UiState = when (this) {
    is MappedState.Idle -> UiState.Idle
    is MappedState.Approved -> UiState.DisplayQr(
        bitmap = QrRenderer.render(payload),
        txnId = txnId,
        amountCents = amountCents
    )
    is MappedState.NonApproval -> UiState.Outcome(
        kind = kind,
        txnId = txnId,
        amountCents = amountCents,
        reason = reason
    )
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
