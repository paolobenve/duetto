package com.duetto.platform

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.TrafficStats
import android.os.BatteryManager
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

    /** Oltre questa taglia il file viene ruotato: uno indietro e basta. */
    private const val TAGLIA_MAX = 512L * 1024L

    private val formato = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.ITALY)

    /** Lo stato che JS ci comunica: ascolto, canale, video. */
    @Volatile private var stato: String = "avvio"

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
