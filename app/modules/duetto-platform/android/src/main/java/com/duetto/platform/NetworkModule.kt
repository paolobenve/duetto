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
import android.net.NetworkRequest
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

    /**
     * The default network last announced, by identity.
     *
     * Some phones (MIUI above all) re-announce the very same default
     * network every few minutes - scores, revalidations - and every
     * announcement used to come out as an arrival: since the arrival
     * is the one word that restarts a healthy link's search for
     * roads, a quiet call got a needless renegotiation on a clock.
     * Only a network that really is ANOTHER one is an arrival; the
     * identity is forgotten when the network is lost, so a genuine
     * gone-and-back still counts as one.
     */
    private var lastNetwork: String = ""

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            val id = network.toString()
            if (id == lastNetwork) return
            lastNetwork = id
            wasValid = false
            emit("arrived")
        }

        override fun onLost(network: Network) {
            lastNetwork = ""
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

    /**
     * The emergency lane: mobile data, asked for by name.
     *
     * The wifi that dies as one walks out of the house is deaf long
     * before the phone lets go of it, and `reportNotCarrying` above
     * only ASKS Android to make its mind up - which, mid-conversation,
     * can take the better part of a minute. Here we stop asking:
     * requesting the cellular transport switches the data radio on
     * even while the wifi is still the default, and binding the
     * process to it puts every new socket - the signalling and the
     * call's own - on the road that works.
     *
     * It costs radio, so whoever opens the lane closes it: when the
     * wifi is validated again (the `valid` event above), or when the
     * conversation ends. Closing unbinds, and the phone goes back to
     * choosing its own road.
     */
    private var mobileLane: ConnectivityManager.NetworkCallback? = null

    /**
     * The wifi's watchman, alive only while the lane is open.
     *
     * With the process bound to the cellular network, the default
     * network callback above speaks of the cellular alone: nobody
     * would ever say the wifi has come back to health. This second
     * pair of eyes watches the wifi transport by name and says
     * "wifi-back" on the step from useless to good - the word the
     * app closes the lane on, at its own pace.
     */
    private var wifiWatch: ConnectivityManager.NetworkCallback? = null
    private var wifiWasValid = false

    @ReactMethod
    fun requestMobile(promise: Promise) {
        if (mobileLane != null) { promise.resolve(true); return }
        val c = cm
        if (c == null) { promise.resolve(false); return }
        try {
            val request = NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_CELLULAR)
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            val lane = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    try { c.bindProcessToNetwork(network) } catch (_: Exception) { return }
                    // Said as an arrival: every piece of machinery that
                    // rebuilds on a new network runs on this word.
                    emit("arrived")
                }

                override fun onLost(network: Network) {
                    // The lane itself died (aeroplane mode, no signal):
                    // the binding must not outlive it, or every socket
                    // would be nailed to a road that is not there.
                    try { c.bindProcessToNetwork(null) } catch (_: Exception) { /* noop */ }
                    emit("lost")
                }
            }
            c.requestNetwork(request, lane)
            mobileLane = lane

            wifiWasValid = false
            val watch = object : ConnectivityManager.NetworkCallback() {
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                    val valid = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                    if (valid == wifiWasValid) return
                    wifiWasValid = valid
                    if (valid) emit("wifi-back")
                }

                override fun onLost(network: Network) {
                    wifiWasValid = false
                }
            }
            try {
                c.registerNetworkCallback(
                    NetworkRequest.Builder()
                        .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        .build(),
                    watch,
                )
                wifiWatch = watch
            } catch (_: Exception) {
                // Without the watchman the lane still works: it just
                // stays open until the conversation ends.
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * One question through the mobile radio alone: is this host
     * reachable over there?
     *
     * From the wifi, a wifi gone deaf and a server down for everybody
     * are the same silence; only another road can tell them apart.
     * The cellular network is requested WITHOUT binding anything to
     * it, the host is resolved and dialled through that network only,
     * and the request is let go as soon as the answer is in. True
     * means the server answered over mobile - the deafness is ours.
     */
    @ReactMethod
    fun probeViaMobile(host: String, port: Int, timeoutMs: Int, promise: Promise) {
        val c = cm
        if (c == null) { promise.resolve(false); return }
        val done = java.util.concurrent.atomic.AtomicBoolean(false)
        var probeCb: ConnectivityManager.NetworkCallback? = null
        fun finish(ok: Boolean) {
            if (!done.compareAndSet(false, true)) return
            try { probeCb?.let { c.unregisterNetworkCallback(it) } } catch (_: Exception) { /* noop */ }
            promise.resolve(ok)
        }
        probeCb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                if (done.get()) return
                Thread {
                    val ok = try {
                        val addr = network.getAllByName(host).firstOrNull()
                        if (addr == null) false else {
                            val s = network.socketFactory.createSocket()
                            try {
                                s.connect(java.net.InetSocketAddress(addr, port), timeoutMs)
                                true
                            } finally {
                                try { s.close() } catch (_: Exception) { /* noop */ }
                            }
                        }
                    } catch (_: Exception) { false }
                    finish(ok)
                }.start()
            }
        }
        try {
            val request = NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_CELLULAR)
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            c.requestNetwork(request, probeCb)
        } catch (_: Exception) { finish(false); return }
        // No cellular coming - aeroplane mode, no SIM, no coverage: the
        // callback never fires and the answer is no. (The timeout-taking
        // requestNetwork exists only from API 26; minSdk is 24.)
        android.os.Handler(android.os.Looper.getMainLooper())
            .postDelayed({ finish(false) }, (timeoutMs + 2000).toLong())
    }

    @ReactMethod
    fun releaseMobile(promise: Promise) {
        val lane = mobileLane
        mobileLane = null
        val watch = wifiWatch
        wifiWatch = null
        try {
            if (watch != null) cm?.unregisterNetworkCallback(watch)
            if (lane != null) cm?.unregisterNetworkCallback(lane)
            cm?.bindProcessToNetwork(null)
            // Back on the phone's own choice: the rebuild runs again.
            if (lane != null) emit("arrived")
        } catch (_: Exception) { /* noop */ }
        promise.resolve(true)
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

    /**
     * Looks at which network is carrying us NOW, instead of waiting to
     * be told.
     *
     * The announcement of a change can simply not arrive: when it is
     * made there may be no JavaScript alive to hear it, and `emit`
     * drops it in silence - nothing queues it, nothing repeats it. A
     * phone that reached home with the screen off was seen holding its
     * link over the carrier until the screen came back on, minutes
     * later, although the wifi had been the default network all along.
     *
     * So the heartbeat, which rings with the screen off, asks this
     * instead: the default network is read from the system, and if it
     * is not the one already announced, the arrival is announced now.
     * Being the same word, everything downstream - the search for new
     * roads, the escape from the relay - happens exactly as it would
     * have then.
     */
    @ReactMethod
    fun recheck(promise: Promise) {
        val c = cm
        if (c == null) { promise.resolve(false); return }
        try {
            val now = c.activeNetwork
            if (now == null) { promise.resolve(false); return }
            val id = now.toString()
            if (id == lastNetwork) { promise.resolve(false); return }
            lastNetwork = id
            wasValid = false
            emit("arrived")
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
