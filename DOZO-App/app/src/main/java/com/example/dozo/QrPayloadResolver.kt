package com.example.dozo

import java.net.URLEncoder

/**
 * Which branch of [QrPayloadResolver.resolveWithSource] produced the displayed
 * payload. `dynamic` marks payloads that route through the connector redirect
 * (and so can be recorded); the rest are static Google review links used as
 * fallbacks. Powers the app-only developer-mode indicator.
 */
enum class QrSource(val dynamic: Boolean) {
    PRIMARY(true),
    PRIMARY_FALLBACK(true),
    STATIC_REVIEW_URL(false),
    PLACE_ID(false),
    INTENT_REVIEW_URL(false),
    DEFAULT(false)
}

data class QrResolution(val url: String, val source: QrSource)

/**
 * Chooses the payload encoded into the review QR (App Sprint 4).
 *
 * The primary QR points at the connector redirect (`{redirect_base_url}/r/{id}`)
 * so a scan can be recorded. At render time the app probes the server; when the
 * probe fails the static chain takes over: a server-provided direct Google link,
 * then a link built from the persisted `google_place_id`, then the intent's own
 * `review_url`. The primary QR is the last best-effort fallback.
 */
object QrPayloadResolver {

    fun resolve(
        primaryUrl: String?,
        serverHealthy: Boolean,
        staticReviewUrl: String?,
        googlePlaceId: String?,
        intentReviewUrl: String?
    ): String = resolveWithSource(
        primaryUrl = primaryUrl,
        serverHealthy = serverHealthy,
        staticReviewUrl = staticReviewUrl,
        googlePlaceId = googlePlaceId,
        intentReviewUrl = intentReviewUrl
    ).url

    /**
     * Mirrors [resolve]'s branch order exactly, tagging each branch with its
     * [QrSource] so the UI can tell a dynamic (connector redirect) payload from
     * a static fallback.
     */
    fun resolveWithSource(
        primaryUrl: String?,
        serverHealthy: Boolean,
        staticReviewUrl: String?,
        googlePlaceId: String?,
        intentReviewUrl: String?
    ): QrResolution {
        if (serverHealthy && !primaryUrl.isNullOrBlank()) {
            return QrResolution(primaryUrl, QrSource.PRIMARY)
        }
        staticReviewUrl?.takeIf { it.isNotBlank() }?.let {
            return QrResolution(it, QrSource.STATIC_REVIEW_URL)
        }
        placeIdUrl(googlePlaceId)?.let {
            return QrResolution(it, QrSource.PLACE_ID)
        }
        intentReviewUrl?.takeIf { it.isNotBlank() }?.let {
            return QrResolution(it, QrSource.INTENT_REVIEW_URL)
        }
        primaryUrl?.takeIf { it.isNotBlank() }?.let {
            return QrResolution(it, QrSource.PRIMARY_FALLBACK)
        }
        return QrResolution(DozoContract.DEFAULT_REVIEW_URL, QrSource.DEFAULT)
    }

    fun placeIdUrl(googlePlaceId: String?): String? {
        val id = googlePlaceId?.takeIf { it.isNotBlank() } ?: return null
        val encoded = URLEncoder.encode(id, Charsets.UTF_8.name())
        return "${DozoContract.GOOGLE_REVIEW_BASE}?placeid=$encoded"
    }
}
