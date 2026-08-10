package com.duotalk.platform

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Notifiche di avviso ("Anna e' nel canale").
 *
 * Sono cosa diversa dalla notifica fissa del foreground service: quella
 * e' silenziosa e serve solo a tenere vivo il processo, questa deve farsi
 * notare. Per questo stanno su due canali separati, cosi' puoi anche
 * regolarle indipendentemente dalle impostazioni di Android.
 */
object Notifier {

    private const val ALERT_CHANNEL_ID = "duotalk_alerts"
    private const val ALERT_NOTIFICATION_ID = 4712

    private fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = ctx.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(ALERT_CHANNEL_ID) != null) return

        val channel = NotificationChannel(
            ALERT_CHANNEL_ID,
            "Avvisi dal canale",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Quando l'altra persona entra nel canale o ti chiama"
            enableVibration(true)
            setShowBadge(true)
        }
        manager.createNotificationChannel(channel)
    }

    fun show(ctx: Context, title: String, text: String) {
        ensureChannel(ctx)

        val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pending = PendingIntent.getActivity(
            ctx,
            1,
            launch,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        val notification = NotificationCompat.Builder(ctx, ALERT_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        try {
            // Se il permesso notifiche e' negato lancia SecurityException:
            // e' un avviso mancato, non un buon motivo per far cadere l'app.
            NotificationManagerCompat.from(ctx).notify(ALERT_NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
        }
    }

    fun cancel(ctx: Context) {
        try {
            NotificationManagerCompat.from(ctx).cancel(ALERT_NOTIFICATION_ID)
        } catch (_: Exception) {
        }
    }
}
