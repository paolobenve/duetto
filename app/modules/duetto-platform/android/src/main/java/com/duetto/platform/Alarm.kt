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

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * The sounds for calling back somebody who got distracted or fell asleep.
 *
 * They are not alerts: an alert is there to say "I am here" to somebody
 * who is not. These are for when the other person IS there - you are both
 * in the channel, the connection is open, their voice does not come - and
 * calling out does not wake them because the phone is on the other side
 * of the room.
 *
 * That is why they come out of the ALARM stream and not out of the
 * conversation one: the alarm volume is nearly always high, "do not
 * disturb" does not lower it, and it does not depend on how the voice
 * happens to be set at that moment. A drum roll sent at call volume, with
 * the voice at a third, would wake nobody.
 *
 * The files are made by assets/make-sounds.py: no licence to honour, no
 * sample of uncertain origin inside the app.
 */
object Alarm {

    private const val TAG = "Duetto"

    /** One at a time: two drum rolls on top of each other are just noise. */
    private var player: MediaPlayer? = null

    val names = listOf("drumroll", "drumkit", "fanfare", "horn", "rooster")

    /** The scheduled cut, to be called off if the sound ends earlier. */
    private val clock = Handler(Looper.getMainLooper())

    /**
     * @param echo it is being played by whoever SENT it, not by the receiver
     * @param maxMs how long to play at most; 0 = all of it
     *
     * Whoever sends a sound has to hear what they sent: without that, one
     * presses a button and nothing perceptible happens on this side. But
     * not in the same way: at alarm volume it would go straight into
     * one's own microphone, and come back to the other person doubled on
     * top of what is already playing over there. So quietly, and by way
     * of the conversation - the same road as the call-waiting beep -
     * which is made for short signals during a call and which the echo
     * canceller knows about.
     *
     * And only for a piece of it: the drum roll goes on for a while, and
     * whoever sent it only needs the first couple of seconds to know it
     * left - the rest keeps playing while one is already doing something
     * else.
     */
    fun play(ctx: Context, name: String, echo: Boolean = false, maxMs: Int = 0) {
        val res = when (name) {
            "drumroll" -> R.raw.alarm_drumroll
            "drumkit" -> R.raw.alarm_drumkit
            "fanfare" -> R.raw.alarm_fanfare
            "horn" -> R.raw.alarm_horn
            "rooster" -> R.raw.alarm_rooster
            // Not an alarm, and not in the list: it is the answer heard by
            // whoever knocks, two raps on a door.
            "knock" -> R.raw.knock
            // The names as the older Duetto said them: they come from a
            // phone that has not been updated yet. These six lines go away
            // with the next version.
            "tamburi" -> R.raw.alarm_drumroll
            "batteria" -> R.raw.alarm_drumkit
            "fanfara" -> R.raw.alarm_fanfare
            "strombazzata" -> R.raw.alarm_horn
            "gallo" -> R.raw.alarm_rooster
            "bussata" -> R.raw.knock
            else -> return
        }
        stop()
        try {
            val attributes = AudioAttributes.Builder()
                .setUsage(
                    if (echo) AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING
                    else AudioAttributes.USAGE_ALARM,
                )
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            val mp = MediaPlayer.create(ctx, res, attributes, AudioManager.AUDIO_SESSION_ID_GENERATE)
            if (mp == null) {
                Log.w(TAG, "alarm: cannot get $name ready")
                return
            }
            mp.setOnCompletionListener {
                it.release()
                if (player === it) player = null
            }
            // A third of the volume: it is an answer, not an alarm.
            if (echo) mp.setVolume(0.33f, 0.33f)
            player = mp
            mp.start()
            if (maxMs > 0) {
                clock.postDelayed({ if (player === mp) stop() }, maxMs.toLong())
            }
        } catch (e: Exception) {
            Log.w(TAG, "alarm: $name does not play: ${e.message}")
        }
    }

    /** Silences the one under way: also used before starting another. */
    fun stop() {
        clock.removeCallbacksAndMessages(null)
        val mp = player ?: return
        player = null
        try {
            if (mp.isPlaying) mp.stop()
        } catch (_: Exception) {
            // already over by itself
        }
        try { mp.release() } catch (_: Exception) { /* noop */ }
    }
}
