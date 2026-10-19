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
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
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

    /**
     * The cues and the echoes have a player of their own: they shared
     * the alarms' one, and a camera turning round cut short the rooster
     * that was waking somebody up.
     */
    private var cuePlayer: MediaPlayer? = null

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
    /**
     * The sound behind a name, or null for a name nobody knows.
     *
     * The alert's notification asks for it too: what one hears trying
     * the sounds in the list must be what the notification plays.
     */
    fun resourceFor(name: String): Int? = when (name) {
        "drumroll" -> R.raw.alarm_drumroll
        "drumkit" -> R.raw.alarm_drumkit
        "fanfare" -> R.raw.alarm_fanfare
        "horn" -> R.raw.alarm_horn
        "rooster" -> R.raw.alarm_rooster
        // Not an alarm, and not in the list: it is the answer heard by
        // whoever knocks, two raps on a door.
        "knock" -> R.raw.knock
        // The cues, on both phones: the camera, the microphone and the
        // listening going on and off, the camera turning round, coming in, going out,
        // going out for good.
        "cue_video_on" -> R.raw.cue_video_on
        "cue_video_off" -> R.raw.cue_video_off
        "cue_audio_on" -> R.raw.cue_audio_on
        "cue_audio_off" -> R.raw.cue_audio_off
        "cue_output_on" -> R.raw.cue_output_on
        "cue_output_off" -> R.raw.cue_output_off
        "cue_camera" -> R.raw.cue_camera
        "cue_enter" -> R.raw.cue_enter
        "cue_leave" -> R.raw.cue_leave
        "cue_detach" -> R.raw.cue_detach
        // The volume test's beeps: see playTest.
        "test_tone" -> R.raw.test_tone
        // The names as the older Duetto said them: they come from a
        // phone that has not been updated yet. These six lines go away
        // with the next version.
        "tamburi" -> R.raw.alarm_drumroll
        "batteria" -> R.raw.alarm_drumkit
        "fanfara" -> R.raw.alarm_fanfare
        "strombazzata" -> R.raw.alarm_horn
        "gallo" -> R.raw.alarm_rooster
        "bussata" -> R.raw.knock
        else -> null
    }


    /**
     * @param volume for the echoes and the cues, the share of their
     *   stream's top, 0 to 1, whatever the voice's volume (see
     *   apartFromKnob); below 0, the old third
     */
    fun play(ctx: Context, name: String, echo: Boolean = false, maxMs: Int = 0, volume: Float = -1f) {
        val res = resourceFor(name) ?: return
        if (echo) {
            playCue(ctx, res, name, maxMs, if (volume >= 0f) volume else 0.33f)
            return
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
            // Softer, when the calls received were asked to be (the
            // connection's level of the calls): full otherwise, as always.
            if (volume >= 0f && volume < 1f) mp.setVolume(volume, volume)
            player = mp
            mp.start()
            if (maxMs > 0) {
                clock.postDelayed({ if (player === mp) stop() }, maxMs.toLong())
            }
        } catch (e: Exception) {
            Log.w(TAG, "alarm: $name does not play: ${e.message}")
        }
    }

    private fun playCue(ctx: Context, res: Int, name: String, maxMs: Int, volume: Float) {
        stopCue()
        if (volume <= 0f) return
        try {
            val attributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            val mp = MediaPlayer.create(ctx, res, attributes, AudioManager.AUDIO_SESSION_ID_GENERATE)
                ?: return
            mp.setOnCompletionListener {
                it.release()
                if (cuePlayer === it) cuePlayer = null
            }
            val v = apartFromKnob(ctx, volume)
            mp.setVolume(v, v)
            cuePlayer = mp
            mp.start()
            if (maxMs > 0) {
                clock.postDelayed({ if (cuePlayer === mp) stopCue() }, maxMs.toLong())
            }
        } catch (e: Exception) {
            Log.w(TAG, "cue: $name does not play: ${e.message}")
        }
    }

    /**
     * A sound on the signalling stream at `share` of that stream's top,
     * whatever the call volume stands at: the value for its player.
     *
     * In the conversation the signalling stream follows the call volume -
     * the knob Duetto moves with its scale - and a share of it made the
     * buttons' sounds and the calls follow the other's voice: lowered,
     * they went down with it. The levels in the settings are meant as
     * levels of their own, so the knob is taken back out: with the voice
     * at -12 dB the sound starts 12 dB higher. Not past the stream's top
     * - a player cannot go above 1 - so with the knob below the level
     * chosen the sound stays at the top, lower than asked.
     *
     * Outside the conversation the stream follows another knob, and
     * there is no voice to keep apart from: the share is left as it is.
     */
    fun apartFromKnob(ctx: Context, share: Float): Float {
        if (share <= 0f) return 0f
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return share
        if (am.mode != AudioManager.MODE_IN_COMMUNICATION) return share
        val knob = knobShare(am)
        return if (knob > 0f) (share / knob).coerceIn(0f, 1f) else share
    }

    /**
     * Where the call volume stands, as a share of its top: from Android's
     * decibels where it says them (9 on), from the step otherwise - a
     * step is not a share, and the steps alone take back less than the
     * knob took off, never more.
     */
    private fun knobShare(am: AudioManager): Float {
        val stream = AudioManager.STREAM_VOICE_CALL
        val max = am.getStreamMaxVolume(stream)
        val now = am.getStreamVolume(stream)
        if (max <= 0 || now >= max) return 1f
        val bySteps = (now.toFloat() / max).coerceIn(0.01f, 1f)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return bySteps
        // The device the call is on, as VolumeModule.steps asks for it.
        val devices = mutableListOf<Int>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            am.communicationDevice?.type?.let { devices.add(it) }
        }
        @Suppress("DEPRECATION")
        devices.add(
            when {
                am.isBluetoothScoOn -> AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                am.isSpeakerphoneOn -> AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                am.isWiredHeadsetOn -> AudioDeviceInfo.TYPE_WIRED_HEADSET
                else -> AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
            },
        )
        for (device in devices.distinct()) {
            try {
                val below = am.getStreamVolumeDb(stream, max, device) -
                    am.getStreamVolumeDb(stream, now.coerceAtLeast(am.getStreamMinVolume(stream)), device)
                // A table that is flat says nothing: the next device, or the steps.
                if (below.isFinite() && below > 0f) {
                    return Math.pow(10.0, -below / 20.0).toFloat().coerceIn(0.001f, 1f)
                }
            } catch (_: Exception) {
                // a device this phone has no table for: the next one
            }
        }
        return bySteps
    }

    /**
     * The volume test's beeps, on the voice's own stream.
     *
     * Not on the cues' signalling stream: the question is whether the
     * phone's call volume changes what the other voice sounds like, and
     * only a sound on the voice's stream goes the same road.
     */
    fun playTest(ctx: Context) {
        stopCue()
        try {
            val attributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            val mp = MediaPlayer.create(ctx, R.raw.test_tone, attributes, AudioManager.AUDIO_SESSION_ID_GENERATE)
                ?: return
            mp.setOnCompletionListener {
                it.release()
                if (cuePlayer === it) cuePlayer = null
            }
            cuePlayer = mp
            mp.start()
        } catch (e: Exception) {
            Log.w(TAG, "test tone: ${e.message}")
        }
    }

    private fun stopCue() {
        val mp = cuePlayer ?: return
        cuePlayer = null
        try { if (mp.isPlaying) mp.stop() } catch (_: Exception) { /* over by itself */ }
        try { mp.release() } catch (_: Exception) { /* noop */ }
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
