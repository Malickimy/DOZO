package com.example.dozo

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class HeartbeatWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val terminalId = DozoConfig.terminalId(applicationContext) ?: return Result.success()
        val apiToken = DozoConfig.apiToken(applicationContext)
        if (terminalId.isBlank() || apiToken.isBlank()) return Result.success()
        return try {
            DozoApi(DozoConfig.apiBaseUrl(applicationContext), apiToken).heartbeat(terminalId)
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }
}
