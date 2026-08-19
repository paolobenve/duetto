package com.duetto.platform

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.TrafficStats
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Il diario dei consumi: una riga ogni tanto, per capire dopo.
 *
 * PERCHE' NON MISURA LE ALTRE APP
 * Un'app non puo' sapere quanta batteria consumano le altre: quel conto
 * lo tiene Android e lo mostra solo nella sua schermata "Batteria", o via
 * `adb shell dumpsys batterystats`. Qui si registra quello che si puo'
 * sapere davvero:
 *
 *  - quanto scende la batteria del telefono (di tutti, non solo nostra);
 *  - in che stato stava Duetto in quel momento;
 *  - quanto ha consumato Duetto di suo: tempo di CPU e byte scambiati.
 *
 * Messe in fila, queste tre cose rispondono alla domanda che conta: se il
 * telefono cala piu' in fretta mentre Duetto e' nel canale, e di quanto.
 * Lo schermo acceso e' segnato perche' consuma piu' di tutto il resto:
 * senza quella colonna i numeri direbbero il falso.
 *
 * Il file sta in una cartella che si legge da adb senza permessi
 * particolari:
 *   /sdcard/Android/data/com.duetto/files/diario/mio.log
 */
object Diario {

    private const val TAG = "Duetto"
    private const val CARTELLA = "diario"
    private const val MIO = "mio.log"
    private const val ALTRO = "altro.log"

    /** L'ultima morte gia' scritta nel diario: le altre sono vecchie. */
    private const val ULTIMA_MORTE = "ultima_morte_registrata"

    /** Oltre questa taglia il file viene ruotato: uno indietro e basta. */
    private const val TAGLIA_MAX = 512L * 1024L

    private val formato = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.ITALY)

    /** Lo stato che JS ci comunica: ascolto, canale, video. */
    @Volatile private var stato: String = "avvio"

    /**
     * Quanto dello scorso intervallo è passato a schermo acceso.
     *
     * E' la cosa più importante da sapere per interpretare il resto: lo
     * schermo consuma più di tutto, e cinque minuti con lo schermo acceso
     * costano da soli molto più di quanto Duetto possa costare in un'ora.
     * Senza questo numero si finirebbe per attribuire all'app il consumo
     * di chi stava guardando il telefono.
     *
     * Non basta guardare com'è lo schermo nell'istante del campione: in
     * cinque minuti può essersi acceso e spento. Qui si accumula.
     */
    private var msSchermoAcceso = 0L
    private var schermoAccesoDa = 0L

    /** Contatori dell'ultima riga, per scrivere le differenze. */
    private var ultimoCpuMs = 0L
    private var ultimiRx = 0L
    private var ultimiTx = 0L
    private var ultimaCarica = 0
    private var ultimoIstante = 0L

    fun stato(nuovo: String) {
        stato = nuovo
    }

    /**
     * Chi tiene il tempo fra una riga e l'altra.
     *
     * Le righe non arrivano solo dall'attesa periodica: un cambio di
     * stato o il cavo della carica ne fanno scrivere una subito. Se
     * l'attesa proseguisse per conto suo, la riga dopo potrebbe cadere
     * pochi secondi più tardi, e una finestra di pochi secondi sul
     * contatore della batteria non misura niente: dice solo rumore.
     *
     * Perciò ogni riga scritta - da qualunque parte venga - fa ripartire
     * l'attesa da capo. Chi la tiene è il servizio, l'unico che vive
     * abbastanza a lungo da poterlo fare.
     */
    @Volatile private var riprogramma: (() -> Unit)? = null

    fun quandoScrive(f: (() -> Unit)?) {
        riprogramma = f
    }

    /** Da chiamare quando lo schermo si accende o si spegne. */
    @Synchronized
    fun schermoCambiato(acceso: Boolean) {
        val ora = System.currentTimeMillis()
        if (acceso) {
            if (schermoAccesoDa == 0L) schermoAccesoDa = ora
        } else if (schermoAccesoDa != 0L) {
            msSchermoAcceso += ora - schermoAccesoDa
            schermoAccesoDa = 0L
        }
    }

    private fun cartella(ctx: Context): File? {
        val base = ctx.getExternalFilesDir(null) ?: ctx.filesDir
        val dir = File(base, CARTELLA)
        return if (dir.exists() || dir.mkdirs()) dir else null
    }

    fun fileMio(ctx: Context): File? = cartella(ctx)?.let { File(it, MIO) }
    fun fileAltro(ctx: Context): File? = cartella(ctx)?.let { File(it, ALTRO) }

    /** Percentuale, carica residua in microampere-ora, corrente istantanea. */
    private fun batteria(ctx: Context): Triple<Int, Int, Int> {
        val bm = ctx.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        val perc = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        val carica = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER) ?: -1
        // Il segno non e' uniforme fra i produttori: si guarda il valore
        // assoluto e si dice a parte se e' sotto carica.
        val corrente = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW) ?: 0
        return Triple(perc, carica, corrente)
    }

    private fun sottoCarica(ctx: Context): Boolean {
        val stato = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            ?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        return stato == BatteryManager.BATTERY_STATUS_CHARGING ||
            stato == BatteryManager.BATTERY_STATUS_FULL
    }

    private fun rete(ctx: Context): String {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return "?"
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return "niente"
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "mobile"
            else -> "altro"
        }
    }

    private fun schermoAcceso(ctx: Context): Boolean {
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
        return pm.isInteractive
    }

    /**
     * Il telefono era in letargo, o in risparmio energetico.
     *
     * Sono i due stati in cui Android taglia il lavoro in background di
     * tutti: un intervallo passato in letargo non e' confrontabile con
     * uno passato sveglio, e senza saperlo si finirebbe per attribuire
     * all'app una differenza che e' del sistema.
     */
    private fun letargo(ctx: Context): String {
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return "?"
        val idle = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) pm.isDeviceIdleMode else false
        val risparmio = pm.isPowerSaveMode
        return when {
            idle && risparmio -> "letargo+risparmio"
            idle -> "letargo"
            risparmio -> "risparmio"
            else -> "no"
        }
    }

    /**
     * Chiude il conto dello schermo e lo restituisce in secondi.
     *
     * Va chiamata mentre si scrive la riga: quello che si e' accumulato
     * appartiene all'intervallo che finisce adesso, e il prossimo riparte
     * da zero.
     */
    private fun secondiSchermo(ctx: Context): Long {
        val ora = System.currentTimeMillis()
        // Se lo schermo e' acceso ora, il pezzo in corso conta per questo
        // intervallo e il prossimo riparte da adesso.
        if (schermoAcceso(ctx)) {
            if (schermoAccesoDa == 0L) schermoAccesoDa = ora
            msSchermoAcceso += ora - schermoAccesoDa
            schermoAccesoDa = ora
        }
        val secondi = msSchermoAcceso / 1000
        msSchermoAcceso = 0
        return secondi
    }

    /**
     * Scrive una riga.
     *
     * I contatori nostri (CPU, byte) sono totali da quando il processo e'
     * partito: quello che interessa e' quanto sono cresciuti dall'ultima
     * riga, quindi si scrivono le differenze. Alla prima riga, o dopo un
     * riavvio del processo, non c'e' differenza da mostrare e si segna un
     * trattino invece di un numero inventato.
     */
    @Synchronized
    fun campiona(ctx: Context, motivo: String = "periodico") {
        try {
            val file = fileMio(ctx) ?: return
            ruotaSeGrosso(file)

            val ora = System.currentTimeMillis()
            val (perc, carica, corrente) = batteria(ctx)
            val cpuMs = Process.getElapsedCpuTime()
            val uid = Process.myUid()
            val rx = TrafficStats.getUidRxBytes(uid).coerceAtLeast(0)
            val tx = TrafficStats.getUidTxBytes(uid).coerceAtLeast(0)

            val minuti = if (ultimoIstante == 0L) -1.0
                else (ora - ultimoIstante) / 60000.0
            val dCarica = if (ultimaCarica == 0 || carica <= 0) Int.MIN_VALUE
                else carica - ultimaCarica
            val dCpu = if (ultimoCpuMs == 0L || cpuMs < ultimoCpuMs) -1L else cpuMs - ultimoCpuMs
            val dRx = if (ultimiRx == 0L || rx < ultimiRx) -1L else rx - ultimiRx
            val dTx = if (ultimiTx == 0L || tx < ultimiTx) -1L else tx - ultimiTx

            val riga = buildString {
                append(formato.format(Date(ora)))
                append(" motivo=").append(motivo)
                append(" stato=").append(stato)
                append(" batt=").append(perc).append('%')
                append(" carica=").append(carica).append("uAh")
                if (dCarica != Int.MIN_VALUE) append(" dcarica=").append(dCarica).append("uAh")
                append(" corrente=").append(corrente / 1000).append("mA")
                append(" incarica=").append(if (sottoCarica(ctx)) "si" else "no")
                append(" schermo=").append(if (schermoAcceso(ctx)) "on" else "off")
                // Quanto dell'intervallo appena chiuso e' stato a schermo
                // acceso: e' la chiave per capire se il consumo e' nostro
                // o di chi stava usando il telefono.
                append(" schermoOn=").append(secondiSchermo(ctx)).append('s')
                append(" sistema=").append(letargo(ctx))
                append(" rete=").append(rete(ctx))
                if (minuti >= 0) append(" min=").append(String.format(Locale.US, "%.1f", minuti))
                if (dCpu >= 0) append(" cpu=+").append(dCpu / 1000).append('s')
                if (dRx >= 0) append(" rx=+").append(dRx / 1024).append("kB")
                if (dTx >= 0) append(" tx=+").append(dTx / 1024).append("kB")
                append('\n')
            }
            file.appendText(riga)

            ultimoIstante = ora
            ultimaCarica = carica
            ultimoCpuMs = cpuMs
            ultimiRx = rx
            ultimiTx = tx

            // La prossima riga periodica riparte da adesso, non da quando
            // era stata programmata.
            riprogramma?.invoke()
        } catch (e: Exception) {
            Log.w(TAG, "diario: non sono riuscito a scrivere: ${e.message}")
        }
    }

    /**
     * Perche' il processo e' morto, l'ultima volta.
     *
     * E' la domanda a cui nessun registro sapeva rispondere: l'app "non
     * c'e' piu'" e non si sa se l'ha chiusa il padrone del telefono, se
     * e' finita la memoria, se e' andata in errore o se e' stato il
     * gestore della batteria del produttore. Android la risposta ce
     * l'ha - `getHistoricalProcessExitReasons`, da Android 11 - e non la
     * dice a nessuno finche' non gliela si chiede.
     *
     * Si chiede all'avvio, quando le morti da raccontare sono quelle di
     * prima, e finisce nel diario: che vuol dire che finisce anche
     * sull'ALTRO telefono, che il diario se lo scambia. Un'app che
     * sparisce dal telefono di un'altra persona, senza un cavo e senza
     * poterle chiedere niente, altrimenti resta un mistero.
     *
     * `descrizione` e' il campo piu' prezioso: e' li' che i produttori
     * scrivono cose come "stop com.duetto due to ...", ed e' l'unico
     * modo di distinguere una morte per memoria da una decisione del
     * gestore della batteria, che ad Android risulta "altro".
     */
    fun registraUscite(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        try {
            val am = ctx.getSystemService(ActivityManager::class.java) ?: return
            val uscite = am.getHistoricalProcessExitReasons(ctx.packageName, 0, 10)
            if (uscite.isEmpty()) return

            val prefs = ctx.getSharedPreferences(BootReceiver.PREFS, Context.MODE_PRIVATE)
            val gia = prefs.getLong(ULTIMA_MORTE, 0L)
            // Dalla piu' vecchia alla piu' recente, cosi' nel diario
            // restano in ordine di tempo come tutto il resto.
            val nuove = uscite.filter { it.timestamp > gia }.sortedBy { it.timestamp }
            if (nuove.isEmpty()) return

            val file = fileMio(ctx) ?: return
            ruotaSeGrosso(file)
            for (u in nuove) {
                val riga = buildString {
                    append(formato.format(Date(u.timestamp)))
                    append(" motivo=morte")
                    append(" causa=").append(causa(u.reason))
                    append(" era=").append(importanza(u.importance))
                    if (u.status != 0) append(" stato=").append(u.status)
                    if (u.pss > 0) append(" pss=").append(u.pss).append("kB")
                    if (u.rss > 0) append(" rss=").append(u.rss).append("kB")
                    u.description?.let { append(" descrizione=\"").append(it).append('"') }
                    append('\n')
                }
                file.appendText(riga)
            }
            prefs.edit().putLong(ULTIMA_MORTE, nuove.last().timestamp).apply()
        } catch (e: Exception) {
            Log.w(TAG, "diario: non sono riuscito a leggere le uscite: ${e.message}")
        }
    }

    /**
     * L'ultima morte del processo, per raccontarla all'altro telefono.
     *
     * Il diario la scrive per chi lo leggera' un giorno; questa serve
     * subito, per dirlo a chi stava aspettando dall'altra parte e ha
     * visto sparire una persona senza sapere perche'.
     */
    fun ultimaMorte(ctx: Context): ApplicationExitInfo? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
        return try {
            ctx.getSystemService(ActivityManager::class.java)
                ?.getHistoricalProcessExitReasons(ctx.packageName, 0, 1)
                ?.firstOrNull()
        } catch (e: Exception) {
            Log.w(TAG, "diario: non riesco a leggere l'ultima uscita: ${e.message}")
            null
        }
    }

    internal fun causa(reason: Int): String = when (reason) {
        ApplicationExitInfo.REASON_EXIT_SELF -> "uscita-nostra"
        ApplicationExitInfo.REASON_SIGNALED -> "segnale"
        ApplicationExitInfo.REASON_LOW_MEMORY -> "memoria-finita"
        ApplicationExitInfo.REASON_CRASH -> "errore"
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "errore-nativo"
        ApplicationExitInfo.REASON_ANR -> "bloccata"
        ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "avvio-fallito"
        ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "permessi-cambiati"
        ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "troppe-risorse"
        ApplicationExitInfo.REASON_USER_REQUESTED -> "chiusa-dall-utente"
        ApplicationExitInfo.REASON_USER_STOPPED -> "arresto-forzato"
        ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "dipendenza-morta"
        ApplicationExitInfo.REASON_OTHER -> "altro"
        else -> "sconosciuta($reason)"
    }

    /**
     * Quanto contava il processo agli occhi di Android quando e' morto.
     *
     * Distingue il caso che qui interessa da tutti gli altri: un
     * processo ucciso mentre teneva un servizio in primo piano e' un
     * telefono che ha voluto liberarsene comunque; uno ucciso da
     * "cached" e' semplicemente un'app che non serviva piu' a nessuno,
     * e vuol dire che il servizio non c'era gia' piu'.
     */
    internal fun importanza(v: Int): String = when {
        v <= 100 -> "primo-piano"
        v <= 125 -> "servizio-in-primo-piano"
        v <= 200 -> "visibile"
        v <= 230 -> "percepibile"
        v <= 300 -> "servizio"
        v <= 350 -> "in-cache-pesante"
        else -> "in-cache"
    }

    /**
     * Tiene il file entro una taglia ragionevole.
     *
     * Una riga ogni cinque minuti fa circa 40 kB al mese: la rotazione
     * non scattera' quasi mai, ma un file che cresce senza limite su un
     * telefono e' il genere di cosa che si scopre quando e' tardi.
     */
    private fun ruotaSeGrosso(file: File) {
        if (!file.exists() || file.length() < TAGLIA_MAX) return
        val vecchio = File(file.parentFile, file.name + ".1")
        if (vecchio.exists()) vecchio.delete()
        file.renameTo(vecchio)
    }

    /** Il diario nostro, dalla riga che comincia con `da` in poi. */
    fun leggiMio(ctx: Context, daRiga: Int): String {
        val file = fileMio(ctx) ?: return ""
        if (!file.exists()) return ""
        val righe = file.readLines()
        if (daRiga >= righe.size) return ""
        return righe.subList(daRiga.coerceAtLeast(0), righe.size).joinToString("\n")
    }

    /** Quante righe ha il diario nostro: serve a mandare solo le nuove. */
    fun righeMie(ctx: Context): Int {
        val file = fileMio(ctx) ?: return 0
        return if (file.exists()) file.readLines().size else 0
    }

    /** Aggiunge in coda quello che ha mandato l'altro telefono. */
    @Synchronized
    fun aggiungiAltro(ctx: Context, testo: String) {
        try {
            val file = fileAltro(ctx) ?: return
            ruotaSeGrosso(file)
            file.appendText(if (testo.endsWith("\n")) testo else testo + "\n")
        } catch (e: Exception) {
            Log.w(TAG, "diario: non sono riuscito a scrivere quello dell'altro: ${e.message}")
        }
    }
}
