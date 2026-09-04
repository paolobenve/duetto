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

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Bridge from JS to ChannelForegroundService. */
class ForegroundModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoForeground"

    private fun sendToService(
        promise: Promise,
        configure: Intent.() -> Unit,
    ) {
        try {
            val intent = Intent(ctx, ChannelForegroundService::class.java).apply(configure)
            ContextCompat.startForegroundService(ctx, intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("foreground_service_error", e)
        }
    }

    @ReactMethod
    fun start(text: String, withCamera: Boolean, promise: Promise) {
        sendToService(promise) {
            putExtra(ChannelForegroundService.EXTRA_TEXT, text)
            putExtra(ChannelForegroundService.EXTRA_CAMERA, withCamera)
        }
    }

    /**
     * To be called when the video goes on or off: on Android 14+ using
     * the camera outside the foreground requires the service to declare
     * the "camera" type as well.
     */
    @ReactMethod
    fun setCameraActive(active: Boolean, promise: Promise) {
        sendToService(promise) {
            putExtra(ChannelForegroundService.EXTRA_CAMERA, active)
        }
    }

    @ReactMethod
    fun setText(text: String, name: String, promise: Promise) {
        sendToService(promise) {
            putExtra(ChannelForegroundService.EXTRA_TEXT, text)
            putExtra(ChannelForegroundService.EXTRA_NAME, name)
        }
    }

    /** Takes the quiet note away when it is not true any more. */
    @ReactMethod
    fun clearNote(promise: Promise) {
        Notifier.clearNote(ctx)
        promise.resolve(true)
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            ctx.stopService(Intent(ctx, ChannelForegroundService::class.java))
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("foreground_service_error", e)
        }
    }

    /**
     * Hands over to listening without an interface.
     *
     * It is called when the interface is about to disappear without
     * anybody having asked to leave: from that moment the app's
     * JavaScript engine is gone, and the connection would go with it.
     * PresenceService starts one with no window, which opens it again.
     *
     * With a little delay: the old context has to finish taking itself
     * apart, otherwise the task without an interface would be born inside
     * the one that is dying.
     */
    /**
     * To be called on entering and leaving the channel: the service
     * holds the CPU awake only while a conversation is actually running.
     * Waiting costs nothing - see the note on `inChannel` in the service.
     */
    @ReactMethod
    fun setInChannel(active: Boolean, promise: Promise) {
        sendToService(promise) {
            putExtra(ChannelForegroundService.EXTRA_IN_CHANNEL, active)
        }
    }

    /**
     * "Leave and become unavailable", written where a reboot cannot
     * erase it: the boot receiver, the watchdog alarm and the handovers
     * all read it before putting presence back on its feet.
     */
    @ReactMethod
    fun setAvailable(v: Boolean, promise: Promise) {
        WatchdogAlarm.setAvailable(ctx, v)
        promise.resolve(true)
    }

    /**
     * Whether there is anything for the watchdog alarm to watch over:
     * false while no pair is set up, true again the moment one is.
     */
    @ReactMethod
    fun watchdogWanted(v: Boolean, promise: Promise) {
        WatchdogAlarm.setWanted(ctx, v)
        promise.resolve(true)
    }

    @ReactMethod
    fun resumePresence(promise: Promise) {
        if (!PresenceService.canStart() || !WatchdogAlarm.available(ctx)) {
            promise.resolve(false)
            return
        }
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            try {
                ContextCompat.startForegroundService(
                    ctx,
                    Intent(ctx, PresenceService::class.java),
                )
            } catch (e: Exception) {
                android.util.Log.w("Duetto", "presence not resumed: ${e.message}")
            }
        }, 1500)
        promise.resolve(true)
    }

    // --- The settings that staying reachable depends on ---------------

    /**
     * The name the phone goes by, as its owner sees it.
     *
     * Build.MODEL is what the maker calls the hardware - "2511FPC34G"
     * for a POCO F5 - and nobody recognises their phone in it. The
     * device name in the system settings, the one shown in Bluetooth,
     * is what they would write themselves. Empty where there is none.
     */
    @ReactMethod
    fun deviceName(promise: Promise) {
        val resolver = ctx.contentResolver
        val name = try {
            android.provider.Settings.Global.getString(resolver, "device_name")
                ?: android.provider.Settings.Secure.getString(resolver, "bluetooth_name")
        } catch (e: Exception) { null }
        promise.resolve(name?.trim() ?: "")
    }

    @ReactMethod
    fun isBatteryUnrestricted(promise: Promise) {
        promise.resolve(StartupHelper.isIgnoringBatteryOptimizations(ctx))
    }

    @ReactMethod
    fun requestBatteryUnrestricted(promise: Promise) {
        promise.resolve(StartupHelper.requestIgnoreBatteryOptimizations(ctx, currentActivity))
    }

    /**
     * When the app last started up by itself, in milliseconds; 0 if it
     * never happened.
     *
     * It is the only way to know whether auto-start is granted: the
     * permission itself cannot be read by any app, but its effect can.
     */
    @ReactMethod
    fun lastAutoStart(promise: Promise) {
        val p = ctx.getSharedPreferences(BootReceiver.PREFS, android.content.Context.MODE_PRIVATE)
        promise.resolve(p.getLong(BootReceiver.LAST_AUTO_START, 0L).toDouble())
    }

    /** How long the phone has been on: it dates the last reboot. */
    @ReactMethod
    fun uptimeMs(promise: Promise) {
        promise.resolve(android.os.SystemClock.elapsedRealtime().toDouble())
    }

    @ReactMethod
    fun hasAutoStartScreen(promise: Promise) {
        promise.resolve(StartupHelper.hasAutoStartScreen(ctx))
    }

    @ReactMethod
    fun openAutoStartSettings(promise: Promise) {
        promise.resolve(StartupHelper.openAutoStartSettings(ctx, currentActivity))
    }

    @ReactMethod
    fun openAppSettings(promise: Promise) {
        promise.resolve(StartupHelper.openAppSettings(ctx, currentActivity))
    }

    /** News to be read at leisure: it does not sound and does not buzz. */
    @ReactMethod
    fun note(name: String, text: String, promise: Promise) {
        try {
            Notifier.showNote(ctx, name, text)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("notify_error", e)
        }
    }

    /** An alert to show when the app is not in the foreground. */
    @ReactMethod
    fun notify(name: String, text: String, promise: Promise) {
        try {
            Notifier.show(ctx, name, text)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("notify_error", e)
        }
    }

    /** Takes the alert away, when the user has come back into the app. */
    @ReactMethod
    fun clearNotification(promise: Promise) {
        Notifier.cancel(ctx)
        promise.resolve(true)
    }
}
