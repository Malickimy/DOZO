package com.example.papier

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class ConfigSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val terminalId = PapierConfig.terminalId(applicationContext) ?: return Result.success()
        val apiToken = PapierConfig.apiToken(applicationContext)
        if (terminalId.isBlank() || apiToken.isBlank()) return Result.success()
        return try {
            val api = PapierApi(PapierConfig.apiBaseUrl(applicationContext), apiToken)
            when (val result = api.config(terminalId)) {
                is ConfigResult.Success -> {
                    val config = result.config
                    PapierConfig.setDisplayEnabled(applicationContext, config.displayEnabled)
                    PapierConfig.setDisplayTimeoutSeconds(
                        applicationContext,
                        config.displayTimeoutSeconds
                    )
                    PapierConfig.setRedirectBaseUrl(
                        applicationContext,
                        deriveRedirectBaseUrl(config.redirectBaseUrl, terminalId)
                    )
                    Result.success()
                }
                ConfigResult.NotFound -> Result.success()
                ConfigResult.Failed -> Result.retry()
            }
        } catch (_: Exception) {
            Result.retry()
        }
    }
}
