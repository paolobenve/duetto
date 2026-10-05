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
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.os.Build

/**
 * Whose echo cancelling and noise suppression clean the voice: the
 * phone's, or WebRTC's own.
 *
 * The phone's are the default, and cheap on the battery. On a Motorola
 * edge 50 fusion on speaker the voice left some 50 dB too quiet - what
 * such effects do when they take the voice for the echo of the other
 * side. WebRTC's own can be chosen instead.
 *
 * The audio machinery is built once, when the process starts, so the
 * choice is read then, by the application, and holds until the next
 * start.
 */
object VoiceEffects {
    private const val PREFS = "duetto-voice"
    private const val KEY = "ownEffects"

    /** What the running process was started with; null before the start. */
    @Volatile var inUse: Boolean? = null

    /** WebRTC's own effects wanted, instead of the phone's. */
    fun wanted(ctx: Context): Boolean =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY, false)

    fun want(ctx: Context, own: Boolean) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY, own).apply()
    }

    private const val KEY_WEBRTC_LOG = "webrtcLog"

    /**
     * WebRTC's own warnings and errors in Android's log, with the
     * diagnostics on. A crash inside its video encoder left nothing to
     * read: no message, and a library with no names in it. Read at the
     * start, like the effects - the logging is set up with the engine.
     */
    fun webrtcLogWanted(ctx: Context): Boolean =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_WEBRTC_LOG, false)

    fun wantWebrtcLog(ctx: Context, on: Boolean) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_WEBRTC_LOG, on).apply()
    }

    /** Read by the application at start, to build the audio with. */
    fun atStart(ctx: Context): Boolean = wanted(ctx).also { inUse = it }

    private fun sourceName(s: Int) = when (s) {
        MediaRecorder.AudioSource.MIC -> "mic"
        MediaRecorder.AudioSource.VOICE_COMMUNICATION -> "voice-communication"
        MediaRecorder.AudioSource.VOICE_RECOGNITION -> "voice-recognition"
        MediaRecorder.AudioSource.CAMCORDER -> "camcorder"
        MediaRecorder.AudioSource.DEFAULT -> "default"
        else -> "source$s"
    }

    private fun deviceName(d: AudioDeviceInfo?): String {
        if (d == null) return "?"
        val type = when (d.type) {
            AudioDeviceInfo.TYPE_BUILTIN_MIC -> "builtin-mic"
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "bt-sco"
            AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired"
            AudioDeviceInfo.TYPE_USB_HEADSET -> "usb"
            AudioDeviceInfo.TYPE_TELEPHONY -> "telephony"
            else -> "type${d.type}"
        }
        // The built-in microphones are several on most phones - bottom,
        // top, back - and the address, where there is one, tells which.
        val address = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) d.address.orEmpty() else ""
        return if (address.isNotEmpty()) "$type($address)" else type
    }

    /**
     * How the voice is taken now, for the journal: whose effects, and for
     * each recording of ours the source, the microphone, the effects
     * applied, whether Android silences it. Only our own recordings are
     * visible to an app.
     */
    fun describe(ctx: Context): String {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        val parts = mutableListOf<String>()
        parts += "effects=" + when (inUse) { true -> "own"; false -> "phone"; null -> "?" }
        parts += "phone-has=" + listOfNotNull(
            if (AcousticEchoCanceler.isAvailable()) "aec" else null,
            if (NoiseSuppressor.isAvailable()) "ns" else null,
        ).joinToString("+").ifEmpty { "none" }
        val recs = am?.activeRecordingConfigurations.orEmpty()
        if (recs.isEmpty()) parts += "recording=none"
        for (r in recs) {
            val p = mutableListOf(sourceName(r.clientAudioSource), deviceName(r.audioDevice))
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val applied = (r.clientEffects + r.effects).map { it.name }.distinct()
                p += "fx=" + applied.joinToString("+").ifEmpty { "none" }
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && r.isClientSilenced) p += "silenced"
            parts += "recording=" + p.joinToString("/")
        }
        return parts.joinToString(" ")
    }
}
