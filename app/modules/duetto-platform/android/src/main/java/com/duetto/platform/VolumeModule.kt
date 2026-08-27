package com.duetto.platform

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
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
    }
}
