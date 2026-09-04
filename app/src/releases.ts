/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import type { Language } from './i18n';

/**
 * What is new, as the app tells it: one entry per VERSION, a few short
 * sentences each, in every language the app speaks.
 *
 * This is not the changelog. CHANGELOG.md, at the root of the
 * repository, records every build and says why each thing was done;
 * it is for whoever wants to understand the app. What is shown here is
 * for whoever USES it: only what one notices, nothing of what is
 * underneath, and never a build number - a build is a step of the
 * work, a version is a thing handed over. Each entry tells what changed
 * between the version before and the one it names, and nothing else.
 * Written by hand at each new version, in the five languages side by
 * side, so that the compiler complains the moment one of them is
 * missing.
 */
export type Release = {
  version: string;
  notes: Record<Language, string[]>;
};

export const RELEASES: Release[] = [
  {
    version: '0.9.4',
    notes: {
      en: [
        'The first time, the app asks for the server and for nothing else: a server nobody has taken becomes yours, and the door shuts behind you.',
        'Whoever is called by you needs only your code; whoever is to open connections of their own is invited from the pairing screen.',
        'A bluetooth earpiece is seen again: the app asks for the permission it needs to see one, which it had been forgetting.',
        'The settings are in two tabs: server and pairs, and use.',
      ],
      it: [
        'La prima volta l’app chiede il server e nient’altro: un server che nessuno ha preso diventa tuo, e la porta si chiude dietro di te.',
        'A chi chiami basta il tuo codice; chi deve aprire collegamenti propri lo inviti dalla schermata di accoppiamento.',
        'Un auricolare bluetooth si vede di nuovo: l’app chiede il permesso che le serve per vederlo, che si dimenticava.',
        'Le impostazioni sono in due schede: server e coppie, e uso.',
      ],
      es: [
        'La primera vez la app pide el servidor y nada más: un servidor que nadie ha tomado pasa a ser tuyo, y la puerta se cierra detrás de ti.',
        'A quien llamas le basta tu código; a quien deba abrir conexiones propias lo invitas desde la pantalla de emparejamiento.',
        'Un auricular bluetooth se vuelve a ver: la app pide el permiso que necesita para verlo, y que olvidaba.',
        'Los ajustes están en dos pestañas: servidor y parejas, y uso.',
      ],
      pt: [
        'Na primeira vez o app pede o servidor e mais nada: um servidor que ninguém tomou passa a ser seu, e a porta se fecha atrás de você.',
        'Para quem você chama basta o seu código; quem precisa abrir ligações próprias você convida da tela de pareamento.',
        'Um fone bluetooth volta a ser visto: o app pede a permissão de que precisa para vê-lo, que estava esquecendo.',
        'Os ajustes estão em duas abas: servidor e pares, e uso.',
      ],
      fr: [
        'La première fois, l’app demande le serveur et rien d’autre : un serveur que personne n’a pris devient le tien, et la porte se ferme derrière toi.',
        'À qui tu appelles, ton code suffit ; qui doit ouvrir ses propres liaisons, tu l’invites depuis l’écran d’appairage.',
        'Une oreillette bluetooth est de nouveau vue : l’app demande la permission qu’il lui faut pour la voir, et qu’elle oubliait.',
        'Les réglages sont en deux onglets : serveur et paires, et usage.',
      ],
    },
  },
  {
    version: '0.9.3',
    notes: {
      en: [
        'Coming home, the direct link resumes by itself, phone in a pocket included.',
        'If the phone closes the app, it comes back to listening on its own.',
        'The words about reconnecting appear only when the conversation has really stopped.',
        'The volume keys outside Duetto no longer touch the volume chosen inside Duetto.',
      ],
      it: [
        'Tornando a casa, il collegamento diretto riprende da solo, anche col telefono in tasca.',
        'Se il telefono chiude l’app, torna in ascolto da sé.',
        'Le scritte sulla riconnessione compaiono solo se la conversazione si è davvero fermata.',
        'I tasti del volume fuori da Duetto non toccano più il volume scelto dentro Duetto.',
      ],
      es: [
        'Al volver a casa, la conexión directa se reanuda sola, incluso con el teléfono en el bolsillo.',
        'Si el teléfono cierra la app, vuelve a la escucha por sí misma.',
        'Los avisos de reconexión aparecen solo cuando la conversación se ha detenido de verdad.',
        'Las teclas de volumen fuera de Duetto ya no tocan el volumen elegido dentro de Duetto.',
      ],
      pt: [
        'Ao voltar para casa, a ligação direta retoma sozinha, mesmo com o telefone no bolso.',
        'Se o telefone fecha o app, ele volta à escuta por conta própria.',
        'Os avisos de reconexão aparecem só quando a conversa parou de verdade.',
        'As teclas de volume fora do Duetto não mexem mais no volume escolhido dentro do Duetto.',
      ],
      fr: [
        'En rentrant à la maison, la liaison directe reprend toute seule, même le téléphone dans la poche.',
        'Si le téléphone ferme l’app, elle se remet à l’écoute d’elle-même.',
        'Les mots sur la reconnexion n’apparaissent que si la conversation s’est vraiment arrêtée.',
        'Les touches de volume hors de Duetto ne touchent plus au volume choisi dans Duetto.',
      ],
    },
  },
  {
    version: '0.9.2',
    notes: {
      en: ['Duetto also speaks Spanish, Portuguese and French.'],
      it: ['Duetto parla anche spagnolo, portoghese e francese.'],
      es: ['Duetto también habla español, portugués y francés.'],
      pt: ['O Duetto também fala espanhol, português e francês.'],
      fr: ['Duetto parle aussi espagnol, portugais et français.'],
    },
  },
  {
    version: '0.9.1',
    notes: {
      en: [
        'The conversation holds on mobile networks that used to cut it every minute, and no longer stumbles over every twitch of the home wifi.',
        'The microphone comes back as you left it.',
      ],
      it: [
        'La conversazione regge sulle reti mobili che prima la tagliavano ogni minuto, e non inciampa più a ogni starnuto del wifi di casa.',
        'Il microfono torna come lo hai lasciato.',
      ],
      es: [
        'La conversación aguanta en las redes móviles que antes la cortaban cada minuto, y ya no tropieza con cada estornudo del wifi de casa.',
        'El micrófono vuelve como lo dejaste.',
      ],
      pt: [
        'A conversa aguenta nas redes móveis que antes a cortavam a cada minuto, e não tropeça mais a cada espirro do wifi de casa.',
        'O microfone volta como você o deixou.',
      ],
      fr: [
        'La conversation tient sur les réseaux mobiles qui la coupaient toutes les minutes, et ne trébuche plus à chaque éternuement du wifi de la maison.',
        'Le micro revient comme tu l’as laissé.',
      ],
    },
  },
  {
    version: '0.9.0',
    notes: {
      en: [
        'Waiting costs far less battery.',
        'Leaving the house, the conversation moves onto mobile data by itself; a call that dies in a pocket is repaired in a pocket.',
        'No outside services: only your own server.',
      ],
      it: [
        'Aspettare costa molta meno batteria.',
        'Uscendo di casa la conversazione passa sui dati da sola; una chiamata che muore in tasca si ripara in tasca.',
        'Nessun servizio esterno: solo il tuo server.',
      ],
      es: [
        'Esperar cuesta mucha menos batería.',
        'Al salir de casa la conversación pasa a los datos móviles por sí sola; una llamada que muere en el bolsillo se repara en el bolsillo.',
        'Ningún servicio externo: solo tu servidor.',
      ],
      pt: [
        'Esperar custa muito menos bateria.',
        'Ao sair de casa a conversa passa para os dados móveis sozinha; uma chamada que morre no bolso é reparada no bolso.',
        'Nenhum serviço externo: só o seu servidor.',
      ],
      fr: [
        'Attendre coûte beaucoup moins de batterie.',
        'En sortant de chez soi la conversation passe toute seule sur les données mobiles ; un appel qui meurt dans la poche se répare dans la poche.',
        'Aucun service extérieur : seulement ton serveur.',
      ],
    },
  },
];
