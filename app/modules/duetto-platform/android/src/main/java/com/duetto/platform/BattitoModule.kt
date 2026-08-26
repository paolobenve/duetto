package com.duetto.platform

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Un battito che arriva anche a schermo spento.
 *
 * PERCHE' NON BASTA UN TIMER DI JAVASCRIPT
 * In React Native i timer sono agganciati al ritmo dei fotogrammi dello
 * schermo: a schermo spento non ci sono fotogrammi, e `setTimeout` non
 * scade. Tutte le reti di sicurezza dell'app - riagganciarsi al server,
 * accorgersi di una connessione morta - erano fatte di timer, quindi a
 * schermo spento non ne esisteva nessuna.
 *
 * Il diario lo ha mostrato in chiaro: connessione caduta alle 06:36 con
 * il telefono in letargo, otto minuti e mezzo di niente, e il rimedio
 * scattato nell'istante esatto in cui lo schermo si e' acceso. Il motore
 * JavaScript non era morto - la caduta l'ha scritta lui - si sveglia per
 * gli EVENTI, non per i timer.
 *
 * Questo battito e' un evento, e nasce da un Handler nativo, che il
 * ritmo dei fotogrammi non lo guarda: finche' il servizio in primo piano
 * tiene sveglia la CPU, arriva puntuale anche con lo schermo spento.
 */
class BattitoModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoBattito"

    private val orologio = Handler(Looper.getMainLooper())
    private var attivo = false

    /**
     * Quanto aspettare fino al prossimo battito.
     *
     * Fitto quando siamo scollegati, rado quando tutto va: a schermo
     * spento questo e' l'UNICO motore che gira - i cronometri di
     * JavaScript seguono il ritmo dei fotogrammi e stanno fermi - quindi
     * mentre si e' senza server un battito al minuto e' un tentativo al
     * minuto. Nel diario si e' visto un buco di sette minuti fatto di
     * sette tentativi soli.
     */
    private var passo = INTERVALLO_MS

    private val battito = object : Runnable {
        override fun run() {
            if (!attivo) return
            emit()
            orologio.postDelayed(this, passo)
        }
    }

    private fun emit() {
        if (!ctx.hasActiveReactInstance()) return
        try {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT, INTERVALLO_MS.toDouble())
        } catch (_: Exception) {
            // Un battito perso vale un controllo in ritardo, non vale
            // far cadere l'app.
        }
    }

    /** Comincia a battere. Idempotente. */
    @ReactMethod
    fun start(promise: Promise) {
        if (attivo) { promise.resolve(true); return }
        attivo = true
        orologio.postDelayed(battito, passo)
        promise.resolve(true)
    }

    /**
     * Fitto o rado, secondo come sta il collegamento.
     *
     * Il cambio vale dal battito successivo, tranne quando si passa al
     * fitto: li' si riprogramma subito, perche' aspettare il minuto che
     * era gia' in corso vanificherebbe la fretta.
     */
    @ReactMethod
    fun fitto(sveltoOra: Boolean, promise: Promise) {
        val nuovo = if (sveltoOra) INTERVALLO_FITTO_MS else INTERVALLO_MS
        if (nuovo == passo) { promise.resolve(true); return }
        passo = nuovo
        if (attivo && sveltoOra) {
            orologio.removeCallbacks(battito)
            orologio.postDelayed(battito, passo)
        }
        promise.resolve(true)
    }

    /** Smette: fuori dal canale e senza presenza non c'e' niente da tenere. */
    @ReactMethod
    fun stop(promise: Promise) {
        attivo = false
        orologio.removeCallbacks(battito)
        promise.resolve(true)
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    companion object {
        const val EVENT = "duetto-battito"

        /**
         * Un minuto: e' il buco massimo che si accetta di restare
         * scollegati senza accorgersene, e come traffico e' un messaggio
         * di poche decine di byte.
         */
        const val INTERVALLO_MS = 60_000L

        /** Il passo mentre si e' senza server: quattro tentativi al minuto. */
        const val INTERVALLO_FITTO_MS = 15_000L
    }
}
