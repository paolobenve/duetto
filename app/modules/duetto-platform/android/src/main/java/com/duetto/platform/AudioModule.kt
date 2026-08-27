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
 * Points the volume keys at the stream the conversation comes out of.
 *
 * WHY IT IS NEEDED
 * A call's sound does not come out of the "media" volume but out of the
 * "call" one, which is a different knob. The side keys, though, adjust
 * whatever the system believes the active stream is, and for an ordinary
 * app that is media: you press, the little bar goes down, and the other
 * voice stays exactly where it was.
 *
 * On many phones Android guesses right on its own, seeing that we are in
 * MODE_IN_COMMUNICATION; on others it does not - and there the keys have
 * no effect at all, with the volume stuck wherever it happened to be,
 * often at the top. Discord and WhatsApp do not have the problem because
 * they register as real calls with the system (ConnectionService), which
 * is a whole other machinery.
 *
 * The line that fixes it is a single one, and it has to be said out loud.
 * react-native-incall-manager has it, but commented out with a TODO
 * (InCallManagerModule.java, "setVolumeControlStream"), so it is up to
 * us.
 *
 * We set it again on every onActivityResumed while we are in the channel:
 * it is a property of the activity, and a recreated activity would go
 * back to the ordinary behaviour without anybody noticing.
 */
class AudioModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoAudio"

    /** Whether we want the keys on the call volume right now. */
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
                // The journal records it: on a phone far away this is the
                // only way to know whether this line really ran.
                Diario.tastiVoce(active)
            } catch (_: Exception) {
                // The worst that can happen: the keys stay on media,
                // which is where they started.
            }
        }
    }

    /**
     * `true` when entering the channel, `false` when leaving it.
     *
     * It has to be put back to `false`: left on, outside the conversation
     * the keys would adjust a volume nobody is using, and they would look
     * broken the other way round.
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
            // No activity right now (app in the background): onActivityResumed
            // will see to it. This is not a failure.
            promise.resolve(false)
            return
        }
        apply(activity, active)
        promise.resolve(true)
    }
}
