package com.duetto.platform

import android.content.Context
import android.media.AudioManager
import android.view.KeyEvent

/**
 * I tasti del volume, quando il telefono non ubbidisce.
 *
 * IL PROBLEMA
 * Mandare i tasti sul volume della conversazione (vedi AudioModule) basta
 * quasi sempre. Ma su parecchi telefoni il volume di chiamata
 * SULL'ALTOPARLANTE e' inchiodato dal produttore: sta al massimo e sopra
 * non si va. L'utente preme, il sistema mostra la barretta gia' piena, e
 * la voce dell'altro resta assordante. Nessuna app puo' cambiare quel
 * limite dall'esterno: Discord e WhatsApp non hanno il problema perche'
 * si registrano come chiamate vere nel sistema, che e' un altro impianto.
 *
 * LA VIA D'USCITA
 * WebRTC sa alzare e abbassare la voce dell'altro da sola, dentro di se',
 * senza chiedere niente al telefono. Allora i tasti li prendiamo noi
 * mentre siamo nel canale: prima si prova a girarli al sistema, com'e'
 * giusto, e SOLO SE il sistema non si muove - perche' e' al limite - si
 * avvisa JavaScript, che alza o abbassa il guadagno suo.
 *
 * Cosi' dove il volume di sistema funziona non cambia niente, e dove non
 * funziona i tasti smettono di sembrare rotti.
 *
 * Sta in un `object` e non nel modulo perche' a riceverli e' l'activity,
 * che di moduli React non sa nulla.
 */
object Volume {

    /** Vero mentre si e' nel canale: fuori, i tasti sono del sistema. */
    @Volatile
    var attivo = false

    /** Chi porta la notizia a JavaScript; lo mette il modulo. */
    @Volatile
    var avvisa: ((Int) -> Unit)? = null

    /**
     * @return true se il tasto l'abbiamo gestito noi e non deve andare oltre
     */
    fun intercetta(ctx: Context, keyCode: Int): Boolean {
        if (!attivo) return false
        val direzione = when (keyCode) {
            KeyEvent.KEYCODE_VOLUME_UP -> AudioManager.ADJUST_RAISE
            KeyEvent.KEYCODE_VOLUME_DOWN -> AudioManager.ADJUST_LOWER
            else -> return false
        }
        val am = ctx.getSystemService(AudioManager::class.java) ?: return false
        return try {
            val prima = am.getStreamVolume(AudioManager.STREAM_VOICE_CALL)
            // FLAG_SHOW_UI: la barretta di sistema si vede come sempre.
            // Se il volume si muove davvero, e' quella la risposta giusta
            // da dare all'utente, non un indicatore nostro.
            am.adjustStreamVolume(AudioManager.STREAM_VOICE_CALL, direzione, AudioManager.FLAG_SHOW_UI)
            val dopo = am.getStreamVolume(AudioManager.STREAM_VOICE_CALL)
            if (dopo == prima) {
                avvisa?.invoke(if (direzione == AudioManager.ADJUST_RAISE) 1 else -1)
            }
            true
        } catch (e: Exception) {
            // Meglio lasciar fare al sistema che mangiarsi il tasto.
            false
        }
    }

    /** Il tasto rilasciato va consumato con quello premuto, o suona due volte. */
    fun consumaRilascio(keyCode: Int): Boolean =
        attivo && (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN)
}
