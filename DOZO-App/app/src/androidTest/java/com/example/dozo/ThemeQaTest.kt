package com.example.dozo

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.text.TextLayoutResult
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.dozo.ui.theme.Cream
import com.example.dozo.ui.theme.DozoTheme
import com.example.dozo.ui.theme.Ink
import com.example.dozo.ui.theme.Lime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Native coverage for the dashboard-aligned theme: brand tokens resolve through
 * MaterialTheme, and Polish diacritics lay out with the bundled Huninn/Unbounded
 * families. Glyph coverage itself is asserted by the JVM `FontSubsetTest` (cmap);
 * here we prove the families lay the string out at a non-zero size.
 */
@RunWith(AndroidJUnit4::class)
class ThemeQaTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun lightThemeResolvesBrandTokens() {
        var background = 0
        var onBackground = 0
        var primary = 0
        composeRule.setContent {
            DozoTheme(darkTheme = false) {
                background = MaterialTheme.colorScheme.background.toArgb()
                onBackground = MaterialTheme.colorScheme.onBackground.toArgb()
                primary = MaterialTheme.colorScheme.primary.toArgb()
                Text("DOZO")
            }
        }
        composeRule.waitForIdle()
        assertEquals(Cream.toArgb(), background)
        assertEquals(Ink.toArgb(), onBackground)
        assertEquals(Lime.toArgb(), primary)
    }

    @Test
    fun polishDiacriticsLayOutInHuninnAndUnbounded() {
        val bodySample = "Zażółć gęślą jaźń ąćęłńóśźż"
        val headingSample = "ĄĆĘŁŃÓŚŹŻ DOZO"
        var bodyLayout: TextLayoutResult? = null
        var headingLayout: TextLayoutResult? = null
        composeRule.setContent {
            DozoTheme(darkTheme = false) {
                Text(
                    text = bodySample,
                    style = MaterialTheme.typography.bodyLarge,
                    onTextLayout = { bodyLayout = it },
                )
                Text(
                    text = headingSample,
                    style = MaterialTheme.typography.headlineLarge,
                    onTextLayout = { headingLayout = it },
                )
            }
        }
        composeRule.waitForIdle()
        composeRule.onNodeWithText(bodySample).assertIsDisplayed()
        composeRule.onNodeWithText(headingSample).assertIsDisplayed()
        assertNotNull("Huninn body did not lay out", bodyLayout)
        assertNotNull("Unbounded heading did not lay out", headingLayout)
        assertTrue(bodyLayout!!.size.width > 0 && bodyLayout!!.size.height > 0)
        assertTrue(headingLayout!!.size.width > 0 && headingLayout!!.size.height > 0)
    }
}
