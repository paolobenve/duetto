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

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Where Android hands over the notifications, once the access is
 * granted: see OtherSounds, which decides.
 *
 * The keys already there tell a new notification from an update - a
 * WhatsApp summary is the same one, updated, at every message.
 */
class OtherSoundsListener : NotificationListenerService() {

    private val known = HashSet<String>()

    override fun onListenerConnected() {
        known.clear()
        try { activeNotifications?.forEach { known.add(it.key) } } catch (_: Exception) { /* noop */ }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?, rankingMap: RankingMap?) {
        sbn ?: return
        val wasThere = !known.add(sbn.key)
        try {
            val r = Ranking()
            val ranking = if (rankingMap?.getRanking(sbn.key, r) == true) r else null
            OtherSounds.posted(applicationContext, sbn, ranking, wasThere)
        } catch (_: Exception) { /* a notification is never worth a crash */ }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        sbn?.let { known.remove(it.key) }
    }
}
