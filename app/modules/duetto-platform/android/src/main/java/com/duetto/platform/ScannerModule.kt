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
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Reading a QR code, from JavaScript: one call, one answer.
 *
 * The screen that looks is ScanActivity; this opens it and waits for
 * what it read. The camera permission is the same one the video uses,
 * asked for at start-up: refused, the answer is a refusal too, and the
 * code can still be typed.
 */
class ScannerModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx), ActivityEventListener {

    private var waiting: Promise? = null

    init {
        ctx.addActivityEventListener(this)
    }

    override fun getName() = "DuettoScanner"

    @ReactMethod
    fun scan(hint: String, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("no-activity", "no screen to open the camera from")
            return
        }
        if (ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            promise.reject("no-camera-permission", "the camera permission was not granted")
            return
        }
        waiting?.resolve("")
        waiting = promise
        val intent = Intent(ctx, ScanActivity::class.java).putExtra("hint", hint)
        activity.startActivityForResult(intent, REQUEST)
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST) return
        val text = if (resultCode == Activity.RESULT_OK) data?.getStringExtra("text") ?: "" else ""
        waiting?.resolve(text)
        waiting = null
    }

    override fun onNewIntent(intent: Intent) { /* nothing to do */ }

    companion object {
        const val REQUEST = 0xD0E7
    }
}
