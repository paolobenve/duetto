package com.duetto.platform

import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.os.Build
import android.util.Rational
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Picture-in-Picture di sistema: la finestrella che resta sopra le altre
 * app. Ci si entra col tasto Indietro, invece di uscire dal canale.
 *
 * Richiede android:supportsPictureInPicture="true" sulla MainActivity e
 * che fra i configChanges ci siano screenSize/smallestScreenSize/
 * screenLayout/orientation: ci pensa scripts/patch-android-manifest.js.
 */
class PipModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoPip"

    companion object {
        // Limiti imposti da Android: fuori da questi la richiesta fallisce.
        private const val MIN_RATIO = 0.4184f
        private const val MAX_RATIO = 2.39f
    }

    /**
     * Manda l'app in secondo piano, come farebbe il tasto Home.
     *
     * Serve per "Esci": l'app deve sparire dallo schermo, ma il processo
     * deve restare vivo. Chiuderla davvero (finish) distruggerebbe il
     * contesto JavaScript e con esso la connessione che ci tiene
     * raggiungibili, quindi non arriverebbero più le notifiche.
     */
    @ReactMethod
    fun minimize(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }
        try {
            promise.resolve(activity.moveTaskToBack(true))
        } catch (e: Exception) {
            promise.reject("minimize_error", e)
        }
    }

    @ReactMethod
    fun isSupported(promise: Promise) {
        val ok = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
        promise.resolve(ok)
    }

    /**
     * Entra in PiP con le proporzioni indicate (larghezza/altezza).
     * Risolve false se il sistema non lo consente: chi chiama decide
     * allora se lasciar fare al tasto Indietro il suo mestiere normale.
     */
    @ReactMethod
    fun enter(aspect: Double, promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            promise.resolve(false)
            return
        }
        val activity = currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }
        try {
            val ratio = aspect.toFloat().coerceIn(MIN_RATIO, MAX_RATIO)
            // Rational vuole interi: moltiplichiamo per avere precisione.
            val params = PictureInPictureParams.Builder()
                .setAspectRatio(Rational((ratio * 1000).toInt(), 1000))
                .build()
            promise.resolve(activity.enterPictureInPictureMode(params))
        } catch (e: Exception) {
            promise.reject("pip_error", e)
        }
    }
}
