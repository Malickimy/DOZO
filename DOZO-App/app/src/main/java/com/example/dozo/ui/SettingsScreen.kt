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
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.dozo.DozoContract
import com.example.dozo.Language
import com.example.dozo.R
import kotlin.math.roundToInt

private const val TAB_SCREEN = 0
private const val TAB_CONNECTION = 1
private const val TAB_SYSTEM = 2

@Composable
fun SettingsScreen(
    initialApiBaseUrl: String,
    initialRedirectBaseUrl: String,
    initialMerchantId: String,
    initialTerminalId: String,
    initialApiToken: String,
    initialMerchantName: String,
    initialPromptText: String,
    initialDisplayEnabled: Boolean,
    initialActivated: Boolean,
    initialAutoCloseEnabled: Boolean,
    initialTimeoutSeconds: Int,
    initialLanguage: String,
    onApiBaseUrlChange: (String) -> Unit,
    onRedirectBaseUrlChange: (String) -> Unit,
    onMerchantIdChange: (String) -> Unit,
    onTerminalIdChange: (String) -> Unit,
    onApiTokenChange: (String) -> Unit,
    onMerchantNameChange: (String) -> Unit,
    onPromptTextChange: (String) -> Unit,
    onDisplayEnabledChange: (Boolean) -> Unit,
    onActivatedChange: (Boolean) -> Unit,
    onAutoCloseEnabledChange: (Boolean) -> Unit,
    onTimeoutSecondsChange: (Int) -> Unit,
    onLanguageChange: (String) -> Unit,
    manualStatus: String?,
    onSyncNow: () -> Unit,
    onSendHeartbeatNow: () -> Unit,
    onEnterSetupCode: () -> Unit,
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
    var merchantName by remember { mutableStateOf(initialMerchantName) }
    var promptText by remember { mutableStateOf(initialPromptText) }
    var displayEnabled by remember { mutableStateOf(initialDisplayEnabled) }
    var activated by remember { mutableStateOf(initialActivated) }
    var autoCloseEnabled by remember { mutableStateOf(initialAutoCloseEnabled) }
    var timeoutSeconds by remember { mutableFloatStateOf(initialTimeoutSeconds.toFloat()) }
    var language by remember { mutableStateOf(initialLanguage) }
    var selectedTab by remember { mutableIntStateOf(TAB_SCREEN) }

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
            Spacer(Modifier.height(16.dp))
            SettingsTabs(selectedTab = selectedTab, onSelect = { selectedTab = it })
            Spacer(Modifier.height(20.dp))

            when (selectedTab) {
                TAB_SCREEN -> {
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
                    Spacer(Modifier.height(16.dp))
                    ToggleRow(
                        title = stringResource(R.string.settings_close_mode),
                        subtitle = stringResource(R.string.settings_close_mode_subtitle),
                        checked = autoCloseEnabled,
                        onCheckedChange = {
                            autoCloseEnabled = it
                            onAutoCloseEnabledChange(it)
                        }
                    )
                    if (autoCloseEnabled) {
                        Spacer(Modifier.height(16.dp))
                        Text(
                            text = stringResource(
                                R.string.settings_display_timeout,
                                timeoutSeconds.roundToInt()
                            ),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onBackground
                        )
                        Slider(
                            value = timeoutSeconds,
                            onValueChange = { timeoutSeconds = it },
                            onValueChangeFinished = {
                                onTimeoutSecondsChange(timeoutSeconds.roundToInt())
                            },
                            valueRange = DozoContract.MIN_DISPLAY_TIMEOUT_SECONDS.toFloat()..
                                DozoContract.MAX_DISPLAY_TIMEOUT_SECONDS.toFloat(),
                            steps = DozoContract.MAX_DISPLAY_TIMEOUT_SECONDS -
                                DozoContract.MIN_DISPLAY_TIMEOUT_SECONDS - 1
                        )
                    }
                    Spacer(Modifier.height(16.dp))
                    ConfigField(
                        label = stringResource(R.string.settings_merchant_name),
                        value = merchantName,
                        onValueChange = {
                            merchantName = it
                            onMerchantNameChange(it)
                        }
                    )
                    Spacer(Modifier.height(12.dp))
                    ConfigField(
                        label = stringResource(R.string.settings_prompt_text),
                        value = promptText,
                        onValueChange = {
                            promptText = it
                            onPromptTextChange(it)
                        }
                    )
                }

                TAB_CONNECTION -> {
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
                    Spacer(Modifier.height(24.dp))
                    Button(
                        onClick = onEnterSetupCode,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(stringResource(R.string.settings_enter_setup_code))
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
                        onClick = onUnpair,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(stringResource(R.string.settings_unpair))
                    }
                }

                TAB_SYSTEM -> {
                    Text(
                        text = stringResource(R.string.settings_language),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Spacer(Modifier.height(8.dp))
                    LanguageOption(
                        label = stringResource(R.string.settings_language_system),
                        selected = language == Language.SYSTEM,
                        onSelect = {
                            language = Language.SYSTEM
                            onLanguageChange(Language.SYSTEM)
                        }
                    )
                    LanguageOption(
                        label = stringResource(R.string.settings_language_pl),
                        selected = language == Language.PL,
                        onSelect = {
                            language = Language.PL
                            onLanguageChange(Language.PL)
                        }
                    )
                    LanguageOption(
                        label = stringResource(R.string.settings_language_en),
                        selected = language == Language.EN,
                        onSelect = {
                            language = Language.EN
                            onLanguageChange(Language.EN)
                        }
                    )
                    Spacer(Modifier.height(24.dp))
                    OutlinedButton(
                        onClick = onChangePin,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(stringResource(R.string.settings_change_pin))
                    }
                }
            }

            Spacer(Modifier.height(28.dp))
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
private fun SettingsTabs(
    selectedTab: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        SettingsTabChip(
            label = stringResource(R.string.settings_tab_screen),
            selected = selectedTab == TAB_SCREEN,
            onClick = { onSelect(TAB_SCREEN) },
            modifier = Modifier.weight(1f)
        )
        SettingsTabChip(
            label = stringResource(R.string.settings_tab_connection),
            selected = selectedTab == TAB_CONNECTION,
            onClick = { onSelect(TAB_CONNECTION) },
            modifier = Modifier.weight(1f)
        )
        SettingsTabChip(
            label = stringResource(R.string.settings_tab_system),
            selected = selectedTab == TAB_SYSTEM,
            onClick = { onSelect(TAB_SYSTEM) },
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun SettingsTabChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label) },
        modifier = modifier
    )
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

@Composable
private fun LanguageOption(
    label: String,
    selected: Boolean,
    onSelect: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .selectable(selected = selected, onClick = onSelect),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(selected = selected, onClick = onSelect)
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onBackground
        )
    }
}
