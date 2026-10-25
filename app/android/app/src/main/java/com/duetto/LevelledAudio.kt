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
import android.media.AudioTrack
import com.duetto.platform.Leveller
import org.webrtc.audio.JavaAudioDeviceModule

/**
 * WebRTC's sound device as react-native-webrtc builds it, with one thing
 * more: it says when the other's voice starts playing, and on which
 * AudioTrack, so that the leveller can hang on it (see Leveller in
 * duetto-platform).
 *
 * WebRTC keeps its AudioTrack to itself: it is read here by name, from
 * the fields of version 124 (JavaAudioDeviceModule.audioOutput, then
 * WebRtcAudioTrack.audioTrack). Another version may call them otherwise:
 * then the leveller says so and the voice plays as before.
 *
 * One for the process: react-native-webrtc releases it once its factory
 * holds it, and asked again it builds its native half anew.
 */
object LevelledAudio {

    fun deviceModule(ctx: Context): JavaAudioDeviceModule {
        val built = arrayOfNulls<JavaAudioDeviceModule>(1)
        val adm = JavaAudioDeviceModule.builder(ctx)
            .setEnableVolumeLogger(false)
            .setAudioTrackStateCallback(object : JavaAudioDeviceModule.AudioTrackStateCallback {
                override fun onWebRtcAudioTrackStart() {
                    val module = built[0] ?: return Leveller.trackUnreachable("no-module")
                    try {
                        val track = playbackTrack(module)
                            ?: return Leveller.trackUnreachable("no-track")
                        Leveller.trackStarted(track.audioSessionId, track.channelCount)
                    } catch (e: Exception) {
                        Leveller.trackUnreachable(e.javaClass.simpleName)
                    }
                }

                override fun onWebRtcAudioTrackStop() = Leveller.trackStopped()
            })
            .createAudioDeviceModule()
        built[0] = adm
        return adm
    }

    private fun playbackTrack(adm: JavaAudioDeviceModule): AudioTrack? {
        val out = JavaAudioDeviceModule::class.java.getDeclaredField("audioOutput")
            .apply { isAccessible = true }.get(adm) ?: return null
        return out.javaClass.getDeclaredField("audioTrack")
            .apply { isAccessible = true }.get(out) as? AudioTrack
    }
}
