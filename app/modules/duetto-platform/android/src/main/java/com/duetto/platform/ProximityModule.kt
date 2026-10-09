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

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
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
 *
 * NEAR, AND HOW THE PHONE LIES
 * The same sensor says when the phone is at the ear, for the speaker to
 * give way to the earpiece. On 9 October the POCO - whose "sensor" is
 * Elliptic Labs' ultrasound, not a light - said near some twenty times
 * while it lay on the table, and the sound went to the earpiece and back,
 * five times in two minutes. Android keeps such a sensor in check with
 * the way the phone lies, and so does this module now: while the sensor
 * says near, and only then, the accelerometer says whether the phone is
 * flat. Flat it is at nobody's ear, face up or face down; face up its
 * screen is not covered either - a pocket does not lie flat on its back -
 * while face down on the table it is, and the touches stay blocked.
 */
class ProximityModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoProximity"

    private val sensors: SensorManager?
        get() = ctx.getSystemService(Context.SENSOR_SERVICE) as? SensorManager

    /** How many are listening: the controls and the audio, each its own way. */
    @Volatile private var users = 0
    private var near = false
    /** The phone flat: 1 face up, -1 face down, 0 not flat. */
    private var lying = 0
    /** Whether the accelerometer has spoken since the sensor said near. */
    private var lyingKnown = false
    /** What has been told about a near set aside, once each time. */
    private var toldLying = 0
    @Volatile private var covered = false
    private var ear = false
    private val main = Handler(Looper.getMainLooper())

    private val listener = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) {
            val sensor = e.sensor ?: return
            val value = e.values.firstOrNull() ?: return
            // Near: below the maximum range, and below five centimetres
            // anyway. Two-value sensors report 0 or the range; the ones
            // that measure distance report centimetres.
            val now = value < sensor.maximumRange && value < 5f
            if (now == near) return
            near = now
            if (near) watchLying() else stopLying()
            update()
        }

        override fun onAccuracyChanged(s: Sensor?, accuracy: Int) {}
    }

    /**
     * How flat the phone is, from where gravity pulls: straight through
     * the screen, the phone lies flat. Within 30 degrees of the table it
     * counts as flat; once flat, it has to rise past 40 to stop being so,
     * or a hand resting on a phone on the table would make it waver.
     */
    private val tilt = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) {
            if (e.values.size < 3) return
            val x = e.values[0]
            val y = e.values[1]
            val z = e.values[2]
            val g = Math.sqrt((x * x + y * y + z * z).toDouble())
            // Thrown or falling: no gravity to read.
            if (g < 3.0) return
            val r = z / g
            val up = if (lyingKnown && lying == 1) FLAT_STAYS else FLAT_FROM
            val down = if (lyingKnown && lying == -1) FLAT_STAYS else FLAT_FROM
            lying = when {
                r > up -> 1
                r < -down -> -1
                else -> 0
            }
            lyingKnown = true
            update()
        }

        override fun onAccuracyChanged(s: Sensor?, accuracy: Int) {}
    }

    /**
     * The accelerometer, only while the sensor says near: the rest of the
     * time it is not needed, and costs nothing. Until it answers nothing
     * is said; a phone without one, or one that stays silent, is taken
     * for one held upright - as it was before.
     */
    private fun watchLying() {
        lyingKnown = false
        lying = 0
        val sm = sensors
        val acc = sm?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        if (sm == null || acc == null) {
            lyingKnown = true
            return
        }
        sm.registerListener(tilt, acc, SensorManager.SENSOR_DELAY_UI)
        main.postDelayed(silentTilt, 600)
    }

    private val silentTilt = Runnable {
        if (near && !lyingKnown) {
            lyingKnown = true
            update()
        }
    }

    private fun stopLying() {
        main.removeCallbacks(silentTilt)
        try { sensors?.unregisterListener(tilt) } catch (_: Exception) { /* noop */ }
        lyingKnown = false
        lying = 0
        toldLying = 0
    }

    /**
     * Covered, for the controls: near, unless lying on its back. At the
     * ear, for the sound: near, and not lying at all.
     */
    private fun update() {
        val known = near && lyingKnown
        val nowCovered = known && lying != 1
        val nowEar = known && lying == 0
        if (known && lying != 0 && toldLying != lying) {
            toldLying = lying
            Journal.sample(ctx, "proximity:ignored:${if (lying == 1) "flat-up" else "flat-down"}")
        }
        if (nowCovered == covered && nowEar == ear) return
        covered = nowCovered
        ear = nowEar
        emit()
    }

    private fun emit() {
        if (!ctx.hasActiveReactInstance()) return
        try {
            val m = Arguments.createMap()
            m.putBoolean("covered", covered)
            m.putBoolean("ear", ear)
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT, m)
        } catch (_: Exception) { /* noop */ }
    }

    /**
     * Starts watching, for one more listener: the controls on entering
     * the channel, the audio for the ear.
     */
    @ReactMethod
    fun start(promise: Promise) {
        users++
        if (users > 1) { promise.resolve(true); return }
        val sm = sensors
        val sensor = sm?.getDefaultSensor(Sensor.TYPE_PROXIMITY)
        if (sm == null || sensor == null) { promise.resolve(false); return }
        // The slowest rate: what matters here is "covered or not", not the
        // distance, and a sensor asked rarely uses less.
        sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL)
        promise.resolve(true)
    }

    /** One listener less; with none left there is nothing to protect. */
    @ReactMethod
    fun stop(promise: Promise) {
        if (users > 0) users--
        // Where the sensors speak, so that nothing changes under them.
        if (users == 0) main.post { if (users == 0) quiet() }
        promise.resolve(true)
    }

    private fun quiet() {
        try { sensors?.unregisterListener(listener) } catch (_: Exception) { /* noop */ }
        stopLying()
        near = false
        covered = false
        ear = false
    }

    override fun invalidate() {
        users = 0
        main.post { quiet() }
        super.invalidate()
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
        /** cos 30 degrees: closer than this to the table, flat */
        const val FLAT_FROM = 0.866
        /** cos 40 degrees: once flat, flat until past this */
        const val FLAT_STAYS = 0.766
    }
}
