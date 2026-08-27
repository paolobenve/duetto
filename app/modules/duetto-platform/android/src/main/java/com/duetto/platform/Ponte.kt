package com.duetto.platform

import android.content.Context
import android.util.Log
import java.io.File

/**
 * TEMPORANEO. Il ponte fra i nomi italiani e quelli inglesi.
 *
 * Il progetto passa all'inglese per essere pubblicato, e con il codice
 * cambiano anche i nomi con cui le cose stanno scritte nella memoria del
 * telefono: le preferenze, e i file del diario. Chi ha gia' l'app non
 * deve accorgersene di niente.
 *
 * Si esegue una volta sola, al primo avvio dopo l'aggiornamento: copia i
 * valori vecchi sotto i nomi nuovi, rinomina i file, e lascia un segno
 * per non rifarlo mai piu'. I nomi vecchi non vengono cancellati - non
 * costano niente e, se qualcosa andasse storto, sono ancora li'.
 *
 * DA TOGLIERE alla prossima versione: a quel punto tutti i telefoni
 * saranno passati di qui.
 */
object Ponte {

    private const val FATTO = "migrato-in-inglese-2"

    /** Il secondo passo: non i nomi, ma i VALORI scritti dentro. */
    private const val VALORI = "valori-in-inglese"

    /**
     * Vero mentre stiamo attraversando: il diario chiama di qui, e
     * scrivendo chiamerebbe di nuovo il diario.
     */
    private var inCorso = false

    fun migra(ctx: Context) {
        if (inCorso) return
        val nuove = ctx.getSharedPreferences(BootReceiver.PREFS, Context.MODE_PRIVATE)
        if (!nuove.getBoolean(VALORI, false)) {
            valoriInInglese(ctx)
            nuove.edit().putBoolean(VALORI, true).apply()
        }
        if (nuove.getBoolean(FATTO, false)) return
        inCorso = true
        try {
            preferenze(ctx, nuove)
            fileDelDiario(ctx)
        } catch (e: Exception) {
            Log.w("Duetto", "ponte: ${e.message}")
        }
        nuove.edit().putBoolean(FATTO, true).apply()
        inCorso = false
    }

    /**
     * Le parole scritte DENTRO le preferenze, non i loro nomi.
     *
     * Come deve farsi sentire l'avviso era scritto in italiano -
     * "predefinito", "sempre", "nessuno" - e passando all'inglese quelle
     * parole non le riconoscerebbe piu' nessuno: chi aveva scelto "mai"
     * si ritroverebbe la vibrazione, che e' il contrario di quello che
     * aveva chiesto.
     */
    private fun valoriInInglese(ctx: Context) {
        val p = ctx.getSharedPreferences("duetto_alerts", Context.MODE_PRIVATE)
        val tradotto = mapOf(
            "predefinito" to "default", "sempre" to "always", "mai" to "never",
            "nessuno" to "none", "scelto" to "chosen",
        )
        val e = p.edit()
        for (chiave in listOf("vibration", "sound")) {
            val valore = p.getString(chiave, null) ?: continue
            tradotto[valore]?.let { e.putString(chiave, it) }
        }
        e.apply()
    }

    private fun preferenze(ctx: Context, nuove: android.content.SharedPreferences) {
        val vecchie = ctx.getSharedPreferences(BootReceiver.OLD_PREFS, Context.MODE_PRIVATE)
        val e = nuove.edit()
        val avvio = vecchie.getLong(BootReceiver.OLD_LAST_AUTO_START, 0L)
        if (avvio > 0L) e.putLong(BootReceiver.LAST_AUTO_START, avvio)
        vecchie.getString("titolo-notifica", null)?.let { e.putString(Notifier.CHIAVE_TITOLO, it) }
        val morte = vecchie.getLong("ultima_morte_registrata", 0L)
        if (morte > 0L) e.putLong(Diario.ULTIMA_MORTE, morte)
        e.apply()

        val avvisiVecchi = ctx.getSharedPreferences("duetto_avvisi", Context.MODE_PRIVATE)
        if (avvisiVecchi.contains("vibra") || avvisiVecchi.contains("suono")) {
            val tradotto = mapOf(
                "predefinito" to "default", "sempre" to "always", "mai" to "never",
                "nessuno" to "none", "scelto" to "chosen",
            )
            val come = { chiave: String ->
                val v = avvisiVecchi.getString(chiave, "predefinito") ?: "predefinito"
                tradotto[v] ?: v
            }
            Avvisi.salva(ctx, come("vibra"), come("suono"), avvisiVecchi.getString("uri", "") ?: "")
        }
    }

    /**
     * I file del diario cambiano nome, non contenuto.
     *
     * Rinominare invece di ricominciare: quelle righe sono l'unico
     * racconto che abbiamo di cosa succede sui telefoni lontani, e
     * buttarle vorrebbe dire perdere il confronto con i giorni prima.
     */
    private fun fileDelDiario(ctx: Context) {
        val base = ctx.getExternalFilesDir(null) ?: ctx.filesDir
        val vecchia = File(base, "diario")
        if (!vecchia.isDirectory) return
        val nuova = File(base, Diario.CARTELLA)
        if (!nuova.exists() && vecchia.renameTo(nuova)) {
            rinomina(nuova)
            return
        }

        // La cartella nuova c'e' gia' - l'app scrive righe appena parte,
        // e puo' averla creata prima di arrivare qui: si spostano i file
        // uno per uno.
        if (!nuova.isDirectory && !nuova.mkdirs()) return
        vecchia.listFiles()?.forEach { f -> porta(f, File(nuova, nomeNuovo(f.name))) }
        // Svuotata, la cartella vecchia se ne va: `delete` su una
        // cartella riesce solo se e' vuota, quindi se per qualche motivo
        // fosse rimasto dentro qualcosa, resta li' a disposizione.
        vecchia.delete()
    }

    /**
     * Porta un file di la', unendo se di la' c'e' gia' qualcosa.
     *
     * Saltare quando la destinazione esiste sembra prudente ed e' il
     * modo di perdere tutto: il file nuovo, appena nato, contiene tre
     * righe, e il vecchio mesi. La storia va davanti, le righe nuove in
     * coda, e l'ordine cronologico resta giusto.
     */
    private fun porta(da: File, a: File) {
        if (!da.isFile) return
        try {
            if (!a.exists()) {
                if (da.renameTo(a)) return
            }
            val coda = if (a.exists()) a.readText() else ""
            a.writeText(da.readText() + coda)
            da.delete()
        } catch (e: Exception) {
            Log.w("Duetto", "ponte, ${da.name}: ${e.message}")
        }
    }

    private fun rinomina(cartella: File) {
        cartella.listFiles()?.forEach { f ->
            val nuovo = nomeNuovo(f.name)
            if (nuovo != f.name) f.renameTo(File(cartella, nuovo))
        }
    }

    private fun nomeNuovo(nome: String) = when {
        nome == "mio.log" -> Diario.MIO
        nome == "mio.log.1" -> "${Diario.MIO}.1"
        nome == "altro.log" -> Diario.ALTRO
        nome.startsWith("altro-") -> "other-" + nome.removePrefix("altro-")
        else -> nome
    }
}
