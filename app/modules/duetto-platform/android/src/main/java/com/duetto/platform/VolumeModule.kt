package com.duetto.platform

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Il ponte per i tasti del volume presi in mano dall'app.
 *
 * Manda a JavaScript un evento solo nei casi in cui il volume di sistema
 * non si e' mosso: la stragrande maggioranza delle pressioni non passa
 * mai di qui.
 */
class VolumeModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoVolume"

    init {
        Volume.avvisa = { direzione ->
            if (ctx.hasActiveReactInstance()) {
                ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(EVENTO, direzione)
            }
        }
    }

    /** Nel canale i tasti li guardiamo noi; fuori sono del sistema. */
    @ReactMethod
    fun prendiTasti(attivo: Boolean, promise: Promise) {
        Volume.attivo = attivo
        promise.resolve(true)
    }

    // Richiesti da NativeEventEmitter su iOS; su Android non servono, ma
    // averli evita l'avviso in console.
    @ReactMethod fun addListener(eventName: String) { /* noop */ }
    @ReactMethod fun removeListeners(count: Int) { /* noop */ }

    companion object {
        const val EVENTO = "duetto-volume"
    }
}
