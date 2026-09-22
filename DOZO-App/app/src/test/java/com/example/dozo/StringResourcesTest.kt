package com.example.dozo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Guards the PL-default / EN-fallback string-resource contract from Sprint 2 Part A.
 *
 * Plain JVM test (no Robolectric required): it parses the XML sources directly, so it
 * asserts key parity and `%1$s` / `%1$d` placeholder parity between `values/` and
 * `values-en/` without an Android runtime.
 */
class StringResourcesTest {

    private val resDir: File = findResDir()

    private fun findResDir(): File {
        var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        repeat(5) {
            val candidates = listOf(
                File(dir, "src/main/res"),
                File(dir, "app/src/main/res")
            )
            candidates.firstOrNull { File(it, "values/strings.xml").isFile }?.let { return it }
            dir = dir?.parentFile
        }
        throw AssertionError(
            "Could not locate src/main/res/values/strings.xml from ${System.getProperty("user.dir")}"
        )
    }

    private fun parse(file: File): Map<String, String> {
        val regex = Regex(
            """<string\s+name="([^"]+)"[^>]*>(.*?)</string>""",
            RegexOption.DOT_MATCHES_ALL
        )
        return regex.findAll(file.readText())
            .associate { it.groupValues[1] to it.groupValues[2].trim() }
    }

    private fun placeholders(value: String): List<String> =
        Regex("""%(\d+)\$[sd]""").findAll(value).map { it.groupValues[0] }.toList()

    @Test
    fun englishCoversEveryDefaultLocaleKey() {
        val pl = parse(File(resDir, "values/strings.xml"))
        val en = parse(File(resDir, "values-en/strings.xml"))
        assertTrue("default locale has no strings", pl.isNotEmpty())
        assertEquals("keys in values/ missing from values-en/", emptySet<String>(), pl.keys - en.keys)
        assertEquals("orphan keys only in values-en/", emptySet<String>(), en.keys - pl.keys)
    }

    @Test
    fun englishValuesAreNotBlank() {
        val en = parse(File(resDir, "values-en/strings.xml"))
        assertEquals("blank EN translations", emptySet<String>(), en.filterValues { it.isBlank() }.keys)
    }

    @Test
    fun formatPlaceholdersMatchAcrossLocales() {
        val pl = parse(File(resDir, "values/strings.xml"))
        val en = parse(File(resDir, "values-en/strings.xml"))
        val mismatched = (pl.keys intersect en.keys).filter {
            placeholders(pl.getValue(it)) != placeholders(en.getValue(it))
        }
        assertTrue(
            "placeholder mismatch (key -> PL vs EN): " +
                mismatched.joinToString { "$it=${placeholders(pl.getValue(it))} vs ${placeholders(en.getValue(it))}" },
            mismatched.isEmpty()
        )
    }
}
