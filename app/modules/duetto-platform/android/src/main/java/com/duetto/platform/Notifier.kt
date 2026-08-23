package com.duetto.platform

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Notifiche di avviso ("Anna è nel canale").
 *
 * Sono cosa diversa dalla notifica fissa del foreground service: quella
 * è silenziosa e serve solo a tenere vivo il processo, questa deve farsi
 * notare. Per questo stanno su due canali separati, così puoi anche
 * regolarle indipendentemente dalle impostazioni di Android.
 */
object Notifier {

    private const val TAG = "Duetto"
    private const val ALERT_NOTIFICATION_ID = 4712
    private const val PRESENCE_CHANNEL_ID = "duetto_presence"
    private const val PRESENCE_NOTIFICATION_ID = 4711
    private const val NOTA_NOTIFICATION_ID = 4713

    /**
     * Una notifica che non fa rumore.
     *
     * Serve per le cose da sapere, non per quelle a cui rispondere:
     * "l'app dell'altro e' morta e ora e' tornata" e' una notizia, e
     * usare per quella il canale degli avvisi - che suona e vibra come
     * ha chiesto l'utente - vorrebbe dire far scattare in piedi qualcuno
     * per un'informazione. Va sul canale della presenza, che e' muto per
     * costruzione, e sta in un posto suo per non scacciare l'avviso vero
     * se arrivano insieme.
     */
    fun mostraNota(ctx: Context, title: String, text: String) {
        val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pending = PendingIntent.getActivity(
            ctx,
            2,
            launch,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(ctx, PRESENCE_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setSmallIcon(R.drawable.ic_notifica)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify(NOTA_NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
        }
    }

    fun show(ctx: Context, title: String, text: String) {
        // Il canale dipende dalle preferenze: vedi Avvisi. Da lì viene
        // il suono nel caso normale; vibrazione e suono in conversazione
        // li fa Avvisi.avvisaOra qui sotto, perché il canale non può.
        val canale = Avvisi.canale(ctx)

        val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pending = PendingIntent.getActivity(
            ctx,
            1,
            launch,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        val builder = NotificationCompat.Builder(ctx, canale)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_notifica)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH)

        // Prima di Android 8 i canali non esistono e queste due cose si
        // dicono qui. Da Android 8 in su vengono ignorate: comanda il
        // canale, e ripeterle non fa danno.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setSound(Avvisi.suonoScelto(ctx))
            Avvisi.ritmoScelto(ctx)?.let { builder.setVibrate(it) }
        }

        val notification = builder.build()

        try {
            // Se il permesso notifiche è negato lancia SecurityException:
            // è un avviso mancato, non un buon motivo per far cadere l'app.
            NotificationManagerCompat.from(ctx).notify(ALERT_NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
        }

        // Vibrazione e suono che la notifica da sola non può garantire:
        // vedi Avvisi.avvisaOra. Va dopo, non prima: se la notifica non
        // si può mostrare, un avviso che suona e basta è comunque meglio
        // di niente, ma l'ordine naturale resta quello.
        Avvisi.avvisaOra(ctx)
    }

    /**
     * Porta un servizio in primo piano con la notifica di presenza.
     *
     * Riusa il canale silenzioso del servizio principale: è la stessa
     * informazione ("sei raggiungibile"), e due notifiche fisse diverse
     * sarebbero solo confusione.
     */
    fun startForegroundPresence(service: android.app.Service) {
        val launch = service.packageManager
            .getLaunchIntentForPackage(service.packageName)?.apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
        val pending = PendingIntent.getActivity(
            service, 2, launch,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = service.getSystemService(NotificationManager::class.java)
            if (manager?.getNotificationChannel(PRESENCE_CHANNEL_ID) == null) {
                manager?.createNotificationChannel(
                    NotificationChannel(
                        PRESENCE_CHANNEL_ID,
                        "Presenza nel canale",
                        NotificationManager.IMPORTANCE_LOW,
                    ).apply {
                        description = "Mostra che sei raggiungibile"
                        setShowBadge(false)
                        enableVibration(false)
                    },
                )
            }
        }

        val notification = NotificationCompat.Builder(service, PRESENCE_CHANNEL_ID)
            .setContentTitle("Duetto")
            .setContentText("In attesa")
            .setSmallIcon(R.drawable.ic_notifica)
            .setContentIntent(pending)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        /**
         * Il tipo dice ad Android a cosa serve questo servizio, e da
         * Android 14 alcuni tipi si possono chiedere solo stando in primo
         * piano. Qui non si e' quasi mai: la presenza riparte dopo un
         * riavvio, o quando l'interfaccia e' appena stata smantellata.
         *
         * "specialUse" e' quello onesto - restare raggiungibili - e
         * l'unico senza permessi da chiedere ne' tetti di durata.
         */
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                service.startForeground(
                    PRESENCE_NOTIFICATION_ID,
                    notification,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
                )
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                service.startForeground(
                    PRESENCE_NOTIFICATION_ID,
                    notification,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
                )
            } else {
                service.startForeground(PRESENCE_NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            // Se il sistema rifiuta, la presenza non parte: e' un guaio.
            // Ma un'app che va in errore e' peggio, e a chi la usa non
            // resta nemmeno il modo di sapere cos'e' successo. Lo scrive
            // nel diario e si ferma.
            Log.w(TAG, "presenza rifiutata dal sistema: ${e.message}")
            Diario.campiona(service.applicationContext, "presenza-rifiutata")
            try { service.stopSelf() } catch (_: Exception) { /* noop */ }
        }
    }

    fun cancel(ctx: Context) {
        try {
            NotificationManagerCompat.from(ctx).cancel(ALERT_NOTIFICATION_ID)
        } catch (_: Exception) {
        }
    }
}
