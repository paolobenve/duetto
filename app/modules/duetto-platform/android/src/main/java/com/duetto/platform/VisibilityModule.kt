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
 * Dice se l'app sta davvero mostrando qualcosa sullo schermo.
 *
 * Serve a non trasmettere video a un telefono che non lo guarda: senza,
 * la camera dell'altro continua a spedire ~300 kB/s verso uno schermo
 * spento, che sulla rete cellulare si paga.
 *
 * Perché non basta AppState di React Native: su Android segnala la
 * PAUSA dell'activity, e in Picture-in-Picture l'activity è in pausa pur
 * essendo perfettamente visibile. Spegneremmo il video proprio nella
 * finestrella fatta per continuare a vederlo.
 *
 * onStart/onStop dell'activity hanno invece esattamente il significato
 * che ci serve: onStop arriva quando l'app sparisce davvero dalla vista
 * - schermo spento, o un'altra app davanti - e NON arriva in PiP.
 */
class VisibilityModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoVisibility"

    /** Quante activity dell'app sono attualmente visibili. */
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
            // Un evento perso vale una trasmissione non ottimizzata,
            // non vale far cadere l'app.
        }
    }

    /**
     * Comincia a segnalare i cambiamenti. Idempotente: JS può chiamarlo
     * a ogni montaggio senza accumulare registrazioni.
     */
    @ReactMethod
    fun start(promise: Promise) {
        if (registered) { promise.resolve(true); return }
        val app = ctx.applicationContext as? Application
        if (app == null) { promise.resolve(false); return }
        // Se un'activity è già in piedi partiamo da "visibile": il primo
        // onStart potrebbe essere già passato quando JS si registra.
        if (ctx.currentActivity != null) started = 1
        app.registerActivityLifecycleCallbacks(callbacks)
        registered = true
        promise.resolve(true)
    }

    /** Stato attuale, per chi si registra a giochi già fatti. */
    @ReactMethod
    fun isVisible(promise: Promise) {
        promise.resolve(started > 0)
    }

    // Richiesti da NativeEventEmitter: senza, React Native avvisa a ogni
    // addListener che il modulo non li implementa.
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    companion object {
        const val EVENT = "duetto-visibility"
    }
}
