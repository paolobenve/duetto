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
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * The Bluetooth audio devices, one by one.
 *
 * "Take a Bluetooth headset when it connects" was one choice for all of
 * them: the earpiece for work and the car's kit alike. Each device is
 * told here by name - what Android calls it, usually make and model -
 * and by address, when it comes and when it goes, so that the choice
 * can be made, and remembered, for each.
 *
 * No permission: an app without "Nearby devices" may get the address
 * partly hidden from Android 12, and the name alone tells them apart.
 */
class AudioDevicesModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoAudioDevices"

    private val am: AudioManager?
        get() = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

    private var callback: AudioDeviceCallback? = null

    private fun isBluetooth(d: AudioDeviceInfo): Boolean {
        if (!d.isSink) return false
        return d.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
            d.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && d.type == AudioDeviceInfo.TYPE_BLE_HEADSET)
    }

    /** One device, as JavaScript sees it: its name, and a key of its own. */
    private fun describe(d: AudioDeviceInfo): WritableMap {
        val name = d.productName?.toString()?.trim().orEmpty()
        val address = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) d.address.orEmpty() else ""
        val m = Arguments.createMap()
        m.putString("name", name)
        m.putString("id", if (address.isNotEmpty() && !address.startsWith("XX")) address else name)
        return m
    }

    /** The Bluetooth audio devices connected now, each once. */
    @ReactMethod
    fun list(promise: Promise) {
        val out = Arguments.createArray()
        val seen = mutableSetOf<String>()
        am?.getDevices(AudioManager.GET_DEVICES_OUTPUTS)?.filter { isBluetooth(it) }?.forEach {
            val m = describe(it)
            if (seen.add(m.getString("id") ?: "")) out.pushMap(m)
        }
        promise.resolve(out)
    }

    /** Starts telling JavaScript of the devices that come and go. */
    @ReactMethod
    fun watch(promise: Promise) {
        if (callback != null) { promise.resolve(true); return }
        val cb = object : AudioDeviceCallback() {
            override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>) = tell("added", added)
            override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) = tell("removed", removed)
        }
        am?.registerAudioDeviceCallback(cb, Handler(Looper.getMainLooper()))
        callback = cb
        promise.resolve(true)
    }

    private fun tell(what: String, devices: Array<out AudioDeviceInfo>) {
        if (!ctx.hasActiveReactInstance()) return
        val seen = mutableSetOf<String>()
        for (d in devices) {
            if (!isBluetooth(d)) continue
            val m = describe(d)
            if (!seen.add(m.getString("id") ?: "")) continue
            m.putString("event", what)
            try {
                ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(EVENT, m)
            } catch (_: Exception) { /* nobody listening */ }
        }
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    companion object {
        const val EVENT = "duetto-audio-device"
    }
}
