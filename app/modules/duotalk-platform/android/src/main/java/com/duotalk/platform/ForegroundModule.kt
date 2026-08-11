package com.duotalk.platform

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Ponte JS -> ChannelForegroundService. */
class ForegroundModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuoTalkForeground"

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
     * Da chiamare quando accendi/spegni il video: su Android 14+ usare la
     * camera fuori dal primo piano richiede che il servizio dichiari anche
     * il tipo "camera".
     */
    @ReactMethod
    fun setCameraActive(active: Boolean, promise: Promise) {
        sendToService(promise) {
            putExtra(ChannelForegroundService.EXTRA_CAMERA, active)
        }
    }

    @ReactMethod
    fun setText(text: String, promise: Promise) {
        sendToService(promise) {
            putExtra(ChannelForegroundService.EXTRA_TEXT, text)
        }
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

    // --- Impostazioni da cui dipende il restare raggiungibili ---------

    @ReactMethod
    fun isBatteryUnrestricted(promise: Promise) {
        promise.resolve(StartupHelper.isIgnoringBatteryOptimizations(ctx))
    }

    @ReactMethod
    fun requestBatteryUnrestricted(promise: Promise) {
        promise.resolve(StartupHelper.requestIgnoreBatteryOptimizations(ctx))
    }

    @ReactMethod
    fun hasAutoStartScreen(promise: Promise) {
        promise.resolve(StartupHelper.hasAutoStartScreen(ctx))
    }

    @ReactMethod
    fun openAutoStartSettings(promise: Promise) {
        promise.resolve(StartupHelper.openAutoStartSettings(ctx))
    }

    @ReactMethod
    fun openAppSettings(promise: Promise) {
        promise.resolve(StartupHelper.openAppSettings(ctx))
    }

    /** Avviso da mostrare quando l'app non e' in primo piano. */
    @ReactMethod
    fun notify(title: String, text: String, promise: Promise) {
        try {
            Notifier.show(ctx, title, text)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("notify_error", e)
        }
    }

    /** Toglie l'avviso, quando l'utente e' rientrato nell'app. */
    @ReactMethod
    fun clearNotification(promise: Promise) {
        Notifier.cancel(ctx)
        promise.resolve(true)
    }
}
