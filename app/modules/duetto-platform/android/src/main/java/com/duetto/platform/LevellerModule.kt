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

/** The other's voice levelled, from JavaScript: see Leveller. */
class LevellerModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    init {
        Leveller.listener = { state -> tell(state) }
    }

    override fun getName() = "DuettoLeveller"

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    @ReactMethod fun setWanted(on: Boolean) = Leveller.setWanted(on)

    @ReactMethod fun setGain(gain: Double) = Leveller.setGain(gain.toFloat())

    @ReactMethod fun state(p: Promise) = p.resolve(Leveller.state)

    private fun tell(state: String) {
        if (!ctx.hasActiveReactInstance()) return
        try {
            ctx.getJSModule(
                com.facebook.react.modules.core.DeviceEventManagerModule
                    .RCTDeviceEventEmitter::class.java,
            ).emit(EVENT, state)
        } catch (_: Exception) {
            // Only the telling is lost: the voice is levelled or not all the same.
        }
    }

    companion object {
        const val EVENT = "duetto-leveller"
    }
}
