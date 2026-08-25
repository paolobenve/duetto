package com.duetto.platform

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
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

    private val am: AudioManager?
        get() = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

    /**
     * Il volume di chiamata del telefono, e il suo massimo.
     *
     * E' meta' di quello che si sente: l'altra meta' e' il guadagno di
     * Duetto, che moltiplica il suono prima di suonarlo. Il livello che
     * l'app mostra e' il prodotto dei due, e questo e' il fattore che
     * comanda il telefono - quello che Android ricorda separatamente per
     * cornetta, altoparlante, cuffie e bluetooth, e che si muove anche
     * da fuori.
     */
    @ReactMethod
    fun leggi(promise: Promise) {
        val a = am
        val m = Arguments.createMap()
        if (a == null) {
            m.putInt("volume", 0)
            m.putInt("max", 0)
            promise.resolve(m)
            return
        }
        try {
            m.putInt("volume", a.getStreamVolume(AudioManager.STREAM_VOICE_CALL))
            m.putInt("max", a.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL))
        } catch (_: Exception) {
            m.putInt("volume", 0)
            m.putInt("max", 0)
        }
        promise.resolve(m)
    }

    /** Mette il volume di chiamata a un valore preciso. */
    @ReactMethod
    fun metti(valore: Int, promise: Promise) {
        val a = am
        if (a == null) { promise.resolve(false); return }
        try {
            val max = a.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL)
            val v = valore.coerceIn(0, max)
            // Senza suoni e senza il pannello di sistema: la barretta la
            // disegna l'app, e vederne due sovrapposte confonde.
            a.setStreamVolume(AudioManager.STREAM_VOICE_CALL, v, 0)
            promise.resolve(true)
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * Avverte quando il volume di chiamata cambia, anche da fuori.
     *
     * Serve perche' il numero mostrato da Duetto non menta: se qualcuno
     * abbassa il volume da un'altra app o dal pannello di sistema, il
     * livello e' cambiato davvero, e finora l'app continuava a mostrare
     * il suo.
     *
     * L'azione non e' nella documentazione pubblica ma esiste da sempre
     * e la usano tutti; se un giorno non arrivasse piu', il livello si
     * riallineerebbe comunque a ogni battito e a ogni tocco dei tasti.
     */
    private var registrato = false
    private val ascolto = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.getIntExtra(EXTRA_TIPO, -1) != AudioManager.STREAM_VOICE_CALL) return
            if (!ctx.hasActiveReactInstance()) return
            try {
                ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(EVENTO_SISTEMA, intent.getIntExtra(EXTRA_VALORE, -1))
            } catch (_: Exception) { /* noop */ }
        }
    }

    @ReactMethod
    fun ascoltaSistema(promise: Promise) {
        if (registrato) { promise.resolve(true); return }
        try {
            // Con la bandiera, e non a mano: da Android 14 registrare un
            // ricevitore senza dichiarare se il segnale puo' venire da
            // fuori fa cadere l'app con una SecurityException. Questo
            // arriva dal sistema, quindi non e' esportato.
            ContextCompat.registerReceiver(
                ctx, ascolto, IntentFilter(AZIONE_VOLUME),
                ContextCompat.RECEIVER_NOT_EXPORTED,
            )
            registrato = true
            promise.resolve(true)
        } catch (_: Exception) {
            promise.resolve(false)
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
        const val EVENTO_SISTEMA = "duetto-volume-sistema"
        private const val AZIONE_VOLUME = "android.media.VOLUME_CHANGED_ACTION"
        private const val EXTRA_TIPO = "android.media.EXTRA_VOLUME_STREAM_TYPE"
        private const val EXTRA_VALORE = "android.media.EXTRA_VOLUME_STREAM_VALUE"
    }
}
