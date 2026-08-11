package com.duotalk.platform

import android.content.Intent
import android.os.Build
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Tiene viva la presenza SENZA aprire l'interfaccia.
 *
 * Serve al riavvio del telefono: da Android 10 avviare un'activity dal
 * secondo piano è vietato, quindi non si può "aprire l'app da sola".
 * Si può però avviare il motore JavaScript senza interfaccia, ed è
 * quello che fa questo servizio: la stessa logica di connessione che già
 * esiste riparte da sola e il telefono torna raggiungibile.
 *
 * Il compito JS non si conclude mai di proposito (vedi presence.ts): deve
 * restare in ascolto finché il servizio vive.
 */
class PresenceService : HeadlessJsTaskService() {

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Senza passare in primo piano Android chiuderebbe il servizio in
        // pochi secondi, e la presenza durerebbe quanto un fiammifero.
        Notifier.startForegroundPresence(this)
        return super.onStartCommand(intent, flags, startId)
    }

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        return HeadlessJsTaskConfig(
            "duotalk-presence",
            Arguments.createMap(),
            // 0 = nessun limite di tempo: il compito deve restare vivo.
            0,
            // Continua anche quando l'app è in primo piano: è il JS a
            // decidere di farsi da parte quando l'interfaccia prende il
            // comando (vedi presence.ts).
            true,
        )
    }

    companion object {
        /** Vero se il sistema permette di avviarlo in questo momento. */
        fun canStart(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
    }
}
