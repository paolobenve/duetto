package com.duetto.platform

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Ponte JS -> ChannelForegroundService. */
class ForegroundModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoForeground"

    private fun sendToService(
        promise: Promise,
        configure: Intent.() -> Unit,
    ) {
        try {
            val intent = Intent(ctx, ChannelForegroundService::class.java).apply(configure)
            ContextCompat.startForegroundService(ctx, intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("foreground_service_error", e)
        }
    }

    @ReactMethod
    fun start(text: String, withCamera: Boolean, promise: Promise) {
        sendToService(promise) {
            putExtra(ChannelForegroundService.EXTRA_TEXT, text)
            putExtra(ChannelForegroundService.EXTRA_CAMERA, withCamera)
        }
    }

    /**
     * Da chiamare quando accendi/spegni il video: su Android 14+ usare la
     * camera fuori dal primo piano richiede che il servizio dichiari anche
     * il tipo "camera".
     */
    @ReactMethod
    fun setCameraActive(active: Boolean, promise: Promise) {
        sendToService(promise) {
            putExtra(ChannelForegroundService.EXTRA_CAMERA, active)
        }
    }

    @ReactMethod
    fun setText(text: String, nome: String, promise: Promise) {
        sendToService(promise) {
            putExtra(ChannelForegroundService.EXTRA_TEXT, text)
            putExtra(ChannelForegroundService.EXTRA_NOME, nome)
        }
    }

    /** Toglie la notizia silenziosa quando non è più vera. */
    @ReactMethod
    fun togliNota(promise: Promise) {
        Notifier.togliNota(ctx)
        promise.resolve(true)
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            ctx.stopService(Intent(ctx, ChannelForegroundService::class.java))
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("foreground_service_error", e)
        }
    }

    /**
     * Passa la mano all'ascolto senza interfaccia.
     *
     * Si chiama quando l'interfaccia sta per sparire senza che nessuno
     * abbia chiesto di andarsene: da quel momento il motore JavaScript
     * dell'app non c'e' piu', e con lui se ne andrebbe la connessione.
     * PresenceService ne avvia uno senza finestra, che la riapre.
     *
     * Con un po' di ritardo: il contesto vecchio deve finire di
     * smontarsi, altrimenti il compito senza interfaccia nascerebbe
     * dentro a quello che sta morendo.
     */
    @ReactMethod
    fun riprendiPresenza(promise: Promise) {
        if (!PresenceService.canStart()) {
            promise.resolve(false)
            return
        }
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            try {
                ContextCompat.startForegroundService(
                    ctx,
                    Intent(ctx, PresenceService::class.java),
                )
            } catch (e: Exception) {
                android.util.Log.w("Duetto", "presenza non ripresa: ${e.message}")
            }
        }, 1500)
        promise.resolve(true)
    }

    // --- Impostazioni da cui dipende il restare raggiungibili ---------

    @ReactMethod
    fun isBatteryUnrestricted(promise: Promise) {
        promise.resolve(StartupHelper.isIgnoringBatteryOptimizations(ctx))
    }

    @ReactMethod
    fun requestBatteryUnrestricted(promise: Promise) {
        promise.resolve(StartupHelper.requestIgnoreBatteryOptimizations(ctx, currentActivity))
    }

    /**
     * Quando l'app è ripartita da sola per l'ultima volta, in
     * millisecondi; 0 se non è mai successo.
     *
     * È l'unico modo di sapere se l'avvio automatico è concesso:
     * l'autorizzazione in sé non è leggibile da nessuna app, ma il suo
     * effetto sì.
     */
    @ReactMethod
    fun lastAutoStart(promise: Promise) {
        val p = ctx.getSharedPreferences(BootReceiver.PREFS, android.content.Context.MODE_PRIVATE)
        promise.resolve(p.getLong(BootReceiver.ULTIMO_AVVIO, 0L).toDouble())
    }

    /** Da quanto è acceso il telefono: serve a datare l'ultimo riavvio. */
    @ReactMethod
    fun uptimeMs(promise: Promise) {
        promise.resolve(android.os.SystemClock.elapsedRealtime().toDouble())
    }

    @ReactMethod
    fun hasAutoStartScreen(promise: Promise) {
        promise.resolve(StartupHelper.hasAutoStartScreen(ctx))
    }

    @ReactMethod
    fun openAutoStartSettings(promise: Promise) {
        promise.resolve(StartupHelper.openAutoStartSettings(ctx, currentActivity))
    }

    @ReactMethod
    fun openAppSettings(promise: Promise) {
        promise.resolve(StartupHelper.openAppSettings(ctx, currentActivity))
    }

    /** Notizia da leggere con comodo: non suona e non vibra. */
    @ReactMethod
    fun nota(nome: String, text: String, promise: Promise) {
        try {
            Notifier.mostraNota(ctx, nome, text)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("notify_error", e)
        }
    }

    /** Avviso da mostrare quando l'app non è in primo piano. */
    @ReactMethod
    fun notify(nome: String, text: String, promise: Promise) {
        try {
            Notifier.show(ctx, nome, text)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("notify_error", e)
        }
    }

    /** Toglie l'avviso, quando l'utente è rientrato nell'app. */
    @ReactMethod
    fun clearNotification(promise: Promise) {
        Notifier.cancel(ctx)
        promise.resolve(true)
    }
}
