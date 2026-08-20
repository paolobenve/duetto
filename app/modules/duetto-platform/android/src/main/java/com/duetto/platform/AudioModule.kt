package com.duetto.platform

import android.app.Activity
import android.app.Application
import android.media.AudioManager
import android.os.Bundle
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

/**
 * Manda i tasti del volume sul flusso della conversazione.
 *
 * PERCHE' SERVE
 * Il suono di una chiamata non esce dal volume "multimedia" ma da quello
 * "chiamata", che è un'altra manopola. I tasti laterali però regolano
 * quello che il sistema crede sia il flusso attivo, e per un'app comune
 * quello è il multimedia: si preme, la barretta scende, e la voce
 * dell'altro resta esattamente com'era.
 *
 * Su parecchi telefoni Android indovina da solo, vedendo che siamo in
 * MODE_IN_COMMUNICATION; su altri no - e lì i tasti non hanno alcun
 * effetto, col volume bloccato dove capita, spesso al massimo. Discord e
 * WhatsApp non hanno il problema perché si registrano come chiamate vere
 * nel sistema (ConnectionService), che è tutt'altro impianto.
 *
 * La riga che risolve è una sola, e va detta esplicitamente. In
 * react-native-incall-manager c'è, ma commentata con un TODO
 * (InCallManagerModule.java, "setVolumeControlStream"), quindi tocca a
 * noi.
 *
 * La rimettiamo a ogni onActivityResumed finché siamo nel canale: è una
 * proprietà dell'activity, e un'activity ricreata ripartirebbe dal
 * comportamento normale senza che nessuno se ne accorga.
 */
class AudioModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoAudio"

    /** Se in questo momento vogliamo i tasti sul volume della chiamata. */
    private var wanted = false
    private var registered = false

    private val callbacks = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityResumed(activity: Activity) {
            if (wanted) apply(activity, true)
        }

        override fun onActivityCreated(activity: Activity, saved: Bundle?) {}
        override fun onActivityStarted(activity: Activity) {}
        override fun onActivityPaused(activity: Activity) {}
        override fun onActivityStopped(activity: Activity) {}
        override fun onActivitySaveInstanceState(activity: Activity, out: Bundle) {}
        override fun onActivityDestroyed(activity: Activity) {}
    }

    private fun apply(activity: Activity, active: Boolean) {
        UiThreadUtil.runOnUiThread {
            try {
                activity.volumeControlStream =
                    if (active) AudioManager.STREAM_VOICE_CALL
                    else AudioManager.USE_DEFAULT_STREAM_TYPE
                // Il diario lo registra: su un telefono lontano e' l'unico
                // modo di sapere se questa riga e' stata eseguita davvero.
                Diario.tastiVoce(active)
            } catch (_: Exception) {
                // Peggio che possa andare: i tasti restano sul multimedia,
                // che è la situazione di partenza.
            }
        }
    }

    /**
     * `true` entrando nel canale, `false` uscendone.
     *
     * Va rimesso a `false`: lasciato acceso, fuori dalla conversazione i
     * tasti regolerebbero un volume che non si sta usando, e sembrerebbero
     * rotti nel modo opposto.
     */
    @ReactMethod
    fun useCallVolumeKeys(active: Boolean, promise: Promise) {
        wanted = active

        if (active && !registered) {
            (ctx.applicationContext as? Application)?.let {
                it.registerActivityLifecycleCallbacks(callbacks)
                registered = true
            }
        }

        val activity = currentActivity
        if (activity == null) {
            // Nessuna activity ora (app in secondo piano): ci penserà
            // onActivityResumed. Non è un fallimento.
            promise.resolve(false)
            return
        }
        apply(activity, active)
        promise.resolve(true)
    }
}
