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

import android.content.Intent
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** The other apps' sounds in the channel, from JavaScript: see OtherSounds. */
class OtherSoundsModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoOtherSounds"

    /** The level, a share of the cues' stream top; 0 = off. */
    @ReactMethod
    fun setShare(share: Double, promise: Promise) {
        OtherSounds.setShare(ctx, share.toFloat())
        promise.resolve(true)
    }

    /** Whether this build has the listener: see OtherSounds.declared. */
    @ReactMethod
    fun declared(promise: Promise) {
        promise.resolve(OtherSounds.declared(ctx))
    }

    /** Whether the notification access is granted. */
    @ReactMethod
    fun allowed(promise: Promise) {
        promise.resolve(OtherSounds.allowed(ctx))
    }

    /**
     * Android's screen for the access: Duetto's own page where there is
     * one (11 on), the list of apps otherwise.
     */
    @ReactMethod
    fun openAccess(promise: Promise) {
        try {
            val i = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(
                    Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                    OtherSounds.component(ctx).flattenToString(),
                )
            } else {
                Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                ctx.startActivity(i)
            } catch (_: Exception) {
                // Some phones have no page of their own: the list, then.
                ctx.startActivity(
                    Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            }
            promise.resolve(true)
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }
}
