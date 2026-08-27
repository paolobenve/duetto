package com.duetto.platform

import android.app.Activity
import android.app.Application
import android.os.Bundle
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Tells whether the app is really showing anything on the screen.
 *
 * It is there to avoid sending video to a phone that is not looking at
 * it: without it, the other camera keeps pushing ~300 kB/s towards a dark
 * screen, and on a mobile network that is paid for.
 *
 * Why React Native's AppState is not enough: on Android it reports the
 * PAUSE of the activity, and in Picture-in-Picture the activity is paused
 * while being perfectly visible. We would turn the video off exactly in
 * the little window made to keep watching it.
 *
 * The activity's onStart/onStop, instead, mean precisely what we need:
 * onStop arrives when the app really leaves the view - screen off, or
 * another app in front - and does NOT arrive in PiP.
 */
class VisibilityModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoVisibility"

    /** How many of the app's activities are visible right now. */
    private var started = 0
    private var registered = false

    private val callbacks = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityStarted(activity: Activity) {
            started++
            if (started == 1) emit(true)
        }

        override fun onActivityStopped(activity: Activity) {
            started--
            if (started <= 0) {
                started = 0
                emit(false)
            }
        }

        override fun onActivityCreated(activity: Activity, saved: Bundle?) {}
        override fun onActivityResumed(activity: Activity) {}
        override fun onActivityPaused(activity: Activity) {}
        override fun onActivitySaveInstanceState(activity: Activity, out: Bundle) {}
        override fun onActivityDestroyed(activity: Activity) {}
    }

    private fun emit(visible: Boolean) {
        if (!ctx.hasActiveReactInstance()) return
        try {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT, visible)
        } catch (_: Exception) {
            // A lost event costs an unoptimised stream; it is not worth
            // bringing the app down for.
        }
    }

    /**
     * Starts reporting the changes. Idempotent: JS may call it on every
     * mount without piling registrations up.
     */
    @ReactMethod
    fun start(promise: Promise) {
        if (registered) { promise.resolve(true); return }
        val app = ctx.applicationContext as? Application
        if (app == null) { promise.resolve(false); return }
        // If an activity is already up we start from "visible": the first
        // onStart may well be past by the time JS registers.
        if (ctx.currentActivity != null) started = 1
        app.registerActivityLifecycleCallbacks(callbacks)
        registered = true
        promise.resolve(true)
    }

    /** The state right now, for whoever registers once the game is on. */
    @ReactMethod
    fun isVisible(promise: Promise) {
        promise.resolve(started > 0)
    }

    // Required by NativeEventEmitter: without them React Native warns on
    // every addListener that the module does not implement them.
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    companion object {
        const val EVENT = "duetto-visibility"
    }
}
