package com.duetto.platform

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** The bridge to the sounds for calling the other back. See Alarm. */
class AlarmModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoAlarm"

    /**
     * `echo`: it is being played by whoever sent it, and then it comes
     * out quietly. `maxMs`: when to cut it; 0 to let it finish.
     */
    @ReactMethod
    fun play(name: String, echo: Boolean, maxMs: Double, promise: Promise) {
        Alarm.play(ctx, name, echo, maxMs.toInt())
        promise.resolve(true)
    }

    @ReactMethod
    fun stop(promise: Promise) {
        Alarm.stop()
        promise.resolve(true)
    }

    /** Which sounds really exist: the list is kept by whoever owns them. */
    @ReactMethod
    fun list(promise: Promise) {
        val a = Arguments.createArray()
        Alarm.names.forEach { a.pushString(it) }
        promise.resolve(a)
    }
}
