package com.example.dozo

/**
 * Remembers the last connector health probe for a short window. Showing the
 * payment QR reads this so the screen does not wait on the network every time;
 * a stale entry is treated as missing and the caller probes again.
 *
 * Time is passed in (monotonic elapsed milliseconds) so the expiry rule is
 * testable without an Android clock.
 */
class ConnectorHealthCache(private val ttlMs: Long) {

    private var healthy: Boolean = false
    private var atElapsed: Long = Long.MIN_VALUE
    private var hasEntry: Boolean = false

    /** The cached result, or null when empty or older than [ttlMs]. */
    fun get(nowElapsed: Long): Boolean? {
        if (!hasEntry) return null
        return healthy.takeIf { nowElapsed - atElapsed in 0..ttlMs }
    }

    fun put(value: Boolean, nowElapsed: Long) {
        healthy = value
        atElapsed = nowElapsed
        hasEntry = true
    }
}
