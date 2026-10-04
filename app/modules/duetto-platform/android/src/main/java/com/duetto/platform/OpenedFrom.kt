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

    fun read(intent: Intent?) {
        val id = intent?.getStringExtra(Notifier.EXTRA_PAIR)
        if (!id.isNullOrEmpty()) pair = id
    }
}
