package com.example.dozo.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.dozo.DozoApi
import com.example.dozo.R
import com.example.dozo.RedeemResult
import com.example.dozo.StoreConfig
import kotlinx.coroutines.launch

private const val CODE_LENGTH = 8

/**
 * Model-B pairing (Release Board R1): the installer types the setup code issued in the
 * dashboard and the app redeems it via `POST /api/terminals/redeem`.
 */
@Composable
fun SetupCodeScreen(
    apiBaseUrl: String,
    apiToken: String,
    deviceSerial: String,
    onRedeemed: (apiToken: String, store: StoreConfig) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier
) {
    var code by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<Int?>(null) }
    var submitting by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun submit() {
        if (code.length < CODE_LENGTH || submitting) return
        submitting = true
        message = null
        scope.launch {
            val result = runCatching {
                DozoApi(apiBaseUrl, apiToken).redeem(code, deviceSerial)
            }.getOrElse { RedeemResult.Failed }
            when (result) {
                is RedeemResult.Success -> onRedeemed(result.apiToken, result.store)
                RedeemResult.Invalid -> message = R.string.setup_code_invalid
                RedeemResult.Unknown -> message = R.string.setup_code_unknown
                RedeemResult.Expired -> message = R.string.setup_code_expired
                RedeemResult.AlreadyRedeemed -> message = R.string.setup_code_redeemed
                RedeemResult.Failed -> message = R.string.common_unreachable
            }
            submitting = false
        }
    }

    Surface(
        modifier = modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .systemBarsPadding()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = stringResource(R.string.setup_code_title),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(12.dp))
            Text(
                text = stringResource(R.string.setup_code_help),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(24.dp))
            OutlinedTextField(
                value = code,
                onValueChange = { raw ->
                    code = raw.uppercase().filter { it.isLetterOrDigit() }.take(CODE_LENGTH)
                    message = null
                },
                label = { Text(stringResource(R.string.setup_code_label)) },
                singleLine = true,
                enabled = !submitting,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = { submit() },
                enabled = code.length == CODE_LENGTH && !submitting,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.setup_code_action))
            }
            Spacer(Modifier.height(16.dp))
            val messageRes = message
            if (submitting) {
                CircularProgressIndicator()
            } else if (messageRes != null) {
                Text(
                    text = stringResource(messageRes),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center
                )
            }
            Spacer(Modifier.height(24.dp))
            OutlinedButton(onClick = onCancel) {
                Text(stringResource(R.string.common_cancel))
            }
        }
    }
}
