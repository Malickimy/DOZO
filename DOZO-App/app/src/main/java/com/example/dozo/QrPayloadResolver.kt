package com.example.dozo

import java.net.URLEncoder

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
    ): String {
        if (serverHealthy && !primaryUrl.isNullOrBlank()) return primaryUrl
        return staticReviewUrl?.takeIf { it.isNotBlank() }
            ?: placeIdUrl(googlePlaceId)
            ?: intentReviewUrl?.takeIf { it.isNotBlank() }
            ?: primaryUrl?.takeIf { it.isNotBlank() }
            ?: DozoContract.DEFAULT_REVIEW_URL
    }

    fun placeIdUrl(googlePlaceId: String?): String? {
        val id = googlePlaceId?.takeIf { it.isNotBlank() } ?: return null
        val encoded = URLEncoder.encode(id, Charsets.UTF_8.name())
        return "${DozoContract.GOOGLE_REVIEW_BASE}?placeid=$encoded"
    }
}
