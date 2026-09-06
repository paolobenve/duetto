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

import java.util.Locale

/**
 * The few sentences the native side says on its own.
 *
 * Everything the user reads normally comes from src/i18n, on the
 * JavaScript side. These do not: they are the names of the notification
 * channels, which Android shows in its own settings, and the words of the
 * notifications that get written when JS is not there to write them - the
 * presence one, born after a reboot before the app has said anything.
 *
 * English is the reference and the fallback; Italian is there because the
 * phones this was born on are set to Italian, and losing one's own
 * language to publish the code would be a strange price to pay. Adding a
 * language means adding a line to each sentence, and nothing else.
 */
object Strings {

    private val italian: Boolean
        get() = Locale.getDefault().language.lowercase() == "it"

    private fun pick(en: String, it: String) = if (italian) it else en

    /** The channel of the standing notification: silent, informative. */
    val presenceChannel get() = pick("Presence in the channel", "Presenza nel canale")
    val presenceChannelWhat
        get() = pick(
            "Shows that you are connected to the Duetto channel",
            "Mostra che sei collegato al canale Duetto",
        )
    val reachableWhat get() = pick("Shows that you can be reached", "Mostra che sei raggiungibile")

    /** The channel of the alerts: this one has to be noticed. */
    val alertsChannel get() = pick("Alerts from the channel", "Avvisi dal canale")
    val alertsChannelWhat
        get() = pick(
            "When the other person comes into the channel or calls you",
            "Quando l'altra persona entra nel canale o ti chiama",
        )

    /** What the standing notification says until the app says otherwise. */
    val inChannel get() = pick("You are in the channel", "Sei nel canale")
    val waiting get() = pick("Waiting", "In attesa")
    /** the buttons on the standing notification */
    val enter get() = pick("Enter", "Entra")
    val goWaiting get() = pick("Go to waiting", "Vai in attesa")

    /** The system's sound picker, and the name for a sound with no title. */
    val alertSoundTitle get() = pick("Alert sound", "Suono dell'avviso")
    val chosenSound get() = pick("Chosen sound", "Suono scelto")
}
