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

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.text.HtmlCompat

/**
 * Alert notifications ("Anna is in the channel").
 *
 * They are a different thing from the foreground service's standing
 * notification: that one is silent and only serves to keep the process
 * alive, this one has to be noticed. That is why they sit on two separate
 * channels, so that you can also tune them independently from Android's
 * settings.
 */
object Notifier {

    private const val TAG = "Duetto"
    private const val ALERT_NOTIFICATION_ID = 4712
    private const val PRESENCE_CHANNEL_ID = "duetto_presence"
    private const val PRESENCE_NOTIFICATION_ID = 4711
    private const val NOTE_NOTIFICATION_ID = 4713

    /**
     * How long before a piece of news takes itself away: ten minutes.
     *
     * News grows old. "They came back at 8:35" read at noon does not say
     * anything true any more, and meanwhile it sits there among the
     * others: better that it disappears by itself.
     */
    private const val NOTE_TIMEOUT_MS = 10L * 60L * 1000L

    /**
     * A notification that makes no noise.
     *
     * It is there for things to know about, not for things to answer:
     * "the other person's app died and now it is back" is news, and using
     * the alerts channel for that - which sounds and buzzes as the user
     * asked - would mean making somebody jump to their feet over a piece
     * of information. It goes on the presence channel, which is mute by
     * construction, and it sits in a place of its own so as not to chase
     * away the real alert if they arrive together.
     */
    /** The title: the same for all, the connection's name is in the text. */
    private const val TITLE = "Duetto"

    /**
     * The text of a notification, with the connection's name in front.
     *
     * In italics, because it is not part of the sentence: it is the room
     * the sentence was said in. It sits in the TEXT and not in the title
     * because the title, with the notification folded, is not shown on a
     * good many phones - and "You are in the channel" without the name,
     * with more than one connection set up, does not say which.
     *
     * With a single connection the name is empty and nothing shows: there
     * is nothing to tell apart.
     */
    fun withName(name: String, text: String): CharSequence {
        if (name.isEmpty()) return text
        return HtmlCompat.fromHtml(
            "<i>${escape(name)}</i> · ${escape(text)}",
            HtmlCompat.FROM_HTML_MODE_LEGACY,
        )
    }

    /** The names are written by the user: a "<" must not become a tag. */
    private fun escape(s: String) =
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    /** Takes the news away: used when what it said is not true any more. */
    fun clearNote(ctx: Context) {
        try {
            NotificationManagerCompat.from(ctx).cancel(NOTE_NOTIFICATION_ID)
        } catch (_: Exception) { /* noop */ }
    }

    fun showNote(ctx: Context, name: String, text: String) {
        val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pending = PendingIntent.getActivity(
            ctx,
            2,
            launch,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(ctx, PRESENCE_CHANNEL_ID)
            .setContentTitle(TITLE)
            .setContentText(withName(name, text))
            .setStyle(NotificationCompat.BigTextStyle().bigText(withName(name, text)))
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setSilent(true)
            .setTimeoutAfter(NOTE_TIMEOUT_MS)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify(NOTE_NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
        }
    }

    fun show(ctx: Context, name: String, text: String) {
        // The channel depends on the preferences: see Alerts. The sound in
        // the ordinary case comes from there; vibration and sound during
        // the conversation are done by Alerts.alertNow below, because the
        // channel cannot.
        val channel = Alerts.channel(ctx)

        val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pending = PendingIntent.getActivity(
            ctx,
            1,
            launch,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        val builder = NotificationCompat.Builder(ctx, channel)
            .setContentTitle(TITLE)
            .setContentText(withName(name, text))
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH)

        // Before Android 8 the channels do not exist and these two things
        // are said here. From Android 8 on they are ignored: the channel
        // is in command, and repeating them does no harm.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setSound(Alerts.chosenSound(ctx))
            Alerts.chosenRhythm(ctx)?.let { builder.setVibrate(it) }
        }

        val notification = builder.build()

        try {
            // If the notification permission is denied it throws a
            // SecurityException: it is a missed alert, not a good reason
            // to bring the app down.
            NotificationManagerCompat.from(ctx).notify(ALERT_NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
        }

        // Vibration and sound that the notification alone cannot
        // guarantee: see Alerts.alertNow. It goes after, not before: if
        // the notification cannot be shown, an alert that merely sounds is
        // still better than nothing, but the natural order stays this one.
        Alerts.alertNow(ctx)
    }

    /** Where we keep the last title, to find it again after a reboot. */
    const val KEY_TITLE = "notification-title"

    /** Remembers what the connection in use is called. */
    fun rememberName(ctx: Context, title: String) {
        try {
            ctx.getSharedPreferences(BootReceiver.PREFS, Context.MODE_PRIVATE)
                .edit().putString(KEY_TITLE, title).apply()
        } catch (_: Exception) { /* noop */ }
    }

    /**
     * The name of the connection in use, as the app wrote it.
     *
     * It is read back from here because after the phone reboots the
     * presence notification appears before the app has spoken, and
     * without this it would not say which connection it is waiting on.
     */
    fun name(ctx: Context): String {
        return try {
            ctx.getSharedPreferences(BootReceiver.PREFS, Context.MODE_PRIVATE)
                .getString(KEY_TITLE, null) ?: ""
        } catch (_: Exception) { "" }
    }

    /**
     * Brings a service to the foreground with the presence notification.
     *
     * It reuses the main service's silent channel: it is the same
     * information ("you can be reached"), and two different standing
     * notifications would only be confusing.
     */
    fun startForegroundPresence(service: android.app.Service) {
        val launch = service.packageManager
            .getLaunchIntentForPackage(service.packageName)?.apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
        val pending = PendingIntent.getActivity(
            service, 2, launch,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = service.getSystemService(NotificationManager::class.java)
            if (manager?.getNotificationChannel(PRESENCE_CHANNEL_ID) == null) {
                manager?.createNotificationChannel(
                    NotificationChannel(
                        PRESENCE_CHANNEL_ID,
                        Strings.presenceChannel,
                        NotificationManager.IMPORTANCE_LOW,
                    ).apply {
                        description = Strings.reachableWhat
                        setShowBadge(false)
                        enableVibration(false)
                    },
                )
            }
        }

        val notification = NotificationCompat.Builder(service, PRESENCE_CHANNEL_ID)
            .setContentTitle(TITLE)
            .setContentText(withName(name(service), Strings.waiting))
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pending)
            // No `setOngoing`: it is that declaration that makes the
            // notification impossible to dismiss, and on Android 13 and
            // later it is of no use any more. From there on the system
            // lets a foreground service's notification be swiped away -
            // the service goes on running and one stays reachable all the
            // same - while before 13 it is the system itself that holds it
            // in place, with or without this line. Taking it away changes
            // nothing on old phones and gives the choice back on new ones.
            // It comes back at the first change of state, because a
            // foreground service has to have a notification.
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        /**
         * The type tells Android what this service is for, and from
         * Android 14 some types can only be asked for while in the
         * foreground. Here we hardly ever are: presence starts again after
         * a reboot, or when the interface has just been taken apart.
         *
         * "specialUse" is the honest one - staying reachable - and the
         * only one with no permissions to ask for and no limits on how
         * long it may run.
         */
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                service.startForeground(
                    PRESENCE_NOTIFICATION_ID,
                    notification,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
                )
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                service.startForeground(
                    PRESENCE_NOTIFICATION_ID,
                    notification,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
                )
            } else {
                service.startForeground(PRESENCE_NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            // If the system refuses, presence does not start: that is
            // trouble. But an app that crashes is worse, and whoever uses
            // it is not even left with a way of knowing what happened. It
            // writes it in the journal and stops.
            Log.w(TAG, "presence refused by the system: ${e.message}")
            Journal.sample(service.applicationContext, "presence-refused")
            try { service.stopSelf() } catch (_: Exception) { /* noop */ }
        }
    }

    fun cancel(ctx: Context) {
        try {
            NotificationManagerCompat.from(ctx).cancel(ALERT_NOTIFICATION_ID)
        } catch (_: Exception) {
        }
    }
}
