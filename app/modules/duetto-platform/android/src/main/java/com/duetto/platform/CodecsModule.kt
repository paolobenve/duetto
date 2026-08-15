package com.duetto.platform

import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Cosa sa fare la parte video di QUESTO telefono.
 *
 * VP9 comprime meglio di VP8 a parità di immagine, ma solo se lo encoda
 * l'hardware: in software costa più batteria e calore di quanta banda
 * faccia risparmiare. Quindi l'opzione va offerta solo dove serve
 * davvero, e questo si può sapere solo a telefono acceso - non deciderlo
 * a tavolino guardando due modelli.
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
     * Da Android 10 il sistema lo dichiara. Prima bisogna dedurlo dal
     * nome: i codec software di Android si chiamano "OMX.google.*" o
     * "c2.android.*", tutto il resto viene dal produttore del chip.
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
