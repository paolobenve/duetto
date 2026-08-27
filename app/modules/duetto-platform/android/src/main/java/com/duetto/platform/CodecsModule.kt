package com.duetto.platform

import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * What the video side of THIS phone can do.
 *
 * VP9 compresses better than VP8 at the same picture quality, but only
 * when hardware does the encoding: in software it costs more battery and
 * heat than the bandwidth it saves. So the option is worth offering only
 * where it truly helps, and that can only be known on a running phone -
 * not decided at a desk by looking at a couple of models.
 */
class CodecsModule(ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoCodecs"

    @ReactMethod
    fun hasHardwareVp9Encoder(promise: Promise) {
        promise.resolve(hasHardwareEncoder(VP9))
    }

    private fun hasHardwareEncoder(mime: String): Boolean {
        return try {
            MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.any { info ->
                info.isEncoder &&
                    info.supportedTypes.any { it.equals(mime, ignoreCase = true) } &&
                    isHardware(info)
            }
        } catch (_: Exception) {
            false
        }
    }

    /**
     * From Android 10 on the system says so itself. Before that it has to
     * be guessed from the name: Android's software codecs are called
     * "OMX.google.*" or "c2.android.*", everything else comes from the
     * chip maker.
     */
    private fun isHardware(info: MediaCodecInfo): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return info.isHardwareAccelerated && !info.isSoftwareOnly
        }
        val name = info.name.lowercase()
        return !name.startsWith("omx.google.") && !name.startsWith("c2.android.")
    }

    companion object {
        private const val VP9 = "video/x-vnd.on2.vp9"
    }
}
