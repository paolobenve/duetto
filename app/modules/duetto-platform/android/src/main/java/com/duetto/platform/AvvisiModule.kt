package com.duetto.platform

import android.app.Activity
import android.content.Intent
import android.media.RingtoneManager
import android.net.Uri
import androidx.core.content.IntentCompat
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Le preferenze dell'avviso: vibrazione e suono.
 *
 * Il lavoro vero lo fa Avvisi; qui c'e' il ponte verso JS e la scelta del
 * suono, che richiede di aprire una schermata di sistema e aspettarne il
 * risultato - cosa che da JS non si puo' fare.
 */
class AvvisiModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoAvvisi"

    /** Chi aspetta il suono scelto. Uno per volta: e' una schermata modale. */
    private var inAttesa: Promise? = null

    private val ascoltatore: ActivityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(
            activity: Activity?,
            requestCode: Int,
            resultCode: Int,
            data: Intent?,
        ) {
            if (requestCode != CODICE_SCELTA) return
            val promise = inAttesa ?: return
            inAttesa = null

            if (resultCode != Activity.RESULT_OK || data == null) {
                // Ha annullato: non e' un errore, semplicemente non cambia
                // niente. Chi chiama distingue null da un suono scelto.
                promise.resolve(null)
                return
            }
            // Via IntentCompat: la versione diretta e' deprecata da
            // Android 13, e con essa i tipi non sono controllati.
            val uri: Uri? = IntentCompat.getParcelableExtra(
                data, RingtoneManager.EXTRA_RINGTONE_PICKED_URI, Uri::class.java,
            )
            if (uri == null) {
                promise.resolve(null)
                return
            }
            val risposta = Arguments.createMap()
            risposta.putString("uri", uri.toString())
            risposta.putString("nome", nomeDi(uri))
            promise.resolve(risposta)
        }
    }

    init {
        ctx.addActivityEventListener(ascoltatore)
    }

    /** Il nome da mostrare, chiesto al sistema: noi non lo sapremmo. */
    private fun nomeDi(uri: Uri): String = try {
        RingtoneManager.getRingtone(ctx, uri)?.getTitle(ctx) ?: "Suono scelto"
    } catch (_: Exception) {
        "Suono scelto"
    }

    /**
     * Registra le preferenze e prepara il canale di notifica.
     *
     * Da chiamare all'avvio e a ogni cambiamento: e' la creazione del
     * canale a fissare suono e vibrazione, e un canale gia' nato non si
     * puo' piu' modificare.
     */
    @ReactMethod
    fun configura(vibra: String, suono: String, uri: String, promise: Promise) {
        try {
            Avvisi.salva(ctx, vibra, suono, uri)
            // Qui sì: è il momento in cui le preferenze cambiano davvero,
            // e i canali che non corrispondono più vanno tolti di mezzo.
            promise.resolve(Avvisi.canale(ctx, ripulisci = true))
        } catch (e: Exception) {
            promise.reject("avvisi_errore", e)
        }
    }

    /**
     * Apre la scelta dei suoni di sistema.
     *
     * Risolve `{uri, nome}`, oppure null se si annulla.
     */
    @ReactMethod
    fun scegliSuono(uriCorrente: String, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.resolve(null)
            return
        }
        // Se ne era rimasta una appesa - schermata chiusa in modo strano -
        // la si chiude prima, altrimenti resterebbe in attesa per sempre.
        inAttesa?.resolve(null)
        inAttesa = promise

        val intent = Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
            putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_NOTIFICATION)
            putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "Suono dell'avviso")
            // "Predefinito" e "Nessuno" sono gia' due voci nelle nostre
            // impostazioni: rimetterle qui dentro sarebbe la stessa scelta
            // in due posti, con due risposte possibili diverse.
            putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, false)
            putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
            putExtra(
                RingtoneManager.EXTRA_RINGTONE_EXISTING_URI,
                uriCorrente.takeIf { it.isNotEmpty() }?.let { Uri.parse(it) },
            )
        }
        try {
            activity.startActivityForResult(intent, CODICE_SCELTA)
        } catch (e: Exception) {
            inAttesa = null
            promise.reject("scelta_impossibile", e)
        }
    }

    companion object {
        private const val CODICE_SCELTA = 4713
    }
}
