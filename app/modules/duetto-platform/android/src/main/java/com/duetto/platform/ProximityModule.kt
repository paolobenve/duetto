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
 * Says when something is covering the screen: a pocket, a closed case.
 *
 * WHY IT IS NEEDED
 * During a conversation the system turns the display off when the sensor
 * is covered, but only with the earpiece: with the speaker on, that
 * behaviour is disabled on purpose, because the phone is held in the hand
 * or put down. Somebody who puts it in their pocket with the speaker on,
 * though, ends up with a live screen against something, and everything
 * that touches the glass reaches the buttons: the journal showed exits
 * from the channel nobody had pressed, with contacts of forty
 * milliseconds, while the other person was leaving the house.
 *
 * Nothing is turned off here and the audio is not touched: it only says
 * that the screen is covered, and whoever draws the controls stops taking
 * the touches for choices.
 *
 * On phones the sensor nearly always has two values - near or far - so it
 * is compared against its own maximum range instead of looking for a
 * precise distance.
 */
class ProximityModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoProximity"

    private val sensors: SensorManager?
        get() = ctx.getSystemService(Context.SENSOR_SERVICE) as? SensorManager

    private var registered = false
    private var covered = false

    private val listener = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) {
            val sensor = e.sensor ?: return
            val value = e.values.firstOrNull() ?: return
            // Near: below the maximum range, and below five centimetres
            // anyway. Two-value sensors report 0 or the range; the ones
            // that measure distance report centimetres.
            val near = value < sensor.maximumRange && value < 5f
            if (near == covered) return
            covered = near
            emit()
        }

        override fun onAccuracyChanged(s: Sensor?, accuracy: Int) {}
    }

    private fun emit() {
        if (!ctx.hasActiveReactInstance()) return
        try {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT, covered)
        } catch (_: Exception) { /* noop */ }
    }

    /** Starts watching. Idempotent: it is called on entering the channel. */
    @ReactMethod
    fun start(promise: Promise) {
        if (registered) { promise.resolve(true); return }
        val sm = sensors
        val sensor = sm?.getDefaultSensor(Sensor.TYPE_PROXIMITY)
        if (sm == null || sensor == null) { promise.resolve(false); return }
        // The slowest rate: what matters here is "covered or not", not the
        // distance, and a sensor asked rarely uses less.
        sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL)
        registered = true
        promise.resolve(true)
    }

    /** Stops: outside the channel there is nothing to protect. */
    @ReactMethod
    fun stop(promise: Promise) {
        if (registered) {
            try { sensors?.unregisterListener(listener) } catch (_: Exception) { /* noop */ }
            registered = false
        }
        covered = false
        promise.resolve(true)
    }

    /** How it is now, for whoever registers once the game is on. */
    @ReactMethod
    fun covered(promise: Promise) {
        promise.resolve(covered)
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    companion object {
        const val EVENT = "duetto-proximity"
    }
}
