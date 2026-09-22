package com.example.dozo

import android.content.Context
import android.content.res.Configuration
import java.util.Locale

object LocaleManager {

    fun wrap(base: Context): Context {
        val tag = Language.localeTag(DozoConfig.language(base))
        if (tag == null) {
            Locale.setDefault(systemLocale(base))
            return base
        }
        val locale = Locale.forLanguageTag(tag)
        Locale.setDefault(locale)
        val config = Configuration(base.resources.configuration)
        config.setLocale(locale)
        return base.createConfigurationContext(config)
    }

    private fun systemLocale(base: Context): Locale {
        val locales = base.resources.configuration.locales
        return if (locales.isEmpty) Locale.getDefault() else locales[0]
    }
}
