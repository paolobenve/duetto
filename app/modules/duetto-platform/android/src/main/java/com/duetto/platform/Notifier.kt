package com.duetto.platform

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
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

    private const val ALERT_NOTIFICATION_ID = 4712
    private const val PRESENCE_CHANNEL_ID = "duetto_presence"
    private const val PRESENCE_NOTIFICATION_ID = 4711

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
            .setSmallIcon(android.R.drawable.ic_dialog_info)
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
            .setContentText("In ascolto")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(pending)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            service.startForeground(
                PRESENCE_NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
            )
        } else {
            service.startForeground(PRESENCE_NOTIFICATION_ID, notification)
        }
    }

    fun cancel(ctx: Context) {
        try {
            NotificationManagerCompat.from(ctx).cancel(ALERT_NOTIFICATION_ID)
        } catch (_: Exception) {
        }
    }
}
