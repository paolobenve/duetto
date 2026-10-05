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

import android.Manifest
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
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
    private var batteryReceiver: BroadcastReceiver? = null

    /**
     * The battery of a Bluetooth headset, as Android last heard it.
     *
     * Android knows it - the headset says it - but keeps the reading
     * behind a method it does not publish and a broadcast it does not
     * document: both are tried, the method first, the broadcast's last
     * word kept here by name and by address. Both need "Nearby devices",
     * the permission asked at the first start for seeing the headset at
     * all: without it, no figure, and nothing else changes.
     */
    private val batteries = mutableMapOf<String, Int>()

    private fun mayConnect(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.BLUETOOTH_CONNECT) ==
            PackageManager.PERMISSION_GRANTED

    @Suppress("MissingPermission")
    private fun deviceName(d: BluetoothDevice): String =
        try { d.name?.trim().orEmpty() } catch (_: SecurityException) { "" }

    @Suppress("MissingPermission")
    private fun batteryOf(d: BluetoothDevice): Int? {
        val viaMethod = try {
            d.javaClass.getMethod("getBatteryLevel").invoke(d) as? Int
        } catch (_: Throwable) { null }
        if (viaMethod != null && viaMethod in 0..100) return viaMethod
        return batteries[d.address] ?: batteries[deviceName(d)]
    }

    /** The battery of the device known as `id` (its name, or its address): null if unknown. */
    @ReactMethod
    @Suppress("MissingPermission")
    fun battery(id: String, promise: Promise) {
        if (!mayConnect()) { promise.resolve(null); return }
        val manager = ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        val bonded = try { manager?.adapter?.bondedDevices.orEmpty() } catch (_: SecurityException) { emptySet() }
        val dev = bonded.firstOrNull { deviceName(it) == id || it.address == id }
        val level = dev?.let { batteryOf(it) } ?: batteries[id]
        promise.resolve(level)
    }

    private fun watchBattery() {
        if (batteryReceiver != null || !mayConnect()) return
        val receiver = object : BroadcastReceiver() {
            @Suppress("MissingPermission", "DEPRECATION")
            override fun onReceive(c: Context, intent: Intent) {
                val dev = intent.getParcelableExtra<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE) ?: return
                val level = intent.getIntExtra(EXTRA_BATTERY_LEVEL, -1)
                if (level !in 0..100) return
                val name = deviceName(dev)
                batteries[dev.address] = level
                if (name.isNotEmpty()) batteries[name] = level
                if (!ctx.hasActiveReactInstance()) return
                val m = Arguments.createMap()
                m.putString("event", "battery")
                m.putString("id", name.ifEmpty { dev.address })
                m.putString("name", name)
                m.putInt("level", level)
                try {
                    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit(EVENT, m)
                } catch (_: Exception) { /* nobody listening */ }
            }
        }
        try {
            ContextCompat.registerReceiver(
                ctx, receiver, IntentFilter(ACTION_BATTERY_LEVEL_CHANGED),
                ContextCompat.RECEIVER_EXPORTED,
            )
            batteryReceiver = receiver
        } catch (_: Exception) { /* no figure, nothing else changes */ }
    }

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
        // The name first: a headset shows itself twice - calls and music -
        // and the two can carry different or hidden addresses, while the
        // name is the same. The address only where there is no name.
        m.putString("id", name.ifEmpty { address })
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
        watchBattery()
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

    /** How the voice is taken now, as a line for the journal. See VoiceEffects. */
    @ReactMethod
    fun voice(promise: Promise) {
        promise.resolve(VoiceEffects.describe(ctx))
    }

    /** Whether WebRTC's own voice effects are wanted, and in use now. */
    @ReactMethod
    fun ownEffects(promise: Promise) {
        val m = Arguments.createMap()
        m.putBoolean("wanted", VoiceEffects.wanted(ctx))
        m.putBoolean("inUse", VoiceEffects.inUse == true)
        promise.resolve(m)
    }

    /** Takes effect at the next start of Duetto. */
    @ReactMethod
    fun setOwnEffects(own: Boolean, promise: Promise) {
        VoiceEffects.want(ctx, own)
        promise.resolve(true)
    }

    /** WebRTC's warnings in Android's log from the next start: see VoiceEffects. */
    @ReactMethod
    fun setWebrtcLog(on: Boolean, promise: Promise) {
        VoiceEffects.wantWebrtcLog(ctx, on)
        promise.resolve(true)
    }

    /** Starts Duetto afresh, for the choice to take effect. */
    @ReactMethod
    fun restart(promise: Promise) {
        promise.resolve(true)
        RestartActivity.restart(ctx)
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    companion object {
        const val EVENT = "duetto-audio-device"
        // Not in the public SDK: the strings the system sends with.
        private const val ACTION_BATTERY_LEVEL_CHANGED =
            "android.bluetooth.device.action.BATTERY_LEVEL_CHANGED"
        private const val EXTRA_BATTERY_LEVEL = "android.bluetooth.device.extra.BATTERY_LEVEL"
    }
}
