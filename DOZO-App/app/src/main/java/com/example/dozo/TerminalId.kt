package com.example.dozo

object TerminalId {

    private const val MIN_LENGTH = 8
    private const val MAX_LENGTH = 16
    private val NON_ALPHANUMERIC = Regex("[^A-Za-z0-9]")

    fun derive(seed: String): String {
        val normalized = seed.uppercase().replace(NON_ALPHANUMERIC, "")
        return normalized.take(MAX_LENGTH).padEnd(MIN_LENGTH, '0')
    }
}
