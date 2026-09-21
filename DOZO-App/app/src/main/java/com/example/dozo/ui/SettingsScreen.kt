package com.example.dozo.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.dozo.DozoContract
import com.example.dozo.R
import kotlin.math.roundToInt

@Composable
fun SettingsScreen(
    initialApiBaseUrl: String,
    initialRedirectBaseUrl: String,
    initialMerchantId: String,
    initialTerminalId: String,
    initialApiToken: String,
    initialDisplayEnabled: Boolean,
    initialActivated: Boolean,
    initialTimeoutSeconds: Int,
    onApiBaseUrlChange: (String) -> Unit,
    onRedirectBaseUrlChange: (String) -> Unit,
    onMerchantIdChange: (String) -> Unit,
    onTerminalIdChange: (String) -> Unit,
    onApiTokenChange: (String) -> Unit,
    onDisplayEnabledChange: (Boolean) -> Unit,
    onActivatedChange: (Boolean) -> Unit,
    onTimeoutSecondsChange: (Int) -> Unit,
    manualStatus: String?,
    onSyncNow: () -> Unit,
    onSendHeartbeatNow: () -> Unit,
    onGeneratePairingCode: () -> Unit,
    onAdoptExistingRegister: () -> Unit,
    onChangePin: () -> Unit,
    onUnpair: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    var apiBaseUrl by remember { mutableStateOf(initialApiBaseUrl) }
    var redirectBaseUrl by remember { mutableStateOf(initialRedirectBaseUrl) }
    var merchantId by remember { mutableStateOf(initialMerchantId) }
    var terminalId by remember { mutableStateOf(initialTerminalId) }
    var apiToken by remember { mutableStateOf(initialApiToken) }
    var displayEnabled by remember { mutableStateOf(initialDisplayEnabled) }
    var activated by remember { mutableStateOf(initialActivated) }
    var timeoutSeconds by remember { mutableFloatStateOf(initialTimeoutSeconds.toFloat()) }

    Surface(
        modifier = modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .systemBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.Top
        ) {
            Text(
                text = stringResource(R.string.settings_title),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground
            )
            Spacer(Modifier.height(20.dp))
            ConfigField(
                label = stringResource(R.string.settings_api_base_url),
                value = apiBaseUrl,
                onValueChange = {
                    apiBaseUrl = it
                    onApiBaseUrlChange(it)
                }
            )
            Spacer(Modifier.height(12.dp))
            ConfigField(
                label = stringResource(R.string.settings_redirect_base_url),
                value = redirectBaseUrl,
                onValueChange = {
                    redirectBaseUrl = it
                    onRedirectBaseUrlChange(it)
                }
            )
            Spacer(Modifier.height(12.dp))
            ConfigField(
                label = stringResource(R.string.settings_merchant_id),
                value = merchantId,
                onValueChange = {
                    merchantId = it
                    onMerchantIdChange(it)
                }
            )
            Spacer(Modifier.height(12.dp))
            ConfigField(
                label = stringResource(R.string.settings_terminal_id),
                value = terminalId,
                onValueChange = {
                    terminalId = it
                    onTerminalIdChange(it)
                }
            )
            Spacer(Modifier.height(12.dp))
            ConfigField(
                label = stringResource(R.string.settings_api_token),
                value = apiToken,
                onValueChange = {
                    apiToken = it
                    onApiTokenChange(it)
                }
            )
            Spacer(Modifier.height(20.dp))
            ToggleRow(
                title = stringResource(R.string.settings_show_qr),
                subtitle = stringResource(R.string.settings_show_qr_subtitle),
                checked = displayEnabled,
                onCheckedChange = {
                    displayEnabled = it
                    onDisplayEnabledChange(it)
                }
            )
            Spacer(Modifier.height(16.dp))
            ToggleRow(
                title = stringResource(R.string.settings_activated),
                subtitle = stringResource(R.string.settings_activated_subtitle),
                checked = activated,
                onCheckedChange = {
                    activated = it
                    onActivatedChange(it)
                }
            )
            Spacer(Modifier.height(20.dp))
            Text(
                text = stringResource(R.string.settings_display_timeout, timeoutSeconds.roundToInt()),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onBackground
            )
            Slider(
                value = timeoutSeconds,
                onValueChange = { timeoutSeconds = it },
                onValueChangeFinished = { onTimeoutSecondsChange(timeoutSeconds.roundToInt()) },
                valueRange = DozoContract.MIN_DISPLAY_TIMEOUT_SECONDS.toFloat()..DozoContract.MAX_DISPLAY_TIMEOUT_SECONDS.toFloat(),
                steps = DozoContract.MAX_DISPLAY_TIMEOUT_SECONDS - DozoContract.MIN_DISPLAY_TIMEOUT_SECONDS - 1
            )
            Spacer(Modifier.height(20.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = onSyncNow,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(stringResource(R.string.settings_sync_now))
                }
                OutlinedButton(
                    onClick = onSendHeartbeatNow,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(stringResource(R.string.settings_heartbeat_now))
                }
            }
            if (manualStatus != null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = manualStatus,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(Modifier.height(28.dp))
            Button(
                onClick = onGeneratePairingCode,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.settings_generate_pairing))
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = onAdoptExistingRegister,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.settings_adopt_register))
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = onChangePin,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.settings_change_pin))
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = onUnpair,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.settings_unpair))
            }
            Spacer(Modifier.height(24.dp))
            OutlinedButton(
                onClick = onBack,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.settings_back))
            }
        }
    }
}

@Composable
private fun ConfigField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        modifier = modifier.fillMaxWidth()
    )
}

@Composable
private fun ToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onBackground
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange
        )
    }
}
