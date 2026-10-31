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

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * The bridge for the volume keys taken over by the app.
 *
 * It sends JavaScript an event only in the cases where the system volume
 * did not move: the vast majority of presses never comes through here.
 */
class VolumeModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoVolume"

    init {
        Volume.tell = { direction ->
            if (ctx.hasActiveReactInstance()) {
                ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(EVENT, direction)
            }
        }
    }

    private val am: AudioManager?
        get() = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

    /**
     * The phone's call volume, and its maximum.
     *
     * It is half of what one hears: the other half is Duetto's gain,
     * which multiplies the sound before playing it. The level the app
     * shows is the product of the two, and this is the factor the phone
     * commands - the one Android remembers separately for earpiece,
     * speaker, headphones and bluetooth, and which moves from outside
     * too.
     */
    @ReactMethod
    fun read(promise: Promise) {
        val a = am
        val m = Arguments.createMap()
        if (a == null) {
            m.putInt("volume", 0)
            m.putInt("max", 0)
            promise.resolve(m)
            return
        }
        try {
            m.putInt("volume", a.getStreamVolume(AudioManager.STREAM_VOICE_CALL))
            m.putInt("max", a.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL))
        } catch (_: Exception) {
            m.putInt("volume", 0)
            m.putInt("max", 0)
        }
        promise.resolve(m)
    }

    /**
     * The call volume's steps, in decibels below the top, for an output.
     *
     * A step is not a share of the volume: Android has a table of its
     * own, a few decibels a step, and "6 of 12" is not half. Reading the
     * steps as shares made the level shown - the phone's part times
     * ours - come out wrong. Gives back one figure per step, 0 for the
     * top; an empty list where Android cannot say (before 9).
     */
    @ReactMethod
    fun steps(route: String, promise: Promise) {
        val a = am
        val out = Arguments.createArray()
        if (a == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            promise.resolve(out)
            return
        }
        val stream = AudioManager.STREAM_VOICE_CALL
        val byRoute = when (route) {
            "EARPIECE" -> AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
            "WIRED_HEADSET" -> AudioDeviceInfo.TYPE_WIRED_HEADSET
            "BLUETOOTH" -> AudioDeviceInfo.TYPE_BLUETOOTH_SCO
            else -> AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
        }
        // The device the call is really on, where Android says it (12+),
        // then the one the route names: a phone refused the second.
        val candidates = mutableListOf<Int>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            a.communicationDevice?.type?.let { candidates.add(it) }
        }
        if (byRoute !in candidates) candidates.add(byRoute)
        var why = ""
        for (device in candidates) {
            try {
                val max = a.getStreamMaxVolume(stream)
                val top = a.getStreamVolumeDb(stream, max, device)
                val list = Arguments.createArray()
                var usable = top.isFinite()
                // The call volume has no step 0 - a call cannot be silenced
                // from the knob - and asking for it threw the whole table
                // away: "Invalid stream volume index 0".
                val min = a.getStreamMinVolume(stream)
                for (i in 0..max) {
                    if (i < min) { list.pushDouble(-96.0); continue }
                    val db = a.getStreamVolumeDb(stream, i, device) - top
                    if (i == max - 1 && !(db < 0f)) usable = false
                    list.pushDouble(if (db.isFinite()) db.toDouble() else -96.0)
                }
                if (usable) {
                    promise.resolve(list)
                    return
                }
                why += "device $device: flat; "
            } catch (e: Exception) {
                why += "device $device: ${e.javaClass.simpleName} ${e.message}; "
            }
        }
        // Said in the journal: without it, "no table" cannot be told from
        // "never asked".
        Journal.sample(ctx, "volume-steps:none:${why.take(160)}")
        promise.resolve(out)
    }

    /** Puts the call volume at an exact value. */
    @ReactMethod
    fun set(value: Int, promise: Promise) {
        val a = am
        if (a == null) { promise.resolve(false); return }
        try {
            val max = a.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL)
            val v = value.coerceIn(0, max)
            // No sounds and no system panel: the little bar is drawn by
            // the app, and seeing two of them overlapping is confusing.
            a.setStreamVolume(AudioManager.STREAM_VOICE_CALL, v, 0)
            promise.resolve(true)
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * All of Android's volumes, for the sheet that shows them.
     *
     * HyperOS has no call volume in its panel nor in its settings, and
     * its volume bar does not open onto the others: the call volume is
     * reached only with the keys during a call. Here each with its
     * value, its top and its floor - the call cannot go to zero.
     */
    @ReactMethod
    fun streams(promise: Promise) {
        val a = am
        val out = Arguments.createArray()
        if (a == null) { promise.resolve(out); return }
        for ((name, stream) in STREAMS) {
            try {
                val m = Arguments.createMap()
                m.putString("name", name)
                m.putInt("volume", a.getStreamVolume(stream))
                m.putInt("max", a.getStreamMaxVolume(stream))
                m.putInt(
                    "min",
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) a.getStreamMinVolume(stream) else 0,
                )
                out.pushMap(m)
            } catch (_: Exception) { /* that one is left out */ }
        }
        promise.resolve(out)
    }

    /**
     * One of them, at an exact value, quietly. Says how it went: "ok",
     * "held" when Android kept another value, "refused" when it will not
     * - with Do Not Disturb on, the ring cannot be touched without a
     * permission Duetto does not ask for.
     */
    @ReactMethod
    fun setStream(name: String, value: Int, promise: Promise) {
        val a = am
        val stream = STREAMS.firstOrNull { it.first == name }?.second
        if (a == null || stream == null) { promise.resolve("unknown"); return }
        try {
            val v = value.coerceIn(0, a.getStreamMaxVolume(stream))
            a.setStreamVolume(stream, v, 0)
            promise.resolve(if (a.getStreamVolume(stream) == v) "ok" else "held")
        } catch (_: SecurityException) {
            promise.resolve("refused")
        } catch (_: Exception) {
            promise.resolve("failed")
        }
    }

    /**
     * Warns when the call volume changes, from outside as well.
     *
     * It is there so that the number Duetto shows does not lie: if
     * somebody lowers the volume from another app or from the system
     * panel, the level really has changed, and until now the app went on
     * showing its own.
     *
     * The action is not in the public documentation but has always been
     * there and everybody uses it; if one day it stopped arriving, the
     * level would line itself up again at every heartbeat and at every
     * touch of the keys anyway.
     */
    private var registered = false
    private val listener = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.getIntExtra(EXTRA_TYPE, -1) != AudioManager.STREAM_VOICE_CALL) return
            if (!ctx.hasActiveReactInstance()) return
            try {
                ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(SYSTEM_EVENT, intent.getIntExtra(EXTRA_VALUE, -1))
            } catch (_: Exception) { /* noop */ }
        }
    }

    @ReactMethod
    fun listenToSystem(promise: Promise) {
        if (registered) { promise.resolve(true); return }
        try {
            // With the flag, and not by hand: from Android 14 on,
            // registering a receiver without declaring whether the signal
            // can come from outside brings the app down with a
            // SecurityException. This one comes from the system, so it is
            // not exported.
            ContextCompat.registerReceiver(
                ctx, listener, IntentFilter(VOLUME_ACTION),
                ContextCompat.RECEIVER_NOT_EXPORTED,
            )
            registered = true
            promise.resolve(true)
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    /** In the channel we watch the keys; outside they belong to the system. */
    @ReactMethod
    fun takeKeys(active: Boolean, promise: Promise) {
        Volume.active = active
        promise.resolve(true)
    }

    // Required by NativeEventEmitter on iOS; on Android they are not
    // needed, but having them avoids the warning in the console.
    @ReactMethod fun addListener(eventName: String) { /* noop */ }
    @ReactMethod fun removeListeners(count: Int) { /* noop */ }

    companion object {
        const val EVENT = "duetto-volume"
        const val SYSTEM_EVENT = "duetto-volume-system"
        private const val VOLUME_ACTION = "android.media.VOLUME_CHANGED_ACTION"
        private const val EXTRA_TYPE = "android.media.EXTRA_VOLUME_STREAM_TYPE"
        private const val EXTRA_VALUE = "android.media.EXTRA_VOLUME_STREAM_VALUE"
        /** Android's volumes, in the order the sheet shows them */
        private val STREAMS = listOf(
            "call" to AudioManager.STREAM_VOICE_CALL,
            "media" to AudioManager.STREAM_MUSIC,
            "ring" to AudioManager.STREAM_RING,
            "notification" to AudioManager.STREAM_NOTIFICATION,
            "alarm" to AudioManager.STREAM_ALARM,
        )
    }
}
