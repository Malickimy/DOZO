package com.example.dozo

object Language {
    const val SYSTEM = "system"
    const val PL = "pl"
    const val EN = "en"

    const val DEFAULT = SYSTEM

    private val SUPPORTED = setOf(SYSTEM, PL, EN)

    fun isSupported(preference: String?): Boolean = preference in SUPPORTED

    fun localeTag(preference: String?): String? = when (preference) {
        PL -> PL
        EN -> EN
        else -> null
    }
}
