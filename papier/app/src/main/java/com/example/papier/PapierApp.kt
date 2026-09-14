package com.example.papier

import android.app.Application
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

class PapierApp : Application() {

    override fun onCreate() {
        super.onCreate()
        scheduleBackgroundWork()
    }

    private fun scheduleBackgroundWork() {
        val workManager = WorkManager.getInstance(this)
        workManager.enqueueUniquePeriodicWork(
            HEARTBEAT_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<HeartbeatWorker>(12, TimeUnit.HOURS).build()
        )
        workManager.enqueueUniquePeriodicWork(
            CONFIG_SYNC_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<ConfigSyncWorker>(24, TimeUnit.HOURS).build()
        )
    }

    private companion object {
        const val HEARTBEAT_WORK_NAME = "papier_heartbeat"
        const val CONFIG_SYNC_WORK_NAME = "papier_config_sync"
    }
}
