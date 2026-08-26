package com.duetto.platform

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

/**
 * The language the phone is set to, as a two-letter code.
 *
 * The app follows the phone unless the user picks a language of their
 * own. React Native's own locale bridge is not dependable across
 * versions - and it is not there at all for the headless side, which
 * writes notifications with nobody looking at a screen - so the answer
 * comes straight from Android.
 */
class LocaleModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoLocale"

    @ReactMethod
    fun current(promise: Promise) {
        promise.resolve(Locale.getDefault().language.lowercase())
    }

    /** Read once at start-up, so it is there before the first frame. */
    override fun getConstants(): Map<String, Any> =
        mapOf("language" to Locale.getDefault().language.lowercase())
}
