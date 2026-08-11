package com.duotalk.platform

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
 * di sistema. Non e' aggirabile da codice.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != Intent.ACTION_LOCKED_BOOT_COMPLETED &&
            action != "android.intent.action.QUICKBOOT_POWERON"
        ) return

        if (!PresenceService.canStart()) return
        try {
            ContextCompat.startForegroundService(
                context,
                Intent(context, PresenceService::class.java),
            )
            Log.i("DuoTalk", "presenza riavviata dopo il boot")
        } catch (e: Exception) {
            // Se il sistema lo vieta non c'e' molto da fare: l'utente
            // aprira' l'app e la presenza ripartira' da li'.
            Log.w("DuoTalk", "impossibile riavviare la presenza: ${e.message}")
        }
    }
}
