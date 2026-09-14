package com.example.dozo

object Pin {

    const val LENGTH = 4

    fun isValid(entered: String, expected: String): Boolean = entered == expected

    fun append(current: String, digit: Char, maxLength: Int = LENGTH): String =
        if (current.length >= maxLength || !digit.isDigit()) current else current + digit
}
