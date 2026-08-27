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
import android.util.Log
import java.io.File

/**
 * TEMPORARY. The bridge between the Italian names and the English ones.
 *
 * The project moves to English to be published, and along with the code
 * the names things are stored under on the phone change too: the
 * preferences, and the journal's files. Whoever already has the app must
 * notice nothing.
 *
 * It runs once only, at the first start after the update: it copies the
 * old values under the new names, renames the files, and leaves a mark so
 * as never to do it again. The old names are not deleted - they cost
 * nothing and, if something went wrong, they are still there.
 *
 * TO BE TAKEN AWAY in the next version: by then every phone will have
 * come through here.
 */
object Bridge {

    /**
     * The marks stay word for word as they were written.
     *
     * They are already on the phones that came through here with 1.1.124.
     * Translating them would mean a mark nobody recognises, the crossing
     * done a second time, and the old preferences written back on top of
     * the ones chosen since.
     */
    private const val DONE = "migrato-in-inglese-2"

    /** The second step: not the names, but the VALUES written inside. */
    private const val VALUES = "valori-in-inglese"

    /**
     * True while we are crossing: the journal calls in here, and by
     * writing it would call the journal again.
     */
    private var crossing = false

    fun migrate(ctx: Context) {
        if (crossing) return
        val fresh = ctx.getSharedPreferences(BootReceiver.PREFS, Context.MODE_PRIVATE)
        if (!fresh.getBoolean(VALUES, false)) {
            valuesIntoEnglish(ctx)
            fresh.edit().putBoolean(VALUES, true).apply()
        }
        if (fresh.getBoolean(DONE, false)) return
        crossing = true
        try {
            preferences(ctx, fresh)
            journalFiles(ctx)
        } catch (e: Exception) {
            Log.w("Duetto", "bridge: ${e.message}")
        }
        fresh.edit().putBoolean(DONE, true).apply()
        crossing = false
    }

    /**
     * The words written INSIDE the preferences, not their names.
     *
     * How the alert had to make itself heard was written in Italian -
     * "predefinito", "sempre", "nessuno" - and moving to English nobody
     * would recognise those words any more: whoever had chosen "mai"
     * would find themselves with the vibration on, which is the opposite
     * of what they asked for.
     */
    private fun valuesIntoEnglish(ctx: Context) {
        val p = ctx.getSharedPreferences("duetto_alerts", Context.MODE_PRIVATE)
        val translated = mapOf(
            "predefinito" to "default", "sempre" to "always", "mai" to "never",
            "nessuno" to "none", "scelto" to "chosen",
        )
        val e = p.edit()
        for (key in listOf("vibration", "sound")) {
            val value = p.getString(key, null) ?: continue
            translated[value]?.let { e.putString(key, it) }
        }
        e.apply()
    }

    private fun preferences(ctx: Context, fresh: android.content.SharedPreferences) {
        val old = ctx.getSharedPreferences(BootReceiver.OLD_PREFS, Context.MODE_PRIVATE)
        val e = fresh.edit()
        val autoStart = old.getLong(BootReceiver.OLD_LAST_AUTO_START, 0L)
        if (autoStart > 0L) e.putLong(BootReceiver.LAST_AUTO_START, autoStart)
        old.getString("titolo-notifica", null)?.let { e.putString(Notifier.KEY_TITLE, it) }
        val death = old.getLong("ultima_morte_registrata", 0L)
        if (death > 0L) e.putLong(Journal.LAST_DEATH, death)
        e.apply()

        val oldAlerts = ctx.getSharedPreferences("duetto_avvisi", Context.MODE_PRIVATE)
        if (oldAlerts.contains("vibra") || oldAlerts.contains("suono")) {
            val translated = mapOf(
                "predefinito" to "default", "sempre" to "always", "mai" to "never",
                "nessuno" to "none", "scelto" to "chosen",
            )
            val how = { key: String ->
                val v = oldAlerts.getString(key, "predefinito") ?: "predefinito"
                translated[v] ?: v
            }
            Alerts.save(ctx, how("vibra"), how("suono"), oldAlerts.getString("uri", "") ?: "")
        }
    }

    /**
     * The journal's files change name, not content.
     *
     * Renaming instead of starting over: those lines are the only account
     * we have of what happens on the phones far away, and throwing them
     * out would mean losing the comparison with the days before.
     */
    private fun journalFiles(ctx: Context) {
        val base = ctx.getExternalFilesDir(null) ?: ctx.filesDir
        val old = File(base, "diario")
        if (!old.isDirectory) return
        val fresh = File(base, Journal.FOLDER)
        if (!fresh.exists() && old.renameTo(fresh)) {
            renameInside(fresh)
            return
        }

        // The new folder is already there - the app writes lines as soon
        // as it starts, and may have created it before getting here: the
        // files are moved one by one.
        if (!fresh.isDirectory && !fresh.mkdirs()) return
        old.listFiles()?.forEach { f -> carry(f, File(fresh, newName(f.name))) }
        // Emptied, the old folder goes: `delete` on a folder succeeds only
        // if it is empty, so if for some reason something were left inside
        // it stays there, available.
        old.delete()
    }

    /**
     * Carries a file over, joining if something is over there already.
     *
     * Skipping when the destination exists looks prudent and is the way
     * to lose everything: the new file, just born, holds three lines, and
     * the old one months. The history goes first, the new lines at the
     * end, and the order in time stays right.
     */
    private fun carry(from: File, to: File) {
        if (!from.isFile) return
        try {
            if (!to.exists()) {
                if (from.renameTo(to)) return
            }
            val tail = if (to.exists()) to.readText() else ""
            to.writeText(from.readText() + tail)
            from.delete()
        } catch (e: Exception) {
            Log.w("Duetto", "bridge, ${from.name}: ${e.message}")
        }
    }

    private fun renameInside(folder: File) {
        folder.listFiles()?.forEach { f ->
            val fresh = newName(f.name)
            if (fresh != f.name) f.renameTo(File(folder, fresh))
        }
    }

    private fun newName(name: String) = when {
        name == "mio.log" -> Journal.MINE
        name == "mio.log.1" -> "${Journal.MINE}.1"
        name == "altro.log" -> Journal.OTHER
        name.startsWith("altro-") -> "other-" + name.removePrefix("altro-")
        else -> name
    }
}
