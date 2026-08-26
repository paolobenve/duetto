package com.duetto.platform

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Fa ripartire la presenza dopo il riavvio del telefono.
 *
 * ATTENZIONE su Xiaomi/POCO e simili: questo evento non viene consegnato
 * affatto se l'app non ha "Avvio automatico" abilitato nelle impostazioni
 * di sistema. Non è aggirabile da codice.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        // I nomi in memoria sono cambiati: si passa di qui per primi.
        Ponte.migra(context)
        val action = intent.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != Intent.ACTION_LOCKED_BOOT_COMPLETED &&
            action != "android.intent.action.QUICKBOOT_POWERON"
        ) return

        /**
         * Si annota che l'evento è arrivato.
         *
         * Quell'autorizzazione non è leggibile - è una schermata del
         * produttore, nessuna app può interrogarla - ma l'unica cosa che
         * conta davvero è se dopo un riavvio l'app riparte. Se questo
         * evento arriva, è la prova sul campo che è a posto; se non
         * arriva mai, l'utente lo scopre da sé.
         */
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putLong(ULTIMO_AVVIO, System.currentTimeMillis())
            .apply()

        if (!PresenceService.canStart()) return
        try {
            ContextCompat.startForegroundService(
                context,
                Intent(context, PresenceService::class.java),
            )
            Log.i("Duetto", "presenza riavviata dopo il boot")
        } catch (e: Exception) {
            // Se il sistema lo vieta non c'è molto da fare: l'utente
            // aprira' l'app e la presenza ripartira' da lì.
            Log.w("Duetto", "impossibile riavviare la presenza: ${e.message}")
        }
    }

    companion object {
        const val PREFS = "duetto_boot"
        const val ULTIMO_AVVIO = "last_auto_start"

        /**
         * I nomi di prima, in italiano: si leggono una volta e si
         * riscrivono con i nuovi.
         *
         * Il progetto passa all'inglese per essere pubblicato, e con il
         * resto cambiano anche i nomi con cui le cose stanno scritte
         * nella memoria del telefono. Chi ha gia' l'app non deve
         * accorgersene. Questo ponte si toglie alla prossima versione.
         */
        const val PREFS_VECCHIE = "duetto_avvio"
        const val ULTIMO_AVVIO_VECCHIO = "ultimo_avvio_automatico"
    }
}
