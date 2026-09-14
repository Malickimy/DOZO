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
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import java.util.Locale

private const val COUNTDOWN_SECONDS = 10

@Composable
fun OutcomeScreen(
    kind: OutcomeKind,
    txnId: String,
    amountCents: Int?,
    reason: String?,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    var secondsLeft by remember { mutableIntStateOf(COUNTDOWN_SECONDS) }

    LaunchedEffect(txnId, kind) {
        secondsLeft = COUNTDOWN_SECONDS
        while (secondsLeft > 0) {
            delay(1000)
            secondsLeft--
        }
        onDismiss()
    }

    val accentColor = when (kind) {
        OutcomeKind.CANCELED -> MaterialTheme.colorScheme.tertiary
        OutcomeKind.REFUSED -> MaterialTheme.colorScheme.error
    }
    val title = when (kind) {
        OutcomeKind.CANCELED -> "Transaction canceled"
        OutcomeKind.REFUSED -> "Transaction refused"
    }

    Surface(
        modifier = modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .systemBarsPadding()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.SemiBold,
                color = accentColor,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Transaction $txnId",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            if (amountCents != null) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = formatAmount(amountCents),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onBackground
                )
            }
            if (!reason.isNullOrBlank()) {
                Spacer(Modifier.height(12.dp))
                Text(
                    text = reason,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
            }

            Spacer(Modifier.height(32.dp))

            LinearProgressIndicator(
                progress = { secondsLeft / COUNTDOWN_SECONDS.toFloat() },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Closing in ${secondsLeft}s",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(20.dp))
            Button(onClick = onDismiss) {
                Text("Done")
            }
        }
    }
}

private fun formatAmount(cents: Int): String =
    String.format(Locale.US, "$%.2f", cents / 100.0)
