package com.example.dozo

import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

object MoneyFormat {
    private val PLN: Currency = Currency.getInstance("PLN")

    fun formatPln(cents: Int, locale: Locale): String {
        val format = NumberFormat.getCurrencyInstance(locale)
        format.currency = PLN
        return format.format(cents / 100.0)
    }
}
