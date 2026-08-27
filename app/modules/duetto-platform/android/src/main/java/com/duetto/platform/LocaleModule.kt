/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
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
