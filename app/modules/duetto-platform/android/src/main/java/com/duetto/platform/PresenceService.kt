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

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Without going to the foreground, Android would close the service
        // within seconds, and presence would last about as long as a match.
        Notifier.startForegroundPresence(this)
        // If we are here after the system killed us, the reason is written
        // down somewhere: take it now, before the older deaths drop off
        // the list Android keeps.
        Journal.recordExits(applicationContext)
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
        /** True if the system allows starting it right now. */
        fun canStart(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
    }
}
