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
import android.net.Uri
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * The journal, handed out.
 *
 * Two ways: Android's own share sheet, with the files of the last
 * days, for whoever wants to send them wherever they like; and the
 * files' text, for the app to carry to a work item on GitLab - by
 * itself with the person's token, or through the server.
 */
class ReportModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "DuettoReport"

    /** Which phone this is, for the head of a report. */
    @ReactMethod
    fun phone(promise: Promise) {
        promise.resolve(Journal.phoneName())
    }

    /** The journal's files of the last `days` days, newest first: name and text. */
    @ReactMethod
    fun journalFiles(days: Int, promise: Promise) {
        val arr = Arguments.createArray()
        try {
            for (f in Journal.recentFiles(ctx, days)) {
                val m = Arguments.createMap()
                m.putString("name", f.name)
                m.putString("path", f.absolutePath)
                m.putString("text", f.readText())
                arr.pushMap(m)
            }
        } catch (_: Exception) { /* what was read is what there is */ }
        promise.resolve(arr)
    }

    /** Android's share sheet with the journal's files of the last `days` days. */
    @ReactMethod
    fun shareJournal(days: Int, title: String, promise: Promise) {
        try {
            val files = Journal.recentFiles(ctx, days)
            if (files.isEmpty()) { promise.resolve(false); return }
            val authority = ctx.packageName + ".duetto.files"
            val uris = ArrayList<Uri>()
            for (f in files) uris.add(FileProvider.getUriForFile(ctx, authority, f))
            val intent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                type = "text/*"
                putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
                putExtra(Intent.EXTRA_SUBJECT, title)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent.createChooser(intent, title)
            val activity = ctx.currentActivity
            if (activity != null) {
                activity.startActivity(chooser)
            } else {
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(chooser)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("share", e.message ?: "cannot share")
        }
    }
}
