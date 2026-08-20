package com.duetto.platform

import android.content.Context
import android.view.KeyEvent

/**
 * I tasti del volume, nel canale, comandano la voce dell'altro.
 *
 * COS'E' SUCCESSO PRIMA
 * Il primo tentativo e' stato mandare i tasti sul volume della
 * conversazione (vedi AudioModule): funziona su parecchi telefoni, non
 * su tutti. Il secondo e' stato girarli al sistema e prendere in mano la
 * situazione solo quando il sistema NON si muoveva, perche' era al suo
 * limite.
 *
 * Il diario di un Motorola Edge 50 Fusion ha mostrato che non basta:
 * li' `tastiVoce=si`, `audio=comunicazione`, e l'indice del volume di
 * chiamata scende da 4/8 a 2/8 quando si preme - il sistema si muove
 * eccome - e all'orecchio non cambia niente. Il telefono registra il
 * numero e lo ignora. Una regola che si fida di quel numero non puo'
 * accorgersene: da fuori, un volume che scende senza effetto e uno che
 * scende davvero sono identici.
 *
 * COSA FA ADESSO
 * Nel canale i tasti li prende l'app, sempre, e cambiano il guadagno che
 * WebRTC applica alla voce dell'altro prima di suonarla: quello non
 * passa dal telefono e non puo' essere ignorato da nessuno. Al posto
 * della barretta di sistema compare l'indicatore dell'app, che dice a
 * che punto si e'.
 *
 * Il volume di sistema resta dov'e' e si regola fuori dal canale, come
 * qualunque altro volume del telefono.
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
     * L'ultima riga di diario scritta per un tasto del volume.
     *
     * Tenendo premuto il tasto le pressioni arrivano a raffica, e una
     * riga per ognuna riempirebbe il diario di rumore. Una ogni due
     * secondi basta a ricostruire cos'e' successo.
     */
    private var ultimaNota = 0L

    /**
     * @return true se il tasto l'abbiamo gestito noi e non deve andare oltre
     */
    fun intercetta(ctx: Context, keyCode: Int): Boolean {
        if (!attivo) return false
        val su = when (keyCode) {
            KeyEvent.KEYCODE_VOLUME_UP -> true
            KeyEvent.KEYCODE_VOLUME_DOWN -> false
            else -> return false
        }
        // Se JavaScript non c'e' - app appena avviata, o motore fermo -
        // il tasto torna al sistema: meglio il volume di prima che un
        // tasto che non fa niente.
        val destinatario = avvisa ?: return false
        destinatario.invoke(if (su) 1 else -1)

        // Una riga di diario ogni tanto: e' l'unico modo di vedere, da un
        // telefono lontano, se i tasti arrivano e in che stato era
        // l'audio quando sono arrivati.
        val ora = System.currentTimeMillis()
        if (ora - ultimaNota > 2000) {
            ultimaNota = ora
            try {
                Diario.campiona(ctx.applicationContext, if (su) "volume-su" else "volume-giu")
            } catch (_: Exception) { /* il diario non vale un tasto */ }
        }
        return true
    }

    /** Il tasto rilasciato va consumato con quello premuto, o suona due volte. */
    fun consumaRilascio(keyCode: Int): Boolean =
        attivo && (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN)
}
