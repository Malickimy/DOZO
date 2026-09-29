package com.example.dozo

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class HeartbeatWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        if (DozoConfig.shouldSkipApiCall(applicationContext)) {
            record(ConnectionStatus.Outcome.SKIPPED)
            return Result.success()
        }
        val terminalId = DozoConfig.terminalId(applicationContext) ?: return Result.success()
        val apiToken = DozoConfig.apiToken(applicationContext)
        return try {
            val result = DozoApi(DozoConfig.apiBaseUrl(applicationContext), apiToken)
                .heartbeat(terminalId)
            if (AuthRecovery.shouldClearToken(result)) {
                DozoConfig.clearApiToken(applicationContext)
            }
            record(ConnectionStatus.outcomeFor(result))
            Result.success()
        } catch (_: Exception) {
            record(ConnectionStatus.Outcome.FAILURE)
            Result.retry()
        }
    }

    private fun record(outcome: ConnectionStatus.Outcome) {
        DozoConfig.recordHeartbeat(applicationContext, outcome)
    }
}
