package com.example.dozo

import android.content.Context
import android.content.Intent
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.Locale

/**
 * QA coverage for the Sprint 2 Part B locale scaffold:
 *  - DozoConfig.language / setLanguage normalisation (Context-bound, so instrumented)
 *  - LocaleManager.wrap context behaviour
 *  - on-device locale rendering through MainActivity.attachBaseContext
 *
 * Cleans up KEY_LANGUAGE and Locale.getDefault() after every test so this class cannot
 * bleed into HandoffResultTest (which asserts English Compose text).
 */
@RunWith(AndroidJUnit4::class)
class LocaleQaTest {

    @get:Rule
    val composeRule = createEmptyComposeRule()

    private lateinit var context: Context
    private lateinit var originalDefault: Locale

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        originalDefault = Locale.getDefault()
        prefs().edit()
            .remove(DozoContract.KEY_LANGUAGE)
            .putBoolean(DozoContract.KEY_ACTIVATED, true)
            .putBoolean(DozoContract.KEY_DISPLAY_ENABLED, true)
            .commit()
    }

    @After
    fun tearDown() {
        prefs().edit().remove(DozoContract.KEY_LANGUAGE).commit()
        Locale.setDefault(originalDefault)
    }

    // --- DozoConfig.language / setLanguage ---------------------------------------------

    @Test
    fun languageFallsBackToDefaultWhenUnset() {
        assertEquals(Language.DEFAULT, DozoConfig.language(context))
    }

    @Test
    fun languageFallsBackToDefaultWhenStoredValueIsInvalid() {
        for (garbage in listOf("de", "", " ", "PL")) {
            seedLanguage(garbage)
            assertEquals("stored=$garbage", Language.DEFAULT, DozoConfig.language(context))
        }
    }

    @Test
    fun languageReturnsStoredValidValue() {
        seedLanguage(Language.PL)
        assertEquals(Language.PL, DozoConfig.language(context))
        seedLanguage(Language.EN)
        assertEquals(Language.EN, DozoConfig.language(context))
        seedLanguage(Language.SYSTEM)
        assertEquals(Language.SYSTEM, DozoConfig.language(context))
    }

    @Test
    fun setLanguageNormalisesUnsupportedValues() {
        DozoConfig.setLanguage(context, "de")
        assertEquals(Language.DEFAULT, storedLanguage())
        DozoConfig.setLanguage(context, "")
        assertEquals(Language.DEFAULT, storedLanguage())
    }

    @Test
    fun setLanguagePersistsSupportedValues() {
        DozoConfig.setLanguage(context, Language.PL)
        assertEquals(Language.PL, storedLanguage())
        DozoConfig.setLanguage(context, Language.EN)
        assertEquals(Language.EN, storedLanguage())
    }

    // --- LocaleManager.wrap ------------------------------------------------------------

    @Test
    fun wrapReturnsSameContextForSystemPreference() {
        val before = Locale.getDefault()
        val wrapped = LocaleManager.wrap(context)
        assertSame("system must not replace the context", context, wrapped)
        assertEquals("system must not mutate the JVM default locale", before, Locale.getDefault())
    }

    @Test
    fun wrapAppliesLocaleForNonSystemPreference() {
        seedLanguage(Language.PL)
        val wrapped = LocaleManager.wrap(context)
        assertNotSame(context, wrapped)
        assertEquals("pl", wrapped.resources.configuration.locales[0].language)
        assertEquals("pl", Locale.getDefault().language)
    }

    // --- Locale rendering through MainActivity.attachBaseContext -----------------------

    @Test
    fun mainActivityRendersPolishWhenPreferenceIsPolish() {
        seedLanguage(Language.PL)
        val scenario = ActivityScenario.launchActivityForResult<MainActivity>(approvedIntent("TXN-QA-PL"))
        composeRule.onNodeWithText("Płatność zatwierdzona").assertIsDisplayed()
        composeRule.onNodeWithText("Transakcja TXN-QA-PL").assertIsDisplayed()
        scenario.close()
    }

    @Test
    fun mainActivityRendersEnglishWhenPreferenceIsEnglish() {
        seedLanguage(Language.EN)
        val scenario = ActivityScenario.launchActivityForResult<MainActivity>(approvedIntent("TXN-QA-EN"))
        composeRule.onNodeWithText("Payment approved").assertIsDisplayed()
        composeRule.onNodeWithText("Transaction TXN-QA-EN").assertIsDisplayed()
        scenario.close()
    }

    private fun approvedIntent(txnId: String): Intent =
        Intent(context, MainActivity::class.java).apply {
            putExtra(DozoContract.EXTRA_STATUS, DozoContract.STATUS_APPROVED)
            putExtra(DozoContract.EXTRA_TXN_ID, txnId)
        }

    private fun seedLanguage(value: String) {
        prefs().edit().putString(DozoContract.KEY_LANGUAGE, value).commit()
    }

    private fun storedLanguage(): String? =
        prefs().getString(DozoContract.KEY_LANGUAGE, null)

    private fun prefs() =
        context.getSharedPreferences(DozoContract.PREFS_NAME, Context.MODE_PRIVATE)
}
