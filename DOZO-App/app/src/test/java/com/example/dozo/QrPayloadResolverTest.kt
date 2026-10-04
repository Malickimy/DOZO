package com.example.dozo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class QrPayloadResolverTest {

    private val primary = "https://track.papier.app/r/TERM01"
    private val staticReview = "https://search.google.com/local/writereview?placeid=ChIJ"
    private val reviewUrl = "https://g.page/r/REAL/review"

    @Test
    fun healthyServerPrefersPrimaryQr() {
        assertEquals(
            primary,
            QrPayloadResolver.resolve(
                primaryUrl = primary,
                serverHealthy = true,
                staticReviewUrl = staticReview,
                googlePlaceId = "ChIJ",
                intentReviewUrl = reviewUrl
            )
        )
    }

    @Test
    fun unhealthyServerPrefersServerStaticReviewUrl() {
        assertEquals(
            staticReview,
            QrPayloadResolver.resolve(
                primaryUrl = primary,
                serverHealthy = false,
                staticReviewUrl = staticReview,
                googlePlaceId = "ChIJ",
                intentReviewUrl = reviewUrl
            )
        )
    }

    @Test
    fun unhealthyServerBuildsFromPersistedPlaceId() {
        assertEquals(
            "${DozoContract.GOOGLE_REVIEW_BASE}?placeid=ChIJ",
            QrPayloadResolver.resolve(
                primaryUrl = primary,
                serverHealthy = false,
                staticReviewUrl = null,
                googlePlaceId = "ChIJ",
                intentReviewUrl = reviewUrl
            )
        )
    }

    @Test
    fun unhealthyServerFallsBackToIntentReviewUrl() {
        assertEquals(
            reviewUrl,
            QrPayloadResolver.resolve(
                primaryUrl = primary,
                serverHealthy = false,
                staticReviewUrl = null,
                googlePlaceId = null,
                intentReviewUrl = reviewUrl
            )
        )
    }

    @Test
    fun unhealthyServerUsesPrimaryAsBestEffort() {
        assertEquals(
            primary,
            QrPayloadResolver.resolve(
                primaryUrl = primary,
                serverHealthy = false,
                staticReviewUrl = null,
                googlePlaceId = null,
                intentReviewUrl = null
            )
        )
    }

    @Test
    fun nothingAvailableUsesDefault() {
        assertEquals(
            DozoContract.DEFAULT_REVIEW_URL,
            QrPayloadResolver.resolve(
                primaryUrl = null,
                serverHealthy = false,
                staticReviewUrl = null,
                googlePlaceId = null,
                intentReviewUrl = null
            )
        )
    }

    @Test
    fun healthyButNoPrimaryFallsThroughToStatic() {
        assertEquals(
            staticReview,
            QrPayloadResolver.resolve(
                primaryUrl = null,
                serverHealthy = true,
                staticReviewUrl = staticReview,
                googlePlaceId = "ChIJ",
                intentReviewUrl = reviewUrl
            )
        )
    }

    @Test
    fun blankValuesAreIgnored() {
        assertEquals(
            DozoContract.DEFAULT_REVIEW_URL,
            QrPayloadResolver.resolve(
                primaryUrl = "   ",
                serverHealthy = true,
                staticReviewUrl = "   ",
                googlePlaceId = "   ",
                intentReviewUrl = "   "
            )
        )
    }

    @Test
    fun placeIdUrlEncodesThePlaceId() {
        assertEquals(
            "${DozoContract.GOOGLE_REVIEW_BASE}?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
            QrPayloadResolver.placeIdUrl("ChIJN1t_tDeuEmsRUsoyG83frY4")
        )
    }

    @Test
    fun placeIdUrlIsNullForBlank() {
        assertNull(QrPayloadResolver.placeIdUrl(null))
        assertNull(QrPayloadResolver.placeIdUrl(""))
        assertNull(QrPayloadResolver.placeIdUrl("   "))
    }

    // --- resolveWithSource: one tag per branch (developer mode) ---

    @Test
    fun healthyPrimaryIsTaggedPrimaryAndDynamic() {
        val resolution = resolveWithSource(
            primaryUrl = primary,
            serverHealthy = true,
            staticReviewUrl = staticReview,
            googlePlaceId = "ChIJ",
            intentReviewUrl = reviewUrl
        )
        assertEquals(primary, resolution.url)
        assertEquals(QrSource.PRIMARY, resolution.source)
        assertTrue(resolution.source.dynamic)
    }

    @Test
    fun healthyButNoPrimaryIsTaggedStaticReview() {
        val resolution = resolveWithSource(
            primaryUrl = null,
            serverHealthy = true,
            staticReviewUrl = staticReview,
            googlePlaceId = "ChIJ",
            intentReviewUrl = reviewUrl
        )
        assertEquals(staticReview, resolution.url)
        assertEquals(QrSource.STATIC_REVIEW_URL, resolution.source)
        assertFalse(resolution.source.dynamic)
    }

    @Test
    fun staticReviewUrlIsTaggedStaticReview() {
        val resolution = resolveWithSource(
            primaryUrl = primary,
            serverHealthy = false,
            staticReviewUrl = staticReview,
            googlePlaceId = "ChIJ",
            intentReviewUrl = reviewUrl
        )
        assertEquals(staticReview, resolution.url)
        assertEquals(QrSource.STATIC_REVIEW_URL, resolution.source)
        assertFalse(resolution.source.dynamic)
    }

    @Test
    fun persistedPlaceIdIsTaggedPlaceId() {
        val resolution = resolveWithSource(
            primaryUrl = primary,
            serverHealthy = false,
            staticReviewUrl = null,
            googlePlaceId = "ChIJ",
            intentReviewUrl = reviewUrl
        )
        assertEquals("${DozoContract.GOOGLE_REVIEW_BASE}?placeid=ChIJ", resolution.url)
        assertEquals(QrSource.PLACE_ID, resolution.source)
        assertFalse(resolution.source.dynamic)
    }

    @Test
    fun intentReviewUrlIsTaggedIntentReviewUrl() {
        val resolution = resolveWithSource(
            primaryUrl = primary,
            serverHealthy = false,
            staticReviewUrl = null,
            googlePlaceId = null,
            intentReviewUrl = reviewUrl
        )
        assertEquals(reviewUrl, resolution.url)
        assertEquals(QrSource.INTENT_REVIEW_URL, resolution.source)
        assertFalse(resolution.source.dynamic)
    }

    @Test
    fun unhealthyServerBestEffortPrimaryIsTaggedPrimaryFallbackAndDynamic() {
        val resolution = resolveWithSource(
            primaryUrl = primary,
            serverHealthy = false,
            staticReviewUrl = null,
            googlePlaceId = null,
            intentReviewUrl = null
        )
        assertEquals(primary, resolution.url)
        assertEquals(QrSource.PRIMARY_FALLBACK, resolution.source)
        assertTrue(resolution.source.dynamic)
    }

    @Test
    fun nothingAvailableIsTaggedDefault() {
        val resolution = resolveWithSource(
            primaryUrl = null,
            serverHealthy = false,
            staticReviewUrl = null,
            googlePlaceId = null,
            intentReviewUrl = null
        )
        assertEquals(DozoContract.DEFAULT_REVIEW_URL, resolution.url)
        assertEquals(QrSource.DEFAULT, resolution.source)
        assertFalse(resolution.source.dynamic)
    }

    private fun resolveWithSource(
        primaryUrl: String?,
        serverHealthy: Boolean,
        staticReviewUrl: String?,
        googlePlaceId: String?,
        intentReviewUrl: String?
    ): QrResolution = QrPayloadResolver.resolveWithSource(
        primaryUrl = primaryUrl,
        serverHealthy = serverHealthy,
        staticReviewUrl = staticReviewUrl,
        googlePlaceId = googlePlaceId,
        intentReviewUrl = intentReviewUrl
    )
}
