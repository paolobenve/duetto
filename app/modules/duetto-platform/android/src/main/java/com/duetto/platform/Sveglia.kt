package com.duetto.platform

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.util.Log

/**
 * I suoni per richiamare chi si e' distratto o addormentato.
 *
 * Non sono avvisi: l'avviso serve a dire "sono qui" a chi non c'e'.
 * Questi servono quando l'altro C'E' - siete tutti e due nel canale, la
 * connessione e' aperta, la sua voce non arriva - e a voce non lo si
 * sveglia perche' il telefono e' dall'altra parte della stanza.
 *
 * Per questo escono dal flusso della SVEGLIA e non da quello della
 * conversazione: il volume della sveglia e' quasi sempre alto, non lo
 * abbassa il "non disturbare" e non dipende da come e' regolata la voce
 * in quel momento. Un tamburo mandato al volume della telefonata, con la
 * voce a un terzo, non sveglierebbe nessuno.
 *
 * I file li fabbrica assets/genera-suoni.py: nessuna licenza da
 * rispettare, nessun campione di provenienza incerta dentro l'app.
 */
object Sveglia {

    private const val TAG = "Duetto"

    /** Uno alla volta: due tamburi sovrapposti sono solo rumore. */
    private var player: MediaPlayer? = null

    val nomi = listOf("tamburi", "batteria", "fanfara", "strombazzata", "gallo")

    /**
     * @param eco lo sta suonando chi lo ha MANDATO, non chi lo riceve
     *
     * Chi manda un suono deve sentire cos'ha mandato: senza, si preme
     * un pulsante e non succede niente di percepibile da questa parte.
     * Ma non allo stesso modo: al volume della sveglia finirebbe dritto
     * nel proprio microfono, e tornerebbe all'altro raddoppiato sopra a
     * quello che sta gia' suonando da lui. Quindi piano, e dalla via
     * della conversazione - la stessa dell'avviso di chiamata in attesa
     * - che e' fatta apposta per i segnali brevi durante una chiamata e
     * che la cancellazione d'eco conosce.
     */
    fun suona(ctx: Context, nome: String, eco: Boolean = false) {
        val res = when (nome) {
            "tamburi" -> R.raw.sveglia_tamburi
            "batteria" -> R.raw.sveglia_batteria
            "fanfara" -> R.raw.sveglia_fanfara
            "strombazzata" -> R.raw.sveglia_strombazzata
            "gallo" -> R.raw.sveglia_gallo
            else -> return
        }
        ferma()
        try {
            val attributi = AudioAttributes.Builder()
                .setUsage(
                    if (eco) AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING
                    else AudioAttributes.USAGE_ALARM,
                )
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            val mp = MediaPlayer.create(ctx, res, attributi, AudioManager.AUDIO_SESSION_ID_GENERATE)
            if (mp == null) {
                Log.w(TAG, "sveglia: non riesco a preparare $nome")
                return
            }
            mp.setOnCompletionListener {
                it.release()
                if (player === it) player = null
            }
            // Un terzo del volume: e' un riscontro, non un allarme.
            if (eco) mp.setVolume(0.33f, 0.33f)
            player = mp
            mp.start()
        } catch (e: Exception) {
            Log.w(TAG, "sveglia: $nome non suona: ${e.message}")
        }
    }

    /** Zittisce quello in corso: si usa anche prima di farne partire un altro. */
    fun ferma() {
        val mp = player ?: return
        player = null
        try {
            if (mp.isPlaying) mp.stop()
        } catch (_: Exception) {
            // gia' finito per conto suo
        }
        try { mp.release() } catch (_: Exception) { /* noop */ }
    }
}
