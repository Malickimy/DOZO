package com.example.dozo

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class ConfigSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val terminalId = DozoConfig.terminalId(applicationContext) ?: return Result.success()
        val apiToken = DozoConfig.apiToken(applicationContext)
        if (terminalId.isBlank() || apiToken.isBlank()) return Result.success()
        return try {
            val api = DozoApi(DozoConfig.apiBaseUrl(applicationContext), apiToken)
            when (val result = api.config(terminalId)) {
                is ConfigResult.Success -> {
                    val config = result.config
                    DozoConfig.setDisplayEnabled(applicationContext, config.displayEnabled)
                    DozoConfig.setDisplayTimeoutSeconds(
                        applicationContext,
                        config.displayTimeoutSeconds
                    )
                    DozoConfig.setRedirectBaseUrl(
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
