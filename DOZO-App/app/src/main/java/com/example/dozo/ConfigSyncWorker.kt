package com.example.dozo

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class ConfigSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        if (DozoConfig.shouldSkipApiCall(applicationContext)) return Result.success()
        val terminalId = DozoConfig.terminalId(applicationContext) ?: return Result.success()
        val apiToken = DozoConfig.apiToken(applicationContext)
        return try {
            val api = DozoApi(DozoConfig.apiBaseUrl(applicationContext), apiToken)
            val result = api.config(terminalId)
            if (AuthRecovery.shouldClearToken(result)) {
                DozoConfig.clearApiToken(applicationContext)
            }
            when (result) {
                is ConfigResult.Success -> {
                    DozoConfig.applyRemoteConfig(applicationContext, result.config, terminalId)
                    Result.success()
                }
                ConfigResult.NotFound, ConfigResult.Unauthorized -> Result.success()
                ConfigResult.Failed -> Result.retry()
            }
        } catch (_: Exception) {
            Result.retry()
        }
    }
}
