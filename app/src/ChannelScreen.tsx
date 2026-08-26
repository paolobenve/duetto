import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated,
  useWindowDimensions, Modal, Pressable,
} from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { MediaStream } from 'react-native-webrtc';
import { Diario, Prossimita } from 'duetto-platform';
import type { PresenceStatus } from './signaling';
import VideoStage from './VideoStage';
import { AudioRoute, routeLabel } from './audioRoute';
import { VERSION_LABEL } from './version';
import ChangelogModal from './ChangelogModal';
import type { Avatar } from './avatar';
import { VIDEO_PROFILES } from './config';
import type { VideoQuality } from './config';
import type { VideoStats } from './webrtc';
import {
  IconaVideo, IconaMicrofono, IconaAvvisa, IconaAvvisato, IconaEsci,
  IconaImpostazioni, IconaFrontale, IconaPosteriore,
  IconaVivavoce, IconaTelefono, IconaCuffie, IconaBluetooth,
} from './Icons';

/**
 * Come si spengono i pulsanti: subito, ma piano.
 *
 * Prima restavano fermi qualche secondo e poi calavano di colpo: un
 * salto che attira l'occhio proprio mentre si vuole guardare altro. Un
 * calo continuo di dieci secondi non ha un istante in cui succede
 * qualcosa, e quando ci si accorge che sono sbiaditi lo sono già da un
 * pezzo.
 */
/**
 * Quanto resta a schermo una notizia prima di sbiadire.
 *
 * Dieci secondi: il tempo di leggerla senza doverla togliere a mano.
 */
const DURATA_NOTIZIA_MS = 10_000;

const FADE_MS = 10000;

/**
 * Dopo quanto i comandi si addormentano.
 *
 * Attenuati e non toccati da un minuto: da lì in poi il primo tocco li
 * risveglia soltanto, senza premere niente. È la stessa regola dei
 * comandi invisibili, estesa a quelli sbiaditi: un telefono lasciato
 * acceso con Duetto davanti non deve poter uscire dal canale perché
 * qualcosa gli si è appoggiato sopra.
 */
const SONNO_MS = 60000;

/**
 * Quanto restano visibili i comandi quando il calo è finito.
 *
 * Quaranta per cento è quello di sempre: si leggono, ma non pesano.
 * Quindici li riduce a un'ombra, per chi guarda l'immagine e non vuole
 * niente sopra ma nemmeno un buio in cui cercare i pulsanti a memoria.
 * Zero li toglie del tutto.
 */
const OPACITA_COMANDI: Record<'poco' | 'molto' | 'nascondi', number> = {
  poco: 0.4,
  molto: 0.15,
  nascondi: 0,
};

/**
 * L'etichetta "Tu"/"Non tu" non scende sotto questa soglia.
 *
 * Chi si sta guardando è l'unica cosa che dallo schermo non si ricava,
 * quindi resta leggibile anche quando tutto il resto se n'è andato.
 */
const DIM_ETICHETTA = 0.4;

/**
 * Sotto questa larghezza siamo nella finestrella Picture-in-Picture:
 * lì comandi e badge non ci starebbero, mostriamo solo il video.
 */
const COMPACT_WIDTH = 340;

/**
 * Icona su pastiglia chiara: disegno scuro.
 *
 * Il colore di fondo serve anche alla barra dello sbarramento, che si
 * stacca dal disegno con un filo dello stesso colore su cui poggia.
 */
const SU_CHIARO = { color: '#1e1f22', sfondo: 'rgb(243,243,243)' } as const;

/** Il disegno di ogni uscita audio, per la pastiglia e per il menu. */
const ICONA_USCITA: Record<
  AudioRoute,
  (p: { size?: number; color?: string; off?: boolean; sfondo?: string }) => JSX.Element
> = {
  SPEAKER_PHONE: IconaVivavoce,
  EARPIECE: IconaTelefono,
  WIRED_HEADSET: IconaCuffie,
  BLUETOOTH: IconaBluetooth,
};

/**
 * I suoni per richiamare chi è nel canale ma non risponde.
 *
 * Tre soli, e ben diversi fra loro: si sceglie a colpo sicuro, senza
 * doverli riascoltare uno per uno. Il nome tecnico lo conosce anche il
 * telefono dall'altra parte, che è quello che poi lo suona.
 */
const SVEGLIE: { nome: string; etichetta: string; nota: string }[] = [
  {
    nome: 'tamburi',
    etichetta: 'Tamburi',
    nota: 'Un giro di batteria secco, due volte. Difficile ignorarlo.',
  },
  {
    nome: 'batteria',
    etichetta: 'Batteria',
    nota: 'Due giri di batteria. Più musica che allarme, ma non si ignora.',
  },
  {
    nome: 'fanfara',
    etichetta: 'Fanfara',
    nota: 'Trombe, «ta-daaa». Chi si sveglia così non se la prende.',
  },
  {
    nome: 'strombazzata',
    etichetta: 'Strombazzata',
    nota: 'Il clacson di un’automobile. Sveglia chiunque, e infastidisce.',
  },
  {
    nome: 'gallo',
    etichetta: 'Canto del gallo',
    nota: 'Chicchirichì. Fa sorridere chi si stava addormentando.',
  },
];

type Props = {
  /**
   * Il nome dato a questo collegamento, se ne ha uno.
   *
   * Prende il posto del nome dell'app sulla pastiglia in alto: con più
   * collegamenti configurati, sapere in quale si sta vale più che
   * rileggere "Duetto".
   */
  collegamento: string;
  peerName: string;
  /** immagine dell'altro, quando non ha un nome */
  peerAvatar: Avatar;
  /**
   * L'altro è collegato al server, anche se non è nel canale.
   *
   * È la differenza fra aspettare qualcuno che può arrivare da un
   * momento all'altro e aspettare qualcuno che in questo momento non ha
   * nemmeno il telefono acceso: nel primo caso l'avviso arriva, nel
   * secondo no.
   */
  peerPresent: boolean;
  /**
   * Non c'è perché ha staccato lui, non perché è caduta la linea.
   *
   * Il server distingue chi saluta da chi sparisce, e per chi resta la
   * differenza è tutta: da un tunnel si esce, da una scelta no.
   */
  peerStaccato: boolean;
  /**
   * È in attesa perché il suo telefono gli ha chiuso l'app.
   *
   * Non è una sua scelta, ed è il contrario di quello che "in attesa"
   * lascia immaginare: certi telefoni smontano l'app da soli, anche di
   * notte, e chi legge merita di saperlo.
   */
  peerSmontato?: boolean;
  /** risoluzione e banda effettive, in uscita e in entrata */
  videoStats: VideoStats;
  /** profilo scelto: senza, non si capisce da cosa dipendano quei numeri */
  qualityLabel: string;
  /** le due righe tecniche sotto ai pulsanti, spente per impostazione */
  showStats: boolean;
  /** i comandi spariscono del tutto invece di attenuarsi */
  /** quanto si fanno da parte i comandi: 'poco' | 'molto' | 'nascondi' */
  comandi: 'poco' | 'molto' | 'nascondi';
  /**
   * Una notizia da leggere: l'app dell'altro è morta ed è tornata, o è
   * tornato dopo una lunga assenza.
   *
   * Fuori dall'app la stessa cosa la dice una notifica silenziosa, che
   * però è nella tendina - cioè in un posto dove chi sta guardando
   * questa schermata non guarda. Qui sta davanti, e va via toccandola.
   */
  avviso?: string | null;
  onAvvisoLetto?: () => void;
  /**
   * A che volume si sta sentendo l'altro, mentre si preme.
   *
   * `null` quasi sempre: si mostra solo nei telefoni dove il volume di
   * chiamata non si muove e ci pensa l'app, e solo per il paio di
   * secondi che seguono la pressione. Senza, premere non produrrebbe
   * nulla di visibile e i tasti sembrerebbero rotti lo stesso.
   */
  guadagno?: number | null;
  /**
   * Il livello in questo momento, per il menu dell'audio.
   *
   * Lì c'è un comando a mano perché i tasti non bastano dappertutto: su
   * certi telefoni l'indice del volume di chiamata scorre e all'orecchio
   * non cambia niente, e da fuori quel caso è indistinguibile da uno che
   * funziona.
   *
   * È il prodotto delle due metà: il volume di chiamata del telefono e
   * il guadagno di Duetto. Vedi `volumeSistema`.
   */
  guadagnoAltro?: number;
  /**
   * Il volume di chiamata del telefono e il suo massimo.
   *
   * Si mostra fra le righe tecniche, perché è l'altra metà del livello:
   * sapere che il telefono sta a 3 su 12 spiega da solo un "non ti
   * sento" che nessuna percentuale, da sola, spiegherebbe.
   */
  volumeSistema?: { volume: number; max: number };
  onGuadagno?: (direzione: number) => void;
  /**
   * Le due parti hanno versioni diverse di Duetto.
   *
   * `null` quando sono uguali, che è il caso normale e non merita una
   * riga. Quando non lo sono, spiega da solo metà delle stranezze - una
   * cosa che qui c'è e lì no - e va detto dove si va a guardare quando
   * qualcosa non torna: fra le righe tecniche.
   */
  avvisoVersione?: string | null;
  /** quale camera sta riprendendo: lo dice l'icona di "Gira" */
  cameraFrontale: boolean;
  /** profilo in uso e come cambiarlo: si apre tenendo premuto "Video" */
  quality: VideoQuality;
  onSelectQuality: (q: VideoQuality) => void;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  status: PresenceStatus;
  connectionState: string;
  audioOn: boolean;
  videoOn: boolean;
  /** `uscita`: da dove esce il suono dall'altra parte, se lo dichiara */
  peerState: {
    audio: boolean; video: boolean; aspect?: number; uscita?: string;
    /** a che volume l'altro sta ascoltando NOI: 1 = come glielo mandiamo */
    volume?: number;
  };
  /** traccia video dell'altro davvero in arrivo */
  remoteHasVideo: boolean;
  /** cambia a ogni ripartenza del video remoto, per ricreare il visualizzatore */
  remoteVideoKey: number;
  /** proporzioni dei due video, per la forma del riquadrino */
  localAspect?: number;
  remoteAspect?: number;
  knockPending: boolean;
  audioRoute: AudioRoute;
  /** uscite audio davvero collegate in questo momento */
  audioRoutes: AudioRoute[];
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onSwitchCamera: () => void;
  onSelectRoute: (r: AudioRoute) => void;
  onKnock: () => void;
  /**
   * Esce dal canale.
   *
   * `disponibile` dice se restare raggiungibili: uscendo si continua a
   * ricevere l'avviso dell'altro, a meno che non si scelga di staccarsi
   * del tutto.
   */
  onLeave: (disponibile: boolean) => void;
  /**
   * L'uscita è in corso: si sta mettendo al sicuro il diario.
   *
   * Dura qualche decimo di secondo. Senza dirlo, il pulsante sembra non
   * aver fatto niente, e chi non vede reazione preme di nuovo.
   */
  uscendo?: boolean;
  /**
   * Manda all'altro un suono forte per richiamarlo.
   *
   * Ha senso solo mentre siete tutti e due nel canale: se non c'è, il
   * suono non ha dove suonare, e per quello serve l'avviso.
   */
  onSveglia: (suono: string) => void;
  /** quanto si è ingrandito il video grande, a gesto finito */
  onIngrandimento?: (zoom: number) => void;
  onOpenSettings: () => void;
};

/**
 * La schermata del canale. Non c'è nulla da "chiamare": sei dentro,
 * e vedi se c'è anche l'altro. Se non c'è, puoi avvisarlo.
 */
export default function ChannelScreen(props: Props) {
  const {
    collegamento, peerName, peerAvatar, peerPresent, peerStaccato, peerSmontato, videoStats, qualityLabel, showStats, comandi, avviso, onAvvisoLetto, guadagno, guadagnoAltro, volumeSistema, onGuadagno,
    avvisoVersione, cameraFrontale, quality, onSelectQuality, localStream, remoteStream, status, connectionState,
    audioOn, videoOn, peerState, remoteHasVideo, remoteVideoKey, localAspect, remoteAspect,
    knockPending, audioRoute, audioRoutes,
    onToggleAudio, onToggleVideo, onSwitchCamera, onSelectRoute, onKnock, onLeave, uscendo,
    onSveglia, onIngrandimento, onOpenSettings,
  } = props;

  // In Picture-in-Picture la finestra è minuscola: niente comandi.
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const compact = winWidth < COMPACT_WIDTH;

  /**
   * Il rettangolo che il video occupa davvero.
   *
   * Il video sta "dentro" lo schermo senza essere tagliato, quindi lascia
   * due bande nere. Appoggiando i comandi ai bordi dello SCHERMO finivano
   * a metà sull'immagine e metà sul nero: appoggiandoli ai bordi del
   * VIDEO stanno tutti dentro, come si intende una sovrapposizione.
   *
   * Senza nessun video il rettangolo è tutto lo schermo, ed è giusto:
   * lì non c'è nessun bordo a cui allinearsi.
   */
  const [bigAspect, setBigAspect] = useState<number | null>(null);
  /**
   * L'ultimo rientro conosciuto, tenuto anche senza video.
   *
   * Spegnendo l'ultima camera il rettangolo del video sparisce e il
   * rientro andrebbe a zero: i comandi scivolavano in fondo allo schermo
   * e il riquadrino cambiava zona, per un cambiamento che dal punto di
   * vista di chi guarda non c'è stato. Restano dove sono, in attesa che
   * l'immagine torni.
   */
  const ultimoInset = useRef({ v: 0, h: 0 });
  const inset = React.useMemo(() => {
    if (winWidth <= 0 || winHeight <= 0) return ultimoInset.current;
    if (!bigAspect) return ultimoInset.current;
    const screen = winWidth / winHeight;
    const v = bigAspect > screen
      ? { v: Math.round((winHeight - winWidth / bigAspect) / 2), h: 0 }
      : { v: 0, h: Math.round((winWidth - winHeight * bigAspect) / 2) };
    ultimoInset.current = v;
    return v;
  }, [bigAspect, winWidth, winHeight]);

  const [routeMenu, setRouteMenu] = useState(false);
  const [novita, setNovita] = useState(false);
  const [menuQualita, setMenuQualita] = useState(false);
  /** le due uscite, tenendo premuto "Esci" */
  const [menuUscita, setMenuUscita] = useState(false);
  /** i suoni per richiamare l'altro, tenendo premuto "Avvisa" */
  const [menuSveglia, setMenuSveglia] = useState(false);
  /** chi occupa lo schermo quando c'è un video solo: 'tu', 'altro', o niente */
  const [soloGrande, setSoloGrande] = useState<'tu' | 'altro' | null>(null);

  const together = status === 'together';
  const linked = connectionState === 'connected';

  /**
   * Interruzione in corso: l'altro c'è ma il collegamento diretto no.
   * Non è un "non c'è nessuno": è un'attesa, e va detto invece di
   * lasciare uno schermo nero senza spiegazione.
   */
  const serverLost = status === 'offline';

  /**
   * Non siamo collegati: caduto il server, oppure l'altro c'è ma il
   * collegamento diretto no - compreso mentre si sta ristabilendo.
   *
   * Includere il ristabilimento è il punto: prima la fase "connecting"
   * non contava come interruzione, e in quell'istante il posto grande
   * veniva dato al proprio video. Si vedeva il proprio a schermo intero
   * per un attimo e poi rimpicciolirsi, a ogni riconnessione.
   */
  /**
   * Interruzione VERA, non una rinegoziazione.
   *
   * Rinegoziare - cambio di risoluzione, ricerca di una strada diretta,
   * cambio di cella - porta la connessione in "connecting" per qualche
   * secondo senza che nulla si sia rotto: i fotogrammi riprendono da
   * soli. Contare quello stato come interruzione mostrava "collegamento
   * interrotto" proprio mentre il collegamento stava lavorando.
   *
   * Sono interruzioni solo "failed" e "disconnected", che è ciò che ICE
   * dice quando i pacchetti non arrivano davvero.
   */
  const rotto = connectionState === 'failed' || connectionState === 'disconnected';
  const notConnected = serverLost || (together && rotto);

  /**
   * Un'interruzione si dichiara solo se dura.
   *
   * Il ritardo vale sia per l'avviso sia per la DISPOSIZIONE dei
   * riquadri, ed è la seconda a contare di più: prima l'avviso aspettava
   * ma il layout si riordinava subito, quindi il riquadrino saltava a
   * schermo intero e tornava indietro a ogni rinegoziazione - la ricerca
   * di una strada diretta, un cambio di risoluzione - senza che nulla
   * fosse davvero successo.
   *
   * Tre secondi: sotto quella soglia le interruzioni si richiudono da
   * sole, e l'unica cosa peggiore di un video che si ferma un attimo è
   * un'interfaccia che si riordina due volte per dirlo.
   */
  const [showNotice, setShowNotice] = useState(false);
  useEffect(() => {
    if (!notConnected) { setShowNotice(false); return; }
    const t = setTimeout(() => setShowNotice(true), 3000);
    return () => clearTimeout(t);
  }, [notConnected]);

  /**
   * Il posto grande resta dell'altro finché lui dichiara di trasmettere.
   *
   * Questo NON aspetta i tre secondi dell'avviso: l'attesa vale per il
   * messaggio, che è un allarme, non per la disposizione. Ritardandola
   * anche qui restava una finestra in cui il proprio video saliva a
   * schermo intero per poi tornare indietro all'arrivo dell'altro - il
   * ballo che si voleva evitare, spostato di tre secondi.
   *
   * Se invece la camera dell'altro è spenta, il proprio a schermo intero
   * è la cosa giusta: lì non stiamo aspettando nulla.
   */
  const interrupted = peerState.video && !remoteHasVideo;

  /**
   * L'avviso ha dove arrivare.
   *
   * Basta che il suo telefono sia collegato al server: nel canale o in
   * attesa non fa differenza, l'avviso passa di lì in tutti e due i
   * casi. Se invece non è collegato - staccato di proposito, o senza
   * rete - non c'è nessuno a cui bussare.
   */
  const raggiungibile = peerPresent || status === 'together';

  // Senza questo, perdendo il server restava uno schermo nero muto: il
  // video dell'altro è ancora lì ma non ci arriva più nessun
  // fotogramma, e nulla lo spiegava.
  const notice = !showNotice
    ? undefined
    : serverLost
      ? 'Connessione persa, mi sto ricollegando…'
      : (connectionState === 'failed'
          ? 'Collegamento perso, sto ricollegando…'
          : 'Collegamento interrotto, in attesa…');
  // remoteHasVideo arriva come prop: è un evento esplicito della sessione,
  // perché le tracce entrano dentro lo stesso MediaStream e React non se
  // ne accorgerebbe guardando il riferimento.
  const localHasVideo =
    !!localStream && videoOn && localStream.getVideoTracks().length > 0;

  /**
   * La notizia si legge e se ne va: dieci secondi, poi sbiadisce.
   *
   * Prima restava lì finché non la si toccava, e siccome le notizie
   * invecchiano in fretta - «è di nuovo raggiungibile» mentre intanto è
   * uscito di nuovo - il riquadro finiva per dire cose non più vere
   * proprio nel punto dove l'occhio va per prima cosa. Si può ancora
   * toccarla per toglierla subito.
   */
  const notiziaOpacita = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!avviso) return;
    notiziaOpacita.setValue(1);
    const anim = Animated.timing(notiziaOpacita, {
      toValue: 0,
      delay: DURATA_NOTIZIA_MS,
      duration: 700,
      useNativeDriver: true,
    });
    anim.start(({ finished }) => { if (finished) onAvvisoLetto?.(); });
    return () => anim.stop();
  }, [avviso, notiziaOpacita, onAvvisoLetto]);

  // I pulsanti restano SEMPRE sullo schermo: non spariscono mai, si
  // attenuano soltanto, e tornano pieni al primo tocco.
  const opacity = useRef(new Animated.Value(1)).current;
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Quando il calo in corso arriverà in fondo.
   *
   * Serve a interpretare il tocco sull'immagine: finché i comandi stanno
   * ancora calando si vedono, e chi tocca li vuole via; una volta in
   * fondo non si vedono più, e chi tocca li vuole indietro.
   *
   * Un semplice "sono pieni sì/no" non bastava: diventava "no" appena
   * partito il calo, cioè dopo un decimo di secondo, e da lì in avanti il
   * tocco li richiamava invece di toglierli - che è il difetto che si
   * vedeva, comandi che non se ne andavano più.
   */
  const finCalo = useRef(0);

  /**
   * Comandi spariti del tutto: da lì in poi non si premono.
   *
   * Con "nascosti" restavano premibili anche invisibili, e un dito
   * appoggiato dove prima c'era un pulsante spegneva il video o usciva
   * dal canale senza che niente lo annunciasse. Un comando che non si
   * vede non è un comando: il primo tocco li richiama, e da lì si
   * decide guardando.
   *
   * Vale solo per lo zero assoluto: sbiaditi al 15% si vedono ancora, e
   * chi sa dove sono ha diritto di premerli senza due tocchi.
   */
  const [spariti, setSpariti] = useState(false);

  /** Il calo: parte subito e dura dieci secondi. */
  const attenua = useCallback((durata = FADE_MS) => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    finCalo.current = Date.now() + durata;
    const meta = OPACITA_COMANDI[comandi] ?? OPACITA_COMANDI.poco;
    Animated.timing(opacity, {
      toValue: meta,
      duration: durata,
      useNativeDriver: true,
    }).start(({ finished }) => {
      // Solo a calo finito: durante la discesa si vedono ancora.
      if (finished && meta === 0) setSpariti(true);
    });
  }, [opacity, comandi]);

  /**
   * C'è qualcosa da guardare sotto ai comandi.
   *
   * Senza nessun video i comandi non coprono niente, e attenuarli
   * lascerebbe uno schermo scuro con sopra dei pulsanti sbiaditi: si
   * nascondono per lasciar vedere un'immagine, e se l'immagine non c'è
   * non c'è ragione.
   */
  const daVedere = localHasVideo || remoteHasVideo;

  const wake = useCallback(() => {
    setSpariti(false);
    finCalo.current = 0;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    Animated.timing(opacity, {
      toValue: 1, duration: 120, useNativeDriver: true,
    }).start(({ finished }) => {
      // Il calo riparte appena finito di tornare pieni: nessuna attesa
      // ferma, e quindi nessun istante in cui "scattano" via.
      if (finished && daVedere) attenua();
    });
  }, [opacity, attenua, daVedere]);

  /**
   * Un tocco sull'immagine: se i comandi si vedono, li toglie di mezzo.
   *
   * Aspettare i nove secondi dell'attenuazione automatica, quando si
   * vuole guardare l'immagine e basta, è una piccola prigionia.
   */
  /**
   * L'etichetta segue l'attenuazione degli altri, ma non oltre.
   *
   * Con "Nascondi i comandi" gli altri vanno a zero; questa no, perché
   * l'unica informazione che non si ricava guardando lo schermo è
   * proprio chi si sta guardando.
   */
  const opacitaEtichetta = opacity.interpolate({
    inputRange: [0, 1],
    outputRange: [DIM_ETICHETTA, 1],
  });

  const tocco = useCallback(() => {
    const fermo = Date.now() - ultimoTocco.current;
    ultimoTocco.current = Date.now();
    // Anche il tocco sull'immagine conta come risveglio, e se veniva
    // dopo un lungo silenzio vale la pena saperlo: è il gemello buono
    // del tocco che nessuno ha voluto.
    if (fermo > SONNO_MS) {
      Diario.segna(`comandi-risvegliati:fermi ${Math.round(fermo / 1000)}s`)
        .catch(() => { /* noop */ });
    }
    // Chiedere di toglierli è diverso dal lasciarli calare: qui si vuole
    // vedere l'immagine adesso.
    if (Date.now() < finCalo.current) attenua(400); else wake();
  }, [attenua, wake]);

  // `wake` cambia quando cambia `daVedere`: spegnendo l'ultima camera i
  // comandi tornano pieni e ci restano.
  useEffect(() => {
    wake();
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [wake]);

  /** Quando lo schermo è stato toccato l'ultima volta. */
  const ultimoTocco = useRef(Date.now());

  /**
   * Ogni pressione riporta i pulsanti in evidenza e poi fa il suo
   * lavoro - tranne la prima dopo un lungo silenzio, che li risveglia e
   * basta.
   *
   * Serve contro il tocco che nessuno ha voluto: una notte, sul
   * telefono dell'altro, è comparsa un'uscita dal canale alle 4:46 che
   * nessuno aveva premuto, e il pulsante Esci fa il suo lavoro al primo
   * tocco senza chiedere niente. Con i comandi sbiaditi e fermi da un
   * minuto, quel tocco adesso non preme: accende.
   */
  const press = useCallback(
    (action: () => void) => () => {
      // Schermo coperto: qualunque cosa abbia toccato il vetro, non è
      // una scelta di nessuno.
      if (copertoRef.current) {
        Diario.segna('comando:ignorato-schermo-coperto').catch(() => { /* noop */ });
        return;
      }
      const fermo = Date.now() - ultimoTocco.current;
      ultimoTocco.current = Date.now();
      const attenuati = daVedere && (OPACITA_COMANDI[comandi] ?? 0.4) < 1;
      if (attenuati && fermo > SONNO_MS) {
        wake();
        Diario.segna(`comandi-risvegliati:fermi ${Math.round(fermo / 1000)}s`)
          .catch(() => { /* noop */ });
        return;
      }
      wake();
      action();
    },
    [wake, daVedere, comandi],
  );

  /**
   * Campanella che suona subito alla pressione di "Avvisa".
   *
   * `knockPending` arriva dal server, e con la rete lenta può tardare:
   * il dito resterebbe senza risposta proprio nel momento in cui la si
   * aspetta. Questo è solo il ritorno al tocco; la conferma vera resta
   * quella del server, che tiene poi la campanella accesa per i suoi due
   * secondi.
   */
  const [appenaBussato, setAppenaBussato] = useState(false);
  const timerBussata = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timerBussata.current) clearTimeout(timerBussata.current);
  }, []);
  /**
   * Come sta ascoltando l'altro, da mettere accanto a "Non tu".
   *
   * L'icona dice da dove gli esce il suono - vivavoce, orecchio, cuffie,
   * bluetooth - ed è barrata quando ha il microfono spento. Sono le due
   * cose che durante una conversazione si chiedono a voce ("mi senti?",
   * "sei in vivavoce?") e che il telefono sa già.
   *
   * Se l'altro ha una versione che non le dichiara, `uscita` non arriva
   * e si mostra il vivavoce, che è il caso normale entrando nel canale.
   */
  const segno = React.useCallback((size: number, sfondo: string) => {
    const dove = (peerState.uscita as AudioRoute) ?? 'SPEAKER_PHONE';
    const Icona = ICONA_USCITA[dove] ?? ICONA_USCITA.SPEAKER_PHONE;
    // Lo sfondo serve alla barra dello sbarramento per staccarsi dal
    // disegno: cambia con ciò su cui il segno è appoggiato.
    return <Icona size={size} color="#e6ebf1" off={!peerState.audio} sfondo={sfondo} />;
  }, [peerState.uscita, peerState.audio]);
  /**
   * Le due pastiglie dicono chi si sta guardando; con le righe tecniche
   * accese dicono anche come suona quel telefono lì.
   *
   * Ognuna descrive il suo: da dove esce il suono e a che volume lo sta
   * ascoltando chi ce l'ha in mano. Su «Non tu» quindi c'è la sua
   * uscita e il suo volume - cioè quanto forte sente TE - che è l'unica
   * delle quattro cose che non potresti sapere in nessun altro modo, e
   * la sola che spieghi «non ti sento» senza doverselo chiedere a voce.
   */
  const percento = (v?: number) => `${Math.round((v ?? 1) * 100)}%`;

  const segnoAltro = React.useMemo(() => (
    <>
      {segno(13, '#1b1d21')}
      {showStats && peerState.volume != null ? (
        <Text style={styles.pastigliaVolume}>{percento(peerState.volume)}</Text>
      ) : null}
    </>
  ), [segno, showStats, peerState.volume]);

  /** Da dove esce il suono QUI, come `segno` fa per il suo. */
  const segnoUscitaMia = React.useCallback((size: number, sfondo: string) => {
    const Icona = ICONA_USCITA[audioRoute] ?? ICONA_USCITA.SPEAKER_PHONE;
    return <Icona size={size} color="#e6ebf1" off={!audioOn} sfondo={sfondo} />;
  }, [audioRoute, audioOn]);

  const segnoMio = React.useMemo(() => {
    return (
      <>
        {segnoUscitaMia(13, '#1b1d21')}
        {showStats ? (
          <Text style={styles.pastigliaVolume}>{percento(guadagnoAltro)}</Text>
        ) : null}
      </>
    );
  }, [segnoUscitaMia, showStats, guadagnoAltro]);

  /**
   * Qualcosa copre lo schermo: una tasca, una cover chiusa.
   *
   * Finché è coperto i comandi non si premono. Un telefono in tasca
   * riceve tocchi che non sono scelte di nessuno - nel diario sono
   * comparse uscite dal canale con contatti di quaranta millisecondi,
   * mentre l'altro usciva di casa con il telefono in tasca e il
   * vivavoce acceso, che è la condizione in cui il sistema non spegne
   * lo schermo.
   *
   * In un riferimento oltre che in uno stato: lo leggono i gestori dei
   * tocchi, che nascono una volta sola.
   */
  const [coperto, setCoperto] = useState(false);
  const copertoRef = useRef(false);
  useEffect(() => {
    if (compact) return;
    let vivo = true;
    Prossimita.get().then((v) => {
      if (!vivo) return;
      copertoRef.current = !!v;
      setCoperto(!!v);
    }).catch(() => { /* noop */ });
    const stop = Prossimita.subscribe((v) => {
      copertoRef.current = v;
      setCoperto(v);
    });
    return () => { vivo = false; stop(); };
  }, [compact]);

  /**
   * La firma di un tocco su una riga del pannello.
   *
   * I pulsanti rotondi la scrivono da sé; le righe dei pannelli no, e
   * proprio l'uscita - che è la cosa su cui stiamo indagando - passava
   * di lì senza lasciare traccia. Qui non c'è la durata del contatto,
   * perché una riga di pannello non ha il tocco iniziale separato: c'è
   * il punto, che è già qualcosa.
   */
  const firmaTocco = useCallback((che: string, e: GestureResponderEvent) => {
    const x = Math.round(e?.nativeEvent?.pageX ?? -1);
    const y = Math.round(e?.nativeEvent?.pageY ?? -1);
    Diario.segna(
      `comando:${che} ${x},${y} coperto=${copertoRef.current ? 'si' : 'no'}`,
    ).catch(() => { /* noop */ });
  }, []);

  /** Vero se il tocco va lasciato cadere: lo schermo è coperto. */
  const daIgnorare = useCallback(() => {
    if (!copertoRef.current) return false;
    Diario.segna('comando:ignorato-schermo-coperto').catch(() => { /* noop */ });
    return true;
  }, []);

  /** Il lampo della campanella: dice che qualcosa è partito davvero. */
  const bussata = useCallback(() => {
    setAppenaBussato(true);
    if (timerBussata.current) clearTimeout(timerBussata.current);
    timerBussata.current = setTimeout(() => setAppenaBussato(false), 700);
  }, []);

  const bussa = useCallback(() => {
    bussata();
    onKnock();
  }, [bussata, onKnock]);

  return (
    // Il tocco si raccoglie dentro VideoStage, sulla sola immagine
    // grande: sul riquadrino significa già scambiare i due video, e sui
    // comandi significa premerli.
    <View style={styles.root}>
      <VideoStage
        localStream={localStream}
        remoteStream={remoteStream}
        localHasVideo={localHasVideo}
        remoteHasVideo={remoteHasVideo}
        remoteVideoKey={remoteVideoKey}
        awaitingRemote={interrupted}
        notice={notice}
        // Il riquadrino vuoto - quando la camera ce l'hai solo tu e sei
        // andato a schermo intero - è l'unica cosa rimasta a dire dov'è
        // l'altro: che dica quello vero, non un "in attesa" buono per
        // tutte le stagioni.
        etichettaVuoto={parolaAltro(status, peerName, peerPresent, peerStaccato)}
        localAspect={localAspect}
        remoteAspect={remoteAspect}
        compact={compact}
        specchia={cameraFrontale}
        onBigAspect={setBigAspect}
        insetV={compact ? 0 : inset.v}
        insetH={compact ? 0 : inset.h}
        insetBasso={!compact && showStats ? (avvisoVersione ? 54 : 36) : 0}
        onSfondo={tocco}
        onSoloGrande={setSoloGrande}
        onIngrandimento={onIngrandimento}
        segnoAltro={segnoAltro}
        segnoMio={segnoMio}
        placeholder={compact ? (
          /* Nella finestrella di Picture-in-Picture il riepilogo grande
             non ci sta: esce dai bordi e si legge mezza parola. Lì basta
             la faccia e una parola sola, che è tutto quello che si
             riesce a leggere in un rettangolo grande come un pollice. */
          <PresenceMini
            status={status}
            peerName={peerName}
            peerAvatar={peerAvatar}
            peerPresent={peerPresent}
            peerStaccato={peerStaccato}
          />
        ) : (
          <PresenceCard
            collegamento={collegamento}
            segno={
              <View style={styles.cardSegnoRiga}>
                {segno(17, '#0b0e14')}
                {showStats ? (
                  <>
                    {peerState.volume != null ? (
                      <Text style={styles.cardVolume}>
                        ti sente {percento(peerState.volume)}
                      </Text>
                    ) : null}
                    <Text style={styles.cardVolume}>
                      {peerState.volume != null ? '· ' : ''}
                      lo senti {percento(guadagnoAltro)}
                    </Text>
                    {/* Il segno dell'uscita sta accanto al numero di
                        chi ascolta: il suo davanti al suo, il mio dopo
                        il mio. Prima ce n'era uno solo, in testa, e
                        sembrava valere per tutta la riga. */}
                    {segnoUscitaMia(17, '#0b0e14')}
                  </>
                ) : null}
              </View>
            }
            peerPresent={peerPresent}
            peerStaccato={peerStaccato}
            peerSmontato={peerSmontato}
            status={status}
            linked={linked}
            connectionState={connectionState}
            peerName={peerName}
            peerAvatar={peerAvatar}
            peerAudio={peerState.audio}
          />
        )}
      />

      {/*
        Il promemoria dell'attesa anche sopra il video.
        Senza video lo dice il riepilogo al centro dello schermo; con la
        camera accesa quel riepilogo non c'è più, e restava solo la
        propria immagine, senza niente che spiegasse perché non succede
        nulla. Qui non ci va la faccia dell'altro: sopra l'immagine
        peserebbe, e chi guarda sa già chi aspetta.
        Si attenua insieme ai comandi: è un promemoria, non un allarme, e
        chi resta a lungo in attesa vuole vedere l'immagine, non la
        scritta.
      */}
      {!compact && soloGrande && status === 'alone' && !notice ? (
        <Animated.View style={[styles.attesaSopra, { opacity }]} pointerEvents="none">
          <Text style={styles.attesaTesto}>
            Sei nel canale.{'\n'}
            {comeSta(peerName, peerPresent, peerStaccato)}
            {peerPresent ? (
              <>
                {': tocca '}
                <Text style={styles.bold}>Avvisa</Text>
                {' per farglielo sapere.'}
              </>
            ) : peerStaccato ? (
              ': ha staccato Duetto di proposito.'
            ) : (
              ': il suo telefono non è collegato.'
            )}
          </Text>
        </Animated.View>
      ) : null}

      {/* La notizia sta sopra a tutto e non si attenua con i comandi:
          non è un comando, è una cosa da leggere una volta. Sotto la
          barra in alto, per non coprire l'ingranaggio. */}
      {!compact && avviso ? (
        <Animated.View
          style={[
            styles.notiziaSopra,
            { top: 62 + inset.v, left: 14 + inset.h, right: 14 + inset.h },
            { opacity: notiziaOpacita },
          ]}>
          <TouchableOpacity activeOpacity={0.85} onPress={onAvvisoLetto}>
            <Text style={styles.notiziaTesto}>{avviso}</Text>
            <Text style={styles.notiziaVia}>tocca per togliere</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      {/* "Sto uscendo": copre lo schermo e ferma i tocchi, così nessuno
          preme altro mentre il diario sta partendo. */}
      {uscendo ? (
        <View style={styles.uscendoSopra}>
          <Text style={styles.uscendoTesto}>
            Sto uscendo, un momento…
          </Text>
        </View>
      ) : null}

      {/* Il volume dell'altro, mentre lo si sta cambiando. Sta al centro
          e non si tocca: è un riscontro, non un comando. */}
      {!compact && guadagno != null ? (
        <View style={styles.volumeSopra} pointerEvents="none">
          <Text style={styles.volumeTesto}>
            Voce dell’altro{'  '}
            <Text style={styles.volumeCifra}>
              {guadagno === 0 ? 'muto' : `${Math.round(guadagno * 100)}%`}
            </Text>
          </Text>
        </View>
      ) : null}

      {/* In PiP finisce qui: la finestrella mostra solo il video. */}
      {compact ? null : (
        <>
      {/* Barra in alto: canale + stato */}
      {/* Anche la barra in alto sta dentro il video: fuori, sulla banda
          nera, sembra staccata dall'immagine a cui appartiene. Il
          riquadrino le lascia il posto scendendo, non lei salendo. */}
      {/* "Tu/Non tu" si attenua con gli altri comandi ma non sparisce
          mai: dice CHI si sta guardando a schermo intero, e con un tocco
          sul riquadrino i due si scambiano - è facile perdere il conto.
          Anche al minimo resta leggibile, che è quanto basta. */}
      {soloGrande ? (
        <Animated.View
          style={[
            styles.chiRiga,
            { top: 14 + inset.v, left: 14 + inset.h, opacity: opacitaEtichetta },
          ]}
          pointerEvents="none">
          <View style={styles.chiBadge}>
            <Text style={styles.chiText}>{soloGrande === 'tu' ? 'Tu' : 'Non tu'}</Text>
            {soloGrande === 'altro' ? segnoAltro : segnoMio}
          </View>
          {/* Niente pastiglia "Non tu" quando di suo non c'è nessuna
              immagine: queste etichette dicono CHI si sta guardando, e
              una che nomina un video inesistente sembra un secondo video
              che non arriva.

              Con le righe tecniche accese però una pastiglia in più ci
              vuole: se ha il video solo lui, il riquadrino non c'è, e
              con il riquadrino sparivano le uniche due cose che dicono
              come stai sentendo e come ti sente - le altre volte le
              dice il riepilogo al centro, che qui è coperto dal suo
              video. Questa non promette nessun video: porta il nome e
              i due segni dell'audio, e basta. */}
          {showStats && soloGrande === 'altro' && !localHasVideo ? (
            <View style={[styles.chiBadge, styles.chiBadgeAudio]}>
              <Text style={styles.chiTextTenue}>Tu</Text>
              {segnoMio}
            </View>
          ) : null}
        </Animated.View>
      ) : null}

      <Animated.View
        pointerEvents={spariti ? 'none' : 'auto'}
        style={[styles.topBar, { opacity, top: 14 + inset.v, left: 14 + inset.h, right: 14 + inset.h }]}>
        <View style={styles.spacer} pointerEvents="none" />
        <TouchableOpacity
          style={styles.badge}
          // Il nome dichiara già la versione: è lì che uno va a cercare
          // perché qualcosa è cambiato.
          onPress={press(() => setNovita(true))}>
          <View style={[styles.dot, together ? styles.dotGreen : styles.dotGrey]} />
          {/* In corsivo quando è un nome dato da te: così si distingue
              da una parola dell'app, ed è la stessa forma che ha in
              testa alle notifiche. */}
          <Text style={[styles.badgeText, collegamento ? styles.badgeNome : null]}>
            {collegamento || 'Duetto'}
          </Text>
          <Text style={styles.version}>  {VERSION_LABEL}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.gear} onPress={press(onOpenSettings)}>
          <IconaImpostazioni size={21} color="#e6ebf1" />
        </TouchableOpacity>
      </Animated.View>

      {/* Controlli: sempre presenti, in basso, dentro un pannello scuro */}
      <Animated.View
        pointerEvents={spariti ? 'none' : 'auto'}
        style={[
          styles.panel,
          { opacity, bottom: 8 + inset.v, left: 12 + inset.h, right: 12 + inset.h },
        ]}>
        <View style={styles.controls}>
        <CircleButton
          coperto={coperto}
          label="Video"
          // Acceso il pulsante è una pastiglia bianca, e allora il
          // disegno va in scuro: è ciò che sta funzionando a doversi
          // vedere di più, non ciò che è spento.
          icon={<IconaVideo off={!videoOn} {...(videoOn ? SU_CHIARO : {})} />}
          active={videoOn}
          onPress={press(onToggleVideo)}
          // Come per l'audio: il tocco accende e spegne, la pressione
          // prolungata apre le scelte. La qualità si giudica guardando,
          // e andarla a cercare nelle impostazioni fa perdere di vista
          // proprio ciò che si sta valutando.
          onLongPress={press(() => setMenuQualita(true))}
        />
        <CircleButton
          coperto={coperto}
          // Tocco: muto/non muto. Pressione prolungata: da dove esce l'audio.
          label={audioOn ? 'Audio' : 'Muto'}
          icon={<IconaMicrofono off={!audioOn} {...(audioOn ? SU_CHIARO : {})} />}
          active={audioOn}
          onPress={press(onToggleAudio)}
          onLongPress={press(() => setRouteMenu(true))}
          badge={ICONA_USCITA[audioRoute]}
        />
        <CircleButton
          coperto={coperto}
          label="Gira"
          // L'icona dice quale camera è accesa: una persona sola per la
          // frontale, più persone per quella dietro, che è ciò che di
          // solito ci si trova a inquadrare.
          // Pastiglia bianca con la frontale, spenta con la posteriore:
          // la sola differenza fra le due sagome - una persona o più -
          // si coglie leggendola, mentre il pieno o il vuoto si vede.
          icon={cameraFrontale ? <IconaFrontale {...SU_CHIARO} /> : <IconaPosteriore />}
          active={cameraFrontale}
          // Premibile anche a video spento: lì non gira niente, sceglie
          // con quale camera si accenderà. Serve a inquadrare qualcosa
          // senza mostrare prima, per un istante, la propria faccia.
          disabled={false}
          onPress={press(onSwitchCamera)}
        />
        <CircleButton
          coperto={coperto}
          label={knockPending ? 'Avvisato' : 'Avvisa'}
          // Per i due secondi che seguono la pressione la campanella suona:
          // è il segno che l'avviso è partito. La sola scritta cambiava
          // troppo poco per accorgersene.
          icon={appenaBussato || knockPending ? <IconaAvvisato /> : <IconaAvvisa />}
          /**
           * Acceso finché l'avviso ha dove andare.
           *
           * Prima si spegneva quando eravate tutti e due nel canale, con
           * l'idea che lì non ci fosse nulla da avvisare. Ma il pulsante
           * resta premibile proprio per quel caso - l'altro c'è e non
           * risponde - quindi lo spegnimento non diceva niente di vero, e
           * faceva sembrare guasto un pulsante che funzionava.
           *
           * Si spegne invece quando il suo telefono al server non è
           * collegato: lì l'avviso non ha dove arrivare, e un pulsante
           * blu che promette di chiamarlo promette una cosa che non
           * succede.
           */
          highlight={!appenaBussato && raggiungibile}
          // Premibile finché è raggiungibile: può essere nel canale ma
          // distratto, e insistere è proprio ciò che si vuole fare
          // quando il primo avviso non ha ottenuto risposta.
          disabled={!raggiungibile}
          onPress={press(bussa)}
          // Tenendolo premuto, i suoni per richiamarlo. Solo mentre
          // siete tutti e due nel canale: fuori di lì non c'è nessun
          // telefono acceso su cui potrebbero suonare, e l'avviso -
          // quello sì - passa dal server.
          onLongPress={together ? press(() => setMenuSveglia(true)) : undefined}
        />
        <CircleButton
          coperto={coperto}
          label="Esci"
          icon={<IconaEsci sfondo="#da373c" />}
          danger
          /**
           * Il tocco non esce: apre le due uscite, in mezzo allo schermo.
           *
           * Uscire dal canale era l'unica cosa distruttiva che questa
           * schermata sapesse fare, con un tocco solo, in un angolo dove
           * i tocchi capitano: sono comparse uscite che nessuno aveva
           * premuto, di notte e in pieno giorno. Prima avevo provato con
           * l'etichetta che diventava «Sicuro?», ma è una scritta
           * piccola sotto un'icona, e non la si vede.
           *
           * Adesso il tocco apre lo stesso pannello della pressione
           * lunga: una domanda grande in mezzo allo schermo, con le due
           * uscite scritte per esteso, e si esce toccando quella che si
           * vuole. Un tocco solo non porta più fuori da nessuna parte.
           */
          onPress={press(() => setMenuUscita(true))}
          onLongPress={press(() => setMenuUscita(true))}
        />
        </View>
        {showStats ? (
          // Altezza fissa: comparendo la seconda riga solo quando il
          // percorso è noto, il pannello cresceva sotto le dita e i
          // pulsanti si spostavano.
          <View style={[styles.statsBox, avvisoVersione ? styles.statsBoxTre : null]}>
            <StatsLine
              stats={videoStats}
              quality={qualityLabel}
              mostraSu={localHasVideo}
              mostraGiu={remoteHasVideo}
              versioni={avvisoVersione}
            />
          </View>
        ) : null}
      </Animated.View>
        </>
      )}

      {/* Uscita audio: si apre tenendo premuto il pulsante Audio. */}
      <ChangelogModal visible={novita} onClose={() => setNovita(false)} />

      {/* Risoluzione: si apre tenendo premuto il pulsante Video. */}
      <Modal
        visible={menuQualita}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuQualita(false)}>
        <Pressable style={styles.sheetBack} onPress={() => setMenuQualita(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Risoluzione</Text>
            {(Object.keys(VIDEO_PROFILES) as VideoQuality[]).map((q) => (
              <TouchableOpacity
                key={q}
                style={styles.sheetRow}
                onPress={() => { onSelectQuality(q); setMenuQualita(false); }}>
                <View style={styles.sheetText}>
                  <Text style={[styles.sheetLabel, q === quality && styles.sheetLabelOn]}>
                    {VIDEO_PROFILES[q].etichetta}
                  </Text>
                  <Text style={styles.sheetNota}>{VIDEO_PROFILES[q].nota}</Text>
                </View>
                {q === quality ? <Text style={styles.sheetCheck}>{'\u2713'}</Text> : null}
              </TouchableOpacity>
            ))}
            <Text style={styles.sheetHint}>
              Vale per tutti e due i telefoni: cambiandola qui cambia anche
              all’altro.
            </Text>
          </View>
        </Pressable>
      </Modal>

      {/* I suoni per richiamare: si apre tenendo premuto "Avvisa". */}
      <Modal
        visible={menuSveglia}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuSveglia(false)}>
        <Pressable style={styles.sheetBack} onPress={() => setMenuSveglia(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Richiamalo</Text>
            {SVEGLIE.map((sv) => (
              <TouchableOpacity
                key={sv.nome}
                style={styles.sheetRow}
                onPress={() => {
                  setMenuSveglia(false);
                  // Lo stesso lampo della campanella: il suono suona di
                  // là, e da qui non si sente nulla.
                  bussata();
                  onSveglia(sv.nome);
                }}>
                <View style={styles.sheetText}>
                  <Text style={styles.sheetLabel}>{sv.etichetta}</Text>
                  <Text style={styles.sheetNota}>{sv.nota}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <Text style={styles.sheetHint}>
              Suona sul suo telefono, al volume della sveglia: si sente anche
              con la suoneria bassa e il telefono lontano.
            </Text>
          </View>
        </Pressable>
      </Modal>

      {/* Le due uscite: si apre tenendo premuto "Esci". */}
      <Modal
        visible={menuUscita}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuUscita(false)}>
        <Pressable style={styles.sheetBack} onPress={() => setMenuUscita(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Uscire dal canale?</Text>
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={(e) => {
                firmaTocco('esci-resto', e);
                if (daIgnorare()) return;
                setMenuUscita(false);
                onLeave(true);
              }}>
              <View style={styles.sheetText}>
                <Text style={styles.sheetLabel}>Esci e resta disponibile</Text>
                <Text style={styles.sheetNota}>
                  Il canale si chiude, ma resti raggiungibile e il suo avviso
                  ti arriva.
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={(e) => {
                firmaTocco('esci-staccato', e);
                if (daIgnorare()) return;
                setMenuUscita(false);
                onLeave(false);
              }}>
              <View style={styles.sheetText}>
                <Text style={styles.sheetLabel}>Esci e renditi non disponibile</Text>
                <Text style={styles.sheetNota}>
                  Duetto si stacca del tutto: niente avvisi, niente notifica,
                  e all’altro risulti non raggiungibile. Finché non riapri
                  l’app.
                </Text>
              </View>
            </TouchableOpacity>
            {/* Esplicita, per chi ci è finito senza volerlo: toccare
                fuori funziona, ma è una cosa da sapere, e chi si trova
                davanti questa domanda senza averla chiesta non la sa. */}
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={(e) => { firmaTocco('esci-annulla', e); setMenuUscita(false); }}>
              <View style={styles.sheetText}>
                <Text style={styles.sheetLabel}>Resta nel canale</Text>
              </View>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={routeMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setRouteMenu(false)}>
        <Pressable style={styles.sheetBack} onPress={() => setRouteMenu(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Uscita audio</Text>
            {audioRoutes.map((r) => (
              <TouchableOpacity
                key={r}
                style={styles.sheetRow}
                onPress={() => { onSelectRoute(r); setRouteMenu(false); }}>
                {React.createElement(ICONA_USCITA[r], { size: 22, color: '#e6ebf1' })}
                <Text style={[styles.sheetLabel, r === audioRoute && styles.sheetLabelOn]}>
                  {routeLabel(r)}
                </Text>
                {r === audioRoute ? <Text style={styles.sheetCheck}>{'\u2713'}</Text> : null}
              </TouchableOpacity>
            ))}
            {audioRoutes.length < 2 ? (
              <Text style={styles.sheetHint}>
                Collega cuffie o un dispositivo Bluetooth per avere altre scelte.
              </Text>
            ) : null}

            {/* Il volume della voce dell'altro, dentro l'app.
                I tasti laterali fanno la stessa cosa; questo serve
                quando si vuole vedere dove si è, e per i telefoni dove
                i tasti sembrano non fare niente.

                Attenzione a non confonderlo con la percentuale sulla
                pastiglia «Non tu», che è l'altra metà: lì c'è il volume
                a cui LUI sente TE. Questo è quanto tu senti lui. */}
            <Text style={styles.sheetTitle}>Voce dell’altro</Text>
            <View style={styles.sheetRow}>
              <TouchableOpacity
                style={styles.passo}
                onPress={() => onGuadagno?.(-1)}>
                <Text style={styles.passoSegno}>−</Text>
              </TouchableOpacity>
              <Text style={styles.passoValore}>
                {guadagnoAltro === 0
                  ? 'muto'
                  : `${Math.round((guadagnoAltro ?? 1) * 100)}%`}
              </Text>
              <TouchableOpacity
                style={styles.passo}
                onPress={() => onGuadagno?.(+1)}>
                <Text style={styles.passoSegno}>+</Text>
              </TouchableOpacity>
            </View>
            {showStats && volumeSistema && volumeSistema.max > 0 ? (
              // Le due metà, per chi guarda i numeri: il volume di
              // chiamata del telefono e quanto Duetto ci moltiplica
              // sopra. Il totale è la percentuale qui sopra.
              <Text style={styles.sheetMeta}>
                telefono {volumeSistema.volume}/{volumeSistema.max}
                {volumeSistema.volume >= volumeSistema.max && (guadagnoAltro ?? 1) > 1
                  ? `  ·  Duetto ×${(guadagnoAltro ?? 1).toFixed(2).replace(/0$/, '')}`
                  : ''}
              </Text>
            ) : null}
            <Text style={styles.sheetHint}>
              È il volume a cui stai sentendo l’altro: il volume di chiamata del
              telefono, e quando quello è al massimo Duetto continua ad alzare
              per conto suo. Funziona anche dove i tasti del volume non cambiano
              niente.
            </Text>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/**
 * Come sta l'altro mentre lo si aspetta, in una riga.
 *
 * "In attesa" vuol dire collegato al server e raggiungibile
 * dall'avviso; "non raggiungibile" vuol dire che il suo telefono al
 * server non è collegato, e allora l'avviso non ha dove andare. Sono le
 * stesse parole della notifica, di proposito: sono la stessa cosa.
 */
function comeSta(nome: string, presente: boolean, staccato = false): string {
  const chi = nome || 'L’altro';
  if (presente) return `${chi} è in attesa`;
  return staccato
    ? `${chi} si è reso non raggiungibile`
    : `${chi} non è raggiungibile`;
}

/**
 * Lo stesso riepilogo, ridotto a quello che sta in un pollice.
 *
 * Serve in Picture-in-Picture: chi ha premuto Indietro non sta
 * leggendo, sta tenendo d'occhio. Una faccia e una parola.
 */
/**
 * Come sta l'altro, in due parole.
 *
 * Sta fuori dai componenti perché la usano in due: il riquadro piccolo
 * della modalità finestrella e l'etichetta del riquadrino vuoto. Due
 * vocabolari diversi per la stessa cosa, nello stesso schermo, sarebbero
 * due cose da imparare invece di una.
 */
function parolaAltro(
  status: PresenceStatus, peerName: string, peerPresent: boolean, peerStaccato: boolean,
): string {
  return status === 'connecting' ? 'mi collego\u2026'
    : status === 'offline' ? 'senza server'
      : status === 'together' ? (peerName || 'c\u2019\u00e8')
        : peerStaccato ? 'si \u00e8 staccato'
          : peerPresent ? 'in attesa' : 'non raggiungibile';
}

function PresenceMini(props: {
  status: PresenceStatus;
  peerName: string;
  peerAvatar: Avatar;
  peerPresent: boolean;
  peerStaccato: boolean;
}) {
  const { status, peerName, peerAvatar, peerPresent, peerStaccato } = props;
  const testo = parolaAltro(status, peerName, peerPresent, peerStaccato);
  const iniziale = peerName.trim().charAt(0).toUpperCase();
  return (
    <View style={styles.miniCard}>
      <View
        style={[
          styles.miniFaccia,
          { backgroundColor: peerAvatar.color + '33', borderColor: peerAvatar.color },
        ]}>
        <Text style={styles.miniSimbolo}>{iniziale || peerAvatar.symbol}</Text>
      </View>
      <Text style={styles.miniTesto} numberOfLines={1}>{testo}</Text>
    </View>
  );
}

function PresenceCard(props: {
  status: PresenceStatus;
  linked: boolean;
  connectionState: string;
  peerName: string;
  peerAvatar: Avatar;
  peerAudio: boolean;
  peerPresent: boolean;
  peerStaccato: boolean;
  /** è in attesa perché il telefono gli ha chiuso l'app, non per scelta */
  peerSmontato?: boolean;
  /** il segno dell'uscita audio dell'altro, alla misura del riepilogo */
  segno: React.ReactNode;
  /** il nome dato a questo collegamento, se ce n'è più di uno */
  collegamento?: string;
}) {
  const {
    status, linked, connectionState, peerName, peerAvatar, peerAudio, peerPresent,
    peerStaccato, peerSmontato, segno, collegamento,
  } = props;

  if (status === 'connecting') {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="large" color="#2f7cf6" />
        <Text style={styles.cardTitle}>Mi collego al canale...</Text>
      </View>
    );
  }

  if (status === 'offline') {
    return (
      <View style={styles.card}>
        <Text style={styles.avatarGhost}>{'\u{1F4F6}'}</Text>
        <Text style={styles.cardTitle}>Server irraggiungibile</Text>
        <Text style={styles.cardSub}>Riprovo automaticamente...</Text>
      </View>
    );
  }

  if (status === 'alone') {
    return (
      <View style={styles.card}>
        <PeerFace name={peerName} avatar={peerAvatar} live={false} />
        <Text style={styles.cardTitle}>
          Sei nel canale
          {collegamento ? (
            <Text style={styles.cardNome}>{'  '}{collegamento}</Text>
          ) : null}
        </Text>
        <Text style={styles.cardSub}>
          {comeSta(peerName, peerPresent, peerStaccato)}
          {peerPresent && peerSmontato ? (
            // Non è una sua scelta: certi telefoni smontano l'app da
            // soli, anche di notte, e dirlo evita di attribuirgli una
            // decisione che non ha preso.
            <>
              {': il suo telefono gli ha chiuso l’app.'}
              {'\n'}L’avviso gli arriva lo stesso. Tocca{' '}
              <Text style={styles.bold}>Avvisa</Text> per farglielo sapere.
            </>
          ) : peerPresent ? (
            <>
              {': non è nel canale, ma l’avviso gli arriva.'}
              {'\n'}Tocca <Text style={styles.bold}>Avvisa</Text> per farglielo sapere.
            </>
          ) : peerStaccato ? (
            <>
              {': ha staccato Duetto di proposito.'}
              {'\n'}Tornerà raggiungibile quando riaprirà l’app.
            </>
          ) : (
            <>
              {': il suo telefono non è collegato.'}
              {'\n'}Finché non torna, l’avviso non può raggiungerlo.
            </>
          )}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <PeerFace name={peerName} avatar={peerAvatar} live />
      <Text style={styles.cardTitle}>{peerName || 'L’altro'} è nel canale</Text>
      {/* La riga qui sotto dice già se ha il microfono muto, ma non da
          dove gli esce il suono: il segno lo aggiunge senza allungarla. */}
      {linked ? <View style={styles.cardSegno}>{segno}</View> : null}
      <Text style={styles.cardSub}>
        {linked
          ? (peerAudio ? 'Audio collegato · video non attivo' : 'Ha il microfono muto')
          : connectionState === 'failed'
            ? 'Collegamento diretto non riuscito.\nSenza un server TURN certe reti lo impediscono.'
            : 'Sto stabilendo la connessione diretta…'}
      </Text>
      {/* Lo stato grezzo aiuta a capire dove si è fermato. */}
      {linked ? null : (
        <Text style={styles.cardTiny}>stato: {connectionState}</Text>
      )}
    </View>
  );
}

/**
 * La faccia dell'altro quando non c'è il suo video.
 *
 * Chi non ha messo un nome prima vedeva un punto interrogativo, che sembra
 * un errore. Al suo posto un'immagine generata dalla coppia: sempre la
 * stessa, quindi diventa "lui" invece di essere un segnaposto.
 *
 * Il nome, se c'è, vince: l'iniziale dice più di un disegno.
 */
/**
 * Risoluzione e banda davvero in gioco, sotto ai comandi.
 *
 * Il profilo scelto è un tetto, non una promessa: quanto passa davvero
 * dipende dalla rete e dalla scena, e sapere che si sta mandando 1080p
 * mentre si riceve 640x352 spiega in un colpo d'occhio perché l'immagine
 * dell'altro è brutta - senza dover leggere un log.
 */
function StatsLine({ stats, quality, mostraSu, mostraGiu, versioni }: {
  stats: VideoStats;
  quality: string;
  /** camere davvero accese: le statistiche restano indietro di un campione */
  mostraSu: boolean;
  mostraGiu: boolean;
  /** avviso sulle versioni diverse, o `null` se sono uguali */
  versioni?: string | null;
}) {
  const fmt = (v?: { w: number; h: number; fps: number; kbps: number | null }) => {
    if (!v || !v.w || !v.h) return null;
    // In byte al secondo: è l'unità con cui si guarda il consumo di dati,
    // ed è anche più corta da leggere di sfuggita sotto ai pulsanti.
    const kBs = v.kbps === null ? null : v.kbps / 8;
    const banda = kBs === null ? '' :
      kBs >= 1000 ? `·${(kBs / 1000).toFixed(1)}MB/s` : `·${Math.round(kBs)}kB/s`;
    return `${v.w}×${v.h}·${v.fps}fps${banda}`;
  };
  // Spegnendo una camera il suo flusso RTP resta fra le statistiche con
  // le ultime dimensioni viste: senza questo filtro la riga continuerebbe
  // a dichiarare una risoluzione che non sta più passando.
  const su = mostraSu ? fmt(stats.out) : null;
  const giu = mostraGiu ? fmt(stats.in) : null;
  // Il profilo si mostra sempre, anche a video spento: è la scelta che
  // spiega i numeri accanto, e senza sembrerebbero venire dal nulla.
  /**
   * Da dove passa il traffico.
   *
   * Con i due telefoni su reti diverse è il dato che spiega tutto il
   * resto: se la banda è asimmetrica o l'immagine è brutta, "relay" dice
   * subito che è la strada e non il telefono. Leggerlo dal log a casa
   * dell'altra persona non è praticabile.
   */
  // La latenza vale anche senza video: si mostra insieme al percorso.
  const strada = stats.percorso === 'locale'
    ? 'diretto, stessa rete'
    : stats.percorso === 'diretto'
      ? 'diretto tra i telefoni'
      : stats.percorso === 'relay'
        ? 'passa dal server'
        : null;

  return (
    <>
      <Text
        style={styles.stats}
        numberOfLines={1}
        // Con due video accesi la riga può non starci: meglio
        // rimpicciolirla che vederla tagliata a metà parola.
        adjustsFontSizeToFit
        minimumFontScale={0.6}>
        {`Risoluzione: ${quality.toLowerCase()}`}
        {su ? `  \u2191${su}` : ''}
        {giu ? `  \u2193${giu}` : ''}
      </Text>
      {versioni ? (
        <Text style={[styles.stats, styles.statsAvviso]} numberOfLines={1}>
          {versioni}
        </Text>
      ) : null}
      {strada || stats.audioKbps != null || stats.latenza != null ? (
        // Come la riga sopra: con la latenza in coda finiva fuori dallo
        // schermo, e una riga tagliata a metà numero non dice niente.
        <Text
          style={styles.stats}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}>
          {strada ? `Collegamento: ${strada}` : ''}
          {stats.audioKbps != null
            ? `${strada ? '   ' : ''}audio ${stats.audioKbps} kbit/s`
            : ''}
          {stats.latenza != null ? `   latenza a/r ${stats.latenza} ms` : ''}
        </Text>
      ) : null}
    </>
  );
}

function PeerFace({ name, avatar, live }: { name: string; avatar: Avatar; live: boolean }) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <View
      style={[
        styles.avatar,
        { backgroundColor: avatar.color + '33', borderColor: avatar.color },
        live && styles.avatarLive,
      ]}>
      {initial
        ? <Text style={styles.avatarText}>{initial}</Text>
        : <Text style={styles.avatarSymbol}>{avatar.symbol}</Text>}
    </View>
  );
}

/**
 * Un comando rotondo, e la firma del tocco che lo ha premuto.
 *
 * Il diario registra ogni pressione con il punto dello schermo e quanto
 * e' durato il contatto, perche' su un telefono lontano e' l'unico modo
 * di sapere COSA e' arrivato all'app. Serve a una domanda precisa: da
 * giorni compaiono uscite dal canale che nessuno ha premuto, e nel
 * codice quella riga ha una sorgente sola, il tocco su questo pulsante.
 * Un dito lascia una firma riconoscibile - coordinate un po' diverse
 * ogni volta, contatto di decine o centinaia di millisecondi - che un
 * tocco sintetico o un fantasma del digitalizzatore non hanno.
 */
function CircleButton(props: {
  label: string;
  icon: React.ReactNode;
  /** lo schermo è coperto: si segna accanto al tocco */
  coperto?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  /** piccolo simbolo d'angolo: usato per l'uscita audio attiva */
  badge?: (p: { size?: number; color?: string }) => JSX.Element;
  active?: boolean;
  highlight?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const giu = useRef<{ t: number; x: number; y: number } | null>(null);
  const firma = (che: string) => {
    const g = giu.current;
    const x = Math.round(g?.x ?? -1);
    const y = Math.round(g?.y ?? -1);
    const durata = g ? Date.now() - g.t : -1;
    Diario.segna(
      `comando:${che} ${x},${y} dopo ${durata}ms coperto=${props.coperto ? 'si' : 'no'}`,
    ).catch(() => { /* noop */ });
  };

  return (
    <TouchableOpacity
      style={styles.ctrlItem}
      onPressIn={(e) => {
        giu.current = {
          t: Date.now(),
          x: e.nativeEvent.pageX,
          y: e.nativeEvent.pageY,
        };
      }}
      onPress={() => {
        firma(props.label.toLowerCase());
        props.onPress();
      }}
      onLongPress={props.onLongPress
        ? () => { firma(`${props.label.toLowerCase()}-lungo`); props.onLongPress?.(); }
        : undefined}
      delayLongPress={350}
      disabled={props.disabled}
      activeOpacity={0.6}>
      {/* Il simbolo d'angolo sta FUORI dalla pastiglia, che ritaglia
          quello che contiene: dentro, sporgendo, verrebbe tagliato a
          metà. La scatola tiene i due insieme. */}
      <View style={styles.circleBox}>
        <View
          style={[
            styles.circle,
            // Come su Discord: l'icona sta nuda sul pannello, e prende uno
            // sfondo solo quando la funzione è spenta o va evidenziata.
            props.danger
              ? styles.circleDanger
              : props.highlight
                ? styles.circleHighlight
                : props.active === true
                  ? styles.circleOn
                  : null,
            props.disabled && styles.circleDisabled,
          ]}>
          {props.icon}
        </View>
        {props.badge ? (
          <View style={[styles.miniBadge, props.disabled && styles.circleDisabled]}>
            <props.badge size={13} color="#e6ebf1" />
          </View>
        ) : null}
      </View>
      <Text style={styles.ctrlLabel}>{props.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0e14' },

  card: { alignItems: 'center', paddingHorizontal: 32 },
  avatar: {
    width: 108, height: 108, borderRadius: 54,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 3,
  },
  /** il colore proprio resta: dentro il canale cambia solo l'anello */
  avatarLive: { borderColor: '#38d16a' },
  avatarText: { color: '#e6ebf1', fontSize: 42, fontWeight: '700' },
  avatarSymbol: { fontSize: 52 },
  statsBox: { height: 36, justifyContent: 'center' },
  /** con l'avviso sulle versioni le righe diventano tre */
  statsBoxTre: { height: 54 },
  /**
   * Le righe tecniche devono restare leggibili anche attenuate.
   *
   * Erano di un grigio da nota a piè di pagina: giusto a pieno schermo,
   * illeggibile appena i comandi cominciano a farsi da parte, perché
   * l'attenuazione moltiplica quel poco contrasto che c'era. Ora sono
   * di un grigio chiaro, con un'ombra scura sotto che le stacca anche
   * quando il pannello dietro è quasi sparito.
   */
  stats: {
    color: '#c9d2de', fontSize: 11, textAlign: 'center',
    letterSpacing: 0.2, lineHeight: 16,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  /** giallo da avviso: è l'unica riga tecnica che chiede di essere letta */
  statsAvviso: { color: '#e8b33a', fontWeight: '700' },
  avatarGhost: { fontSize: 54, marginBottom: 16 },
  cardTitle: { color: '#e6ebf1', fontSize: 21, fontWeight: '700', textAlign: 'center' },
  cardSub: { color: '#8892a0', fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 22 },
  bold: { color: '#c9d2de', fontWeight: '700' },
  // Come l'avviso di VideoStage: una pastiglia al centro, non una fascia,
  // così sotto resta visibile il più possibile dell'immagine.
  uscendoSopra: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,14,20,0.82)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  uscendoTesto: {
    color: '#e6ebf1', fontSize: 16, fontWeight: '600',
  },
  volumeSopra: {
    position: 'absolute', left: 0, right: 0, top: '46%', alignItems: 'center',
  },
  volumeTesto: {
    color: '#e6ebf1', fontSize: 15, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 18, overflow: 'hidden',
    paddingVertical: 10, paddingHorizontal: 20,
  },
  volumeCifra: { color: '#7cc4ff', fontWeight: '800' },
  notiziaSopra: {
    position: 'absolute',
    backgroundColor: 'rgba(20,26,36,0.94)', borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1, borderColor: '#2f7cf6',
  },
  notiziaTesto: { color: '#e6ebf1', fontSize: 14.5, lineHeight: 20 },
  notiziaVia: { color: '#6b7686', fontSize: 12, marginTop: 6 },
  attesaSopra: {
    position: 'absolute', left: 0, right: 0, top: '42%',
    alignItems: 'center', paddingHorizontal: 24,
  },
  attesaTesto: {
    color: '#e6ebf1', fontSize: 15, textAlign: 'center', lineHeight: 21,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20,
    paddingVertical: 10, paddingHorizontal: 18, overflow: 'hidden',
  },
  cardTiny: { color: '#4a5462', fontSize: 12, marginTop: 10 },
  cardSegno: { marginTop: 12 },
  cardSegnoRiga: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardVolume: { color: '#7d8794', fontSize: 13 },

  miniCard: { alignItems: 'center', paddingHorizontal: 10 },
  miniFaccia: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  miniSimbolo: { color: '#e6ebf1', fontSize: 15, fontWeight: '700' },
  miniTesto: { color: '#c9d2de', fontSize: 11, fontWeight: '600' },

  topBar: {
    position: 'absolute', top: 14, left: 14, right: 14,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  chiRiga: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8 },
  chiBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  chiText: { color: '#e6ebf1', fontSize: 12.5, fontWeight: '700' },
  /** il nome del collegamento: è un nome, non una parola dell'app */
  badgeNome: { fontStyle: 'italic' },
  /** lo stesso nome, nel riepilogo al centro */
  cardNome: { fontStyle: 'italic', fontWeight: '400', color: '#9fb4c8' },
  /** le due metà del livello, sotto al numero, con le righe tecniche */
  sheetMeta: {
    color: '#7d8794', fontSize: 12.5, textAlign: 'center', marginTop: 2,
  },
  /** la pastiglia dell'audio proprio: c'è ma non compete con la prima */
  chiBadgeAudio: { backgroundColor: 'rgba(0,0,0,0.42)' },
  chiTextTenue: { color: '#9fb4c8', fontSize: 12, fontWeight: '600' },
  /** la percentuale accanto al segno dell'uscita, quando le righe
   *  tecniche sono accese */
  pastigliaVolume: { color: '#9fb4c8', fontSize: 11, fontWeight: '700' },
  badge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18,
  },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 7 },
  dotGreen: { backgroundColor: '#38d16a' },
  dotGrey: { backgroundColor: '#6b7686' },
  badgeText: { color: '#e6ebf1', fontSize: 13, fontWeight: '600' },
  spacer: { flex: 1 },
  gear: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  gearText: { color: '#e6ebf1', fontSize: 17 },
  version: { color: 'rgba(230,235,241,0.45)', fontSize: 10 },
  miniBadge: {
    position: 'absolute', right: -4, bottom: -4,
    backgroundColor: '#1e1f22', borderRadius: 10, padding: 2,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.45)',
  },
  sheetBack: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end', padding: 16,
  },
  sheet: {
    backgroundColor: '#151a23', borderRadius: 16, padding: 8, paddingBottom: 16,
    borderWidth: 1, borderColor: '#252c38',
  },
  sheetTitle: {
    color: '#8892a0', fontSize: 13, fontWeight: '700',
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8,
  },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 14, paddingVertical: 15, borderRadius: 12,
  },
  sheetIcon: { fontSize: 20 },
  sheetLabel: { color: '#c9d2de', fontSize: 17, flex: 1 },
  sheetText: { flex: 1 },
  sheetNota: { color: '#6b7686', fontSize: 12.5, marginTop: 2 },
  sheetLabelOn: { color: '#7cc4ff', fontWeight: '700' },
  sheetCheck: { color: '#7cc4ff', fontSize: 18, fontWeight: '700' },
  passo: {
    width: 52, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1e2531', borderWidth: 1, borderColor: '#2f3846',
  },
  passoSegno: { color: '#e6ebf1', fontSize: 22, fontWeight: '700' },
  passoValore: {
    flex: 1, textAlign: 'center',
    color: '#7cc4ff', fontSize: 19, fontWeight: '800',
  },
  sheetHint: {
    color: '#5a6472', fontSize: 12, paddingHorizontal: 14, paddingTop: 6, lineHeight: 17,
  },

  panel: {
    position: 'absolute', bottom: 8, left: 12, right: 12,
    backgroundColor: 'rgba(30,31,34,0.94)',
    borderRadius: 28,
    paddingTop: 14, paddingBottom: 14, paddingHorizontal: 4,
  },
  // La linguetta in cima, come nei pannelli che si trascinano.

  controls: {
    flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start',
  },
  ctrlItem: { alignItems: 'center', flex: 1 },
  /**
   * La pastiglia di ogni comando.
   *
   * I quattro angoli sono dichiarati uno per uno, e la pastiglia ritaglia
   * quello che contiene. Con il solo `borderRadius` il pulsante del video
   * si vedeva quadrato quando si accendeva - solo quello, solo acceso -
   * e su Android succede: il fondo viene ridisegnato mentre la camera si
   * apre, e in quel ridisegno il raggio si perde. Dichiararli tutti e
   * quattro e ritagliare toglie di mezzo la strada che lo perdeva.
   */
  circleBox: { width: 48, height: 48 },
  circle: {
    width: 48, height: 48,
    borderRadius: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  // Spento: sfondo chiaro, come Discord segnala il microfono in muto.
  circleOn: { backgroundColor: 'rgba(255,255,255,0.92)' },
  circleHighlight: { backgroundColor: '#2f7cf6' },
  circleDanger: { backgroundColor: '#da373c' },
  circleDisabled: { opacity: 0.35 },
  circleIcon: { fontSize: 22 },
  ctrlLabel: {
    color: 'rgba(255,255,255,0.72)', marginTop: 6, fontSize: 10, fontWeight: '600',
  },
});
