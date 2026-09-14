package com.example.papier

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class HeartbeatWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val terminalId = PapierConfig.terminalId(applicationContext) ?: return Result.success()
        val apiToken = PapierConfig.apiToken(applicationContext)
        if (terminalId.isBlank() || apiToken.isBlank()) return Result.success()
        return try {
            PapierApi(PapierConfig.apiBaseUrl(applicationContext), apiToken).heartbeat(terminalId)
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }
}
