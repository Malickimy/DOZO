package com.example.dozo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ConnectorHealthCacheTest {

    private val ttl = 60_000L

    @Test
    fun emptyCacheReturnsNull() {
        assertNull(ConnectorHealthCache(ttl).get(1_000L))
    }

    @Test
    fun returnsValueWithinTtl() {
        val cache = ConnectorHealthCache(ttl)
        cache.put(value = false, nowElapsed = 1_000L)
        assertEquals(false, cache.get(1_000L))
        assertEquals(false, cache.get(61_000L))
    }

    @Test
    fun expiresAfterTtl() {
        val cache = ConnectorHealthCache(ttl)
        cache.put(value = true, nowElapsed = 1_000L)
        assertNull(cache.get(61_001L))
    }

    @Test
    fun putOverwritesPreviousValue() {
        val cache = ConnectorHealthCache(ttl)
        cache.put(value = true, nowElapsed = 1_000L)
        cache.put(value = false, nowElapsed = 2_000L)
        assertEquals(false, cache.get(2_000L))
    }
}
