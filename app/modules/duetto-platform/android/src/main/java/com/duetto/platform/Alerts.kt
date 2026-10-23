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
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
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
    private const val KEY_LEVEL = "level"

    private const val CHANNEL_PREFIX = "duetto_alerts"

    /** Two separate buzzes: it stands out from any other notification. */
    val RHYTHM = longArrayOf(0, 400, 200, 400)

    fun save(ctx: Context, vibration: String, sound: String, uri: String, level: Float = 1f) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_VIBRATION, vibration)
            .putString(KEY_SOUND, sound)
            .putString(KEY_URI, uri)
            .putFloat(KEY_LEVEL, level)
            .apply()
    }

    /**
     * What an alert sounds and buzzes like: the connection in use's,
     * kept in the preferences - or another connection's, for a call
     * from a connection not in use, which brings its own (see standby.ts).
     */
    data class Choice(
        val vibration: String, val sound: String, val uri: String,
        /** how loud, 0 to 1: 1 is the phone's top, see raise */
        val level: Float = 1f,
    ) {
        /**
         * Played by Duetto, not by the notification, which is silent: a
         * channel has no volume of its own, and the level is to be the
         * one chosen here whatever the notification volume - see raise.
         * Only where a sound can be made softer (Android 9 on); before,
         * the notification sounds it at the notification volume.
         */
        val ours: Boolean
            get() = sound != "none" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
    }

    /** The connection in use's choice, as saved. */
    fun stored(ctx: Context): Choice {
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return Choice(
            prefs.getString(KEY_VIBRATION, "default") ?: "default",
            prefs.getString(KEY_SOUND, "default") ?: "default",
            prefs.getString(KEY_URI, "") ?: "",
            try { prefs.getFloat(KEY_LEVEL, 1f) } catch (_: Exception) { 1f },
        )
    }

    /** The sound to use, or null when none is to be heard. */
    fun chosenSound(ctx: Context, c: Choice = stored(ctx)): Uri? = when (c.sound) {
        "none" -> null
        "chosen" -> c.uri.takeIf { it.isNotEmpty() }?.let { Uri.parse(it) }
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        // One of Duetto's own, which live in res/raw: the short name
        // travels - "fanfare" - and the address is built here, where
        // the package and the resources are known. The same names the
        // alarms go by, so that what one hears in the list is what the
        // notification will play.
        "duetto" -> Alarm.resourceFor(c.uri)
            ?.let { Uri.parse("android.resource://${ctx.packageName}/$it") }
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        else -> RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    }

    /**
     * The rhythm for phones before Android 8, where the vibration is set
     * on the notification. With "always" it stays null, because the
     * buzzing is done by alertNow(), on every version.
     */
    fun chosenRhythm(ctx: Context, c: Choice = stored(ctx)): LongArray? = when (c.vibration) {
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
    fun alertNow(ctx: Context, c: Choice = stored(ctx)) {
        vibrateNow(ctx, c)
        if (!playIfInConversation(ctx, c)) playOurs(ctx, c)
    }

    /**
     * The call's sound and buzz, with no notification: the app in front
     * with the screen on, where the call shows in the middle of the
     * screen and the notification only said it a second time.
     *
     * Without a notification nothing sounds by itself: the channel's
     * sound and buzz are done here, as the channel would - the chosen
     * sound at its level, only with the ringer on and no Do Not Disturb
     * holding it back; the buzz "always" always, "default" unless the
     * phone is silent, "never" never. In the conversation, on its own
     * stream, as alertNow does.
     */
    fun ringOnly(ctx: Context, c: Choice = stored(ctx)) {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        val ringer = am?.ringerMode ?: AudioManager.RINGER_MODE_NORMAL
        vibrateNow(ctx, c, evenDefault = ringer != AudioManager.RINGER_MODE_SILENT)
        if (playIfInConversation(ctx, c)) return
        if (ringer != AudioManager.RINGER_MODE_NORMAL) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val filter = nm?.currentInterruptionFilter ?: NotificationManager.INTERRUPTION_FILTER_ALL
        if (filter != NotificationManager.INTERRUPTION_FILTER_ALL &&
            filter != NotificationManager.INTERRUPTION_FILTER_UNKNOWN) return
        ring(ctx, c, AudioAttributes.USAGE_NOTIFICATION, "in front")
    }

    private fun vibrateNow(ctx: Context, c: Choice, evenDefault: Boolean = false) {
        // "default" means letting the system decide, and there the channel
        // already does its part - unless there is no notification, and
        // then `evenDefault` says; "never" means never.
        if (c.vibration == "never") return
        if (c.vibration != "always" && !evenDefault) return
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

    /** the call sounding in the conversation, stopped by the next one */
    @Volatile private var playing: android.media.Ringtone? = null

    /** Played if in the conversation: true if it was the case. */
    private fun playIfInConversation(ctx: Context, c: Choice): Boolean {
        if (c.sound == "none") return true
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return true
        // Outside the conversation the notification sees to it, and
        // sounding twice would be worse than not sounding.
        if (am.mode != AudioManager.MODE_IN_COMMUNICATION) return false
        ring(ctx, c, AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING, "during the conversation")
        return true
    }

    /**
     * Played by Duetto, with the notification silent: see Choice.ours. Only when the notification itself would have sounded
     * - the ringer on, no Do Not Disturb holding it back - and on the
     * same volume it would have used.
     */
    private fun playOurs(ctx: Context, c: Choice) {
        if (!c.ours) return
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        if (am.ringerMode != AudioManager.RINGER_MODE_NORMAL) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val filter = nm?.currentInterruptionFilter ?: NotificationManager.INTERRUPTION_FILTER_ALL
        if (filter != NotificationManager.INTERRUPTION_FILTER_ALL &&
            filter != NotificationManager.INTERRUPTION_FILTER_UNKNOWN) return
        ring(ctx, c, AudioAttributes.USAGE_NOTIFICATION, "softer")
    }

    /**
     * The sound of a call at a level, to hear it while choosing: on the
     * notifications' volume, raised, as a call arriving would be.
     */
    fun preview(ctx: Context, c: Choice) {
        if (c.sound == "none") return
        ring(ctx, c, AudioAttributes.USAGE_NOTIFICATION, "preview")
    }

    private fun ring(ctx: Context, c: Choice, usage: Int, why: String) {
        try {
            val uri = chosenSound(ctx, c) ?: return
            val ringtone = RingtoneManager.getRingtone(ctx, uri) ?: return
            // The call before stops: see Notifier.show, one a second.
            playing?.stop()
            playing = ringtone
            ringtone.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(usage)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val level = c.level.coerceIn(0f, 1f)
                // In the conversation, at its level whatever the voice's
                // volume: see Alarm.apartFromKnob.
                ringtone.volume =
                    if (usage == AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING) Alarm.apartFromKnob(ctx, level)
                    else level
            }
            if (usage == AudioAttributes.USAGE_NOTIFICATION) raise(ctx)
            ringtone.play()
            if (usage == AudioAttributes.USAGE_NOTIFICATION) watch(ctx)
        } catch (e: Exception) {
            Log.w("Duetto", "alert: cannot play ($why): ${e.message}")
        }
    }

    /*
     * THE NOTIFICATION VOLUME, RAISED FOR A CALL
     *
     * Outside the conversation a call sounds on the notifications'
     * stream, and its level was a share of where that knob stood: on the
     * POCO, kept at 3 steps out of 15, "full" was faint (23 October). The
     * levels are meant as Duetto's own, so for the call's few seconds
     * the knob is taken to the top, and given back when the sound ends:
     * "full" is the phone's top, the others 6 dB apart below it.
     *
     * Only where the call would sound anyway - the ringer on, no Do Not
     * Disturb: raising a silent ringer would switch it on, which is the
     * person's to do. Not with headphones on, where the top is in the
     * ears. A knob moved by hand meanwhile is left where the hand put
     * it. What to give back is kept in the preferences: if the process
     * died with the sound, the next start gives it back.
     */

    private const val RAISED = "duetto_alerts_raised"
    private const val KEY_BEFORE = "before"
    private const val KEY_TO = "to"

    /** The longest a call's sound keeps the knob up: a whole song is cut there. */
    private const val RAISED_MAX_MS = 20_000L

    private val main = Handler(Looper.getMainLooper())
    @Volatile private var ringingSince = 0L
    private var watching = false

    private fun raise(ctx: Context) {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        if (am.ringerMode != AudioManager.RINGER_MODE_NORMAL) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val filter = nm?.currentInterruptionFilter ?: NotificationManager.INTERRUPTION_FILTER_ALL
        if (filter != NotificationManager.INTERRUPTION_FILTER_ALL &&
            filter != NotificationManager.INTERRUPTION_FILTER_UNKNOWN) return
        if (am.isVolumeFixed || headphonesOn(am)) return
        val stream = AudioManager.STREAM_NOTIFICATION
        val now = am.getStreamVolume(stream)
        val max = am.getStreamMaxVolume(stream)
        val prefs = ctx.getSharedPreferences(RAISED, Context.MODE_PRIVATE)
        // Raised by the call before, still up: what to give back stays its.
        if (prefs.getInt(KEY_BEFORE, -1) >= 0 && now == prefs.getInt(KEY_TO, -1)) return
        // At 0 the notifications are off, and the call too.
        if (now <= 0 || now >= max) return
        try {
            am.setStreamVolume(stream, max, 0)
        } catch (e: Exception) {
            Log.w("Duetto", "alert: cannot raise the volume: ${e.message}")
            return
        }
        val to = am.getStreamVolume(stream)
        if (to == now) return
        prefs.edit().putInt(KEY_BEFORE, now).putInt(KEY_TO, to).commit()
        Journal.sample(ctx, "alert:raised:$now>$to")
    }

    private fun headphonesOn(am: AudioManager): Boolean {
        val ears = mutableSetOf(
            AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
            AudioDeviceInfo.TYPE_USB_HEADSET,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) ears.add(AudioDeviceInfo.TYPE_HEARING_AID)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ears.add(AudioDeviceInfo.TYPE_BLE_HEADSET)
            ears.add(AudioDeviceInfo.TYPE_BLE_SPEAKER)
        }
        return am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { it.type in ears }
    }

    /** Gives the knob back when the sound ends - this one's or the next's. */
    private fun watch(ctx: Context) {
        ringingSince = SystemClock.elapsedRealtime()
        val app = ctx.applicationContext
        main.post {
            if (watching) return@post
            watching = true
            main.postDelayed(object : Runnable {
                override fun run() {
                    val rt = playing
                    val long = SystemClock.elapsedRealtime() - ringingSince > RAISED_MAX_MS
                    val on = try { rt?.isPlaying == true } catch (_: Exception) { false }
                    if (on && !long) {
                        main.postDelayed(this, 300)
                        return
                    }
                    if (on) try { rt?.stop() } catch (_: Exception) { /* noop */ }
                    watching = false
                    giveBack(app)
                }
            }, 500)
        }
    }

    private fun giveBack(ctx: Context) {
        val prefs = ctx.getSharedPreferences(RAISED, Context.MODE_PRIVATE)
        val before = prefs.getInt(KEY_BEFORE, -1)
        val to = prefs.getInt(KEY_TO, -1)
        if (before < 0) return
        prefs.edit().clear().commit()
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        val stream = AudioManager.STREAM_NOTIFICATION
        val now = am.getStreamVolume(stream)
        // Moved by hand meanwhile: the hand wins.
        if (now != to) {
            Journal.sample(ctx, "alert:raised:left:$now")
            return
        }
        try {
            am.setStreamVolume(stream, before, 0)
        } catch (e: Exception) {
            Log.w("Duetto", "alert: cannot give the volume back: ${e.message}")
        }
    }

    /** At the start: a knob left up by a process that died with the sound. */
    fun giveBackLeft(ctx: Context) {
        if (watching) return
        if (try { playing?.isPlaying == true } catch (_: Exception) { false }) return
        giveBack(ctx)
    }

    /**
     * The channel identifier for the configuration as it is now.
     *
     * It changes when the configuration changes: that is what makes a new
     * channel be born instead of reusing one that was set up otherwise.
     */
    private fun channelId(c: Choice): String {
        val s = when {
            // Softer: the channel is silent, the sound is Duetto's.
            c.sound == "none" || c.ours -> "mute"
            c.sound == "chosen" || c.sound == "duetto" -> "s" + Integer.toHexString(c.uri.hashCode())
            else -> "default"
        }
        return "${CHANNEL_PREFIX}_${c.vibration}_$s"
    }

    /**
     * Gets the channel ready and gives back its identifier.
     *
     * The old channels are thrown away: left there, they would show up
     * one under the other in Android's settings, all called "Alerts from
     * the channel", with no way of telling which one is the live one.
     */
    fun channel(ctx: Context, tidyUp: Boolean = false, c: Choice = stored(ctx)): String {
        val id = channelId(c)
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
            when (c.vibration) {
                // With "always" the vibration is ours, in alertNow(),
                // because the channel's own can be suppressed by a system
                // setting. Here it has to be off, otherwise whoever has
                // the system vibration on would feel it twice.
                "always", "never" -> enableVibration(false)
            }

            when (if (c.ours) "none" else c.sound) {
                "none" -> setSound(null, null)
                "chosen" -> {
                    val u = c.uri
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
