package com.duetto.platform

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * A heartbeat that arrives with the screen off too.
 *
 * WHY A JAVASCRIPT TIMER IS NOT ENOUGH
 * In React Native the timers are hooked to the rhythm of the screen's
 * frames: with the screen off there are no frames, and `setTimeout` never
 * fires. All of the app's safety nets - getting back to the server,
 * noticing a dead connection - were made of timers, so with the screen
 * off not one of them existed.
 *
 * The journal showed it plainly: connection lost at 06:36 with the phone
 * dozing, eight and a half minutes of nothing, and the remedy going off
 * at the exact instant the screen came on. The JavaScript engine was not
 * dead - it wrote the loss down itself - it wakes for EVENTS, not for
 * timers.
 *
 * This heartbeat is an event, and it is born of a native Handler, which
 * does not look at the frame rate: as long as the foreground service
 * keeps the CPU awake, it arrives on time with the screen off as well.
 */
class HeartbeatModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoHeartbeat"

    private val clock = Handler(Looper.getMainLooper())
    private var active = false

    /**
     * How long to wait until the next beat.
     *
     * Close together when we are disconnected, far apart when all is
     * well: with the screen off this is the ONLY engine running - the
     * JavaScript stopwatches follow the frame rate and stand still - so
     * while we are without a server, a beat a minute is one attempt a
     * minute. The journal showed a hole of seven minutes made of seven
     * attempts in all.
     */
    private var step = INTERVAL_MS

    private val beat = object : Runnable {
        override fun run() {
            if (!active) return
            emit()
            clock.postDelayed(this, step)
        }
    }

    private fun emit() {
        if (!ctx.hasActiveReactInstance()) return
        try {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT, INTERVAL_MS.toDouble())
        } catch (_: Exception) {
            // A lost beat costs a late check; it is not worth bringing the
            // app down for.
        }
    }

    /** Starts beating. Idempotent. */
    @ReactMethod
    fun start(promise: Promise) {
        if (active) { promise.resolve(true); return }
        active = true
        clock.postDelayed(beat, step)
        promise.resolve(true)
    }

    /**
     * Close together or far apart, according to how the connection is.
     *
     * The change counts from the next beat on, except when going to the
     * close rhythm: there it is rescheduled at once, because waiting out
     * the minute already under way would defeat the hurry.
     */
    @ReactMethod
    fun fast(fastNow: Boolean, promise: Promise) {
        val fresh = if (fastNow) FAST_INTERVAL_MS else INTERVAL_MS
        if (fresh == step) { promise.resolve(true); return }
        step = fresh
        if (active && fastNow) {
            clock.removeCallbacks(beat)
            clock.postDelayed(beat, step)
        }
        promise.resolve(true)
    }

    /** Stops: outside the channel and with no presence there is nothing to hold. */
    @ReactMethod
    fun stop(promise: Promise) {
        active = false
        clock.removeCallbacks(beat)
        promise.resolve(true)
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    companion object {
        const val EVENT = "duetto-heartbeat"

        /**
         * One minute: it is the longest hole we accept staying
         * disconnected without noticing, and as traffic it is a message
         * of a few tens of bytes.
         */
        const val INTERVAL_MS = 60_000L

        /** The step while we are without a server: four attempts a minute. */
        const val FAST_INTERVAL_MS = 15_000L
    }
}
