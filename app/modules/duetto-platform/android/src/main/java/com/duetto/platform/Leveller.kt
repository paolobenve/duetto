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
import android.media.audiofx.Visualizer
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import androidx.annotation.RequiresApi
import java.util.Locale
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.pow

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
     */
    private const val SPLIT_HZ = 2000f

    /** nearly all at one level; the room between words comes up with it */
    private val strength = Strength(-36f, 5f, 6f, -44f, 8f, 0f)

    private const val KNEE_DB = 10f
    /** 5 ms let the first of a loud sound through whole (31 October) */
    private const val ATTACK_MS = 2f
    private const val RELEASE_MS = 250f
    /** under this the room between words, taken down rather than lifted */
    private const val GATE_DB = -55f
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

    /** "on:time" or "on:frequency" (the engine), "off", "waiting" (no voice playing yet), "failed:why" */
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
        if (sessionId != session) { release(); meterStop() }
        session = sessionId
        channels = max(1, channelCount)
        meterStart()
        apply()
    }

    /** It started, but could not be reached. */
    @Synchronized
    fun trackUnreachable(why: String) {
        release()
        meterStop()
        session = 0
        say(if (wanted) "failed:$why" else "off")
    }

    @Synchronized
    fun trackStopped() {
        release()
        meterStop()
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
     * The engine that follows the voice closest in time where the phone
     * has it, the one working by frequencies where it does not: the moto
     * on Android 13 refused the first ("bad parameter value", 25
     * October), the POCO on Android 16 took it. The second works on
     * blocks of about ten milliseconds, a little later and a little
     * coarser on the attacks.
     */
    @RequiresApi(Build.VERSION_CODES.P)
    private fun create() {
        var why = ""
        for ((variant, name) in listOf(
            DynamicsProcessing.VARIANT_FAVOR_TIME_RESOLUTION to "time",
            DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION to "frequency",
        )) {
            try {
                val cfg = DynamicsProcessing.Config.Builder(
                    variant, channels, false, 0, true, 2, false, 0, true,
                ).build()
                cfg.setMbcBandAllChannelsTo(0, band())
                cfg.setMbcBandAllChannelsTo(1, highBand())
                cfg.setLimiterAllChannelsTo(limiter())
                val d = DynamicsProcessing(0, session, cfg)
                d.enabled = true
                dp = d
                say("on:$name")
                return
            } catch (e: Exception) {
                Log.w(TAG, "leveller ($name): ${e.message}")
                release()
                why += "$name=${e.javaClass.simpleName}(${e.message.orEmpty().take(60)});"
            }
        }
        say("failed:$why")
    }

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

    /*
     * What comes out, measured. The levels were worked out on paper, and
     * twice the ear said otherwise (31 October, 1 November): a Visualizer
     * on the same session reads the power of what plays, ten times a
     * second, and takeOut gives its mean since the last call. JavaScript
     * sets it beside the power that WebRTC says arrived, over the same
     * stretch, and the journal gets the pairs: the real curve.
     *
     * Made before the compressor, on purpose: both want the end of the
     * session's chain, and Android puts the one that comes second just
     * before the one already there - so the meter stays after it. The
     * order can be read in `dumpsys media.audio_flinger`.
     */
    private const val METER_EVERY_MS = 100L
    private var meter: Visualizer? = null
    private var meterThread: Handler? = null
    private var outPower = 0.0
    private var outCount = 0
    /** why there is no meter, said once through takeOut */
    private var meterProblem = ""

    private val meterTick = object : Runnable {
        override fun run() {
            if (meterRead()) meterThread?.postDelayed(this, METER_EVERY_MS)
        }
    }

    private fun meterStart() {
        if (meter != null || session == 0) return
        try {
            val v = Visualizer(session)
            v.measurementMode = Visualizer.MEASUREMENT_MODE_PEAK_RMS
            v.enabled = true
            meter = v
            meterProblem = ""
        } catch (e: Throwable) {
            Log.w(TAG, "leveller meter: ${e.message}")
            meterProblem = "failed:${e.javaClass.simpleName}(${e.message.orEmpty().take(60)})"
            return
        }
        val h = meterThread ?: Handler(HandlerThread("duetto-meter").apply { start() }.looper)
            .also { meterThread = it }
        h.removeCallbacks(meterTick)
        h.postDelayed(meterTick, METER_EVERY_MS)
    }

    @Synchronized
    private fun meterRead(): Boolean {
        val v = meter ?: return false
        try {
            val m = Visualizer.MeasurementPeakRms()
            if (v.getMeasurementPeakRms(m) == Visualizer.SUCCESS) {
                // millibels: -9600 is silence
                if (m.mRms > -9600) outPower += 10.0.pow(m.mRms / 1000.0)
                outCount++
            }
        } catch (_: Exception) { /* a reading missed */ }
        return true
    }

    private fun meterStop() {
        meterThread?.removeCallbacks(meterTick)
        val v = meter ?: return
        meter = null
        try { v.release() } catch (_: Exception) { /* noop */ }
        outPower = 0.0
        outCount = 0
    }

    /**
     * The mean power of what came out since the last call, in dBFS
     * rounded: "" with nothing read, "-96" for silence, "failed:why"
     * once if the meter could not be had.
     */
    @Synchronized
    fun takeOut(): String {
        if (meter == null) {
            val why = meterProblem
            meterProblem = ""
            return why
        }
        val out = when {
            outCount == 0 -> ""
            outPower <= 0.0 -> "-96"
            else -> String.format(Locale.US, "%.0f", 10 * log10(outPower / outCount))
        }
        outPower = 0.0
        outCount = 0
        return out
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
