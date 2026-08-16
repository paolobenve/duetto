package com.duetto.platform

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/**
 * Tiene vivo il processo mentre sei nel canale.
 *
 * Android sospende le app in background e a schermo spento: senza un
 * foreground service la connessione WebRTC cadrebbe dopo pochi secondi.
 * Da Android 14 il tipo "microphone" è anche l'unico modo consentito
 * per continuare a registrare audio fuori dal primo piano.
 *
 * La notifica fissa nella barra di stato non è un vezzo: è Android che
 * la impone come contropartita, e non è rimovibile.
 */
class ChannelForegroundService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private var currentText: String = "Sei nel canale"
    private var cameraActive: Boolean = false

    /**
     * Il diario dei consumi si scrive da qui.
     *
     * E' il servizio a essere vivo per tutto il tempo che interessa
     * misurare - anche a schermo spento e con l'app in secondo piano -
     * mentre il lato JavaScript puo' essere fermo. Con il wake lock che
     * teniamo, questa attesa scatta puntuale; se un domani il wake lock
     * andra' via, servira' una sveglia di sistema al suo posto.
     */
    private val orologio = Handler(Looper.getMainLooper())
    private var diarioAvviato = false
    private val scriviDiario = object : Runnable {
        override fun run() {
            Diario.campiona(applicationContext)
            orologio.postDelayed(this, INTERVALLO_DIARIO_MS)
        }
    }

    companion object {
        const val CHANNEL_ID = "duetto_presence"
        const val NOTIFICATION_ID = 4711
        const val EXTRA_TEXT = "text"
        const val EXTRA_CAMERA = "camera"

        // Rete di sicurezza: se qualcosa va storto e non fermiamo il
        // servizio, il wake lock non resta appeso per sempre.
        private const val WAKELOCK_TIMEOUT_MS = 8L * 60L * 60L * 1000L

        /**
         * Ogni quanto si scrive una riga di diario.
         *
         * Cinque minuti sono abbastanza fitti da vedere la differenza fra
         * un'ora in conversazione e una di attesa, e abbastanza radi da
         * non essere loro stessi un consumo: la riga costa una lettura di
         * contatori e una scrittura di un centinaio di byte.
         */
        private const val INTERVALLO_DIARIO_MS = 5L * 60L * 1000L
    }

    override fun onBind(intent: Intent?): IBinder? = null

    /**
     * Attaccare e staccare il cavo sono i confini più importanti del
     * diario: in carica la batteria sale, e qualunque conto sul consumo
     * fatto a cavallo di quel momento è privo di senso. Segnandoli con
     * una riga, chi legge può buttare via i periodi in carica interi
     * invece di trovarsi differenze positive in mezzo ai numeri.
     */
    private val cavo = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val motivo = when (intent?.action) {
                Intent.ACTION_POWER_CONNECTED -> "carica-attaccata"
                Intent.ACTION_POWER_DISCONNECTED -> "carica-staccata"
                else -> return
            }
            Diario.campiona(applicationContext, motivo)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        val filtro = IntentFilter().apply {
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
        }
        // Registrato a runtime e non nel manifest: da Android 8 questi
        // annunci non arrivano più ai ricevitori dichiarati nel manifest.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(cavo, filtro, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(cavo, filtro)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        intent?.getStringExtra(EXTRA_TEXT)?.let { currentText = it }
        if (intent?.hasExtra(EXTRA_CAMERA) == true) {
            cameraActive = intent.getBooleanExtra(EXTRA_CAMERA, false)
        }
        goForeground()
        acquireWakeLock()

        // onStartCommand arriva a ogni cambio di testo della notifica:
        // senza questa guardia si accumulerebbe un campionatore per ogni
        // chiamata, e il diario si riempirebbe di righe gemelle.
        if (!diarioAvviato) {
            diarioAvviato = true
            Diario.campiona(applicationContext, "avvio")
            orologio.postDelayed(scriviDiario, INTERVALLO_DIARIO_MS)
        }

        // Se Android ci uccide per memoria, ci fa ripartire.
        return START_STICKY
    }

    override fun onDestroy() {
        try { unregisterReceiver(cavo) } catch (_: Exception) { /* mai registrato */ }
        orologio.removeCallbacks(scriviDiario)
        diarioAvviato = false
        Diario.campiona(applicationContext, "uscita")
        releaseWakeLock()
        super.onDestroy()
    }

    /** Se l'utente scarta l'app dai recenti, esce dal canale. */
    override fun onTaskRemoved(rootIntent: Intent?) {
        stopSelf()
        super.onTaskRemoved(rootIntent)
    }

    // --- notifica -----------------------------------------------------------

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return

        val channel = NotificationChannel(
            CHANNEL_ID,
            "Presenza nel canale",
            // LOW: niente suono, la notifica è solo informativa
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Mostra che sei collegato al canale Duetto"
            setShowBadge(false)
            enableVibration(false)
        }
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pending = PendingIntent.getActivity(
            this,
            0,
            launch,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Duetto")
            .setContentText(currentText)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(pending)
            .setOngoing(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()
    }

    private fun goForeground() {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            if (cameraActive) {
                type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
            }
            startForeground(NOTIFICATION_ID, notification, type)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    // --- wake lock ----------------------------------------------------------

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val pm = getSystemService(POWER_SERVICE) as? PowerManager ?: return
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Duetto::presenza").apply {
            setReferenceCounted(false)
            acquire(WAKELOCK_TIMEOUT_MS)
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) wakeLock?.release()
        } catch (_: Exception) {
            // già rilasciato: nulla da fare
        }
        wakeLock = null
    }
}
