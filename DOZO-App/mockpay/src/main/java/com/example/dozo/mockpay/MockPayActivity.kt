package com.example.dozo.mockpay

import android.app.ActivityManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

private const val TAG = "MockPay"
private const val DOZO_PACKAGE = "com.example.dozo"
private const val DOZO_ACTIVITY = "com.example.dozo.MainActivity"

private const val ACTION_APPROVED = "com.fiserv.intent.action.TRANSACTION_COMPLETE"
private const val ACTION_CANCELED = "com.fiserv.intent.action.TRANSACTION_CANCELED"
private const val ACTION_REFUSED = "com.fiserv.intent.action.TRANSACTION_REFUSED"

private const val STATUS_APPROVED = "APPROVED"
private const val STATUS_CANCELED = "CANCELED"
private const val STATUS_REFUSED = "REFUSED"

class MockPayActivity : ComponentActivity() {

    private var terminalId by mutableStateOf("DEMOTERM01")
    private var merchantId by mutableStateOf("demo-merchant")
    private var amountCents by mutableStateOf("1999")
    private var transactionId by mutableStateOf("MOCK-${System.currentTimeMillis()}")
    private var reviewUrl by mutableStateOf("")
    private var resultText by mutableStateOf("No result yet")

    private val launcher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val code = result.resultCode
        val label = resultLabel(code)
        resultText = "Result: $code ($label)"
        Log.i(TAG, "resultCode=$code label=$label")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MockPayScreen(
                terminalId = terminalId,
                onTerminalIdChange = { terminalId = it },
                merchantId = merchantId,
                onMerchantIdChange = { merchantId = it },
                amountCents = amountCents,
                onAmountCentsChange = { amountCents = it },
                transactionId = transactionId,
                onTransactionIdChange = { transactionId = it },
                reviewUrl = reviewUrl,
                onReviewUrlChange = { reviewUrl = it },
                resultText = resultText,
                onApprove = { launchTransaction(ACTION_APPROVED, STATUS_APPROVED, null) },
                onCancel = { launchTransaction(ACTION_CANCELED, STATUS_CANCELED, "USER_CANCELED") },
                onRefuse = { launchTransaction(ACTION_REFUSED, STATUS_REFUSED, "DECLINED") },
                onManualLaunch = {
                    launcher.launch(
                        Intent().setComponent(ComponentName(DOZO_PACKAGE, DOZO_ACTIVITY))
                    )
                },
                onForceStop = {
                    getSystemService(ActivityManager::class.java)
                        .killBackgroundProcesses(DOZO_PACKAGE)
                    resultText = "Force-stopped $DOZO_PACKAGE"
                    Log.i(TAG, "force-stop requested for $DOZO_PACKAGE")
                }
            )
        }
    }

    private fun launchTransaction(action: String, status: String, reason: String?) {
        val intent = Intent().apply {
            component = ComponentName(DOZO_PACKAGE, DOZO_ACTIVITY)
            this.action = action
            putExtra("status", status)
            putExtra("merchant_id", merchantId)
            putExtra("terminal_id", terminalId)
            putExtra("transaction_id", transactionId)
            putExtra("amount_cents", amountCents.toIntOrNull() ?: 0)
            if (status == STATUS_APPROVED && reviewUrl.isNotBlank()) {
                putExtra("review_url", reviewUrl)
            }
            if (reason != null) {
                putExtra("reason", reason)
            }
        }
        Log.i(TAG, "launch action=$action status=$status txn=$transactionId")
        launcher.launch(intent)
    }
}

private fun resultLabel(code: Int): String = when (code) {
    1 -> "approved"
    2 -> "canceled"
    3 -> "refused"
    else -> "unexpected"
}

@Composable
private fun MockPayScreen(
    terminalId: String,
    onTerminalIdChange: (String) -> Unit,
    merchantId: String,
    onMerchantIdChange: (String) -> Unit,
    amountCents: String,
    onAmountCentsChange: (String) -> Unit,
    transactionId: String,
    onTransactionIdChange: (String) -> Unit,
    reviewUrl: String,
    onReviewUrlChange: (String) -> Unit,
    resultText: String,
    onApprove: () -> Unit,
    onCancel: () -> Unit,
    onRefuse: () -> Unit,
    onManualLaunch: () -> Unit,
    onForceStop: () -> Unit,
    modifier: Modifier = Modifier
) {
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
                text = "DOZO Mock Pay",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground
            )
            Spacer(Modifier.height(20.dp))
            MockField("Terminal ID", terminalId, onTerminalIdChange)
            Spacer(Modifier.height(12.dp))
            MockField("Merchant ID", merchantId, onMerchantIdChange)
            Spacer(Modifier.height(12.dp))
            MockField("Amount (cents)", amountCents, onAmountCentsChange)
            Spacer(Modifier.height(12.dp))
            MockField("Transaction ID", transactionId, onTransactionIdChange)
            Spacer(Modifier.height(12.dp))
            MockField("Review URL (optional)", reviewUrl, onReviewUrlChange)
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = onApprove,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Approve")
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = onCancel,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Cancel")
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = onRefuse,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Refuse")
            }
            Spacer(Modifier.height(20.dp))
            OutlinedButton(
                onClick = onManualLaunch,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Manual launch (no extras)")
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = onForceStop,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Force stop DOZO")
            }
            Spacer(Modifier.height(24.dp))
            Text(
                text = resultText,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onBackground
            )
        }
    }
}

@Composable
private fun MockField(
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
