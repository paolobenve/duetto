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

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * The net under everything: an alarm that looks at presence every ten
 * minutes, whatever else has died.
 *
 * The watchdog in JavaScript (watchdog.ts) hears the native heartbeat -
 * but the heartbeat is a Handler, and a Handler needs the CPU awake.
 * Keeping a wake lock for it would cost battery all night for something
 * that goes wrong once a month; this alarm costs one brief waking every
 * ten minutes and catches the same failures, later: `setAndAllowWhileIdle`
 * fires even in doze (at the pace doze allows, about one slot every nine
 * minutes, which is why the interval sits just above it).
 *
 * At each firing there are only three cases:
 *
 *  - The user said "unavailable", or there is nothing to listen for:
 *    the alarm cancels itself and that is that.
 *  - The JavaScript engine is alive: one heartbeat is struck by hand,
 *    the watchdog does its round, and a socket that died in silence is
 *    remade. A short wake lock keeps the CPU up long enough for that
 *    round to finish.
 *  - The engine is gone - the phone's maker killed the service, a
 *    handover failed and was only written down, never retried: the
 *    presence service is started again, the same road taken after a
 *    reboot. This is the one thing nothing else in the app can do.
 */
class WatchdogAlarm : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (!available(context) || !wanted(context)) {
            cancel(context)
            return
        }
        // The net goes back under our feet first: whatever happens
        // below, in ten minutes we look again.
        schedule(context)

        // The system holds the CPU only while onReceive runs: the round
        // we are about to set off - a question to the server, perhaps a
        // whole reconnection - takes a few seconds more. A short lock
        // with a timeout and no release: it lets go by itself.
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Duetto::watchdog").apply {
                setReferenceCounted(false)
                acquire(WORK_MS)
            }
        } catch (_: Exception) { /* the round just risks being cut short */ }

        if (HeartbeatModule.beatNow()) return

        if (!PresenceService.canStart()) return
        try {
            ContextCompat.startForegroundService(
                context,
                Intent(context, PresenceService::class.java),
            )
            Log.i("Duetto", "watchdog alarm: presence restarted")
            // In the journal, not only in logcat: logcat has evaporated
            // by the morning after, and the one night this line matters
            // is a night nobody was watching. Its very ABSENCE speaks
            // too: a dead app with no watchdog lines afterwards means
            // the kill was of the force-stop kind, the one that wipes
            // the alarms themselves - and that no app can survive.
            Journal.sample(context, "watchdog-resurrect")
        } catch (e: Exception) {
            // Refused now does not mean refused for ever: the alarm just
            // rescheduled itself, and in ten minutes we try again - this
            // used to be written down as `presence-refused` and never
            // retried by anybody.
            Log.w("Duetto", "watchdog alarm: presence not restarted: ${e.message}")
            Journal.sample(context, "watchdog-refused")
        }
    }

    companion object {
        /**
         * Just above doze's own pace: asking more often would not be
         * granted, and asking less often widens the hole for nothing.
         */
        private const val INTERVAL_MS = 10L * 60L * 1000L

        /** Enough for one round of the watchdog, reconnection included. */
        private const val WORK_MS = 15_000L

        const val PREFS = "duetto_presence"
        const val KEY_AVAILABLE = "available"
        const val KEY_WANTED = "watchdog_wanted"

        private fun pending(ctx: Context): PendingIntent =
            PendingIntent.getBroadcast(
                ctx, 0,
                Intent(ctx, WatchdogAlarm::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        /** One-shot, re-armed at every firing. Idempotent. */
        fun schedule(ctx: Context) {
            try {
                val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                // Inexact on purpose: it needs no permission, and "about
                // ten minutes" is exactly as good as ten.
                am.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    System.currentTimeMillis() + INTERVAL_MS,
                    pending(ctx),
                )
            } catch (e: Exception) {
                Log.w("Duetto", "watchdog alarm not set: ${e.message}")
            }
        }

        fun cancel(ctx: Context) {
            try {
                val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                am.cancel(pending(ctx))
            } catch (_: Exception) { /* noop */ }
        }

        /**
         * "Leave and become unavailable", made to survive a reboot.
         *
         * It used to live in the interface's memory alone: the phone
         * rebooted, the choice was forgotten, and somebody who had asked
         * to be left alone found themselves reachable again. Absent
         * means true, so existing installs behave as before.
         */
        fun available(ctx: Context): Boolean =
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_AVAILABLE, true)

        fun setAvailable(ctx: Context, v: Boolean) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean(KEY_AVAILABLE, v).apply()
            if (v) schedule(ctx) else cancel(ctx)
        }

        /**
         * Whether there is anything to watch over at all: false while no
         * pair is set up, so the alarm does not spend the night starting
         * a service that has nothing to listen for.
         */
        fun wanted(ctx: Context): Boolean =
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_WANTED, true)

        fun setWanted(ctx: Context, v: Boolean) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean(KEY_WANTED, v).apply()
            if (v) schedule(ctx) else cancel(ctx)
        }
    }
}
