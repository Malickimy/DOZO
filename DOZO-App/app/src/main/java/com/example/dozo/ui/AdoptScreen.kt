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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.dozo.AdoptResult
import com.example.dozo.DozoApi
import com.example.dozo.Register
import com.example.dozo.RegistersResult
import com.example.dozo.TerminalConfig
import kotlinx.coroutines.launch

@Composable
fun AdoptScreen(
    apiBaseUrl: String,
    apiToken: String,
    merchantId: String,
    terminalId: String,
    onAdopted: (TerminalConfig) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier
) {
    var registers by remember { mutableStateOf<List<Register>?>(null) }
    var selected by remember { mutableStateOf<Register?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    var adopting by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(attempt) {
        registers = null
        selected = null
        message = null
        val api = DozoApi(apiBaseUrl, apiToken)
        when (
            val result = runCatching { api.registers(merchantId) }
                .getOrElse { RegistersResult.Failed }
        ) {
            is RegistersResult.Success -> registers = result.registers
            RegistersResult.NotFound -> message = "Merchant not found"
            RegistersResult.Failed -> message = "Could not reach the server"
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
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Top
        ) {
            Text(
                text = "Adopt existing register",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Pick the register this terminal replaces",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(20.dp))
            val list = registers
            when {
                message != null -> {
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
                list == null -> CircularProgressIndicator()
                list.isEmpty() -> {
                    Text(
                        text = "No registers available for this merchant",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )
                    Spacer(Modifier.height(16.dp))
                    Button(onClick = { attempt++ }) {
                        Text("Retry")
                    }
                }
                else -> {
                    list.forEach { register ->
                        RegisterRow(
                            register = register,
                            selected = register == selected,
                            onSelect = { selected = register }
                        )
                        Spacer(Modifier.height(8.dp))
                    }
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = {
                            val chosen = selected ?: return@Button
                            adopting = true
                            scope.launch {
                                val result = runCatching {
                                    DozoApi(apiBaseUrl, apiToken)
                                        .adopt(terminalId, merchantId, chosen.label)
                                }.getOrElse { AdoptResult.Failed }
                                when (result) {
                                    is AdoptResult.Success -> onAdopted(result.config)
                                    AdoptResult.NotFound -> message = "Register not found"
                                    AdoptResult.Invalid -> message = "Invalid register selection"
                                    AdoptResult.Failed -> message = "Could not reach the server"
                                }
                                adopting = false
                            }
                        },
                        enabled = selected != null && !adopting,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Adopt")
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
            OutlinedButton(onClick = onCancel) {
                Text("Cancel")
            }
        }
    }
}

@Composable
private fun RegisterRow(
    register: Register,
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
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = register.label,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onBackground
            )
            Text(
                text = register.terminalId,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
