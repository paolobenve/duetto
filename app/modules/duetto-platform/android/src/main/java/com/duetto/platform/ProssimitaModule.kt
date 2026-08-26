package com.duetto.platform

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Dice quando qualcosa copre lo schermo: una tasca, una cover chiusa.
 *
 * PERCHE' SERVE
 * Durante una conversazione il sistema spegne il display quando il
 * sensore e' coperto, ma solo con la cornetta: con il vivavoce quel
 * comportamento e' disattivato di proposito, perche' il telefono lo si
 * tiene in mano o appoggiato. Chi pero' se lo mette in tasca con il
 * vivavoce acceso si ritrova lo schermo vivo contro qualcosa, e tutto
 * quello che tocca il vetro arriva ai pulsanti: nel diario sono comparse
 * uscite dal canale che nessuno aveva premuto, con contatti di quaranta
 * millisecondi, mentre l'altro usciva di casa.
 *
 * Qui non si spegne niente e non si tocca l'audio: si dice soltanto che
 * lo schermo e' coperto, e chi disegna i comandi smette di considerare
 * i tocchi delle scelte.
 *
 * Il sensore, sui telefoni, e' quasi sempre a due valori - vicino o
 * lontano - quindi si confronta con la sua portata massima invece di
 * cercare una distanza precisa.
 */
class ProssimitaModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoProssimita"

    private val sensori: SensorManager?
        get() = ctx.getSystemService(Context.SENSOR_SERVICE) as? SensorManager

    private var registrato = false
    private var coperto = false

    private val ascolto = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) {
            val sensore = e.sensor ?: return
            val valore = e.values.firstOrNull() ?: return
            // Vicino: sotto la portata massima, e comunque sotto cinque
            // centimetri. I sensori a due valori riportano 0 o la
            // portata; quelli a distanza, i centimetri.
            val vicino = valore < sensore.maximumRange && valore < 5f
            if (vicino == coperto) return
            coperto = vicino
            emit()
        }

        override fun onAccuracyChanged(s: Sensor?, accuratezza: Int) {}
    }

    private fun emit() {
        if (!ctx.hasActiveReactInstance()) return
        try {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT, coperto)
        } catch (_: Exception) { /* noop */ }
    }

    /** Comincia a guardare. Idempotente: si chiama entrando nel canale. */
    @ReactMethod
    fun start(promise: Promise) {
        if (registrato) { promise.resolve(true); return }
        val sm = sensori
        val sensore = sm?.getDefaultSensor(Sensor.TYPE_PROXIMITY)
        if (sm == null || sensore == null) { promise.resolve(false); return }
        // Il ritmo piu' lento: qui interessa "coperto o no", non la
        // distanza, e un sensore interrogato di rado consuma meno.
        sm.registerListener(ascolto, sensore, SensorManager.SENSOR_DELAY_NORMAL)
        registrato = true
        promise.resolve(true)
    }

    /** Smette: fuori dal canale non c'e' niente da proteggere. */
    @ReactMethod
    fun stop(promise: Promise) {
        if (registrato) {
            try { sensori?.unregisterListener(ascolto) } catch (_: Exception) { /* noop */ }
            registrato = false
        }
        coperto = false
        promise.resolve(true)
    }

    /** Com'e' adesso, per chi si registra a giochi gia' fatti. */
    @ReactMethod
    fun coperto(promise: Promise) {
        promise.resolve(coperto)
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    companion object {
        const val EVENT = "duetto-prossimita"
    }
}
