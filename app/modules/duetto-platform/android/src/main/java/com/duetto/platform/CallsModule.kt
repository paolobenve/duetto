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

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/** The channel as a call, from JavaScript: see Calls. */
class CallsModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoCalls"

    init {
        Calls.listener = { state ->
            if (ctx.hasActiveReactInstance()) {
                try {
                    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit(EVENT, state)
                } catch (_: Exception) { /* nobody listening */ }
            }
        }
    }

    /** Opens the call on entering the channel: "placed", or why not. */
    @ReactMethod
    fun start(name: String, promise: Promise) {
        promise.resolve(Calls.start(ctx, name))
    }

    /** The phone permission was just granted: the ringing is watched from now. */
    @ReactMethod
    fun watchRinging(promise: Promise) {
        Calls.watchRinging(ctx)
        promise.resolve(true)
    }

    /** Gives it back after a real call ended: see Calls.resume. */
    @ReactMethod
    fun resume(promise: Promise) {
        Calls.resume()
        promise.resolve(true)
    }

    /** The output, through our call: false with no call. */
    @ReactMethod
    fun setRoute(route: String, promise: Promise) {
        promise.resolve(Calls.setRoute(route))
    }

    /** Closes it on leaving. */
    @ReactMethod
    fun end(promise: Promise) {
        Calls.end()
        promise.resolve(true)
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    companion object {
        const val EVENT = "duetto-call"
    }
}
