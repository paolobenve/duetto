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

import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Keeps presence alive WITHOUT opening the interface.
 *
 * It is what a reboot needs: from Android 10 on, starting an activity
 * from the background is forbidden, so the app cannot "open itself". The
 * JavaScript engine can be started without an interface, though, and that
 * is what this service does: the same connection logic that already
 * exists starts up again and the phone becomes reachable once more.
 *
 * The JS task never finishes on purpose (see presence.ts): it has to keep
 * listening for as long as the service lives.
 */
class PresenceService : HeadlessJsTaskService() {

    private val clock = Handler(Looper.getMainLooper())
    private var stopped = false

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Without going to the foreground, Android would close the service
        // within seconds, and presence would last about as long as a match.
        Notifier.startForegroundPresence(this)
        // Once more in a moment: the channel service we are taking over
        // from shares this notification's number, and its teardown can
        // arrive AFTER our start - cancelling the line from under us and
        // leaving a foreground service with no notification, which
        // Android punishes. Re-posting is idempotent and costs nothing.
        clock.postDelayed({
            if (!stopped) Notifier.startForegroundPresence(this)
        }, 4000)
        // If we are here after the system killed us, the reason is written
        // down somewhere: take it now, before the older deaths drop off
        // the list Android keeps.
        Journal.recordExits(applicationContext)
        // The net under the waiting: if this service dies unnoticed, the
        // alarm starts it again within minutes. See WatchdogAlarm.
        WatchdogAlarm.schedule(this)
        return super.onStartCommand(intent, flags, startId)
    }

    /**
     * Here too, swiping the app out of the recents does not stop presence.
     *
     * Same rule as the channel service, and for the same reason: that
     * gesture is made to tidy up, not to say "do not look for me any
     * more", and whoever made it found themselves unreachable without
     * knowing. What says it in so many words is "leave and become
     * unavailable".
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        stopped = true
        clock.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    /**
     * The processor let sleep once the task is under way.
     *
     * React Native keeps the processor awake for as long as a task with no
     * interface runs, and this one never ends, on purpose: from the moment
     * the presence started - after a reboot, an update, an app closed by
     * the phone - the phone never slept again. On 12 October the POCO had
     * been on for fourteen days and its time awake was its time on, to the
     * second, with the screen off drawing 180 to 220 mA even while merely
     * waiting. The process lives on through the foreground service; the
     * processor wakes for what concerns us - the network's packets, the
     * watchdog's alarm every ten minutes (see WatchdogAlarm, written for
     * exactly this: "a wake lock would cost battery all night") - and the
     * channel's own wake locks stay in the channel, as they must.
     */
    override fun startTask(taskConfig: HeadlessJsTaskConfig) {
        super.startTask(taskConfig)
        // A moment for the engine to start and the connection to be made.
        clock.postDelayed({ letProcessorSleep() }, PROCESSOR_SLEEP_AFTER_MS)
    }

    private fun letProcessorSleep() {
        try {
            val field = HeadlessJsTaskService::class.java.getDeclaredField("sWakeLock")
            field.isAccessible = true
            val lock = field.get(null) as? PowerManager.WakeLock ?: return
            if (!lock.isHeld) return
            lock.release()
            Journal.sample(applicationContext, "presence:processor-let-sleep")
        } catch (e: Throwable) {
            Log.w("Duetto", "presence: the processor's lock cannot be let go: ${e.message}")
        }
    }

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        return HeadlessJsTaskConfig(
            "duetto-presence",
            Arguments.createMap(),
            // 0 = no time limit: the task has to stay alive.
            0,
            // Carry on even when the app is in the foreground: it is up to
            // JS to step aside when the interface takes over (see
            // presence.ts).
            true,
        )
    }

    companion object {
        /** how long after the task starts the processor is let sleep */
        private const val PROCESSOR_SLEEP_AFTER_MS = 15_000L

        /** True if the system allows starting it right now. */
        fun canStart(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
    }
}
