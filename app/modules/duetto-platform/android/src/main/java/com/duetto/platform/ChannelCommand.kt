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

import android.content.Context
import android.content.Intent
import java.security.SecureRandom

/**
 * The channel's commands, duetto://channel/..., said by Duetto alone.
 *
 * The scheme is open to every app and every page, and has to be: the
 * links people are given travel on it. So the standing notification's
 * "Enter", which is such a link, could be said by anybody - an app, a
 * page after a touch - and Duetto went into the channel, the microphone
 * as it had been left. The button's intent now carries a word only
 * Duetto knows, kept in its own preferences, and a channel command
 * without it loses its link before React Native reads it: the app
 * opens, as from its icon, and that is all.
 *
 * Kept, not drawn at every start: a notice written by a process that
 * has since died is still touched, and must still work.
 *
 * renew-video stays open: the cure tried by hand from a computer (adb),
 * heeded only in the channel and with the diagnostics on. The prefixes
 * are the interface's own (App.tsx, onLink): whatever it takes for a
 * channel command is vetted here.
 */
object ChannelCommand {
    const val EXTRA = "duetto.channel"
    private const val PREFS = "duetto_channel"
    private const val WORD = "word"

    @Volatile private var cached: String? = null

    /** The word, drawn once and kept. */
    fun word(ctx: Context): String = cached ?: synchronized(this) {
        cached ?: run {
            val prefs = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val kept: String = prefs.getString(WORD, null) ?: ByteArray(16)
                .also { SecureRandom().nextBytes(it) }
                .joinToString("") { "%02x".format(it) }
                .also { prefs.edit().putString(WORD, it).commit() }
            cached = kept
            kept
        }
    }

    /** A channel command that Duetto did not say loses its link here. */
    fun vet(ctx: Context, intent: Intent?) {
        if (intent == null) return
        val url = intent.dataString ?: return
        if (!url.startsWith("duetto://channel")) return
        if (url.startsWith("duetto://channel/renew-video")) return
        // Extras that cannot even be read are nobody's word.
        val said = try { intent.getStringExtra(EXTRA) } catch (e: Exception) { null }
        if (said != null && said == word(ctx)) return
        intent.data = null
        Journal.sample(ctx, "command:refused")
    }
}
