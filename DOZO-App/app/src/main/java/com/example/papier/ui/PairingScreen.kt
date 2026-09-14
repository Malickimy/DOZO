package com.example.papier.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import android.util.Log
import com.example.papier.PairStatusResult
import com.example.papier.PapierApi
import com.example.papier.RegisterResult
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull

private const val POLL_INTERVAL_MS = 2_000L
private const val PAIRING_TIMEOUT_MS = 5 * 60 * 1_000L

@Composable
fun PairingScreen(
    apiBaseUrl: String,
    apiToken: String,
    deviceSerial: String,
    merchantId: String,
    terminalId: String,
    onRegistered: (RegisterResult) -> Unit,
    onPaired: (PairStatusResult.Claimed) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier
) {
    var registerResult by remember { mutableStateOf<RegisterResult?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableIntStateOf(0) }

    LaunchedEffect(attempt) {
        registerResult = null
        message = null
        val api = PapierApi(apiBaseUrl, apiToken)
        val registered = runCatching { api.register(deviceSerial, merchantId, terminalId) }
            .getOrElse {
                Log.w("Papier", "pairing register failed", it)
                message = "Could not reach the server"
                return@LaunchedEffect
            }
        registerResult = registered
        onRegistered(registered)

        val claimed = withTimeoutOrNull(PAIRING_TIMEOUT_MS) {
            var result: PairStatusResult.Claimed? = null
            while (result == null && message == null) {
                delay(POLL_INTERVAL_MS)
                when (val status = runCatching { api.pairStatus(registered.code) }.getOrNull()) {
                    is PairStatusResult.Claimed -> result = status
                    is PairStatusResult.Expired -> message = "Pairing code expired"
                    is PairStatusResult.Unknown -> message = "Pairing code not found"
                    else -> Unit
                }
            }
            result
        }
        when {
            claimed != null -> onPaired(claimed)
            message == null -> message = "Pairing timed out"
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
                text = "Pair terminal",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground
            )
            Spacer(Modifier.height(20.dp))
            val code = registerResult?.code
            if (code != null) {
                Text(
                    text = code,
                    style = MaterialTheme.typography.displaySmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    text = "Enter this code in the merchant portal",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
            } else {
                Text(
                    text = "Requesting a pairing code…",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
            }
            Spacer(Modifier.height(28.dp))
            if (message == null) {
                CircularProgressIndicator()
            } else {
                Text(
                    text = message.orEmpty(),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(16.dp))
                Button(onClick = { attempt++ }) {
                    Text("Retry")
                }
            }
            Spacer(Modifier.height(24.dp))
            OutlinedButton(onClick = onCancel) {
                Text("Cancel")
            }
        }
    }
}
