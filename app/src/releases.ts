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
    version: '0.9.13',
    notes: {
      en: [
        'The channel is no longer rebuilt over and over. With the video on and nobody watching on the other side, the link was made and unmade every eight seconds, in the middle of a conversation that on both screens was audio only.',
        'A better road is now taken without interrupting anything: the voice goes on while the new road is tried.',
        'When the phone closes Duetto by itself, the phone it happened on says so too, and says where to lift the background limits.',
        'The diagnostics have a tab of their own; the switch shows the rest.',
        'From there the journal can be shared, and the beta testers send it, with their reports, to their work item on GitLab.',
      ],
      it: [
        'Il canale non si rifà più in continuazione. Con il video acceso e nessuno che guardasse dall’altra parte, il collegamento si disfaceva ogni otto secondi, in mezzo a una conversazione che sugli schermi era solo audio.',
        'Il passaggio a una strada migliore non interrompe più niente: la voce continua mentre la strada nuova viene provata.',
        'Quando il telefono chiude Duetto da sé, lo dice anche il telefono a cui è successo, e dice dove togliere i limiti in sottofondo.',
        'La diagnostica ha una scheda sua; l’interruttore mostra il resto.',
        'Da lì il giornale si condivide, e i beta tester lo mandano, con le loro segnalazioni, al loro work item su GitLab.',
      ],
      es: [
        'El canal ya no se rehace una y otra vez. Con el vídeo encendido y nadie mirando al otro lado, el enlace se deshacía cada ocho segundos, en medio de una conversación que en las pantallas era solo audio.',
        'El paso a un camino mejor ya no interrumpe nada: la voz sigue mientras se prueba el camino nuevo.',
        'Cuando el teléfono cierra Duetto por su cuenta, lo dice también el teléfono al que le ha pasado, y dice dónde quitar los límites en segundo plano.',
        'La diagnóstica tiene una pestaña propia; el interruptor muestra lo demás.',
        'Desde ahí se comparte el diario, y los beta testers lo mandan, con sus avisos, a su work item en GitLab.',
      ],
      pt: [
        'O canal não é mais refeito sem parar. Com o vídeo ligado e ninguém olhando do outro lado, a ligação se desfazia a cada oito segundos, no meio de uma conversa que nas telas era só áudio.',
        'A passagem para um caminho melhor não interrompe mais nada: a voz continua enquanto o caminho novo é testado.',
        'Quando o telefone fecha o Duetto sozinho, quem o diz é também o telefone em que aconteceu, com onde tirar os limites em segundo plano.',
        'O diagnóstico tem uma aba própria; o interruptor mostra o resto.',
        'De lá o diário se compartilha, e os beta testers o mandam, com os seus relatos, ao seu work item no GitLab.',
      ],
      fr: [
        'Le canal n’est plus refait sans arrêt. Avec la vidéo allumée et personne qui regardait en face, la liaison se défaisait toutes les huit secondes, au milieu d’une conversation qui sur les écrans était en audio seul.',
        'Le passage à une meilleure route n’interrompt plus rien : la voix continue pendant que la nouvelle route est essayée.',
        'Quand le téléphone ferme Duetto de lui-même, le téléphone où c’est arrivé le dit aussi, et dit où enlever les limites en arrière-plan.',
        'Le diagnostic a son propre onglet ; l’interrupteur montre le reste.',
        'De là le journal se partage, et les bêta-testeurs l’envoient, avec leurs signalements, à leur work item sur GitLab.',
      ],
    },
  },
  {
    version: '0.9.12',
    notes: {
      en: [
        'The volume in decibels: the keys move only Duetto\'s gain, the phone\'s knob stays where it is; a scale beside the buttons shows the level and where the phone sits, with a button to hush the other person without losing the volume.',
        'Bluetooth earpiece or wired headset unplugged: back to the output you had before, not to the earpiece.',
        'The microphone on entry: per connection, as you left it or always off.',
        'Beside the other person\'s battery you see whether they are on wifi or mobile data; the video no longer stays black after a change of connection.',
        'With the app behind, everything goes on: battery, journal, link; and after an update the presence comes back by itself.',
        'Fixed: two connections of the same phone pushing each other out every second, the other side seeing the link made and unmade all the time.',
        'The journal: one file a day, shareable; beta testers send it to their work item from Settings, with their reports.',
        'Less data on mobile networks: sparser audio packets, and silence not sent.',
      ],
      it: [
        'Il volume in decibel: i tasti muovono solo il guadagno di Duetto, il pomello del telefono resta dov’è; una scala accanto ai pulsanti mostra il livello e dove sta il telefono, con un pulsante per zittire l’altro senza perdere il volume.',
        'Auricolare Bluetooth o cuffia con filo staccati: si torna all’uscita di prima, non all’orecchio.',
        'Il microfono all’ingresso: per ogni connessione, come l’avevi lasciato o sempre spento.',
        'Accanto alla batteria dell’altro si vede se è su wifi o su rete dati; il video non resta più nero dopo un cambio di connessione.',
        'Con l’app dietro tutto continua: batteria, giornale, collegamento; e dopo un aggiornamento la presenza riparte da sola.',
        'Corretto: due connessioni dello stesso telefono che si scalzavano ogni secondo, con l’altro che vedeva il collegamento rifarsi di continuo.',
        'Il giornale: un file al giorno, condivisibile; i beta tester lo mandano al loro work item dalle Impostazioni, con le segnalazioni.',
        'Meno dati sulla rete mobile: pacchetti audio più radi e silenzio non trasmesso.',
      ],
      es: [
        'El volumen en decibelios: las teclas mueven solo la ganancia de Duetto, la rueda del teléfono se queda donde está; una escala junto a los botones muestra el nivel y dónde está el teléfono, con un botón para silenciar al otro sin perder el volumen.',
        'Auricular Bluetooth o cascos con cable desconectados: se vuelve a la salida de antes, no al auricular.',
        'El micrófono al entrar: por conexión, como lo dejaste o siempre apagado.',
        'Junto a la batería del otro se ve si está en wifi o en datos móviles; el vídeo ya no se queda en negro tras un cambio de conexión.',
        'Con la app detrás todo sigue: batería, diario, enlace; y tras una actualización la presencia vuelve sola.',
        'Corregido: dos conexiones del mismo teléfono que se echaban la una a la otra cada segundo, con el otro viendo el enlace hacerse y deshacerse sin parar.',
        'El diario: un archivo al día, compartible; los beta testers lo mandan a su work item desde Ajustes, con sus avisos.',
        'Menos datos en la red móvil: paquetes de audio más espaciados y silencio no enviado.',
      ],
      pt: [
        'O volume em decibéis: as teclas movem só o ganho do Duetto, o botão do telefone fica onde está; uma escala ao lado dos botões mostra o nível e onde está o telefone, com um botão para silenciar o outro sem perder o volume.',
        'Fone Bluetooth ou com fio desconectado: volta-se à saída de antes, não ao auricular.',
        'O microfone ao entrar: por conexão, como você o deixou ou sempre desligado.',
        'Ao lado da bateria do outro vê-se se está no wi-fi ou nos dados móveis; o vídeo não fica mais preto depois de uma troca de conexão.',
        'Com o app atrás tudo continua: bateria, diário, ligação; e depois de uma atualização a presença volta sozinha.',
        'Corrigido: duas conexões do mesmo telefone que se expulsavam a cada segundo, com o outro vendo a ligação refazer-se sem parar.',
        'O diário: um arquivo por dia, compartilhável; os beta testers mandam-no ao seu work item pelas Configurações, com os relatos.',
        'Menos dados na rede móvel: pacotes de áudio mais espaçados e silêncio não enviado.',
      ],
      fr: [
        'Le volume en décibels : les touches ne bougent que le gain de Duetto, la molette du téléphone reste où elle est ; une échelle à côté des boutons montre le niveau et où en est le téléphone, avec un bouton pour faire taire l’autre sans perdre le volume.',
        'Oreillette Bluetooth ou casque filaire débranchés : retour à la sortie d’avant, pas à l’écouteur.',
        'Le micro à l’entrée : par connexion, comme tu l’avais laissé ou toujours coupé.',
        'À côté de la batterie de l’autre on voit s’il est en wifi ou en données mobiles ; la vidéo ne reste plus noire après un changement de connexion.',
        'L’appli en arrière-plan, tout continue : batterie, journal, liaison ; et après une mise à jour la présence revient d’elle-même.',
        'Corrigé : deux connexions du même téléphone qui se chassaient chaque seconde, l’autre voyant la liaison se refaire sans arrêt.',
        'Le journal : un fichier par jour, partageable ; les bêta-testeurs l’envoient à leur work item depuis les Réglages, avec leurs signalements.',
        'Moins de données sur le réseau mobile : paquets audio plus espacés et silence non transmis.',
      ],
    },
  },
  {
    version: '0.9.11',
    notes: {
      en: [
        'Buttons on the notification: "Enter" while waiting, "Go to waiting" while in the channel.',
        'The screen no longer stays on in an audio-only channel: only the video keeps it awake.',
        'Leaving: "Stay in the channel" sits right over the Leave button, so a second touch in the same place keeps you in; and a leaving is not undone by the app coming back for a moment.',
        'The battery level told to the other side stays fresh with the screen off.',
        'A word about Google, once, with the petition to sign.',
      ],
      it: [
        'Pulsanti sulla notifica: «Entra» in attesa, «Vai in attesa» nel canale.',
        'Lo schermo non resta più acceso nel canale solo audio: lo tiene sveglio solo il video.',
        'Uscita: «Resta nel canale» sta proprio sopra il pulsante Esci, così un secondo tocco nello stesso punto ti tiene dentro; e un’uscita non viene annullata dall’app che torna davanti per un attimo.',
        'Il livello della batteria detto all’altro resta aggiornato a schermo spento.',
        'Una parola su Google, una volta sola, con la petizione da firmare.',
      ],
      es: [
        'Botones en la notificación: «Entrar» en espera, «Ir a la espera» en el canal.',
        'La pantalla ya no se queda encendida en el canal solo de audio: solo el vídeo la mantiene despierta.',
        'Salida: «Quedarse en el canal» está justo sobre el botón Salir, así un segundo toque en el mismo sitio te mantiene dentro; y una salida no la deshace la app al volver un instante.',
        'El nivel de batería que se dice al otro se mantiene actualizado con la pantalla apagada.',
        'Una palabra sobre Google, una sola vez, con la petición para firmar.',
      ],
      pt: [
        'Botões na notificação: «Entrar» em espera, «Ir para a espera» no canal.',
        'A tela não fica mais acesa no canal só de áudio: só o vídeo a mantém acordada.',
        'Saída: «Ficar no canal» fica bem sobre o botão Sair, assim um segundo toque no mesmo lugar mantém você dentro; e uma saída não é desfeita pelo app voltar por um instante.',
        'O nível de bateria dito ao outro fica atualizado com a tela apagada.',
        'Uma palavra sobre o Google, uma só vez, com a petição para assinar.',
      ],
      fr: [
        'Des boutons sur la notification : « Entrer » en attente, « Passer en attente » dans le canal.',
        'L’écran ne reste plus allumé dans le canal audio seul : seule la vidéo le garde éveillé.',
        'Sortie : « Rester dans le canal » se trouve juste sur le bouton Quitter, ainsi un second toucher au même endroit te garde dedans ; et une sortie n’est pas annulée par l’appli qui revient un instant.',
        'Le niveau de batterie dit à l’autre reste à jour écran éteint.',
        'Un mot sur Google, une seule fois, avec la pétition à signer.',
      ],
    },
  },
  {
    version: '0.9.10',
    notes: {
      en: ['No server? The first screen now says how to ask to be a beta tester, and takes you there.'],
      it: ['Non hai un server? La prima schermata ora dice come chiedere di fare da beta tester, e ti ci porta.'],
      es: ['¿Sin servidor? La primera pantalla ahora dice cómo pedir ser beta tester, y te lleva allí.'],
      pt: ['Sem servidor? A primeira tela agora diz como pedir para ser beta tester, e leva você até lá.'],
      fr: ['Pas de serveur ? Le premier écran dit maintenant comment demander à être bêta-testeur, et t’y emmène.'],
    },
  },
  {
    version: '0.9.9',
    notes: {
      en: ['Nothing new to use: the same app as 0.9.7, packaged as F-Droid asks.'],
      it: ['Niente di nuovo da usare: la stessa app della 0.9.7, impacchettata come chiede F-Droid.'],
      es: ['Nada nuevo que usar: la misma app que la 0.9.7, empaquetada como pide F-Droid.'],
      pt: ['Nada de novo para usar: o mesmo app da 0.9.7, empacotado como o F-Droid pede.'],
      fr: ['Rien de nouveau à utiliser : la même app que la 0.9.7, empaquetée comme F-Droid le demande.'],
    },
  },
  {
    version: '0.9.8',
    notes: {
      en: ['Nothing new to use: the same app as 0.9.7, built the way F-Droid needs it.'],
      it: ['Niente di nuovo da usare: la stessa app della 0.9.7, costruita come serve a F-Droid.'],
      es: ['Nada nuevo que usar: la misma app que la 0.9.7, construida como lo necesita F-Droid.'],
      pt: ['Nada de novo para usar: o mesmo app da 0.9.7, construído como o F-Droid precisa.'],
      fr: ['Rien de nouveau à utiliser : la même app que la 0.9.7, construite comme F-Droid en a besoin.'],
    },
  },
  {
    version: '0.9.7',
    notes: {
      en: [
        'With the diagnostics on, the battery of both phones in one line, charger included, under the card and beside the video.',
        'A touch on the picture while the screen counts as covered is said too, instead of doing nothing.',
        'Between one release and the next the version reads «-pre».',
      ],
      it: [
        'Con la diagnostica accesa, la batteria di tutti e due i telefoni in una riga, caricatore compreso, sotto la carta e accanto al video.',
        'Anche un tocco sull’immagine, mentre lo schermo risulta coperto, viene detto, invece di non fare nulla.',
        'Fra una release e l’altra la versione si legge «-pre».',
      ],
      es: [
        'Con el diagnóstico activo, la batería de los dos teléfonos en una línea, cargador incluido, bajo la tarjeta y junto al vídeo.',
        'Un toque en la imagen mientras la pantalla cuenta como cubierta también se avisa, en vez de no hacer nada.',
        'Entre una versión y la siguiente, la versión se lee «-pre».',
      ],
      pt: [
        'Com o diagnóstico ligado, a bateria dos dois telefones numa linha, carregador incluído, sob o cartão e ao lado do vídeo.',
        'Um toque na imagem enquanto a tela conta como coberta também é avisado, em vez de não fazer nada.',
        'Entre uma versão e a seguinte, a versão se lê «-pre».',
      ],
      fr: [
        'Avec le diagnostic actif, la batterie des deux téléphones sur une ligne, chargeur compris, sous la carte et à côté de la vidéo.',
        'Une touche sur l’image pendant que l’écran compte comme couvert est dite aussi, au lieu de ne rien faire.',
        'Entre une version et la suivante, la version se lit « -pre ».',
      ],
    },
  },
  {
    version: '0.9.6',
    notes: {
      en: [
        'On Android 10 to 13 the listening comes back by itself again, after a reboot and after the phone closes the app.',
        'After a reboot, a notification says you were in the channel: one touch takes you back in.',
        'When the screen counts as covered and the buttons are held, the app says so; three touches let you through.',
        'With the diagnostics on, the battery and the charger are shown beside the volumes.',
      ],
      it: [
        'Su Android da 10 a 13 l’ascolto torna di nuovo da solo, dopo un riavvio e dopo che il telefono chiude l’app.',
        'Dopo un riavvio, una notifica dice che eri nel canale: un tocco ti riporta dentro.',
        'Quando lo schermo risulta coperto e i pulsanti sono bloccati, l’app lo dice; tre tocchi ti fanno passare.',
        'Con la diagnostica accesa, batteria e caricatore compaiono accanto ai volumi.',
      ],
      es: [
        'En Android 10 a 13 la escucha vuelve a reanudarse sola, tras un reinicio y cuando el teléfono cierra la app.',
        'Tras un reinicio, una notificación dice que estabas en el canal: un toque te devuelve dentro.',
        'Cuando la pantalla cuenta como cubierta y los botones están bloqueados, la app lo dice; tres toques te dejan pasar.',
        'Con el diagnóstico activo, la batería y el cargador aparecen junto a los volúmenes.',
      ],
      pt: [
        'No Android 10 a 13 a escuta volta a retomar sozinha, depois de um reinício e quando o telefone fecha o app.',
        'Depois de um reinício, uma notificação diz que você estava no canal: um toque leva você de volta.',
        'Quando a tela conta como coberta e os botões estão travados, o app avisa; três toques deixam você passar.',
        'Com o diagnóstico ligado, bateria e carregador aparecem ao lado dos volumes.',
      ],
      fr: [
        'Sur Android 10 à 13 l’écoute revient de nouveau toute seule, après un redémarrage et quand le téléphone ferme l’app.',
        'Après un redémarrage, une notification dit que tu étais dans le canal : une touche t’y ramène.',
        'Quand l’écran compte comme couvert et que les boutons sont bloqués, l’app le dit ; trois touches te laissent passer.',
        'Avec le diagnostic actif, la batterie et le chargeur apparaissent à côté des volumes.',
      ],
    },
  },
  {
    version: '0.9.5',
    notes: {
      en: [
        'When somebody leaves your server, you are told, and the pairs with them are marked as broken.',
      ],
      it: [
        'Quando qualcuno lascia il tuo server, te lo dice, e le coppie con lui risultano sciolte.',
      ],
      es: [
        'Cuando alguien deja tu servidor, te lo dice, y las parejas con esa persona quedan deshechas.',
      ],
      pt: [
        'Quando alguém sai do seu servidor, você fica sabendo, e os pares com essa pessoa ficam desfeitos.',
      ],
      fr: [
        'Quand quelqu’un quitte ton serveur, tu en es informé, et les paires avec cette personne sont rompues.',
      ],
    },
  },
  {
    version: '0.9.4',
    notes: {
      en: [
        'The first time, the app asks for the server and for nothing else: a server nobody has taken becomes yours, and the door shuts behind you.',
        'Whoever is called by you needs only your code; whoever is to open connections of their own is invited from the pairing screen.',
        'A bluetooth earpiece is seen again: the app asks for the permission it needs to see one, which it had been forgetting.',
        'The settings are in two tabs: server and pairs, and use.',
        'During a call on the phone, Duetto is silent both ways, and the other person is told.',
        'A QR code for whoever is near: the pairing code and the invitation can be read with the camera, server included.',
      ],
      it: [
        'La prima volta l’app chiede il server e nient’altro: un server che nessuno ha preso diventa tuo, e la porta si chiude dietro di te.',
        'A chi chiami basta il tuo codice; chi deve aprire collegamenti propri lo inviti dalla schermata di accoppiamento.',
        'Un auricolare bluetooth si vede di nuovo: l’app chiede il permesso che le serve per vederlo, che si dimenticava.',
        'Le impostazioni sono in due schede: server e coppie, e uso.',
        'Durante una chiamata sul telefono, Duetto tace in tutte e due le direzioni, e l’altro lo sa.',
        'Un codice QR per chi è vicino: il codice di accoppiamento e l’invito si leggono con la camera, server compreso.',
      ],
      es: [
        'La primera vez la app pide el servidor y nada más: un servidor que nadie ha tomado pasa a ser tuyo, y la puerta se cierra detrás de ti.',
        'A quien llamas le basta tu código; a quien deba abrir conexiones propias lo invitas desde la pantalla de emparejamiento.',
        'Un auricular bluetooth se vuelve a ver: la app pide el permiso que necesita para verlo, y que olvidaba.',
        'Los ajustes están en dos pestañas: servidor y parejas, y uso.',
        'Durante una llamada en el teléfono, Duetto calla en las dos direcciones, y el otro lo sabe.',
        'Un código QR para quien está cerca: el código de emparejamiento y la invitación se leen con la cámara, servidor incluido.',
      ],
      pt: [
        'Na primeira vez o app pede o servidor e mais nada: um servidor que ninguém tomou passa a ser seu, e a porta se fecha atrás de você.',
        'Para quem você chama basta o seu código; quem precisa abrir ligações próprias você convida da tela de pareamento.',
        'Um fone bluetooth volta a ser visto: o app pede a permissão de que precisa para vê-lo, que estava esquecendo.',
        'Os ajustes estão em duas abas: servidor e pares, e uso.',
        'Durante uma chamada no telefone, o Duetto fica em silêncio nas duas direções, e o outro fica sabendo.',
        'Um código QR para quem está perto: o código de pareamento e o convite se leem com a câmera, servidor incluído.',
      ],
      fr: [
        'La première fois, l’app demande le serveur et rien d’autre : un serveur que personne n’a pris devient le tien, et la porte se ferme derrière toi.',
        'À qui tu appelles, ton code suffit ; qui doit ouvrir ses propres liaisons, tu l’invites depuis l’écran d’appairage.',
        'Une oreillette bluetooth est de nouveau vue : l’app demande la permission qu’il lui faut pour la voir, et qu’elle oubliait.',
        'Les réglages sont en deux onglets : serveur et paires, et usage.',
        'Pendant un appel sur le téléphone, Duetto se tait dans les deux sens, et l’autre le sait.',
        'Un code QR pour qui est à côté : le code d’appairage et l’invitation se lisent avec la caméra, serveur compris.',
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
