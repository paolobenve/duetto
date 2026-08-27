package com.duetto.platform

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

/**
 * How the alert has to make itself heard: vibration and sound.
 *
 * WHY A NEW CHANNEL AT EVERY CHANGE
 * From Android 8 on, sound and vibration are not decided per
 * notification but per channel, and a channel is configured ONLY at the
 * moment it is born: writing it again later has no effect at all, and
 * without an error to say so. The only way for a changed preference to
 * really count is to create a new channel, with another identifier, and
 * throw the previous one away.
 *
 * So the identifier carries the configuration inside itself. The price,
 * worth knowing: if the user had tuned the channel by hand from Android's
 * settings, changing a preference here puts those adjustments back to
 * square one, because the channel is not the same one any more.
 *
 * The preferences live in SharedPreferences, not in the JS state: the
 * notification can be born from a background service, where JS may not be
 * there at all.
 */
object Alerts {

    private const val PREFS = "duetto_alerts"
    private const val KEY_VIBRATION = "vibration"
    private const val KEY_SOUND = "sound"
    private const val KEY_URI = "uri"

    private const val CHANNEL_PREFIX = "duetto_alerts"

    /** Two separate buzzes: it stands out from any other notification. */
    val RHYTHM = longArrayOf(0, 400, 200, 400)

    fun save(ctx: Context, vibration: String, sound: String, uri: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_VIBRATION, vibration)
            .putString(KEY_SOUND, sound)
            .putString(KEY_URI, uri)
            .apply()
    }

    private fun vibration(ctx: Context) =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_VIBRATION, "default") ?: "default"

    private fun sound(ctx: Context) =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_SOUND, "default") ?: "default"

    private fun uri(ctx: Context) =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_URI, "") ?: ""

    /** The sound to use, or null when none is to be heard. */
    fun chosenSound(ctx: Context): Uri? = when (sound(ctx)) {
        "none" -> null
        "chosen" -> uri(ctx).takeIf { it.isNotEmpty() }?.let { Uri.parse(it) }
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        else -> RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    }

    /**
     * The rhythm for phones before Android 8, where the vibration is set
     * on the notification. With "always" it stays null, because the
     * buzzing is done by alertNow(), on every version.
     */
    fun chosenRhythm(ctx: Context): LongArray? = when (vibration(ctx)) {
        "default" -> RHYTHM
        else -> null
    }

    /**
     * Makes the phone buzz and, if needed, sound - without going through
     * the notification.
     *
     * WHY THE CHANNEL IS NOT ENOUGH
     * There are two things the channel cannot do, and they are precisely
     * the ones an alert needs:
     *
     *  - VIBRATION: if notification vibration is off in the system
     *    settings, Android suppresses it and the channel cannot override
     *    that. Somebody who keeps the phone without vibration for
     *    everything else but wants it for this alert would never get it
     *    from the channel alone. Buzzing ourselves, on the other hand,
     *    works.
     *
     *  - SOUND DURING THE CONVERSATION: while in the channel the phone is
     *    in communication mode and the system silences notifications,
     *    exactly as during a phone call. But "Alert" is pressed above all
     *    then - the other person is there but does not answer - and a
     *    mute alert alerts nobody. So it is played on the conversation
     *    stream, which is the road phones use for the call-waiting beep.
     */
    fun alertNow(ctx: Context) {
        vibrateNow(ctx)
        playIfInConversation(ctx)
    }

    private fun vibrateNow(ctx: Context) {
        // "default" means letting the system decide, and there the channel
        // already does its part; "never" means never.
        if (vibration(ctx) != "always") return
        try {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)
                    ?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            } ?: return

            val effect = VibrationEffect.createWaveform(RHYTHM, -1)
            // Declared as a "communication request" - somebody is looking
            // for you - and not as any old notification: that is what it
            // is, and it is the way not to end up among the vibrations the
            // system silences along with the other notifications.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                vibrator.vibrate(
                    effect,
                    VibrationAttributes.createForUsage(
                        VibrationAttributes.USAGE_COMMUNICATION_REQUEST,
                    ),
                )
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(
                    effect,
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_REQUEST)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
            }
        } catch (e: Exception) {
            Log.w("Duetto", "alert: cannot make it buzz: ${e.message}")
        }
    }

    private fun playIfInConversation(ctx: Context) {
        if (sound(ctx) == "none") return
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        // Outside the conversation the notification sees to it, and
        // sounding twice would be worse than not sounding.
        if (am.mode != AudioManager.MODE_IN_COMMUNICATION) return
        try {
            val uri = chosenSound(ctx) ?: return
            val ringtone = RingtoneManager.getRingtone(ctx, uri) ?: return
            ringtone.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            ringtone.play()
        } catch (e: Exception) {
            Log.w("Duetto", "alert: cannot play during the conversation: ${e.message}")
        }
    }

    /**
     * The channel identifier for the configuration as it is now.
     *
     * It changes when the configuration changes: that is what makes a new
     * channel be born instead of reusing one that was set up otherwise.
     */
    private fun channelId(ctx: Context): String {
        val s = when (sound(ctx)) {
            "none" -> "mute"
            "chosen" -> "s" + Integer.toHexString(uri(ctx).hashCode())
            else -> "default"
        }
        return "${CHANNEL_PREFIX}_${vibration(ctx)}_$s"
    }

    /**
     * Gets the channel ready and gives back its identifier.
     *
     * The old channels are thrown away: left there, they would show up
     * one under the other in Android's settings, all called "Alerts from
     * the channel", with no way of telling which one is the live one.
     */
    fun channel(ctx: Context, tidyUp: Boolean = false): String {
        val id = channelId(ctx)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return id

        val manager = ctx.getSystemService(NotificationManager::class.java) ?: return id

        // The tidying up is done only by whoever changes the settings.
        // Doing it at every notification meant deleting and recreating
        // channels at the moment when an alert merely has to be shown: if
        // the preferences read there were for any reason different from
        // the chosen ones, the notification itself would throw the right
        // channel away.
        if (tidyUp) {
            for (old in manager.notificationChannels) {
                if (old.id.startsWith(CHANNEL_PREFIX) && old.id != id) {
                    manager.deleteNotificationChannel(old.id)
                }
            }
        }
        if (manager.getNotificationChannel(id) != null) return id

        val channel = NotificationChannel(
            id,
            Strings.alertsChannel,
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = Strings.alertsChannelWhat
            setShowBadge(true)

            // "default" means touching nothing: the channel is born as
            // Android sees fit, and it is the system that decides,
            // knowing things we do not (silent mode, do not disturb,
            // headphones plugged in).
            when (vibration(ctx)) {
                // With "always" the vibration is ours, in alertNow(),
                // because the channel's own can be suppressed by a system
                // setting. Here it has to be off, otherwise whoever has
                // the system vibration on would feel it twice.
                "always", "never" -> enableVibration(false)
            }

            when (sound(ctx)) {
                "none" -> setSound(null, null)
                "chosen" -> {
                    val u = uri(ctx)
                    if (u.isNotEmpty()) {
                        setSound(
                            Uri.parse(u),
                            AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build(),
                        )
                    }
                }
            }
        }
        manager.createNotificationChannel(channel)
        return id
    }
}
