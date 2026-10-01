package com.example.dozo.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * DOZO brand palette — mirrors the DOZO-Dashboard redesign
 * (`feat/dashboard-redesign`, PR #59).
 *
 * The Compose scheme carries [LightSurface], [DarkLine] and [DarkSurface]
 * directly (surface / outline / surfaceVariant roles). [InkMuted] and
 * [CreamMuted] are the dashboard `--muted` text tokens; the spec pins
 * `onSurfaceVariant` to [G1] instead, so these two are exposed for consumers
 * that need the exact rgba values (and are contract-guarded by
 * `ThemeContractTest`) rather than mapped onto a Material role.
 */
val Cream = Color(0xFFFFFCEA)
val Ink = Color(0xFF141414)
val Lime = Color(0xFFB7FF8D)

/** g2 — the light divider / outline grey. */
val G2 = Color(0xFFE1E1E1)

/** g1 — the muted secondary grey. */
val G1 = Color(0xFF888888)

// Alpha-composited dashboard tokens (aarrggbb).
val InkMuted = Color(0xBD141414) // rgba(20, 20, 20, .74)
val CreamMuted = Color(0xBDFFFCEA) // rgba(255, 252, 234, .74)
val LightSurface = Color(0x8CE1E1E1) // rgba(225, 225, 225, .55)
val DarkLine = Color(0x29E1E1E1) // rgba(225, 225, 225, .16)
val DarkSurface = Color(0x12E1E1E1) // rgba(225, 225, 225, .07)

// Status reds kept intentionally neutral (no Material purple template leftovers).
val LightError = Color(0xFFB3261E)
val DarkError = Color(0xFFFF6B6B)
