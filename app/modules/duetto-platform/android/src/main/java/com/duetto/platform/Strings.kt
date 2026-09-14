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
    /**
     * The words the app writes when it is not running.
     *
     * They cannot come from the app's own dictionary: the notification
     * is put up by the service, sometimes before there is any app at
     * all. Until now there were two of them, English and Italian, and
     * whoever had the phone in Spanish, Portuguese, French or German
     * read English.
     */
    private val lang: String
        get() = Locale.getDefault().language.lowercase()

    private fun pick(
        en: String, it: String, es: String, pt: String, fr: String, de: String,
    ) = when (lang) {
        "it" -> it
        "es" -> es
        "pt" -> pt
        "fr" -> fr
        "de" -> de
        else -> en
    }

    val presenceChannel
        get() = pick(
            "Presence in the channel", "Presenza nel canale", "Presencia en el canal",
            "Presença no canal", "Présence dans le canal", "Anwesenheit im Kanal",
        )

    val presenceChannelWhat
        get() = pick(
            "Shows that you are connected to the Duetto channel",
            "Mostra che sei collegato al canale Duetto",
            "Muestra que estás conectado al canal de Duetto",
            "Mostra que você está conectado ao canal do Duetto",
            "Montre que tu es connecté au canal Duetto",
            "Zeigt, dass du mit dem Kanal von Duetto verbunden bist",
        )

    val reachableWhat
        get() = pick(
            "Shows that you can be reached", "Mostra che sei raggiungibile",
            "Muestra que se te puede localizar", "Mostra que você está acessível",
            "Montre que tu es joignable", "Zeigt, dass du erreichbar bist",
        )

    val alertsChannel
        get() = pick(
            "Alerts from the channel", "Avvisi dal canale", "Avisos del canal",
            "Avisos do canal", "Alertes du canal", "Meldungen aus dem Kanal",
        )

    val alertsChannelWhat
        get() = pick(
            "When the other person comes into the channel or calls you",
            "Quando l'altra persona entra nel canale o ti chiama",
            "Cuando la otra persona entra en el canal o te llama",
            "Quando a outra pessoa entra no canal ou chama você",
            "Quand l'autre personne entre dans le canal ou t'appelle",
            "Wenn die andere Person in den Kanal kommt oder dich ruft",
        )

    val inChannel
        get() = pick(
            "You are in the channel", "Sei nel canale", "Estás en el canal",
            "Você está no canal", "Tu es dans le canal", "Du bist im Kanal",
        )

    val waiting
        get() = pick(
            "Waiting", "In attesa", "En espera", "Em espera", "En attente", "In Bereitschaft",
        )

    val enter
        get() = pick("Enter", "Entra", "Entrar", "Entrar", "Entrer", "Eintreten")

    val goWaiting
        get() = pick(
            "Go to waiting", "Vai in attesa", "Ir a la espera", "Ir para a espera",
            "Passer en attente", "In Bereitschaft gehen",
        )

    val alertSoundTitle
        get() = pick(
            "Alert sound", "Suono dell'avviso", "Sonido del aviso", "Som do aviso",
            "Son de l'alerte", "Ton der Meldung",
        )

    val chosenSound
        get() = pick(
            "Chosen sound", "Suono scelto", "Sonido elegido", "Som escolhido",
            "Son choisi", "Gewählter Ton",
        )
}
