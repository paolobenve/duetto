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
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Warns when the phone's network changes under our feet.
 *
 * WHY IT IS NEEDED
 * No TCP connection survives a change of address: it is made of the pair
 * of addresses and ports of the two ends, and change one of them and that
 * connection does not exist any more. Changing cell, or going from wifi
 * to mobile data, the socket towards the server is dead even though it
 * looks open - and the news of its death can arrive minutes later, when
 * the network layer notices.
 *
 * The first to know is Android, which has just made the change. From here
 * we ask it: as soon as there is a new network the connection is made
 * again, instead of waiting for somebody to trip over the dead socket.
 *
 * What is listened to is the DEFAULT network - the one apps really use -
 * and a change of address on a network that stays the same is reported
 * too: between two cells the phone stays "on data", but the address
 * changes all the same, and that is what breaks connections.
 */
class NetworkModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoNetwork"

    private var registered = false

    /** The last address seen: it keeps us from crying wolf. */
    private var lastAddress: String = ""

    /**
     * Whether the network was good for the internet last time.
     *
     * onCapabilitiesChanged fires constantly on a network that is not
     * moving - the bandwidth estimate, the congestion, the signal - and
     * reporting it every time made a healthy connection be rebuilt every
     * few seconds: the two phones knocked each other down in turn and saw
     * each other disappear. What matters is the STEP from useless to
     * good, not the state.
     */
    private var wasValid = false

    private val cm: ConnectivityManager?
        get() = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            wasValid = false
            emit("arrived")
        }

        override fun onLost(network: Network) {
            lastAddress = ""
            wasValid = false
            emit("lost")
        }

        override fun onLinkPropertiesChanged(network: Network, link: LinkProperties) {
            // A change of cell shows up here: same network, new address.
            // Without the comparison, dozens of identical events would
            // arrive, and every time a healthy connection would be rebuilt.
            val addresses = link.linkAddresses.joinToString(",") { it.address.hostAddress ?: "" }
            if (addresses == lastAddress) return
            lastAddress = addresses
            emit("address")
        }

        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
            // Only one case matters: the network that BECOMES good for the
            // internet after having been useless - the guest wifi asking
            // for a password, the data hooking up. The state on its own
            // changes dozens of times a minute without anything having
            // happened.
            val valid = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            if (valid == wasValid) return
            wasValid = valid
            if (valid) emit("valid")
        }
    }

    private fun emit(what: String) {
        if (!ctx.hasActiveReactInstance()) return
        try {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT, what)
        } catch (_: Exception) {
            // A lost event costs a later reconnection; it is not worth
            // bringing the app down for.
        }
    }

    /**
     * Tells Android that on this network the traffic does not get through.
     *
     * It is not "this network is broken": it is "check now, because I have
     * just tried and nothing is getting through". The system runs its own
     * check and decides for itself - if the network does not lead to the
     * internet it demotes it and moves the traffic elsewhere, and if it
     * does get through nothing happens.
     *
     * It is there for the case one sees when leaving the house: the wifi,
     * which works perfectly well, gets weak and stops carrying data, but
     * the phone stays hooked to it. With the screen off Android takes a
     * long time to make up its mind - twenty-nine seconds this morning,
     * and the decision came one second after the screen came back on. We
     * know sooner, because our own attempts fail: we tell it, and it does
     * the checking.
     *
     * The judgement holds for that connection alone: coming back home the
     * phone hooks up again, the check succeeds, and the wifi is its usual
     * self once more.
     */
    @ReactMethod
    fun reportNotCarrying(promise: Promise) {
        try {
            val c = cm
            val network = c?.activeNetwork
            if (c == null || network == null) { promise.resolve(false); return }
            c.reportNetworkConnectivity(network, false)
            promise.resolve(true)
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    /** Starts listening. Idempotent. */
    @ReactMethod
    fun start(promise: Promise) {
        if (registered) { promise.resolve(true); return }
        try {
            cm?.registerDefaultNetworkCallback(callback)
            registered = true
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    companion object {
        const val EVENT = "duetto-network"
    }
}
