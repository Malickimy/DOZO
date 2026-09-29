package com.example.dozo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

/**
 * Sprint 3 task 5: the Połączenie tab's last-run record must map every
 * heartbeat/config-sync outcome (including the no-token `SKIPPED` case) and
 * format an absent record as "never". Pure JVM — [ConnectionStatus] holds the
 * rules, `DozoConfig` only persists them.
 */
class ConnectionStatusTest {

    private val utc: ZoneId = ZoneId.of("UTC")
    private val locale: Locale = Locale.US

    // --- outcome mapping -------------------------------------------------------

    @Test
    fun heartbeatOutcomesMap() {
        assertEquals(ConnectionStatus.Outcome.SUCCESS, ConnectionStatus.outcomeFor(HeartbeatResult.Ok))
        assertEquals(ConnectionStatus.Outcome.FAILURE, ConnectionStatus.outcomeFor(HeartbeatResult.Failed))
        assertEquals(
            ConnectionStatus.Outcome.UNAUTHORIZED,
            ConnectionStatus.outcomeFor(HeartbeatResult.Unauthorized)
        )
    }

    @Test
    fun configOutcomesMap() {
        val config = TerminalConfig(
            terminalId = "T1",
            merchantId = "demo-merchant",
            googlePlaceId = null,
            label = null,
            active = true,
            displayEnabled = true,
            displayTimeoutSeconds = 15,
            redirectBaseUrl = "https://track.papier.app"
        )
        assertEquals(
            ConnectionStatus.Outcome.SUCCESS,
            ConnectionStatus.outcomeFor(ConfigResult.Success(config))
        )
        assertEquals(ConnectionStatus.Outcome.FAILURE, ConnectionStatus.outcomeFor(ConfigResult.NotFound))
        assertEquals(ConnectionStatus.Outcome.FAILURE, ConnectionStatus.outcomeFor(ConfigResult.Failed))
        assertEquals(
            ConnectionStatus.Outcome.UNAUTHORIZED,
            ConnectionStatus.outcomeFor(ConfigResult.Unauthorized)
        )
    }

    @Test
    fun skippedIsItsOwnRecordedOutcome() {
        assertTrue(ConnectionStatus.Outcome.entries.contains(ConnectionStatus.Outcome.SKIPPED))
        assertFalse(ConnectionStatus.Outcome.SKIPPED == ConnectionStatus.Outcome.FAILURE)
    }

    // --- persisted name round-trip ---------------------------------------------

    @Test
    fun outcomeNameRoundTripsAndUnknownIsNever() {
        ConnectionStatus.Outcome.entries.forEach { outcome ->
            assertEquals(outcome, ConnectionStatus.outcomeFromName(outcome.name))
        }
        assertNull(ConnectionStatus.outcomeFromName(null))
        assertNull(ConnectionStatus.outcomeFromName(""))
        assertNull(ConnectionStatus.outcomeFromName("legacy-value"))
    }

    // --- formatting ------------------------------------------------------------

    @Test
    fun formatTimestampIsReadableAndDeterministic() {
        val at = Instant.parse("2026-09-29T14:30:00Z").toEpochMilli()
        assertEquals("2026-09-29 14:30", ConnectionStatus.formatTimestamp(at, locale, utc))
    }

    @Test
    fun formatShowsTimestampWhenRecordedAndNeverWhenAbsent() {
        val at = Instant.parse("2026-09-29T14:30:00Z").toEpochMilli()
        val recorded = ConnectionStatus.Snapshot(at, ConnectionStatus.Outcome.UNAUTHORIZED)
        assertEquals("2026-09-29 14:30", ConnectionStatus.format(recorded, "never", locale, utc))

        assertEquals("never", ConnectionStatus.format(ConnectionStatus.Never, "never", locale, utc))
        // A half-written record (timestamp without an outcome) still reads as absent.
        assertEquals(
            "never",
            ConnectionStatus.format(ConnectionStatus.Snapshot(at, null), "never", locale, utc)
        )
    }

    @Test
    fun snapshotRecordedFlagMatchesCompleteness() {
        assertFalse(ConnectionStatus.Never.recorded)
        assertTrue(
            ConnectionStatus.Snapshot(1L, ConnectionStatus.Outcome.SUCCESS).recorded
        )
        assertFalse(ConnectionStatus.Snapshot(1L, null).recorded)
    }
}
