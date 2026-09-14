package com.example.papier

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
import com.example.papier.ui.AdoptScreen
import com.example.papier.ui.IdleScreen
import com.example.papier.ui.OutcomeScreen
import com.example.papier.ui.PairingScreen
import com.example.papier.ui.PinScreen
import com.example.papier.ui.QrDisplayScreen
import com.example.papier.ui.QrRenderer
import com.example.papier.ui.SettingsScreen
import com.example.papier.ui.UiState
import com.example.papier.ui.theme.PapierTheme
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
        PapierContract.DEFAULT_DISPLAY_TIMEOUT_SECONDS
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
        displayTimeoutSeconds = PapierConfig.displayTimeoutSeconds(this)
        setContent {
            PapierTheme {
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
                                closeAndFinish(PapierContract.resultCodeFor(state.kind))
                            }
                        )
                    }
                    AppScreen.Pin -> PinScreen(
                        title = "Enter PIN",
                        expectedPin = PapierConfig.pin(this),
                        onComplete = { appScreen = AppScreen.Settings },
                        onCancel = { appScreen = AppScreen.Payment }
                    )
                    AppScreen.SetPin -> PinScreen(
                        title = "New PIN",
                        expectedPin = null,
                        onComplete = {
                            PapierConfig.setPin(this, it)
                            appScreen = AppScreen.Settings
                        },
                        onCancel = { appScreen = AppScreen.Settings }
                    )
                    AppScreen.Settings -> SettingsScreen(
                        initialApiBaseUrl = PapierConfig.apiBaseUrl(this),
                        initialRedirectBaseUrl = PapierConfig.redirectBaseUrl(this),
                        initialMerchantId = PapierConfig.merchantId(this),
                        initialTerminalId = PapierConfig.terminalId(this).orEmpty(),
                        initialApiToken = PapierConfig.apiToken(this),
                        initialDisplayEnabled = PapierConfig.isDisplayEnabled(this),
                        initialActivated = PapierConfig.isActivationEnabled(this),
                        initialTimeoutSeconds = PapierConfig.displayTimeoutSeconds(this),
                        onApiBaseUrlChange = { PapierConfig.setApiBaseUrl(this, it) },
                        onRedirectBaseUrlChange = { PapierConfig.setRedirectBaseUrl(this, it) },
                        onMerchantIdChange = { PapierConfig.setMerchantId(this, it) },
                        onTerminalIdChange = { PapierConfig.setTerminalId(this, it) },
                        onApiTokenChange = { PapierConfig.setApiToken(this, it) },
                        onDisplayEnabledChange = { PapierConfig.setDisplayEnabled(this, it) },
                        onActivatedChange = { PapierConfig.setActivated(this, it) },
                        onTimeoutSecondsChange = { PapierConfig.setDisplayTimeoutSeconds(this, it) },
                        manualStatus = manualStatus,
                        onSyncNow = { syncConfigNow() },
                        onSendHeartbeatNow = { sendHeartbeatNow() },
                        onGeneratePairingCode = { appScreen = AppScreen.Pairing },
                        onAdoptExistingRegister = { appScreen = AppScreen.Adopt },
                        onChangePin = { appScreen = AppScreen.SetPin },
                        onUnpair = {
                            PapierConfig.wipe(this)
                            appScreen = AppScreen.Payment
                        },
                        onBack = { appScreen = AppScreen.Payment }
                    )
                    AppScreen.Pairing -> PairingScreen(
                        apiBaseUrl = PapierConfig.apiBaseUrl(this),
                        apiToken = PapierConfig.apiToken(this),
                        deviceSerial = deviceSerial(),
                        merchantId = PapierConfig.merchantId(this),
                        terminalId = ensureTerminalId(),
                        onRegistered = {
                            PapierConfig.setPairingCode(this, it.code)
                            PapierConfig.setTerminalId(this, it.terminalId)
                        },
                        onPaired = { claimed ->
                            PapierConfig.applyClaimed(
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
                        apiBaseUrl = PapierConfig.apiBaseUrl(this),
                        apiToken = PapierConfig.apiToken(this),
                        merchantId = PapierConfig.merchantId(this),
                        terminalId = ensureTerminalId(),
                        onAdopted = { config ->
                            PapierConfig.setTerminalId(this, config.terminalId)
                            PapierConfig.setRedirectBaseUrl(
                                this,
                                deriveRedirectBaseUrl(config.redirectBaseUrl, config.terminalId)
                            )
                            PapierConfig.setActivated(this, true)
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
        displayTimeoutSeconds = PapierConfig.displayTimeoutSeconds(this)
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
        val mapped = IntentMapper.map(intent.toPaymentIntent(), PapierConfig.redirectBaseUrl(this))
        if (mapped is MappedState.Idle) return mapped
        if (!isActivated()) return null
        if (mapped.requiresSilentExit(BuildConfig.DEBUG)) return null
        return mapped
    }

    private fun isActivated(): Boolean = PapierConfig.isActivated(this)

    private fun deviceSerial(): String =
        Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID).orEmpty()

    private fun ensureTerminalId(): String {
        PapierConfig.terminalId(this)?.let { return it }
        val derived = TerminalId.derive(deviceSerial())
        PapierConfig.setTerminalId(this, derived)
        return derived
    }

    private fun syncConfigNow() {
        val terminalId = PapierConfig.terminalId(this)
        val apiToken = PapierConfig.apiToken(this)
        if (terminalId.isNullOrBlank() || apiToken.isBlank()) {
            manualStatus = "Not configured"
            return
        }
        manualStatus = "Syncing…"
        lifecycleScope.launch {
            manualStatus = try {
                when (val result = PapierApi(PapierConfig.apiBaseUrl(this@MainActivity), apiToken)
                    .config(terminalId)) {
                    is ConfigResult.Success -> {
                        val config = result.config
                        PapierConfig.setDisplayEnabled(this@MainActivity, config.displayEnabled)
                        PapierConfig.setDisplayTimeoutSeconds(
                            this@MainActivity,
                            config.displayTimeoutSeconds
                        )
                        PapierConfig.setRedirectBaseUrl(
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
        val terminalId = PapierConfig.terminalId(this)
        val apiToken = PapierConfig.apiToken(this)
        if (terminalId.isNullOrBlank() || apiToken.isBlank()) {
            manualStatus = "Not configured"
            return
        }
        manualStatus = "Sending heartbeat…"
        lifecycleScope.launch {
            manualStatus = try {
                val ok = PapierApi(PapierConfig.apiBaseUrl(this@MainActivity), apiToken)
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
        is UiState.Outcome -> PapierContract.resultCodeFor(state.kind)
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
    status = this?.getStringExtra(PapierContract.EXTRA_STATUS),
    reviewUrl = this?.getStringExtra(PapierContract.EXTRA_REVIEW_URL),
    txnId = this?.getStringExtra(PapierContract.EXTRA_TXN_ID),
    amountCents = this?.let {
        if (it.hasExtra(PapierContract.EXTRA_AMOUNT_CENTS)) {
            it.getIntExtra(PapierContract.EXTRA_AMOUNT_CENTS, 0)
        } else {
            null
        }
    },
    reason = this?.getStringExtra(PapierContract.EXTRA_REASON),
    merchantId = this?.getStringExtra(PapierContract.EXTRA_MERCHANT_ID),
    terminalId = this?.getStringExtra(PapierContract.EXTRA_TERMINAL_ID)
)
