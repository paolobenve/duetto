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

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
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

    init {
        // For the alarm's hand-struck beat: see beatNow().
        current = this
    }

    override fun invalidate() {
        if (current === this) current = null
        clock.removeCallbacks(redialBeat)
        super.invalidate()
    }

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

    /**
     * The quick beat of a server just lost: one every two seconds.
     *
     * With the app behind, JavaScript's timers stand still even with
     * the screen on - React Native stops them when the activity is
     * paused - and a lost server is dialled again by a timer. At the
     * server's restarts of 19 October the POCO, in front, was back in a
     * second; the Edge, behind, in fifteen, at the next fifteen-second
     * beat; and the night before the POCO itself, gone behind, waited
     * forty-seven. This beat is what the stopped timers would have
     * been: whoever hears it does the try that was due.
     *
     * It lasts while somebody holds it - each connection under its own
     * name, for as long as it holds the processor up to dial again (see
     * signaling.ts) - and stops by itself when the last hold runs out:
     * a server down for an hour is not beaten for every two seconds.
     * Its own event, apart from the heartbeat's: the heartbeat's round
     * asks the server a question and checks the answer at the next
     * beat, and two seconds is too short a wait for that answer.
     * Everything runs on the main thread, the clock's: no locks.
     */
    private val redialUntil = HashMap<String, Long>()
    private var redialing = false

    private val redialBeat = object : Runnable {
        override fun run() {
            val now = SystemClock.elapsedRealtime()
            redialUntil.values.removeAll { it <= now }
            if (redialUntil.isEmpty()) { redialing = false; return }
            if (ctx.hasActiveReactInstance()) {
                try {
                    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit(REDIAL_EVENT, REDIAL_INTERVAL_MS.toDouble())
                } catch (_: Exception) {
                    // a lost beat is a try two seconds later
                }
            }
            clock.postDelayed(this, REDIAL_INTERVAL_MS)
        }
    }

    /** Holds the quick beat for `ms` under `tag`; 0 lets go of it. */
    @ReactMethod
    fun redial(tag: String, ms: Double, promise: Promise) {
        clock.post {
            if (ms <= 0) {
                redialUntil.remove(tag)
            } else {
                redialUntil[tag] = SystemClock.elapsedRealtime() + ms.toLong().coerceIn(1_000L, 120_000L)
                if (!redialing) {
                    redialing = true
                    clock.postDelayed(redialBeat, REDIAL_INTERVAL_MS)
                }
            }
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
        const val REDIAL_EVENT = "duetto-heartbeat-redial"
        /** the quick beat's step: see redial() */
        const val REDIAL_INTERVAL_MS = 2_000L

        @Volatile
        private var current: HeartbeatModule? = null

        /**
         * One beat, struck by hand.
         *
         * The watchdog alarm calls this when it fires: if the
         * JavaScript engine is alive, the beat sets off the same round
         * as the clock's own - the connection is looked at, a dead one
         * is remade. True if the beat was delivered; false means there
         * is no engine to hear it, and the caller must take the longer
         * road through the presence service.
         */
        fun beatNow(): Boolean {
            val m = current ?: return false
            if (!m.ctx.hasActiveReactInstance()) return false
            return try {
                m.ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(EVENT, 0.0)
                true
            } catch (_: Exception) {
                false
            }
        }

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
