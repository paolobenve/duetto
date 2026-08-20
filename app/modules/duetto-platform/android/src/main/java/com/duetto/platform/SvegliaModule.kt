package com.duetto.platform

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Il ponte verso i suoni per richiamare l'altro. Vedi Sveglia. */
class SvegliaModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoSveglia"

    @ReactMethod
    fun suona(nome: String, promise: Promise) {
        Sveglia.suona(ctx, nome)
        promise.resolve(true)
    }

    @ReactMethod
    fun ferma(promise: Promise) {
        Sveglia.ferma()
        promise.resolve(true)
    }

    /** Quali suoni esistono davvero: l'elenco lo tiene chi li possiede. */
    @ReactMethod
    fun elenco(promise: Promise) {
        val a = Arguments.createArray()
        Sveglia.nomi.forEach { a.pushString(it) }
        promise.resolve(a)
    }
}
