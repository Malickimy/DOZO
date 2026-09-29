package com.example.dozo

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * App DOD gaps / Sprint 3 task 5: the last heartbeat and last config-sync
 * outcome shown in the settings Połączenie tab. Pure so the result mapping and
 * the timestamp formatting are JVM-testable; `DozoConfig` persists a [Snapshot]
 * to `dozo_prefs`.
 */
object ConnectionStatus {

    enum class Outcome { SUCCESS, FAILURE, UNAUTHORIZED, SKIPPED }

    /** A recorded run, or [Never] when the terminal has not run the job yet. */
    data class Snapshot(val atMillis: Long?, val outcome: Outcome?) {
        val recorded: Boolean get() = atMillis != null && outcome != null
    }

    val Never: Snapshot = Snapshot(atMillis = null, outcome = null)

    private const val TIMESTAMP_PATTERN = "yyyy-MM-dd HH:mm"

    fun outcomeFor(result: HeartbeatResult): Outcome = when (result) {
        HeartbeatResult.Ok -> Outcome.SUCCESS
        HeartbeatResult.Unauthorized -> Outcome.UNAUTHORIZED
        HeartbeatResult.Failed -> Outcome.FAILURE
    }

    fun outcomeFor(result: ConfigResult): Outcome = when (result) {
        is ConfigResult.Success -> Outcome.SUCCESS
        ConfigResult.Unauthorized -> Outcome.UNAUTHORIZED
        ConfigResult.NotFound, ConfigResult.Failed -> Outcome.FAILURE
    }

    /** Persisted lookup; an unknown/legacy name reads back as "never". */
    fun outcomeFromName(name: String?): Outcome? =
        Outcome.entries.firstOrNull { it.name == name }

    fun formatTimestamp(atMillis: Long, locale: Locale, zone: ZoneId): String =
        DateTimeFormatter.ofPattern(TIMESTAMP_PATTERN, locale)
            .withZone(zone)
            .format(Instant.ofEpochMilli(atMillis))

    /** Readable `timestamp` for a recorded run, or [never] when absent. */
    fun format(snapshot: Snapshot, never: String, locale: Locale, zone: ZoneId): String =
        snapshot.atMillis
            ?.takeIf { snapshot.outcome != null }
            ?.let { formatTimestamp(it, locale, zone) }
            ?: never
}
