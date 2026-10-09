package com.example.dozo

/**
 * Stable token names for the preset accent palette persisted under
 * [`DozoContract.KEY_ACCENT`]. The token — not the ARGB value — is stored so the
 * palette can evolve without migrating preferences. `lime` is the brand default.
 */
object AccentToken {
    const val LIME = "lime"
    const val SKY = "sky"
    const val CORAL = "coral"
    const val VIOLET = "violet"
    const val AMBER = "amber"
    const val PINK = "pink"

    const val DEFAULT = LIME

    /** Display order for the settings swatch picker. */
    val ALL = listOf(LIME, SKY, CORAL, VIOLET, AMBER, PINK)

    fun isSupported(value: String?): Boolean = value in ALL
}
