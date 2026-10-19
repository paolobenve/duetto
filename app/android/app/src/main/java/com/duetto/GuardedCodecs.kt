/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
package com.duetto

import android.content.Context
import android.util.Log
import com.duetto.platform.Journal
import com.oney.WebRTCModule.EglUtils
import com.oney.WebRTCModule.webrtcutils.H264AndSoftwareVideoDecoderFactory
import com.oney.WebRTCModule.webrtcutils.H264AndSoftwareVideoEncoderFactory
import org.webrtc.SoftwareVideoDecoderFactory
import org.webrtc.SoftwareVideoEncoderFactory
import org.webrtc.VideoCodecInfo
import org.webrtc.VideoCodecStatus
import org.webrtc.VideoDecoder
import org.webrtc.VideoDecoderFactory
import org.webrtc.VideoEncoder
import org.webrtc.VideoEncoderFactory
import org.webrtc.VideoFrame
import org.webrtc.WrappedNativeVideoEncoder

/**
 * The video encoders, with a guard around the phone's own.
 *
 * On 15 and 18 October the Edge's Duetto died a second or two after its
 * camera came on, and a crash inside the encoder had been seen at the
 * start of the month as well: WebRTC, setting up the encoder, asked the
 * phone's H.264 one - MediaCodec, reached through Java - to start, and
 * the Java side threw. An exception coming back from Java is, for
 * WebRTC, a reason to abort the whole app: the channel fell, and Duetto
 * came back a second later.
 *
 * Here the phone's encoder is wrapped: whatever it throws is caught,
 * written in the journal with its own words, and turned into the answer
 * the encoder gives itself when it cannot start - "fall back". WebRTC
 * then leaves H.264 and goes on with the next codec, VP8 in software: a
 * little more work for the CPU, and the channel still up.
 *
 * The factories are the ones react-native-webrtc builds when it is given
 * none; both are given, as given one only it replaces both. They are
 * made on first use, as the EGL context they need is not wanted at every
 * start of the process.
 */
private const val TAG = "DuettoCodecs"

private fun eglFactories(): Pair<VideoEncoderFactory, VideoDecoderFactory> {
    val egl = EglUtils.getRootEglBaseContext()
    return if (egl != null) {
        H264AndSoftwareVideoEncoderFactory(egl) to H264AndSoftwareVideoDecoderFactory(egl)
    } else {
        SoftwareVideoEncoderFactory() to SoftwareVideoDecoderFactory()
    }
}

class GuardedEncoderFactory(private val ctx: Context) : VideoEncoderFactory {
    private val inner: VideoEncoderFactory by lazy { eglFactories().first }

    override fun createEncoder(info: VideoCodecInfo): VideoEncoder? {
        val encoder = inner.createEncoder(info) ?: return null
        // WebRTC's own software encoders run in native code, without
        // passing through Java: nothing there to guard.
        return if (encoder is WrappedNativeVideoEncoder) encoder else GuardedEncoder(ctx, encoder)
    }

    override fun getSupportedCodecs(): Array<VideoCodecInfo> = inner.supportedCodecs
    override fun getImplementations(): Array<VideoCodecInfo> = inner.implementations
    override fun getEncoderSelector(): VideoEncoderFactory.VideoEncoderSelector? = inner.encoderSelector
}

class LazyDecoderFactory : VideoDecoderFactory {
    private val inner: VideoDecoderFactory by lazy { eglFactories().second }

    override fun createDecoder(info: VideoCodecInfo): VideoDecoder? = inner.createDecoder(info)
    override fun getSupportedCodecs(): Array<VideoCodecInfo> = inner.supportedCodecs
}

private class GuardedEncoder(
    private val ctx: Context,
    private val inner: VideoEncoder,
) : VideoEncoder {
    /** one line in the journal per encoder: a throw on every frame would fill it */
    @Volatile private var told = false

    private fun caught(where: String, e: RuntimeException) {
        Log.e(TAG, "${inner.implementationName}: $where threw", e)
        if (told) return
        told = true
        val words = "${e.javaClass.simpleName}:${e.message ?: ""}".take(300)
        Journal.sample(ctx, "encoder:$where-failed:$words")
    }

    override fun initEncode(settings: VideoEncoder.Settings, callback: VideoEncoder.Callback): VideoCodecStatus =
        try {
            inner.initEncode(settings, callback)
        } catch (e: RuntimeException) {
            caught("init", e)
            try { inner.release() } catch (_: RuntimeException) { /* already broken */ }
            VideoCodecStatus.FALLBACK_SOFTWARE
        }

    override fun release(): VideoCodecStatus =
        try { inner.release() } catch (e: RuntimeException) { caught("release", e); VideoCodecStatus.ERROR }

    override fun encode(frame: VideoFrame, info: VideoEncoder.EncodeInfo): VideoCodecStatus =
        try { inner.encode(frame, info) } catch (e: RuntimeException) { caught("encode", e); VideoCodecStatus.ERROR }

    override fun setRateAllocation(allocation: VideoEncoder.BitrateAllocation, framerate: Int): VideoCodecStatus =
        try { inner.setRateAllocation(allocation, framerate) } catch (e: RuntimeException) { caught("rates", e); VideoCodecStatus.ERROR }

    override fun setRates(rc: VideoEncoder.RateControlParameters): VideoCodecStatus =
        try { inner.setRates(rc) } catch (e: RuntimeException) { caught("rates", e); VideoCodecStatus.ERROR }

    override fun getScalingSettings(): VideoEncoder.ScalingSettings = inner.scalingSettings
    override fun getResolutionBitrateLimits(): Array<VideoEncoder.ResolutionBitrateLimits> = inner.resolutionBitrateLimits
    override fun getImplementationName(): String = inner.implementationName
    override fun getEncoderInfo(): VideoEncoder.EncoderInfo = inner.encoderInfo
    override fun isHardwareEncoder(): Boolean = inner.isHardwareEncoder
}
