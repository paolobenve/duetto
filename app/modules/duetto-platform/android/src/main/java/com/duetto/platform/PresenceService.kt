package com.duetto.platform

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
        // Se siamo qui dopo che il sistema ci ha uccisi, il perche' e'
        // scritto da qualche parte: si prende adesso, prima che le morti
        // piu' vecchie escano dalla lista che Android tiene.
        Diario.registraUscite(applicationContext)
        return super.onStartCommand(intent, flags, startId)
    }

    /**
     * Se il padrone del telefono scarta l'app dai recenti, si smette.
     *
     * Il sistema ci rimette in piedi da solo quando ci uccide lui - il
     * compito torna con il suo intento (START_REDELIVER_INTENT) - ed e'
     * giusto cosi': non e' una decisione di nessuno, e' memoria che
     * serviva altrove. Ma quando a togliere di mezzo l'app e' chi il
     * telefono ce l'ha in mano, resuscitare sarebbe disubbidire. E' la
     * stessa regola del servizio del canale.
     *
     * Dopo un riavvio del telefono l'app non ha nessun compito nei
     * recenti, quindi qui non arriva nulla e la presenza resta.
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        stopSelf()
        super.onTaskRemoved(rootIntent)
    }

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        return HeadlessJsTaskConfig(
            "duetto-presence",
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
