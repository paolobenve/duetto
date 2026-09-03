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
 * work, a version is a thing handed over. Written by hand at each new
 * version, in the five languages side by side, so that the compiler
 * complains the moment one of them is missing.
 */
export type Release = {
  version: string;
  notes: Record<Language, string[]>;
};

export const RELEASES: Release[] = [
  {
    version: '0.9.2',
    notes: {
      en: [
        'Duetto also speaks Spanish, Portuguese and French. The language belongs to the connection: the same phone can speak one language with one person and another with somebody else.',
        'On mobile networks that cut the connection every few seconds, the conversation now holds without gaps.',
        'Coming home, the direct link over the wifi resumes by itself, phone in a pocket included.',
        'If the phone closes the app, it comes back to listening on its own, without anybody opening it.',
        'The notification always says how things stand, even after an interruption.',
        'The volume keys outside Duetto no longer touch the volume chosen inside Duetto.',
        'The words about reconnecting appear only when the conversation has really stopped.',
        'These notes are now a short summary for each version, in your language.',
      ],
      it: [
        'Duetto parla anche spagnolo, portoghese e francese. La lingua è del collegamento: lo stesso telefono può parlare una lingua con una persona e un’altra con qualcun altro.',
        'Sulle reti mobili che tagliano la connessione ogni pochi secondi, la conversazione ora regge senza buchi.',
        'Tornando a casa, il collegamento diretto sul wifi riprende da solo, anche col telefono in tasca.',
        'Se il telefono chiude l’app, questa torna in ascolto da sé, senza che nessuno la riapra.',
        'La notifica dice sempre come stanno le cose, anche dopo un’interruzione.',
        'I tasti del volume fuori da Duetto non toccano più il volume scelto dentro Duetto.',
        'Le scritte sulla riconnessione compaiono solo se la conversazione si è davvero fermata.',
        'Queste note sono ora un breve riassunto per ogni versione, nella tua lingua.',
      ],
      es: [
        'Duetto también habla español, portugués y francés. El idioma es de la conexión: el mismo teléfono puede hablar un idioma con una persona y otro con alguien más.',
        'En las redes móviles que cortan la conexión cada pocos segundos, la conversación ahora aguanta sin huecos.',
        'Al volver a casa, la conexión directa por wifi se reanuda sola, incluso con el teléfono en el bolsillo.',
        'Si el teléfono cierra la app, vuelve a la escucha por sí misma, sin que nadie la abra.',
        'La notificación siempre dice cómo están las cosas, incluso después de una interrupción.',
        'Las teclas de volumen fuera de Duetto ya no tocan el volumen elegido dentro de Duetto.',
        'Los avisos de reconexión aparecen solo cuando la conversación se ha detenido de verdad.',
        'Estas notas son ahora un breve resumen por versión, en tu idioma.',
      ],
      pt: [
        'O Duetto também fala espanhol, português e francês. O idioma é da ligação: o mesmo telefone pode falar um idioma com uma pessoa e outro com outra.',
        'Nas redes móveis que cortam a conexão a cada poucos segundos, a conversa agora aguenta sem buracos.',
        'Ao voltar para casa, a ligação direta pelo wifi retoma sozinha, mesmo com o telefone no bolso.',
        'Se o telefone fecha o app, ele volta à escuta por conta própria, sem que ninguém o abra.',
        'A notificação sempre diz como estão as coisas, mesmo depois de uma interrupção.',
        'As teclas de volume fora do Duetto não mexem mais no volume escolhido dentro do Duetto.',
        'Os avisos de reconexão aparecem só quando a conversa parou de verdade.',
        'Estas notas agora são um breve resumo por versão, no seu idioma.',
      ],
      fr: [
        'Duetto parle aussi espagnol, portugais et français. La langue est à la liaison : le même téléphone peut parler une langue avec une personne et une autre avec quelqu’un d’autre.',
        'Sur les réseaux mobiles qui coupent la connexion toutes les quelques secondes, la conversation tient maintenant sans trous.',
        'En rentrant à la maison, la liaison directe par le wifi reprend toute seule, même le téléphone dans la poche.',
        'Si le téléphone ferme l’app, elle se remet à l’écoute d’elle-même, sans que personne ne l’ouvre.',
        'La notification dit toujours où en sont les choses, même après une interruption.',
        'Les touches de volume hors de Duetto ne touchent plus au volume choisi dans Duetto.',
        'Les mots sur la reconnexion n’apparaissent que si la conversation s’est vraiment arrêtée.',
        'Ces notes sont désormais un court résumé par version, dans ta langue.',
      ],
    },
  },
  {
    version: '0.9.1',
    notes: {
      en: [
        'On some networks the link kept dropping every minute: now it holds.',
        'At home, the link is no longer rebuilt over every small twitch of the wifi.',
        'When the two pictures are very unequal, the stronger sender lowers itself a little so that both flow.',
        'The microphone comes back exactly as you left it, even after a whole evening.',
        'On phones where the speaker volume cannot be moved, the volume keys still work.',
      ],
      it: [
        'Su certe reti il collegamento cadeva ogni minuto: ora regge.',
        'A casa, il collegamento non viene più rifatto a ogni piccolo starnuto del wifi.',
        'Quando le due immagini sono molto diseguali, chi trasmette più forte si abbassa un po’, così scorrono entrambe.',
        'Il microfono torna esattamente come lo hai lasciato, anche dopo un’intera serata.',
        'Sui telefoni dove il volume del vivavoce non si muove, i tasti del volume funzionano lo stesso.',
      ],
      es: [
        'En algunas redes la conexión se caía cada minuto: ahora aguanta.',
        'En casa, la conexión ya no se rehace por cada pequeño estornudo del wifi.',
        'Cuando las dos imágenes son muy desiguales, quien transmite más fuerte baja un poco, para que fluyan las dos.',
        'El micrófono vuelve exactamente como lo dejaste, incluso después de una tarde entera.',
        'En los teléfonos donde el volumen del altavoz no se mueve, las teclas de volumen funcionan igual.',
      ],
      pt: [
        'Em algumas redes a ligação caía a cada minuto: agora aguenta.',
        'Em casa, a ligação não é mais refeita a cada pequeno espirro do wifi.',
        'Quando as duas imagens são muito desiguais, quem transmite mais forte baixa um pouco, para que as duas fluam.',
        'O microfone volta exatamente como você o deixou, mesmo depois de uma noite inteira.',
        'Nos telefones em que o volume do viva-voz não se mexe, as teclas de volume funcionam do mesmo jeito.',
      ],
      fr: [
        'Sur certains réseaux la liaison tombait toutes les minutes : maintenant elle tient.',
        'À la maison, la liaison n’est plus refaite à chaque petit éternuement du wifi.',
        'Quand les deux images sont très inégales, celui qui émet le plus fort baisse un peu, pour que les deux passent.',
        'Le micro revient exactement comme tu l’as laissé, même après toute une soirée.',
        'Sur les téléphones où le volume du haut-parleur ne bouge pas, les touches de volume marchent quand même.',
      ],
    },
  },
  {
    version: '0.9.0',
    notes: {
      en: [
        'Waiting costs far less battery: while waiting, the phone really sleeps.',
        'A call that dies in a pocket is repaired in a pocket, with the screen off.',
        'Leaving the house, the conversation jumps onto mobile data within seconds.',
        'Changing network, the link looks for the new roads by itself.',
        'The little Picture-in-Picture window shows only a face and one word, and a long press on the video chooses how much the buttons fade.',
        'If the battery restrictions come back, the app tells you.',
        'Everything the phones use is your own server: no more outside services.',
      ],
      it: [
        'Aspettare costa molta meno batteria: in attesa il telefono dorme davvero.',
        'Una chiamata che muore in tasca si ripara in tasca, a schermo spento.',
        'Uscendo di casa, la conversazione salta sui dati mobili in pochi secondi.',
        'Cambiando rete, il collegamento cerca le strade nuove da solo.',
        'La finestrella Picture-in-Picture mostra solo una faccia e una parola, e una pressione lunga sul video sceglie quanto sfumano i pulsanti.',
        'Se tornano le restrizioni della batteria, l’app te lo dice.',
        'Tutto ciò che i telefoni usano è il tuo server: nessun servizio esterno.',
      ],
      es: [
        'Esperar cuesta mucha menos batería: a la espera, el teléfono duerme de verdad.',
        'Una llamada que muere en el bolsillo se repara en el bolsillo, con la pantalla apagada.',
        'Al salir de casa, la conversación salta a los datos móviles en pocos segundos.',
        'Al cambiar de red, la conexión busca los caminos nuevos por sí sola.',
        'La ventanita Picture-in-Picture muestra solo una cara y una palabra, y una pulsación larga sobre el video elige cuánto se atenúan los botones.',
        'Si vuelven las restricciones de batería, la app te lo dice.',
        'Todo lo que usan los teléfonos es tu servidor: ningún servicio externo.',
      ],
      pt: [
        'Esperar custa muito menos bateria: à espera, o telefone dorme de verdade.',
        'Uma chamada que morre no bolso é reparada no bolso, com a tela apagada.',
        'Ao sair de casa, a conversa pula para os dados móveis em poucos segundos.',
        'Ao trocar de rede, a ligação procura os caminhos novos sozinha.',
        'A janelinha Picture-in-Picture mostra só um rosto e uma palavra, e um toque longo no vídeo escolhe quanto os botões esmaecem.',
        'Se as restrições de bateria voltarem, o app avisa você.',
        'Tudo o que os telefones usam é o seu servidor: nenhum serviço externo.',
      ],
      fr: [
        'Attendre coûte beaucoup moins de batterie : en attente, le téléphone dort vraiment.',
        'Un appel qui meurt dans la poche se répare dans la poche, écran éteint.',
        'En sortant de chez soi, la conversation passe sur les données mobiles en quelques secondes.',
        'En changeant de réseau, la liaison cherche les nouveaux chemins toute seule.',
        'La petite fenêtre Picture-in-Picture ne montre qu’un visage et un mot, et un appui long sur la vidéo choisit à quel point les boutons s’estompent.',
        'Si les restrictions de batterie reviennent, l’app te le dit.',
        'Tout ce que les téléphones utilisent, c’est ton serveur : aucun service extérieur.',
      ],
    },
  },
];
