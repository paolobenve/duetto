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

import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.os.Build
import android.util.Rational
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * The system's Picture-in-Picture: the little window that stays on top of
 * the other apps. The Back key goes in there, instead of leaving the
 * channel.
 *
 * It needs android:supportsPictureInPicture="true" on the MainActivity,
 * and screenSize/smallestScreenSize/screenLayout/orientation among the
 * configChanges: scripts/patch-android-manifest.js takes care of that.
 */
class PipModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    init {
        current = this
    }

    override fun invalidate() {
        if (current === this) current = null
        super.invalidate()
    }

    override fun getName() = "DuettoPip"

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    companion object {
        // Limits imposed by Android: outside them the request fails.
        private const val MIN_RATIO = 0.4184f
        private const val MAX_RATIO = 2.39f

        const val EVENT = "duetto-pip"

        @Volatile
        private var current: PipModule? = null

        /**
         * The activity says when the little window begins and ends.
         *
         * The interface used to work it out from its own width - and on
         * a good many phones React Native goes on reporting the full
         * screen while the window has shrunk to a postage stamp, so the
         * buttons and the technical lines were drawn onto it. Only the
         * activity is told the truth (onPictureInPictureModeChanged,
         * injected by patch-android-mainactivity.js), and from here it
         * reaches the JavaScript as an event.
         */
        fun changed(inPip: Boolean) {
            val m = current ?: return
            if (!m.ctx.hasActiveReactInstance()) return
            try {
                m.ctx.getJSModule(
                    com.facebook.react.modules.core.DeviceEventManagerModule
                        .RCTDeviceEventEmitter::class.java,
                ).emit(EVENT, inPip)
            } catch (_: Exception) {
                // The window still shows; only its clothes are wrong.
            }
        }
    }

    /**
     * Sends the app to the background, the way the Home key would.
     *
     * This is what "Leave" needs: the app has to disappear from the
     * screen, but the process has to stay alive. Really closing it
     * (finish) would destroy the JavaScript context, and with it the
     * connection that keeps us reachable, so no notification would
     * arrive any more.
     */
    @ReactMethod
    fun minimize(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }
        try {
            promise.resolve(activity.moveTaskToBack(true))
        } catch (e: Exception) {
            promise.reject("minimize_error", e)
        }
    }

    @ReactMethod
    fun isSupported(promise: Promise) {
        val ok = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
        promise.resolve(ok)
    }

    /**
     * Enters PiP with the given aspect ratio (width/height). Resolves
     * false when the system does not allow it: the caller then decides
     * whether to let the Back key do its ordinary job.
     */
    @ReactMethod
    fun enter(aspect: Double, promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            promise.resolve(false)
            return
        }
        val activity = currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }
        try {
            val ratio = aspect.toFloat().coerceIn(MIN_RATIO, MAX_RATIO)
            // Rational wants integers: multiply to keep some precision.
            val params = PictureInPictureParams.Builder()
                .setAspectRatio(Rational((ratio * 1000).toInt(), 1000))
                .build()
            promise.resolve(activity.enterPictureInPictureMode(params))
        } catch (e: Exception) {
            promise.reject("pip_error", e)
        }
    }
}
