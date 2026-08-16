package com.duetto.platform

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Il ponte verso il diario dei consumi.
 *
 * Le righe le scrive il servizio, che e' vivo anche quando JS non lo e';
 * da qui si dice soltanto in che stato siamo, si legge quello che c'e' da
 * mandare all'altro telefono, e si mette da parte quello che l'altro
 * manda a noi.
 */
class DiarioModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoDiario"

    /** "ascolto", "canale", "canale+video": finisce in ogni riga. */
    @ReactMethod
    fun stato(stato: String, promise: Promise) {
        Diario.stato(stato)
        promise.resolve(true)
    }

    /** Una riga adesso, per segnare un momento che conta. */
    @ReactMethod
    fun segna(motivo: String, promise: Promise) {
        Diario.campiona(ctx, motivo)
        promise.resolve(true)
    }

    /** Quante righe ha il diario: si mandano solo quelle nuove. */
    @ReactMethod
    fun righe(promise: Promise) {
        promise.resolve(Diario.righeMie(ctx))
    }

    /** Le righe dalla `daRiga` in poi, come un unico testo. */
    @ReactMethod
    fun leggi(daRiga: Int, promise: Promise) {
        promise.resolve(Diario.leggiMio(ctx, daRiga))
    }

    /** Aggiunge in coda il diario arrivato dall'altro telefono. */
    @ReactMethod
    fun aggiungiAltro(testo: String, promise: Promise) {
        Diario.aggiungiAltro(ctx, testo)
        promise.resolve(true)
    }

    /** Dove stanno i file, da dire a chi li andra' a leggere. */
    @ReactMethod
    fun percorso(promise: Promise) {
        promise.resolve(Diario.fileMio(ctx)?.parentFile?.absolutePath ?: "")
    }
}
