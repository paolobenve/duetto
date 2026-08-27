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

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Brings presence back after the phone reboots.
 *
 * BEWARE on Xiaomi/POCO and the like: this event is not delivered at all
 * unless the app has "Auto-start" enabled in the system settings. There
 * is no way around it from code.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        // The names in storage have changed: this is the first stop.
        Bridge.migrate(context)
        val action = intent.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != Intent.ACTION_LOCKED_BOOT_COMPLETED &&
            action != "android.intent.action.QUICKBOOT_POWERON"
        ) return

        /**
         * Note down that the event arrived.
         *
         * That permission cannot be read - it is a manufacturer's screen,
         * no app can query it - but the only thing that really matters is
         * whether the app comes back after a reboot. If this event
         * arrives, that is field proof it is fine; if it never does, the
         * user finds out by themselves.
         */
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putLong(LAST_AUTO_START, System.currentTimeMillis())
            .apply()

        if (!PresenceService.canStart()) return
        try {
            ContextCompat.startForegroundService(
                context,
                Intent(context, PresenceService::class.java),
            )
            Log.i("Duetto", "presence restarted after boot")
        } catch (e: Exception) {
            // If the system forbids it there is not much to do: the user
            // will open the app and presence will start from there.
            Log.w("Duetto", "could not restart presence: ${e.message}")
        }
    }

    companion object {
        const val PREFS = "duetto_boot"
        const val LAST_AUTO_START = "last_auto_start"

        /**
         * The former names, in Italian: they are read once and written
         * back under the new ones.
         *
         * The project moves to English to be published, and along with
         * the rest the names things are stored under on the phone change
         * too. Whoever already has the app must not notice. This bridge
         * goes away in the next version.
         */
        const val OLD_PREFS = "duetto_avvio"
        const val OLD_LAST_AUTO_START = "ultimo_avvio_automatico"
    }
}
