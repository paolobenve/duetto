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
 * The level chosen with the keys comes AFTER the compressor and the
 * limiter, as the limiter's own gain: put before them, as the track's
 * volume is, the compressor would undo it, and the ceiling would move
 * with the level. So while the leveller works the track plays at 1 and
 * the level is the limiter's gain here (see setGain, and applyGain in
 * webrtc.ts).
 *
 * It hangs on WebRTC's AudioTrack, which WebRTC does not show: the app's
 * LevelledAudio reaches it and says when it starts and stops. Where it
 * cannot - another WebRTC, a phone without the effect - the voice plays
 * as before, and the state says why.
 */
object Leveller {

    private const val TAG = "Duetto"

    /**
     * How hard: above `threshold` the voice is brought down by `ratio`,
     * and raised back by `makeup`. One strength only: light and medium
     * were heard to do nothing, and were taken away (1 November).
     *
     * The makeup used to give back, at -18 dB - where WebRTC's gain
     * control puts a voice - just what the ratio took: the voice that
     * arrives there came out where it was, the faint rose, and since
     * hardly anything arrives above that, nothing was heard to come
     * down (31 October, on the POCO). Now the makeup is what leaves a
     * voice at -24 dB where it was: (-24 - threshold) * (1 - 1/ratio).
     * The faint still rise, a voice at -18 comes down three to five dB,
     * a shout ten and more; what is lost in loudness the keys give back.
     */
    private class Strength(
        val threshold: Float, val ratio: Float, val makeup: Float,
        /** the same three for the band over SPLIT_HZ: see below */
        val hiThreshold: Float, val hiRatio: Float, val hiMakeup: Float,
    )

    /*
     * Two bands, not one. A shrill voice is not louder than another: it
     * has more over 2 kHz, where the ear hears most, and a compressor
     * that weighs all the voice together found it at a normal level and
     * let it through as it was (31 October, "voce acuta"). Over SPLIT_HZ
     * a band of its own, held harder: an ordinary voice has some 10 dB
     * less up there than in all, and its makeup leaves it where it was
     * there - (-34 - hiThreshold) * (1 - 1/hiRatio) - so the voice is
     * not made duller; a voice with 10 dB more up there comes down
     * seven to nine.
     *
     * That reckoning failed: with strong, shrill voices came out even
     * louder (1 November). A makeup is added whether the compressor has
     * worked or not, and where a band arrives under its threshold it is
     * only a lift: up there, nearly 9 dB more of the shrill. Now the
     * band over SPLIT_HZ has no makeup, and can only bring down; the
     * body's makeup is smaller, 6 dB, so that a faint voice raised does
     * not turn dull against its own treble.
     *
     * And still too little was heard: -40 and -18 came out at -34 and
     * -24, 22 dB become 10, while 22 should become about 5 and 40 about
     * 10 (Paolo, 1 November). -40 was under the threshold, so only
     * lifted, never pressed. Now the threshold is under the whole voice,
     * -48, at 5 to 1, with the makeup that leaves -24 where it is:
     * (-24 + 48) * (1 - 1/5) = 19.2. -40 comes out at about -27, -18 at
     * -23. The treble the same 10 dB lower, -58, whose makeup so works
     * only on a treble already over its threshold: one that is shrill
     * comes down. The gate moves under it all, at -60 and -70.
     */
    private const val SPLIT_HZ = 2000f

    /** nearly all at one level; the room between words comes up with it */
    private val strength = Strength(-48f, 5f, 19.2f, -58f, 5f, 19.2f)

    private const val KNEE_DB = 10f
    /** 5 ms let the first of a loud sound through whole (31 October) */
    private const val ATTACK_MS = 2f
    private const val RELEASE_MS = 250f
    /** under this the room between words, taken down rather than lifted */
    private const val GATE_DB = -60f
    private const val EXPANDER_RATIO = 2f
    /**
     * The ceiling: about 8 dB over where a voice comes out (-22 to -24
     * dB, see strength), before the level the keys choose. At -2 dB it
     * held only what would have broken the sound, and the loud went
     * through; with the level's +12 dB on top it is at -2 again.
     */
    private const val LIMIT_DB = -14f

    /** asked for, in the settings of the connection in use */
    @Volatile private var wanted = false
    /** the level chosen, as a gain: 1 = as it arrives */
    @Volatile private var gain = 1f
    private var session = 0
    private var channels = 1
    private var dp: DynamicsProcessing? = null

    /** "on:frequency:<who wrote it>", "off", "waiting" (no voice playing yet), "failed:why" */
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
        retune()
    }

    private fun retune() {
        val d = dp ?: return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return
        try {
            d.setMbcBandAllChannelsTo(0, band())
            d.setMbcBandAllChannelsTo(1, highBand())
            d.setLimiterAllChannelsTo(limiter())
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
        if (dp != null) return
        // Born neutral: until JavaScript hears "on" the track still
        // carries the level, and the two would multiply.
        gain = 1f
        create()
    }

    /**
     * The engine that works by frequencies, on blocks of about ten
     * milliseconds: the only one Android has. The other, that follows
     * the voice closer in time, is asked for as a variant, but nowhere
     * made: the moto on Android 13 refused it ("bad parameter value",
     * 25 October), and the POCO on Android 16 took it without making
     * the engine - "FAVOR_TIME_RESOLUTION not available now" in its
     * log, and the voice through untouched, the level too (1 November;
     * see setEngineArchitecture in AOSP's DynamicsProcessingContext).
     * Taken as it was, it explained a leveller that nobody could hear.
     */
    @RequiresApi(Build.VERSION_CODES.P)
    private fun create() {
        try {
            val cfg = DynamicsProcessing.Config.Builder(
                DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION,
                channels, false, 0, true, 2, false, 0, true,
            ).build()
            cfg.setMbcBandAllChannelsTo(0, band())
            cfg.setMbcBandAllChannelsTo(1, highBand())
            cfg.setLimiterAllChannelsTo(limiter())
            val d = DynamicsProcessing(0, session, cfg)
            d.enabled = true
            val missing = engineMissing(d)
            if (missing != null) {
                try { d.release() } catch (_: Exception) { /* noop */ }
                say("failed:$missing")
                return
            }
            dp = d
            say("on:frequency:${maker(d)}")
        } catch (e: Exception) {
            Log.w(TAG, "leveller: ${e.message}")
            release()
            say("failed:${e.javaClass.simpleName}(${e.message.orEmpty().take(60)})")
        }
    }

    /**
     * Whether the effect really has an engine behind it: the ceiling set
     * is read back. Where Android takes the effect without making the
     * engine - the POCO with the time variant - the reading comes back
     * empty, and the voice would go through untouched with the level
     * lost; then the effect goes and the track carries the level again.
     */
    @RequiresApi(Build.VERSION_CODES.P)
    private fun engineMissing(d: DynamicsProcessing): String? = try {
        val l = d.getLimiterByChannelIndex(0)
        if (kotlin.math.abs(l.threshold - LIMIT_DB) > 0.5f) "no-engine" else null
    } catch (e: Exception) {
        "no-engine(${e.javaClass.simpleName})"
    }

    /**
     * Who wrote the effect, for the journal: "aosp" for Android's own,
     * the one measured on the computer; a maker's name otherwise.
     */
    private fun maker(d: DynamicsProcessing): String = try {
        val who = d.descriptor.implementor.orEmpty()
        if (who.contains("Android Open Source")) "aosp"
        else who.replace(Regex("[^A-Za-z0-9]+"), "-").take(24).ifEmpty { "?" }
    } catch (_: Exception) { "?" }

    /** The body of the voice, up to SPLIT_HZ. */
    @RequiresApi(Build.VERSION_CODES.P)
    private fun band(): DynamicsProcessing.MbcBand =
        DynamicsProcessing.MbcBand(
            true, SPLIT_HZ, ATTACK_MS, RELEASE_MS, strength.ratio, strength.threshold, KNEE_DB,
            GATE_DB, EXPANDER_RATIO, 0f, strength.makeup,
        )

    /** Over SPLIT_HZ, where a shrill voice has its edge: held harder. */
    @RequiresApi(Build.VERSION_CODES.P)
    private fun highBand(): DynamicsProcessing.MbcBand =
        DynamicsProcessing.MbcBand(
            true, 20_000f, ATTACK_MS, RELEASE_MS, strength.hiRatio, strength.hiThreshold, KNEE_DB,
            GATE_DB - 10f, EXPANDER_RATIO, 0f, strength.hiMakeup,
        )

    /** The ceiling, with the chosen level after it. */
    @RequiresApi(Build.VERSION_CODES.P)
    private fun limiter(): DynamicsProcessing.Limiter {
        val levelDb = 20f * log10(max(gain, 0.001f))
        return DynamicsProcessing.Limiter(true, true, 0, 1f, 60f, 10f, LIMIT_DB, levelDb)
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
