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

import android.media.audiofx.DynamicsProcessing
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import kotlin.math.log10
import kotlin.math.max

/**
 * The other's voice levelled: the faint raised, the loud brought down,
 * so that it comes out at nearly the same level whoever speaks how.
 *
 * WebRTC's gain control works on the microphone over there, within its
 * limits: somebody walking away from the phone, or speaking low, still
 * arrives faint. Here, on the voice that arrives, Android's own
 * DynamicsProcessing (Android 9 and later): a compressor, with a gate
 * under it that keeps the room's hiss between words from being lifted
 * too, and a limiter at the end.
 *
 * The level chosen with the keys comes AFTER the compressor: put before
 * it, as the track's volume is, the compressor would undo it. So while
 * the leveller works the track plays at 1 and the level is the band's
 * gain here (see setGain, and applyGain in webrtc.ts).
 *
 * It hangs on WebRTC's AudioTrack, which WebRTC does not show: the app's
 * LevelledAudio reaches it and says when it starts and stops. Where it
 * cannot - another WebRTC, a phone without the effect - the voice plays
 * as before, and the state says why.
 */
object Leveller {

    private const val TAG = "Duetto"

    /** above this the voice is brought down, by RATIO */
    private const val THRESHOLD_DB = -30f
    private const val RATIO = 3f
    private const val KNEE_DB = 10f
    private const val ATTACK_MS = 5f
    private const val RELEASE_MS = 250f
    /** under this the room between words, taken down rather than lifted */
    private const val GATE_DB = -55f
    private const val EXPANDER_RATIO = 2f
    /**
     * Raised back by this much: a voice that arrived where WebRTC's
     * gain control puts it, around -18 dB, comes out where it was.
     */
    private const val MAKEUP_DB = 8f
    private const val LIMIT_DB = -2f

    /** asked for, in the settings of the connection in use */
    @Volatile private var wanted = false
    /** the level chosen, as a gain: 1 = as it arrives */
    @Volatile private var gain = 1f
    private var session = 0
    private var channels = 1
    private var dp: DynamicsProcessing? = null

    /** "on", "off", "waiting" (no voice playing yet), or "failed:why" */
    @Volatile var state = "off"
        private set

    /** told every change of state: the module passes it to JavaScript */
    @Volatile var listener: ((String) -> Unit)? = null

    @Synchronized
    fun setWanted(on: Boolean) {
        wanted = on
        apply()
    }

    @Synchronized
    fun setGain(g: Float) {
        gain = g
        val d = dp ?: return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return
        try {
            d.setMbcBandAllChannelsTo(0, band())
        } catch (e: Exception) {
            Log.w(TAG, "leveller gain: ${e.message}")
        }
    }

    /** WebRTC's AudioTrack has started: see LevelledAudio. */
    @Synchronized
    fun trackStarted(sessionId: Int, channelCount: Int) {
        if (sessionId != session) release()
        session = sessionId
        channels = max(1, channelCount)
        apply()
    }

    /** It started, but could not be reached. */
    @Synchronized
    fun trackUnreachable(why: String) {
        release()
        session = 0
        say(if (wanted) "failed:$why" else "off")
    }

    @Synchronized
    fun trackStopped() {
        release()
        session = 0
        apply()
    }

    private fun apply() {
        if (!wanted) { release(); say("off"); return }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) { say("failed:android-too-old"); return }
        if (session == 0) { say("waiting"); return }
        if (dp != null) { say("on"); return }
        // Born neutral: until JavaScript hears "on" the track still
        // carries the level, and the two would multiply.
        gain = 1f
        create()
    }

    @RequiresApi(Build.VERSION_CODES.P)
    private fun create() {
        try {
            val cfg = DynamicsProcessing.Config.Builder(
                DynamicsProcessing.VARIANT_FAVOR_TIME_RESOLUTION, channels,
                false, 0, true, 1, false, 0, true,
            ).build()
            cfg.setMbcBandAllChannelsTo(0, band())
            cfg.setLimiterAllChannelsTo(
                DynamicsProcessing.Limiter(true, true, 0, 1f, 60f, 10f, LIMIT_DB, 0f),
            )
            val d = DynamicsProcessing(0, session, cfg)
            d.enabled = true
            dp = d
            say("on")
        } catch (e: Exception) {
            Log.w(TAG, "leveller: ${e.message}")
            release()
            say("failed:${e.javaClass.simpleName}")
        }
    }

    /** The one band, all frequencies, with the chosen level after it. */
    @RequiresApi(Build.VERSION_CODES.P)
    private fun band(): DynamicsProcessing.MbcBand {
        val levelDb = 20f * log10(max(gain, 0.001f))
        return DynamicsProcessing.MbcBand(
            true, 20_000f, ATTACK_MS, RELEASE_MS, RATIO, THRESHOLD_DB, KNEE_DB,
            GATE_DB, EXPANDER_RATIO, 0f, MAKEUP_DB + levelDb,
        )
    }

    private fun release() {
        val d = dp ?: return
        dp = null
        try { d.release() } catch (_: Exception) { /* noop */ }
    }

    private fun say(s: String) {
        if (s == state) return
        state = s
        listener?.invoke(s)
    }
}
