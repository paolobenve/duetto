package com.duetto.platform

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build

/**
 * Come deve farsi sentire l'avviso: vibrazione e suono.
 *
 * PERCHE' UN CANALE NUOVO A OGNI CAMBIAMENTO
 * Da Android 8 suono e vibrazione non si decidono per notifica ma per
 * canale, e un canale si configura SOLO nel momento in cui nasce:
 * riscriverlo dopo non ha alcun effetto, e senza un errore che lo dica.
 * L'unico modo perche' una preferenza cambiata valga davvero e' creare un
 * canale nuovo, con un altro identificativo, e buttare il precedente.
 *
 * L'identificativo porta quindi dentro di se' la configurazione. Il
 * prezzo, da sapere: se l'utente aveva regolato il canale a mano dalle
 * impostazioni di Android, cambiando preferenza qui quelle regolazioni
 * ripartono da zero, perche' il canale non e' piu' lo stesso.
 *
 * Le preferenze stanno in SharedPreferences, non nello stato di JS: la
 * notifica puo' nascere da un servizio in background, dove JS puo' non
 * esserci affatto.
 */
object Avvisi {

    private const val PREFS = "duetto_avvisi"
    private const val CHIAVE_VIBRA = "vibra"
    private const val CHIAVE_SUONO = "suono"
    private const val CHIAVE_URI = "uri"

    private const val PREFISSO_CANALE = "duetto_alerts"

    /** Due colpi staccati: si distingue da una notifica qualunque. */
    val RITMO = longArrayOf(0, 400, 200, 400)

    fun salva(ctx: Context, vibra: String, suono: String, uri: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(CHIAVE_VIBRA, vibra)
            .putString(CHIAVE_SUONO, suono)
            .putString(CHIAVE_URI, uri)
            .apply()
    }

    private fun vibra(ctx: Context) =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(CHIAVE_VIBRA, "predefinito") ?: "predefinito"

    private fun suono(ctx: Context) =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(CHIAVE_SUONO, "predefinito") ?: "predefinito"

    private fun uri(ctx: Context) =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(CHIAVE_URI, "") ?: ""

    /** Il suono da usare, o null se non se ne deve sentire nessuno. */
    fun suonoScelto(ctx: Context): Uri? = when (suono(ctx)) {
        "nessuno" -> null
        "scelto" -> uri(ctx).takeIf { it.isNotEmpty() }?.let { Uri.parse(it) }
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        else -> RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    }

    /** Il ritmo da usare, null se non si deve vibrare. */
    fun ritmoScelto(ctx: Context): LongArray? = when (vibra(ctx)) {
        "mai" -> null
        else -> RITMO
    }

    /**
     * L'identificativo del canale per la configurazione di adesso.
     *
     * Cambia quando cambia la configurazione: e' questo che fa nascere un
     * canale nuovo invece di riusarne uno gia' regolato altrimenti.
     */
    private fun idCanale(ctx: Context): String {
        val s = when (suono(ctx)) {
            "nessuno" -> "muto"
            "scelto" -> "s" + Integer.toHexString(uri(ctx).hashCode())
            else -> "predef"
        }
        return "${PREFISSO_CANALE}_${vibra(ctx)}_$s"
    }

    /**
     * Prepara il canale e restituisce il suo identificativo.
     *
     * I canali vecchi vengono buttati: restando, comparirebbero uno sopra
     * l'altro nelle impostazioni di Android, tutti chiamati "Avvisi dal
     * canale", senza che si capisca quale sia quello vivo.
     */
    fun canale(ctx: Context, ripulisci: Boolean = false): String {
        val id = idCanale(ctx)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return id

        val manager = ctx.getSystemService(NotificationManager::class.java) ?: return id

        // La pulizia la fa solo chi cambia le impostazioni. Farla a ogni
        // notifica significava cancellare e ricreare canali nel momento
        // in cui bisogna soltanto mostrare un avviso: se le preferenze
        // lette li' fossero per qualunque motivo diverse da quelle scelte,
        // la notifica stessa butterebbe via il canale giusto.
        if (ripulisci) {
            for (vecchio in manager.notificationChannels) {
                if (vecchio.id.startsWith(PREFISSO_CANALE) && vecchio.id != id) {
                    manager.deleteNotificationChannel(vecchio.id)
                }
            }
        }
        if (manager.getNotificationChannel(id) != null) return id

        val canale = NotificationChannel(
            id,
            "Avvisi dal canale",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Quando l'altra persona entra nel canale o ti chiama"
            setShowBadge(true)

            // "predefinito" vuol dire non toccare niente: il canale nasce
            // come Android ritiene giusto, ed e' il sistema a decidere
            // sapendo cose che noi non sappiamo (silenzioso, non
            // disturbare, cuffie collegate).
            when (vibra(ctx)) {
                "sempre" -> { enableVibration(true); vibrationPattern = RITMO }
                "mai" -> enableVibration(false)
            }

            when (suono(ctx)) {
                "nessuno" -> setSound(null, null)
                "scelto" -> {
                    val u = uri(ctx)
                    if (u.isNotEmpty()) {
                        setSound(
                            Uri.parse(u),
                            AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build(),
                        )
                    }
                }
            }
        }
        manager.createNotificationChannel(canale)
        return id
    }
}
