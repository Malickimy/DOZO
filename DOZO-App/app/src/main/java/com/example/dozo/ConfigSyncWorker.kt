package com.example.dozo

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class ConfigSyncWorker(
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
            val api = DozoApi(DozoConfig.apiBaseUrl(applicationContext), apiToken)
            val result = api.config(terminalId)
            if (AuthRecovery.shouldClearToken(result)) {
                DozoConfig.clearApiToken(applicationContext)
            }
            record(ConnectionStatus.outcomeFor(result))
            when (result) {
                is ConfigResult.Success -> {
                    DozoConfig.applyRemoteConfig(applicationContext, result.config, terminalId)
                    Result.success()
                }
                ConfigResult.NotFound, ConfigResult.Unauthorized -> Result.success()
                ConfigResult.Failed -> Result.retry()
            }
        } catch (_: Exception) {
            record(ConnectionStatus.Outcome.FAILURE)
            Result.retry()
        }
    }

    private fun record(outcome: ConnectionStatus.Outcome) {
        DozoConfig.recordConfigSync(applicationContext, outcome)
    }
}
