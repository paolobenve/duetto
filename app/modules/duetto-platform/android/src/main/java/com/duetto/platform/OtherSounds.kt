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

import android.app.Notification
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.telecom.Connection
import android.util.Log
import androidx.core.app.NotificationManagerCompat

/**
 * The other apps' notification sounds, while the channel is on.
 *
 * The channel is a call, and with a call on Android does not sound a
 * notification: it plays the in-call beep instead, which some phones
 * have switched off. On the POCO a WhatsApp message in the channel was
 * marked as sounded and nothing was heard (20 October). Duetto plays
 * what Android would have played, as it plays the ringtone of a phone
 * call (see Calls): the sound of the notification's own channel, as a
 * notification at Android's notification volume, or on the road of
 * Duetto's own sounds at a level of its own, above the other's voice.
 *
 * Seeing the notifications takes the notification access, which shows
 * all of them. Only the app, its channel and its flags are looked at,
 * never the text, and nothing is written but the app's name in the
 * journal. Off unless chosen.
 */
object OtherSounds {

    private const val TAG = "Duetto"
    private const val PREFS = "duetto_other_sounds"
    private const val KEY_SHARE = "share"

    /** An app posting several at once - a summary and the message - gets one sound. */
    private const val GAP_MS = 3000L

    private var lastAt = 0L
    private var ringtone: Ringtone? = null

    /** The level, a share of the cues' stream top; 0 = off, below 0 = Android's notification volume. */
    fun setShare(ctx: Context, share: Float) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putFloat(KEY_SHARE, if (share < 0f) AS_ANDROID else share.coerceIn(0f, 1f)).apply()
    }

    /** The level that says: as a notification, at Android's notification volume. */
    private const val AS_ANDROID = -1f

    private fun share(ctx: Context): Float =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getFloat(KEY_SHARE, 0f)

    /** Whether Android lets Duetto see the notifications. */
    fun allowed(ctx: Context): Boolean =
        NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.packageName)

    fun component(ctx: Context) = ComponentName(ctx, OtherSoundsListener::class.java)

    /**
     * A notification just posted: played, if the channel is on and
     * Android, outside a call, would have sounded it.
     *
     * @param known it was already there - an update, not a new one
     */
    fun posted(
        ctx: Context,
        sbn: StatusBarNotification,
        ranking: NotificationListenerService.Ranking?,
        known: Boolean,
    ) {
        if (sbn.packageName == ctx.packageName) return
        val level = share(ctx)
        if (level == 0f) return
        if (Calls.connection?.state != Connection.STATE_ACTIVE) return
        val n = sbn.notification
        if (sbn.isOngoing || n.flags and Notification.FLAG_FOREGROUND_SERVICE != 0) return
        // A call rings by itself, or is the telephone's: see Calls.
        if (n.category == Notification.CATEGORY_CALL) return
        val r = ranking ?: return
        // What the person said of this app and of this moment.
        if (!r.matchesInterruptionFilter()) return
        if (r.importance < NotificationManager.IMPORTANCE_DEFAULT) return
        val sound: Uri = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) r.channel?.sound else null)
            ?: @Suppress("DEPRECATION") n.sound
            ?: return
        val am = ctx.getSystemService(AudioManager::class.java) ?: return
        if (am.ringerMode != AudioManager.RINGER_MODE_NORMAL) return
        // An update the app asked to stay quiet: quiet outside the channel too.
        if (known && n.flags and Notification.FLAG_ONLY_ALERT_ONCE != 0) return
        if (leftToTheGroup(n)) return
        val now = SystemClock.elapsedRealtime()
        if (now - lastAt < GAP_MS) return
        lastAt = now
        play(ctx, sound, level)
        Journal.sample(ctx, "notif-sound:${sbn.packageName}")
    }

    /**
     * The sound left to another of its group, as Android does: the
     * summary's, or the messages'. WhatsApp posts both at once and has
     * the summary sound (and Notification.setSilent works this way too).
     */
    private fun leftToTheGroup(n: Notification): Boolean {
        if (n.group == null) return false
        val summary = n.flags and Notification.FLAG_GROUP_SUMMARY != 0
        return when (n.groupAlertBehavior) {
            Notification.GROUP_ALERT_SUMMARY -> !summary
            Notification.GROUP_ALERT_CHILDREN -> summary
            else -> false
        }
    }

    /**
     * Through Ringtone, not a player of our own: a sound picked among
     * the phone's music is not Duetto's to read, and Ringtone has it
     * played by the system when it cannot open it here.
     *
     * As Android's: a notification, at the notification volume - what
     * it sounds like outside the channel. Otherwise the cues' road, at
     * a share apart from the call volume.
     */
    private fun play(ctx: Context, sound: Uri, share: Float) {
        stop()
        try {
            val rt = RingtoneManager.getRingtone(ctx, sound) ?: return
            val asAndroid = share < 0f
            rt.audioAttributes = AudioAttributes.Builder()
                .setUsage(
                    if (asAndroid) AudioAttributes.USAGE_NOTIFICATION
                    else AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING,
                )
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            if (!asAndroid && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                rt.volume = Alarm.apartFromKnob(ctx, share)
            }
            ringtone = rt
            rt.play()
        } catch (e: Exception) {
            Log.w(TAG, "other app's sound: ${e.message}")
        }
    }

    private fun stop() {
        val rt = ringtone ?: return
        ringtone = null
        try { rt.stop() } catch (_: Exception) { /* noop */ }
    }
}
