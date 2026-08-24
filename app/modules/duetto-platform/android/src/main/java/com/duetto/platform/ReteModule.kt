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
 * Avverte quando la rete del telefono cambia sotto i piedi.
 *
 * PERCHE' SERVE
 * Nessuna connessione TCP sopravvive a un cambio di indirizzo: e' fatta
 * della coppia di indirizzi e porte dei due capi, e cambiandone uno
 * quella connessione non esiste piu'. Cambiando cella, o passando dal
 * wifi ai dati, il socket verso il server e' morto anche se sembra
 * aperto - e la notizia della sua morte puo' arrivare minuti dopo,
 * quando lo strato di rete se ne accorge.
 *
 * Chi lo sa per primo e' Android, che il cambio lo ha appena fatto. Da
 * qui glielo si chiede: appena c'e' una rete nuova si rifa' la
 * connessione, invece di aspettare che qualcuno inciampi nel socket
 * morto.
 *
 * Si ascolta la rete PREDEFINITA - quella che le app usano davvero - e
 * si segnala anche il cambio di indirizzo su una rete che resta la
 * stessa: fra due celle il telefono resta "sui dati", ma l'indirizzo
 * cambia lo stesso, ed e' quello che rompe le connessioni.
 */
class ReteModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoRete"

    private var registered = false

    /** L'ultimo indirizzo visto: serve a non gridare al lupo. */
    private var ultimoIndirizzo: String = ""

    private val cm: ConnectivityManager?
        get() = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            emit("arrivata")
        }

        override fun onLost(network: Network) {
            ultimoIndirizzo = ""
            emit("persa")
        }

        override fun onLinkPropertiesChanged(network: Network, link: LinkProperties) {
            // Il cambio di cella si vede qui: stessa rete, indirizzo
            // nuovo. Senza confronto arriverebbero decine di eventi
            // identici, e ogni volta si rifarebbe una connessione sana.
            val indirizzi = link.linkAddresses.joinToString(",") { it.address.hostAddress ?: "" }
            if (indirizzi == ultimoIndirizzo) return
            ultimoIndirizzo = indirizzi
            emit("indirizzo")
        }

        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
            // Interessa un caso solo: la rete che diventa buona per
            // internet dopo essere stata inutile - il wifi dell'ospite
            // che chiede la password, i dati che si agganciano.
            if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) emit("valida")
        }
    }

    private fun emit(cosa: String) {
        if (!ctx.hasActiveReactInstance()) return
        try {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT, cosa)
        } catch (_: Exception) {
            // Un evento perso vale una riconnessione piu' tarda, non
            // vale far cadere l'app.
        }
    }

    /** Comincia ad ascoltare. Idempotente. */
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
        const val EVENT = "duetto-rete"
    }
}
