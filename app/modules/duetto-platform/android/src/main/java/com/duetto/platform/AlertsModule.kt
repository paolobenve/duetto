/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
package com.duetto.platform

import android.app.Activity
import android.content.Intent
import android.media.RingtoneManager
import android.net.Uri
import androidx.core.content.IntentCompat
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * The alert's preferences: vibration and sound.
 *
 * The real work is done by Alerts; here there is the bridge to JS and the
 * picking of the sound, which needs a system screen to be opened and its
 * result waited for - something that cannot be done from JS.
 */
class AlertsModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoAlerts"

    /** Who is waiting for the chosen sound. One at a time: it is modal. */
    private var waiting: Promise? = null

    private val listener: ActivityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(
            activity: Activity?,
            requestCode: Int,
            resultCode: Int,
            data: Intent?,
        ) {
            if (requestCode != PICK_CODE) return
            val promise = waiting ?: return
            waiting = null

            if (resultCode != Activity.RESULT_OK || data == null) {
                // They cancelled: it is not an error, simply nothing
                // changes. The caller tells null from a chosen sound.
                promise.resolve(null)
                return
            }
            // Through IntentCompat: the direct version is deprecated from
            // Android 13, and with it the types are not checked.
            val uri: Uri? = IntentCompat.getParcelableExtra(
                data, RingtoneManager.EXTRA_RINGTONE_PICKED_URI, Uri::class.java,
            )
            if (uri == null) {
                promise.resolve(null)
                return
            }
            val answer = Arguments.createMap()
            answer.putString("uri", uri.toString())
            answer.putString("name", nameOf(uri))
            promise.resolve(answer)
        }
    }

    init {
        ctx.addActivityEventListener(listener)
    }

    /** The name to show, asked of the system: we would not know it. */
    private fun nameOf(uri: Uri): String = try {
        RingtoneManager.getRingtone(ctx, uri)?.getTitle(ctx) ?: Strings.chosenSound
    } catch (_: Exception) {
        Strings.chosenSound
    }

    /**
     * Records the preferences and gets the notification channel ready.
     *
     * To be called at start-up and at every change: it is the creation of
     * the channel that fixes sound and vibration, and a channel already
     * born cannot be changed any more.
     */
    @ReactMethod
    fun configure(vibration: String, sound: String, uri: String, promise: Promise) {
        try {
            Alerts.save(ctx, vibration, sound, uri)
            // Here yes: this is the moment the preferences really change,
            // and the channels that no longer match have to go.
            promise.resolve(Alerts.channel(ctx, tidyUp = true))
        } catch (e: Exception) {
            promise.reject("alerts_error", e)
        }
    }

    /**
     * Opens the system's sound picker.
     *
     * Resolves `{uri, name}`, or null if it is cancelled.
     */
    @ReactMethod
    fun pickSound(currentUri: String, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.resolve(null)
            return
        }
        // If one was left hanging - a screen closed in some odd way - it
        // gets closed first, otherwise it would wait for ever.
        waiting?.resolve(null)
        waiting = promise

        val intent = Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
            putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_NOTIFICATION)
            putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, Strings.alertSoundTitle)
            // "Default" and "None" are already two entries in our own
            // settings: putting them in here as well would be the same
            // choice in two places, with two possible different answers.
            putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, false)
            putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
            putExtra(
                RingtoneManager.EXTRA_RINGTONE_EXISTING_URI,
                currentUri.takeIf { it.isNotEmpty() }?.let { Uri.parse(it) },
            )
        }
        try {
            activity.startActivityForResult(intent, PICK_CODE)
        } catch (e: Exception) {
            waiting = null
            promise.reject("cannot_pick", e)
        }
    }

    companion object {
        private const val PICK_CODE = 4713
    }
}
