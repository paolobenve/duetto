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
  /**
   * A language may be missing: the notes of the versions before it was
   * added are not translated backwards, and what is read then is the
   * English - which every entry has.
   */
  notes: Partial<Record<Language, string[]>> & { en: string[] };
};

export const RELEASES: Release[] = [
  {
    version: '0.9.17',
    notes: {
      en: [
        'Eight sounds say what has just happened: the video, the microphone, the camera turning, coming in and going out; the other phone hears them too.',
        'Reopening the app from the icon or the notification goes straight back into the channel: for fifteen seconds after leaving, it used not to.',
        'Out of the channel the screen says so, with Enter: it could stay black and mute.',
        'Out of the channel the buttons work: video, microphone and camera set how one goes in.',
        'While waiting, Leave offers the way out for good and nothing else.',
        'Coming back from waiting, the connection is asked for again instead of remembered: no more sitting on "establishing the connection".',
        'The code, the invitation and the link have one screen, which tells them apart: the step that asked for eight digits is gone.',
        'After the phone closes the app, the call comes through again by itself.',
      ],
      it: [
        'Otto suoni dicono che cosa è appena successo: il video, il microfono, la camera che gira, entrare e uscire; li sente anche l\'altro telefono.',
        'Riaprire l\'app dall\'icona o dalla notifica riporta subito nel canale: per quindici secondi dopo l\'uscita non rientrava.',
        'Fuori dal canale lo schermo lo dice, con «Entra»: poteva restare nero e muto.',
        'Fuori dal canale i pulsanti funzionano: video, microfono e camera preparano come si entra.',
        'In attesa, «Esci» offre l\'uscita definitiva e nient\'altro.',
        'Tornando dall\'attesa il collegamento si richiede invece di ricordarlo: non si resta più fermi su «sto stabilendo il collegamento».',
        'Codice, invito e link hanno una schermata sola, che li riconosce: la tappa che chiedeva le otto cifre non c\'è più.',
        'Dopo che il telefono chiude l\'app, la chiamata torna ad arrivare da sola.',
      ],
      es: [
        'Ocho sonidos dicen lo que acaba de pasar: el vídeo, el micrófono, la cámara que gira, entrar y salir; también los oye el otro teléfono.',
        'Reabrir la app desde el icono o la notificación devuelve al canal enseguida: durante quince segundos después de salir no dejaba entrar.',
        'Fuera del canal la pantalla lo dice, con «Entrar»: podía quedarse negra y muda.',
        'Fuera del canal los botones funcionan: vídeo, micrófono y cámara preparan cómo se entra.',
        'En espera, «Salir» ofrece la salida definitiva y nada más.',
        'Al volver de la espera la conexión se pide de nuevo en vez de recordarla: ya no se queda en «estableciendo la conexión».',
        'Código, invitación y enlace tienen una sola pantalla, que los distingue: el paso que pedía las ocho cifras ya no está.',
        'Después de que el teléfono cierra la app, la llamada vuelve a llegar sola.',
      ],
      pt: [
        'Oito sons dizem o que acabou de acontecer: o vídeo, o microfone, a câmera que vira, entrar e sair; o outro telefone também os ouve.',
        'Reabrir o app pelo ícone ou pela notificação volta logo ao canal: por quinze segundos depois de sair, não deixava entrar.',
        'Fora do canal a tela diz isso, com «Entrar»: podia ficar preta e muda.',
        'Fora do canal os botões funcionam: vídeo, microfone e câmera preparam como se entra.',
        'Em espera, «Sair» oferece a saída definitiva e mais nada.',
        'Voltando da espera a conexão é pedida de novo em vez de lembrada: não fica mais parado em «estabelecendo a conexão».',
        'Código, convite e link têm uma tela só, que os distingue: a etapa que pedia os oito algarismos não existe mais.',
        'Depois que o telefone fecha o app, a chamada volta a chegar sozinha.',
      ],
      fr: [
        'Huit sons disent ce qui vient de se passer : la vidéo, le micro, la caméra qui tourne, entrer et sortir ; l\'autre téléphone les entend aussi.',
        'Rouvrir l\'appli depuis l\'icône ou la notification ramène aussitôt dans le canal : pendant quinze secondes après la sortie, elle refusait.',
        'Hors du canal l\'écran le dit, avec « Entrer » : il pouvait rester noir et muet.',
        'Hors du canal les boutons marchent : vidéo, micro et caméra préparent la façon d\'entrer.',
        'En attente, « Sortir » n\'offre que la sortie définitive.',
        'En revenant de l\'attente la connexion est redemandée au lieu d\'être retenue : on ne reste plus sur « établissement de la connexion ».',
        'Code, invitation et lien ont un seul écran, qui les distingue : l\'étape qui demandait les huit chiffres n\'est plus là.',
        'Après que le téléphone a fermé l\'appli, l\'appel revient tout seul.',
      ],
      de: [
        'Acht Töne sagen, was gerade geschehen ist: das Video, das Mikrofon, die Kamera, die sich dreht, Eintreten und Hinausgehen; das andere Telefon hört sie auch.',
        'Die App vom Symbol oder von der Benachrichtigung aus wieder zu öffnen führt sofort zurück in den Kanal: fünfzehn Sekunden nach dem Hinausgehen tat sie das nicht.',
        'Außerhalb des Kanals sagt es der Bildschirm, mit „Eintreten“: er konnte schwarz und stumm bleiben.',
        'Außerhalb des Kanals wirken die Knöpfe: Video, Mikrofon und Kamera stellen ein, wie man hineingeht.',
        'Beim Warten bietet „Hinausgehen“ nur den endgültigen Ausgang.',
        'Aus dem Warten zurück wird die Verbindung neu erfragt statt erinnert: kein Steckenbleiben mehr bei „Verbindung wird hergestellt“.',
        'Code, Einladung und Link haben einen einzigen Bildschirm, der sie unterscheidet: der Schritt, der die acht Ziffern verlangte, ist fort.',
        'Nachdem das Telefon die App geschlossen hat, kommt der Anruf von selbst wieder an.',
      ],
    },
  },
  {
    version: '0.9.16',
    notes: {
      en: [
        'A connection can be sent as a link: whoever opens it is connected at once, even with the other phone off; the code waits a day.',
        'The app opens on the door, with Enter; whoever would rather go straight in says so there, once.',
        'The channel opens in the earpiece; the first turn to the speaker offers to open it as it was left.',
        'At the ear the sound moves to the earpiece; a Bluetooth or wired headset takes it as soon as it connects. Four switches in the settings.',
        '"Accept an invitation or a connection": one screen for a QR code, a pasted link or a code read out. An invitation to another server leads to a pair there, and each pair remembers its server.',
        'On wifi the video starts sharp.',
        'On a network that loses packets, "short packets" - offered when the voice turns choppy.',
        'The journal records loss and jitter.',
      ],
      it: [
        'Un collegamento si manda come link: chi lo apre si trova collegato subito, anche a telefono dell\'altro spento; il codice aspetta un giorno.',
        'L\'app si apre sulla porta, con «Entra»; chi preferisce entrare da solo lo dice lì, una volta.',
        'Il canale si apre nell\'auricolare; al primo passaggio al vivavoce si può scegliere di riaprirlo com\'era.',
        'All\'orecchio il suono passa all\'auricolare; una cuffia Bluetooth o con filo lo prende appena si collega. Quattro interruttori nelle impostazioni.',
        '«Accetta un invito o un collegamento»: una schermata sola per QR, link incollato o codice dettato. Un invito di un altro server porta a fare una coppia lì, e ogni coppia ricorda il suo server.',
        'Sul wifi il video parte già nitido.',
        'Con una rete che perde pacchetti, «pacchetti brevi», offerti quando la voce arriva a scatti.',
        'Il giornale scrive perdita e jitter.',
      ],
      es: [
        'Una conexión se envía como enlace: quien lo abre queda conectado al instante, aun con el otro teléfono apagado; el código espera un día.',
        'La app se abre en la puerta, con «Entrar»; quien prefiera entrar directo lo dice ahí, una vez.',
        'El canal se abre en el auricular; al primer paso al altavoz se puede elegir reabrirlo como quedó.',
        'Al oído el sonido pasa al auricular; un auricular Bluetooth o con cable lo toma en cuanto se conecta. Cuatro interruptores en los ajustes.',
        '«Aceptar una invitación o una conexión»: una sola pantalla para QR, enlace pegado o código dictado. Una invitación a otro servidor lleva a hacer una pareja allí, y cada pareja recuerda su servidor.',
        'En wifi el vídeo empieza ya nítido.',
        'En una red que pierde paquetes, «paquetes cortos», ofrecidos cuando la voz llega a trompicones.',
        'El diario registra pérdida y jitter.',
      ],
      pt: [
        'Uma conexão se manda como link: quem o abre fica conectado na hora, mesmo com o outro telefone desligado; o código espera um dia.',
        'O app abre na porta, com «Entrar»; quem prefere entrar direto diz isso ali, uma vez.',
        'O canal abre no auricular; na primeira passagem ao viva-voz dá para escolher reabri-lo como ficou.',
        'Ao ouvido o som passa para o auricular; um fone Bluetooth ou com fio o toma assim que se conecta. Quatro chaves nas configurações.',
        '«Aceitar um convite ou uma conexão»: uma tela só para QR, link colado ou código ditado. Um convite de outro servidor leva a fazer um par lá, e cada par lembra o seu servidor.',
        'No wifi o vídeo já começa nítido.',
        'Numa rede que perde pacotes, «pacotes curtos», oferecidos quando a voz chega picotada.',
        'O diário registra perda e jitter.',
      ],
      fr: [
        'Une connexion s\'envoie en lien : qui l\'ouvre est connecté aussitôt, même l\'autre téléphone éteint ; le code attend un jour.',
        'L\'appli s\'ouvre sur la porte, avec « Entrer » ; qui préfère entrer directement le dit là, une fois.',
        'Le canal s\'ouvre dans l\'écouteur ; au premier passage au haut-parleur, on peut choisir de le rouvrir tel quel.',
        'À l\'oreille le son passe dans l\'écouteur ; une oreillette Bluetooth ou un casque filaire le prend dès qu\'il se connecte. Quatre interrupteurs dans les réglages.',
        '« Accepter une invitation ou une connexion » : un seul écran pour QR, lien collé ou code dicté. Une invitation à un autre serveur mène à y faire une paire, et chaque paire se souvient de son serveur.',
        'En wifi la vidéo démarre déjà nette.',
        'Sur un réseau qui perd des paquets, « paquets courts », proposés quand la voix arrive hachée.',
        'Le journal note perte et gigue.',
      ],
      de: [
        'Eine Verbindung lässt sich als Link schicken: wer ihn öffnet, ist sofort verbunden, auch bei ausgeschaltetem anderem Telefon; der Code wartet einen Tag.',
        'Die App öffnet sich an der Tür, mit „Eintreten“; wer lieber direkt hineingeht, sagt es dort, einmal.',
        'Der Kanal öffnet sich im Hörer; beim ersten Wechsel zum Lautsprecher kann man wählen, ihn wie zuletzt zu öffnen.',
        'Am Ohr wechselt der Ton in den Hörer; ein Bluetooth- oder Kabel-Headset übernimmt ihn, sobald es verbunden ist. Vier Schalter in den Einstellungen.',
        '„Eine Einladung oder eine Verbindung annehmen“: ein Bildschirm für QR-Code, eingefügten Link oder diktierten Code. Eine Einladung zu einem anderen Server führt dorthin zu einem Paar, und jedes Paar merkt sich seinen Server.',
        'Im WLAN startet das Video gleich scharf.',
        'In einem Netz, das Pakete verliert, „kurze Pakete“, angeboten, wenn die Stimme abgehackt kommt.',
        'Das Tagebuch schreibt Verlust und Jitter auf.',
      ],
    },
  },
  {
    version: '0.9.15',
    notes: {
      en: [
        'The volume you hear is now a strip instead of a line.',
        'The alert can be made your own, with one of Duetto\'s sounds or with a sound of the phone.',
        'An invitation opened on the phone now opens Duetto, with the server and the code already in place: before, tapping it did nothing.',
        'The invitation written on a beta tester\'s work item stays open, says until when it works, and makes them a guest of the project, with their item in their hands.',
        'Two phones tell each other which version they are showing.',
      ],
      it: [
        'Il volume che si sente è ora una striscia invece che una linea.',
        'Si può personalizzare l\'avviso con uno dei suoni di Duetto o con un audio del telefono.',
        'Un invito aperto sul telefono ora apre Duetto, con il server e il codice già a posto: prima, a toccarlo non succedeva niente.',
        'L\'invito scritto sul work item di un beta tester resta aperto, dice fino a quando vale, e lo fa ospite del progetto, con il suo work item in mano.',
        'Due telefoni si dicono che versione stanno mostrando.',
      ],
      es: [
        'El volumen que se oye es ahora una tira en vez de una línea.',
        'El aviso se puede personalizar con uno de los sonidos de Duetto o con un audio del teléfono.',
        'Una invitación abierta en el teléfono abre ahora Duetto, con el servidor y el código ya puestos: antes, tocarla no hacía nada.',
        'La invitación escrita en el work item de un beta tester queda abierta, dice hasta cuándo vale, y lo hace invitado del proyecto, con su work item en la mano.',
        'Dos teléfonos se dicen qué versión están mostrando.',
      ],
      pt: [
        'O volume que se ouve é agora uma faixa em vez de uma linha.',
        'O aviso pode ser personalizado com um dos sons do Duetto ou com um áudio do telefone.',
        'Um convite aberto no telefone agora abre o Duetto, com o servidor e o código já no lugar: antes, tocá-lo não fazia nada.',
        'O convite escrito no work item de um beta tester fica aberto, diz até quando vale, e o torna convidado do projeto, com o seu work item na mão.',
        'Dois telefones dizem um ao outro qual versão estão mostrando.',
      ],
      fr: [
        'Le volume qu\'on entend est maintenant une bande au lieu d\'une ligne.',
        'L\'alerte peut être personnalisée, avec l\'un des sons de Duetto ou avec un son du téléphone.',
        'Une invitation ouverte sur le téléphone ouvre maintenant Duetto, avec le serveur et le code déjà en place : avant, la toucher ne faisait rien.',
        'L\'invitation écrite sur le work item d\'un bêta-testeur reste ouverte, dit jusqu\'à quand elle vaut, et en fait un invité du projet, son work item en main.',
        'Deux téléphones se disent quelle version ils montrent.',
      ],
      de: [
        'Die Lautstärke, die man hört, ist jetzt ein Streifen statt einer Linie.',
        'Der Hinweis lässt sich anpassen, mit einem von Duettos Klängen oder mit einem Ton des Telefons.',
        'Eine auf dem Telefon geöffnete Einladung öffnet nun Duetto, mit Server und Code schon an Ort und Stelle: vorher geschah beim Antippen nichts.',
        'Die Einladung, die auf das Work Item eines Beta-Testers geschrieben wird, bleibt offen, sagt bis wann sie gilt, und macht ihn zum Gast des Projekts, mit seinem Work Item in der Hand.',
        'Zwei Telefone sagen einander, welche Version sie zeigen.',
      ],
    },
  },
  {
    version: '0.9.14',
    notes: {
      en: [
        'Duetto speaks German too, and the words the notification writes when the app is not running are now in all six languages: until now Spanish, Portuguese, French and German read English there.',
        'An invitation is copied and shared as a link, which carries the server with it - the bare code did not.',
        'And it can be written straight on the work item of whoever asked to be a beta tester, which is made confidential first: the link, their reports and their journals stay between them and the project.',
        'The figure under the buttons is what the channel really costs, both ways together, taken from the road in use: it can be held beside the phone\'s own counter now.',
        'The journal says on every line who has the microphone open and who the camera, on both phones, instead of only writing the changes.',
      ],
      it: [
        'Duetto parla anche tedesco, e le parole che la notifica scrive quando l\'app non è aperta sono ora in tutte e sei le lingue: finora spagnolo, portoghese, francese e tedesco leggevano l\'inglese.',
        'L\'invito si copia e si condivide come link, che porta dentro il server: il codice da solo non lo faceva.',
        'E si può scrivere direttamente sul work item di chi ha chiesto di fare da beta tester, reso prima riservato: il link, le sue segnalazioni e i suoi giornali restano tra lui e il progetto.',
        'Il numero sotto i pulsanti è quello che il canale costa davvero, nelle due direzioni, preso dalla strada in uso: ora si può mettere accanto al contatore del telefono.',
        'Il giornale dice su ogni riga chi ha il microfono aperto e chi la telecamera, dai due lati, invece di scrivere solo i cambi.',
      ],
      de: [
        'Duetto spricht jetzt auch Deutsch, und die Worte, die die Mitteilung schreibt, wenn die App nicht läuft, stehen in allen sechs Sprachen: bisher lasen Spanisch, Portugiesisch, Französisch und Deutsch dort Englisch.',
        'Eine Einladung wird als Link kopiert und geteilt, der den Server mitbringt: der bloße Code tat das nicht.',
        'Und sie lässt sich geradewegs in das Work Item dessen schreiben, der darum gebeten hat, Beta-Tester zu sein; es wird vorher vertraulich gemacht: der Link, seine Meldungen und seine Tagebücher bleiben zwischen ihm und dem Projekt.',
        'Die Zahl unter den Tasten ist das, was der Kanal wirklich kostet, in beide Richtungen zusammen, vom Weg genommen, der gerade trägt: jetzt lässt sie sich neben den Zähler des Telefons halten.',
        'Das Tagebuch sagt in jeder Zeile, wer das Mikrofon offen hat und wer die Kamera, auf beiden Telefonen, statt nur die Wechsel aufzuschreiben.',
      ],
      es: [
        'Duetto habla también alemán, y las palabras que escribe la notificación cuando la app no está abierta están ya en los seis idiomas: hasta ahora español, portugués, francés y alemán leían inglés ahí.',
        'La invitación se copia y se comparte como enlace, que lleva dentro el servidor: el código a secas no lo hacía.',
        'Y puede escribirse directamente en el work item de quien pidió ser beta tester, hecho confidencial antes: el enlace, sus avisos y sus diarios quedan entre él y el proyecto.',
        'El número bajo los botones es lo que el canal cuesta de verdad, en las dos direcciones, tomado del camino en uso: ahora se puede poner al lado del contador del teléfono.',
        'El diario dice en cada línea quién tiene el micrófono abierto y quién la cámara, en los dos lados, en vez de escribir solo los cambios.',
      ],
      pt: [
        'O Duetto fala também alemão, e as palavras que a notificação escreve quando o app não está aberto estão agora nos seis idiomas: até agora espanhol, português, francês e alemão liam inglês ali.',
        'O convite se copia e se compartilha como link, que leva o servidor dentro: o código sozinho não levava.',
        'E pode ser escrito direto no work item de quem pediu para ser beta tester, tornado confidencial antes: o link, os relatos e os diários ficam entre ele e o projeto.',
        'O número sob os botões é o que o canal custa de verdade, nas duas direções, tirado do caminho em uso: agora dá para colocá-lo ao lado do contador do telefone.',
        'O diário diz em cada linha quem está com o microfone aberto e quem com a câmera, dos dois lados, em vez de escrever só as mudanças.',
      ],
      fr: [
        'Duetto parle aussi allemand, et les mots que la notification écrit quand l\'appli n\'est pas ouverte sont désormais dans les six langues : jusqu\'ici l\'espagnol, le portugais, le français et l\'allemand y lisaient l\'anglais.',
        'Une invitation se copie et se partage en lien, qui emporte le serveur avec lui : le code seul ne le faisait pas.',
        'Et elle peut s\'écrire directement sur le work item de qui a demandé à être bêta-testeur, rendu confidentiel d\'abord : le lien, ses signalements et ses journaux restent entre lui et le projet.',
        'Le nombre sous les boutons est ce que le canal coûte vraiment, dans les deux sens, pris sur la route en service : on peut maintenant le tenir à côté du compteur du téléphone.',
        'Le journal dit à chaque ligne qui a le micro ouvert et qui la caméra, des deux côtés, au lieu de n\'écrire que les changements.',
      ],
    },
  },
  {
    version: '0.9.13',
    notes: {
      de: [
        'Der Kanal wird nicht mehr immer wieder neu aufgebaut. Mit eingeschaltetem Video und niemandem, der auf der anderen Seite zusah, wurde die Leitung alle acht Sekunden gelöst und neu geknüpft, mitten in einem Gespräch, das auf beiden Bildschirmen nur Ton war.',
        'Der Wechsel auf einen besseren Weg unterbricht jetzt nichts mehr: die Stimme läuft weiter, während der neue Weg versucht wird.',
        'Wenn das Telefon Duetto von selbst schließt, sagt es auch das Telefon, dem es geschehen ist, und sagt, wo man die Grenzen im Hintergrund wegnimmt.',
        'Die Diagnose hat einen eigenen Reiter; der Schalter zeigt den Rest.',
        'Von dort lässt sich das Tagebuch teilen, und die Beta-Tester schicken es samt ihren Meldungen an ihr Work Item auf GitLab.',
      ],
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
      de: [
        'Die Lautstärke in Dezibel: die Tasten bewegen nur die Verstärkung von Duetto, der Regler des Telefons bleibt, wo er ist; eine Skala neben den Tasten zeigt den Pegel und wo das Telefon steht, mit einer Taste, um die andere Person stummzuschalten, ohne die Lautstärke zu verlieren.',
        'Bluetooth-Hörer oder Kopfhörer mit Kabel abgezogen: zurück zur Ausgabe von vorher, nicht zum Hörer am Ohr.',
        'Das Mikrofon beim Eintreten: für jede Verbindung, wie du es gelassen hast oder immer stumm.',
        'Neben dem Akku der anderen Person siehst du, ob sie im WLAN oder im Mobilfunknetz ist; das Video bleibt nach einem Wechsel der Verbindung nicht mehr schwarz.',
        'Mit der App im Hintergrund läuft alles weiter: Akku, Tagebuch, Leitung; und nach einer Aktualisierung kommt die Bereitschaft von selbst zurück.',
        'Behoben: zwei Verbindungen desselben Telefons, die sich jede Sekunde gegenseitig hinauswarfen, während die andere Seite die Leitung ständig neu entstehen sah.',
        'Das Tagebuch: eine Datei je Tag, teilbar; Beta-Tester schicken es aus den Einstellungen an ihr Work Item, samt ihren Meldungen.',
        'Weniger Daten im Mobilfunknetz: seltenere Tonpakete, und Stille wird nicht gesendet.',
      ],
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
      de: [
        'Tasten auf der Mitteilung: «Eintreten» in Bereitschaft, «In Bereitschaft gehen» im Kanal.',
        'Der Bildschirm bleibt in einem Kanal ohne Video nicht mehr an: wach hält ihn nur das Video.',
        'Hinausgehen: «Im Kanal bleiben» liegt genau über der Taste zum Verlassen, so hält dich eine zweite Berührung an derselben Stelle drinnen; und ein Hinausgehen wird nicht rückgängig gemacht, wenn die App für einen Augenblick zurückkommt.',
        'Der Akkustand, der der anderen Seite gesagt wird, bleibt bei ausgeschaltetem Bildschirm frisch.',
        'Ein Wort über Google, einmal, mit der Petition zum Unterschreiben.',
      ],
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
