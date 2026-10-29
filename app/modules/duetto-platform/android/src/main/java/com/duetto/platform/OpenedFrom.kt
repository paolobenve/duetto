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

/**
 * Which connection the app was opened for, by the touch of a call's
 * notification: a call from a connection not in use opens the app on
 * that connection. Written by the activity from its intent, taken - and
 * forgotten - by the interface.
 */
object OpenedFrom {
    @Volatile var pair: String? = null
    /** and into its channel: the "Enter" of its line in the standing notification */
    @Volatile var enter: Boolean = false

    fun read(intent: Intent?) {
        if (intent == null) return
        // Any app's intent is read here too, and before Android 13 extras
        // that could not be unpacked threw: the whole app went down with
        // it, its presence included.
        try {
            val id = intent.getStringExtra(Notifier.EXTRA_PAIR)
            if (!id.isNullOrEmpty()) {
                pair = id
                enter = intent.getBooleanExtra(Notifier.EXTRA_ENTER, false)
            }
        } catch (e: Exception) {
            // nobody's word
        }
    }
}
