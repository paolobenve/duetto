import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StatusBar, Platform, PermissionsAndroid, Alert, View, AppState,
  ActivityIndicator, StyleSheet, BackHandler, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MediaStream } from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import {
  Foreground, Pip, AppWindow, Visibility, Codecs, Audio, Avvisi, Diario, Volume,
  Sveglia,
} from 'duetto-platform';
import {
  DuoConfig, PairInfo, loadConfig, saveConfig,
  isServerConfigured, isPaired, VIDEO_PROFILES,
  registraCoppia, passaACoppia, dimenticaCoppia, ricordaNomeCoppia,
  allineaServerCoppia, rinominaCoppia, chiaveCoppia, nomeCoppia,
} from './config';
import { Signaling, PresenceStatus, Mode } from './signaling';
import { VERSION } from './version';
import { ChannelSession } from './webrtc';
import type { VideoStats } from './webrtc';
import SettingsScreen from './SettingsScreen';
import SetupScreen from './SetupScreen';
import PairingScreen from './PairingScreen';
import ChannelScreen from './ChannelScreen';
import { caricaPosizionePip } from './VideoStage';
import { useAudioRoute } from './audioRoute';
import { stopListening, testoPresenza, fraseMorte } from './presence';
import { avatarFor, peerAvatar } from './avatar';

// Nessuna schermata intermedia: o si configura, o ci si accoppia, o si è
// nel canale. Aprire l'app - da icona o da notifica - significa entrarci.
type Screen = 'loading' | 'settings' | 'pairing' | 'setup' | 'channel';

/**
 * Quanto si tiene il posto all'altro quando gli cade la rete.
 *
 * Sparire e ricomparire in pochi secondi è il caso normale di un cambio
 * di rete: smontargli il posto addosso vuol dire rimontarlo un attimo
 * dopo, e chi guarda vede il proprio video salire a schermo intero e
 * tornare indietro per niente. Se invece è uscito lui, non si aspetta
 * nulla: quello lo dice il server, che distingue il saluto dalla caduta.
 */
const ATTESA_RITORNO_MS = 6000;

/**
 * Ogni quanto il proprio diario dei consumi va all'altro telefono.
 *
 * Cinque minuti, cioè il passo con cui le righe si scrivono: ne parte
 * una alla volta, un paio di centinaia di byte. Costava poco anche a
 * ogni ora, ma un diario che arriva subito serve a capire cos'è appena
 * successo dall'altra parte - un'app sparita, per esempio - mentre uno
 * che arriva con un'ora di ritardo racconta una storia già vecchia. E
 * parte solo mentre si è collegati, cioè quando la rete è già in uso.
 */
const SCAMBIO_DIARIO_MS = 5 * 60 * 1000;

/**
 * Quante righe di diario sono già state mandate, per collegamento.
 *
 * Il conto non può essere uno solo: con più collegamenti, le righe
 * spedite a uno risulterebbero spedite anche all'altro, che non le
 * riceverebbe mai. Ognuno ha il suo segnaposto.
 *
 * La chiave vecchia, unica, fa da punto di partenza per chi c'era già:
 * senza, il primo scambio dopo l'aggiornamento rimanderebbe da capo
 * mesi di righe che l'altro ha già.
 */
const CHIAVE_DIARIO_INVIATE = 'duetto.diario.inviate';
const chiaveInviate = (id: string) => `${CHIAVE_DIARIO_INVIATE}.${id}`;

/** L'ultima morte già raccontata all'altro telefono: non si ripete. */
const CHIAVE_MORTE_RACCONTATA = 'duetto.morte.raccontata';

/**
 * Quanto alzare la voce dell'altro quando il telefono non ubbidisce.
 *
 * Su parecchi modelli il volume di chiamata in vivavoce è inchiodato al
 * massimo dal produttore: i tasti sembrano rotti e la voce resta
 * assordante. Allora ci pensa WebRTC, moltiplicando il segnale prima
 * che esca.
 *
 * Il passo è di un quarto: dieci pressioni per dimezzare o raddoppiare,
 * che è la sensibilità di una manopola vera. Sotto un quarto non si
 * scende - a quel punto è più onesto spegnere il microfono - e sopra il
 * quadruplo non si sale, che è già oltre il punto in cui la voce
 * comincia a distorcere.
 */
const GUADAGNO_PASSO = 0.25;
const GUADAGNO_MIN = 0.25;
const GUADAGNO_MAX = 4;
const CHIAVE_GUADAGNO = 'duetto.volume.altro';



/**
 * Ogni quanto si torna a chiedere se l'altro c'è, mentre lo si aspetta.
 *
 * Il server annuncia i cambiamenti, ma la caduta di chi sta soltanto in
 * ascolto la scopre con comodo - il suo battito è di quattro minuti, ed
 * è così apposta, per non tenere sveglia la radio tutta la notte. Fino
 * ad allora la riga direbbe "in ascolto" di qualcuno che non c'è più.
 *
 * Fitto all'inizio, quando si è appena entrati e si sta guardando lo
 * schermo aspettando; rado dopo un quarto d'ora, quando l'attesa è
 * diventata un sottofondo e nessuno sta più fissando quella riga. Una
 * domanda ogni cinque minuti costa quanto un battito: è il risveglio
 * della radio a costare, non i venti byte.
 */
const PRESENZA_FITTA_MS = 60 * 1000;
const PRESENZA_RADA_MS = 5 * 60 * 1000;
const PRESENZA_PAZIENZA_MS = 15 * 60 * 1000;

/**
 * Chiede TUTTI i permessi in un colpo solo, al primo avvio.
 *
 * Nota: da Android 6 microfono, camera e notifiche sono "runtime
 * permissions" e il sistema NON permette di concederle al momento
 * dell'installazione. Chiederle tutte insieme è la cosa più vicina:
 * dopo la prima volta Android non le richiede più.
 */
async function requestAllPermissions(): Promise<{ mic: boolean; camera: boolean }> {
  if (Platform.OS !== 'android') return { mic: true, camera: true };

  const wanted: any[] = [
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    PermissionsAndroid.PERMISSIONS.CAMERA,
  ];
  if (Number(Platform.Version) >= 33) {
    wanted.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }
  try {
    const res = await PermissionsAndroid.requestMultiple(wanted);
    return {
      mic: res[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === 'granted',
      camera: res[PermissionsAndroid.PERMISSIONS.CAMERA] === 'granted',
    };
  } catch {
    return { mic: false, camera: false };
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [cfg, setCfg] = useState<DuoConfig | null>(null);
  const [inChannel, setInChannel] = useState(false);
  /** dove tornare chiudendo la schermata delle impostazioni di sistema */
  const [setupFrom, setSetupFrom] = useState<'avvio' | 'impostazioni'>('avvio');

  const [status, setStatus] = useState<PresenceStatus>('connecting');
  const [peerPresent, setPeerPresent] = useState(false);
  /**
   * Raggiungibili o staccati del tutto.
   *
   * Uscendo dal canale si resta normalmente in ascolto: è il senso
   * dell'app, esserci senza tenere lo schermo acceso. Ma qualche volta
   * si vuole proprio non esserci - e allora non basta uscire, bisogna
   * togliere la presenza: niente connessione, niente notifica fissa,
   * niente avvisi, e all'altro si risulta non raggiungibile, che è la
   * verità.
   *
   * Dura finché non si riapre l'app: riaprirla è già dire "ci sono".
   */
  const [disponibile, setDisponibile] = useState(true);
  /**
   * La prossima chiusura è un addio, non un passaggio di mano.
   *
   * Lo alza chi se ne va di proposito - "renditi non disponibile", o lo
   * scioglimento di un collegamento - e lo abbassa la chiusura stessa.
   */
  const salutiamo = useRef(false);
  /**
   * L'ultima notizia da mostrare dentro l'app.
   *
   * Fuori c'è la notifica silenziosa, ma chi sta guardando questa
   * schermata la tendina non la apre: la stessa frase va messa anche
   * qui, dove l'occhio è già.
   */
  const [avviso, setAvviso] = useState<string | null>(null);
  /** quanto stiamo alzando la voce dell'altro, 1 = com'è arrivata */
  const [guadagno, setGuadagno] = useState(1);
  /** mostrato per un attimo mentre si preme: sennò non si vede l'effetto */
  const [guadagnoVisibile, setGuadagnoVisibile] = useState(false);
  const timerGuadagno = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * L'altro se n'è andato di proposito, non gli è caduta la linea.
   *
   * Il server distingue le due cose - chi saluta e chi sparisce - e la
   * differenza conta per chi resta: da un tunnel si esce, da una scelta
   * no. "Non raggiungibile" per uno che ha staccato apposta suonerebbe
   * come un guasto da aspettare.
   */
  const [peerStaccato, setPeerStaccato] = useState(false);
  const [peerName, setPeerName] = useState('');
  const [connState, setConnState] = useState('new');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(false);
  const [localAspect, setLocalAspect] = useState<number | undefined>(undefined);
  /** la camera si accende sempre frontale: da lì in poi lo si segue */
  const [cameraFrontale, setCameraFrontale] = useState(true);
  const [peerState, setPeerState] = useState<{
    audio: boolean; video: boolean; aspect?: number;
    /** da dove esce il suono dall'altra parte: lo dichiara lui */
    uscita?: string;
    /** quale Duetto ha di là; assente se è più vecchio di questo campo */
    versione?: string;
  }>({ audio: true, video: false });
  /**
   * Se l'altro ci ha già detto come sta.
   *
   * Prima che arrivi il suo primo stato non si sa niente di lui, e
   * l'assenza della versione non vuol dire "ha una build vecchia": vuol
   * dire solo che non ha ancora parlato.
   */
  const [peerVisto, setPeerVisto] = useState(false);
  /** VP9 in hardware: nostro e dell'altro. L'opzione si mostra solo con entrambi. */
  const [localVp9, setLocalVp9] = useState(false);
  const [peerVp9, setPeerVp9] = useState(false);
  /** risoluzione e banda effettive, mostrate sotto ai comandi */
  const [videoStats, setVideoStats] = useState<VideoStats>({});
  const [knockPending, setKnockPending] = useState(false);
  /** traccia video dell'altro effettivamente in arrivo (non solo annunciata) */
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  /**
   * Cambia a ogni ripartenza del video dell'altro. Serve come chiave di
   * React: costringe a ricreare il visualizzatore invece di riagganciarlo
   * a una superficie vecchia, che resterebbe nera.
   */
  const [remoteVideoKey, setRemoteVideoKey] = useState(0);

  const signalingRef = useRef<Signaling | null>(null);
  const sessionRef = useRef<ChannelSession | null>(null);
  const politeRef = useRef(false);
  const peerActiveRef = useRef(false);
  const cameraGranted = useRef(false);
  const inChannelRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  /** enterChannel serve dentro un effetto che nasce prima di lei */
  const enterChannelRef = useRef<(() => void) | null>(null);
  /** relay comunicato dal server, valido finché dura la connessione */
  const serverTurnRef = useRef<any[]>([]);
  /** attesa prima di ricostruire un collegamento caduto */
  /** attesa prima della riparazione leggera del collegamento */
  const softTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** attesa prima di ricostruirlo del tutto, se la leggera non basta */
  const hardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** stato corrente del collegamento, leggibile dentro i timer */
  const connStateRef = useRef('new');
  /**
   * La connessione al server è caduta da quando eravamo collegati.
   *
   * Serve perché un'offerta mandata mentre il server è irraggiungibile
   * viene scartata in silenzio: al ritorno va rifatta, anche se dal
   * nostro lato la connessione sembrasse appena creata e quindi sana.
   */
  const signalingWasDown = useRef(false);
  /** il video dell'altro c'era già: serve a non ricrearne la vista invano */
  const avevaVideoRemoto = useRef(false);
  /** si è già ritentata una strada migliore su questo collegamento */
  const relayRiprovato = useRef(false);

  const clearRecovery = useCallback(() => {
    if (softTimer.current) { clearTimeout(softTimer.current); softTimer.current = null; }
    if (hardTimer.current) { clearTimeout(hardTimer.current); hardTimer.current = null; }
  }, []);

  const audio = useAudioRoute(inChannel);

  /**
   * L'altro deve sapere da dove stiamo ascoltando.
   *
   * È l'informazione che a voce ci si chiede di continuo - "sei in
   * vivavoce?" - e il telefono la sa già. Si manda a ogni cambio, e non
   * costa nulla: è un campo in più nel messaggio di stato che parte
   * comunque.
   */
  useEffect(() => {
    sessionRef.current?.setUscita(audio.route);
  }, [audio.route, inChannel]);

  /**
   * Come si chiama l'altro: come si è chiamato lui, o niente.
   *
   * Il nome del collegamento non c'entra - quello è il nome del filo,
   * non della persona - e infatti non compare qui: se l'altro un nome
   * non se l'è dato, resta "l'altro", e a dire in quale collegamento
   * siete ci pensa l'etichetta, per conto suo.
   */
  const shownName =
    peerName && peerName !== 'Qualcuno'
      ? peerName
      : cfg?.pair?.peerName && cfg.pair.peerName !== 'Qualcuno'
        ? cfg.pair.peerName
        : '';

  /**
   * Due Duetto diversi ai capi dello stesso canale.
   *
   * È la spiegazione di metà delle stranezze - una cosa che qui c'è e lì
   * no, un pulsante che si comporta in due modi - e finora bisognava
   * chiederselo a voce. Si dice solo quando c'è qualcosa da dire: con le
   * versioni uguali, silenzio.
   *
   * Una build più vecchia del campo stesso non lo manda: allora non si
   * sa quale sia, ma si sa che è più vecchia di questa, ed è già la
   * cosa che conta.
   */
  /**
   * Che versione ha l'altro, scritta nel diario una volta per sessione.
   *
   * Serve quando qualcosa non torna sul telefono lontano: metà delle
   * volte la spiegazione è che lì gira una versione di due settimane fa,
   * e senza questa riga bisogna chiederlo a voce e fidarsi della
   * risposta. Va nel diario nostro, che a un cavo ci arriva.
   */
  const versioneAltroVista = useRef('');
  useEffect(() => {
    const v = peerState.versione;
    if (!v || v === versioneAltroVista.current) return;
    versioneAltroVista.current = v;
    Diario.segna(`altro-versione:${v}`).catch(() => { /* noop */ });
  }, [peerState.versione]);

  const avvisoVersione = React.useMemo(() => {
    if (!peerVisto) return null;
    const sua = peerState.versione;
    if (!sua) return `Versioni diverse: qui ${VERSION}, di là una più vecchia`;
    if (sua === VERSION) return null;
    return `Versioni diverse: qui ${VERSION}, di là ${sua}`;
  }, [peerVisto, peerState.versione]);

  /**
   * Il guadagno si riapplica a ogni cambiamento e a ogni rientro nel
   * canale: la sessione può essere nata dopo che il valore era già lì.
   */
  useEffect(() => {
    sessionRef.current?.setRemoteGain(guadagno);
  }, [guadagno, inChannel]);

  /**
   * I tasti del volume che il sistema non ha saputo muovere.
   *
   * Arrivano solo in quel caso - il volume di chiamata al suo limite - e
   * allora la voce dell'altro la alza l'app. L'indicatore si mostra
   * perché senza, premendo, non succederebbe niente di visibile e i
   * tasti sembrerebbero rotti lo stesso.
   */
  /**
   * Alza o abbassa la voce dell'altro di un passo.
   *
   * La chiamano in due: i tasti del volume, quando il telefono non li
   * ubbidisce, e il menu dell'audio, dove c'è per chi quei tasti non li
   * vede muovere niente comunque - certi telefoni fanno scorrere
   * l'indice del volume di chiamata senza che all'orecchio cambi nulla,
   * e da fuori quel caso è indistinguibile da uno che funziona.
   */
  const cambiaGuadagno = useCallback((direzione: number) => {
    if (!direzione) return;
    setGuadagno((g) => {
      const nuovo = Math.min(
        GUADAGNO_MAX,
        Math.max(GUADAGNO_MIN, Math.round((g + direzione * GUADAGNO_PASSO) * 100) / 100),
      );
      if (nuovo !== g) AsyncStorage.setItem(CHIAVE_GUADAGNO, String(nuovo)).catch(() => {});
      return nuovo;
    });
    setGuadagnoVisibile(true);
    if (timerGuadagno.current) clearTimeout(timerGuadagno.current);
    timerGuadagno.current = setTimeout(() => setGuadagnoVisibile(false), 1800);
  }, []);

  useEffect(() => {
    if (!inChannel) return;
    Volume.prendiTasti(true).catch(() => {});
    const stop = Volume.subscribe(cambiaGuadagno);
    return () => {
      stop();
      Volume.prendiTasti(false).catch(() => {});
    };
  }, [inChannel, cambiaGuadagno]);

  /**
   * Il nome serve anche dentro i gestori della connessione, che nascono
   * una volta sola e non vedrebbero mai un nome arrivato dopo.
   */
  const shownNameRef = useRef(shownName);
  useEffect(() => { shownNameRef.current = shownName; }, [shownName]);

  /**
   * Sotto che nome archiviare il diario che arriva.
   *
   * In un ref perché lo legge il gestore dei messaggi, che nasce una
   * volta sola: cambiando il nome del collegamento, senza questo
   * continuerebbe a scrivere sotto quello vecchio fino al prossimo
   * riaggancio.
   */
  const chiaveDiarioRef = useRef('');
  useEffect(() => { chiaveDiarioRef.current = chiaveCoppia(cfg?.pair); }, [cfg?.pair]);

  /**
   * Il titolo degli avvisi: dice su quale collegamento sono arrivati.
   *
   * Con un collegamento solo non c'è niente da distinguere e resta
   * "Duetto". Con più di uno diventa "Duetto · Casa": senza, un avviso
   * nella barra di stato dice che qualcuno ti cerca ma non quale dei due
   * o tre che conosci, e per scoprirlo devi aprire l'app.
   *
   * In un ref perché lo legge il gestore dei messaggi, che nasce una
   * volta sola e non vedrebbe mai un nome cambiato dopo.
   */
  const titoloAvvisoRef = useRef('Duetto');
  useEffect(() => {
    const nome = cfg && cfg.pairs.length > 1 ? nomeCoppia(cfg.pair) : '';
    titoloAvvisoRef.current = nome ? `Duetto \u00b7 ${nome}` : 'Duetto';
  }, [cfg]);

  /**
   * Il nome di questo collegamento, se gliene ho dato uno.
   *
   * Si mostra dov'è utile sapere in quale collegamento si sta: sulla
   * pastiglia in alto, al posto del nome dell'app, e in testa alla
   * notifica fissa. Senza nome non compare niente: chi ha un
   * collegamento solo non ha nulla da distinguere.
   */
  const collegamento = cfg?.pair?.etichetta || '';

  /**
   * L'immagine da mostrare al posto del video dell'altro.
   *
   * Dipende solo dalla coppia, quindi non cambia mai; prima del primo
   * accoppiamento non serve a nulla, ma un valore deve esserci.
   */
  const face = React.useMemo(
    () => (cfg?.pair ? peerAvatar(cfg.pair.id, cfg.pair.side) : avatarFor('duetto')),
    [cfg?.pair],
  );

  useEffect(() => { inChannelRef.current = inChannel; }, [inChannel]);

  /**
   * Cosa dice la notifica fissa.
   *
   * Serve a chi guarda la barra senza aprire l'app, e finora diceva solo
   * come stava questo telefono. Ma la domanda vera è sull'altro: se è
   * in attesa basta bussargli, se non è raggiungibile non c'è niente da
   * fare se non aspettare. Stesse parole della schermata di attesa.
   */
  const testoNotifica = React.useMemo(() => testoPresenza({
    inChannel,
    peerActive: status === 'together',
    peerPresent,
    staccato: peerStaccato,
    nome: shownName,
    collegamento,
    server: status === 'offline' ? 'giu' : status === 'connecting' ? 'incorso' : 'ok',
  }), [inChannel, status, peerPresent, peerStaccato, shownName, collegamento]);

  /**
   * Il testo serve anche a chi accende il servizio, che parte prima che
   * ci sia qualcosa da dire: senza questo, la prima riga sarebbe quella
   * di partenza e resterebbe finché non cambia qualcos'altro.
   */
  const testoNotificaRef = useRef(testoNotifica);
  /**
   * Scrivere la riga solo quando la presenza c'è davvero.
   *
   * `setText` non si limita a cambiare il testo: passa da
   * `startForegroundService`, e un servizio spento lo riaccende. Senza
   * questo controllo, dichiararsi non disponibili avrebbe fatto
   * ricomparire la notifica un istante dopo averla tolta - e prima
   * ancora di accoppiarsi ne sarebbe comparsa una per una presenza che
   * non esiste.
   */
  const presenzaViva = !!cfg && isPaired(cfg) && isServerConfigured(cfg) && disponibile;
  useEffect(() => {
    testoNotificaRef.current = testoNotifica;
    if (!presenzaViva) return;
    Foreground.setText(testoNotifica).catch(() => { /* noop */ });
  }, [testoNotifica, presenzaViva]);

  /**
   * Ogni tanto si torna a chiedere al server se l'altro c'è.
   *
   * Solo mentre lo si aspetta: appena entra nel canale non serve più
   * chiedere niente, e fuori dal canale non c'è nessuna schermata che
   * lo stia dicendo.
   *
   * Il primo quarto d'ora è quello in cui si sta davvero aspettando,
   * spesso guardando lo schermo: lì una domanda al minuto è poca cosa.
   * Dopo, l'attesa è diventata un sottofondo e si dirada a cinque
   * minuti, che è il passo del battito del server.
   */
  useEffect(() => {
    if (!inChannel || status !== 'alone') return;
    const inizio = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const giro = () => {
      signalingRef.current?.chiediPresenza();
      const atteso = Date.now() - inizio >= PRESENZA_PAZIENZA_MS
        ? PRESENZA_RADA_MS : PRESENZA_FITTA_MS;
      timer = setTimeout(giro, atteso);
    };
    // Non subito: entrando nel canale la risposta del server è appena
    // arrivata, e richiederla nello stesso istante sarebbe chiederla due
    // volte.
    timer = setTimeout(giro, PRESENZA_FITTA_MS);
    return () => clearTimeout(timer);
  }, [inChannel, status]);

  /**
   * Il diario segue lo stato: senza, le righe direbbero quanto è sceso
   * il telefono senza dire cosa stava facendo l'app, che è l'unica cosa
   * che rende quei numeri confrontabili fra loro.
   */
  useEffect(() => {
    const stato = !inChannel ? 'ascolto' : videoOn ? 'canale+video' : 'canale';
    Diario.stato(stato).catch(() => {});
    // Una riga al cambio di stato: segna il confine fra due periodi, e
    // senza confini non si può misurare né l'uno né l'altro.
    Diario.segna(stato).catch(() => {});
  }, [inChannel, videoOn]);

  /**
   * "Sono morta, ed ecco perché."
   *
   * Nessuno può avvisare mentre muore: un processo ucciso dal sistema
   * non riceve nessun preavviso. Ma riaccendendosi il telefono si
   * ricorda com'è andata, e allora lo si dice all'altro - che intanto
   * ha visto sparire una persona e non aveva modo di sapere se fosse un
   * tunnel, un telefono spento o un'app morta.
   *
   * Si racconta una volta sola: la stessa morte raccontata a ogni
   * riconnessione diventerebbe un ritornello.
   */
  const morteDaRaccontare = useRef<{ quando: number; causa: string } | null>(null);

  /**
   * Da quando l'altro non c'è più, e il ritorno da annunciare.
   *
   * Sparire e tornare vanno raccontati tutti e due, ma non a ogni
   * singhiozzo di rete: un'assenza di pochi secondi è un cambio di
   * cella, e dirla sarebbe rumore. Sopra il minuto invece è successo
   * qualcosa, e chi aspettava merita di sapere che è finita.
   *
   * Il ritorno si annuncia con qualche secondo di ritardo, perché se
   * quell'assenza era una morte arriva anche il racconto del perché, e
   * quello dice già tutto: due notizie per lo stesso fatto sono una di
   * troppo.
   */
  const assenteDa = useRef(0);
  const ritornoInArrivo = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ASSENZA_DA_DIRE_MS = 60_000;
  const ATTESA_RACCONTO_MS = 6_000;

  const scordaRitorno = useCallback(() => {
    if (ritornoInArrivo.current) {
      clearTimeout(ritornoInArrivo.current);
      ritornoInArrivo.current = null;
    }
  }, []);

  useEffect(() => {
    if (!peerPresent) {
      if (assenteDa.current === 0) assenteDa.current = Date.now();
      scordaRitorno();
      return;
    }
    const via = assenteDa.current;
    assenteDa.current = 0;
    if (!via || Date.now() - via < ASSENZA_DA_DIRE_MS) return;
    scordaRitorno();
    ritornoInArrivo.current = setTimeout(() => {
      ritornoInArrivo.current = null;
      const chi = shownNameRef.current || 'L’altro';
      const testo = `${chi} è di nuovo raggiungibile.`;
      // Il titolo dice su quale collegamento, come per gli avvisi: con
      // più di uno configurato, "è di nuovo raggiungibile" da solo non
      // dice chi.
      Foreground.nota(titoloAvvisoRef.current, testo).catch(() => {});
      setAvviso(testo);
    }, ATTESA_RACCONTO_MS);
  }, [peerPresent, scordaRitorno]);

  const leggiLaPropriaMorte = useCallback(async () => {
    try {
      const m = await Diario.ultimaMorte();
      if (!m || !m.quando) return;
      // Un aggiornamento dell'app non è una morte: è il modo normale in
      // cui un'app viene sostituita, e annunciarlo sarebbe un allarme
      // per una cosa voluta.
      if (/installPackage|PackageUpdate/i.test(m.descrizione || '')) return;
      const grezzo = await AsyncStorage.getItem(CHIAVE_MORTE_RACCONTATA);
      if (Number(grezzo) >= m.quando) return;
      morteDaRaccontare.current = { quando: m.quando, causa: m.causa };
    } catch { /* se il telefono non lo sa, non lo sa */ }
  }, []);

  useEffect(() => {
    if (!peerPresent) return;
    const da = morteDaRaccontare.current;
    const sig = signalingRef.current;
    if (!da || !sig?.connected) return;
    sig.sendSignal({ kind: 'morte', quando: da.quando, causa: da.causa });
    morteDaRaccontare.current = null;
    AsyncStorage.setItem(CHIAVE_MORTE_RACCONTATA, String(da.quando)).catch(() => {});
  }, [peerPresent, status]);

  /**
   * Ogni tanto il proprio diario va all'altro telefono.
   *
   * Serve a poterli leggere tutti e due collegandone uno solo: l'altro
   * telefono, in mano a un'altra persona, a un cavo non ci arriva mai.
   * Si mandano solo le righe nuove; se il file è stato ruotato e adesso
   * ne ha meno di quante ne avevamo mandate, si riparte da capo.
   */
  useEffect(() => {
    if (!peerPresent) return;
    let vivo = true;

    const manda = async () => {
      const sig = signalingRef.current;
      if (!vivo || !sig?.connected) return;
      const chiave = chiaveInviate(cfg?.pair?.id ?? '');
      try {
        const righe = await Diario.righe();
        const suo = await AsyncStorage.getItem(chiave);
        const vecchio = suo === null
          ? await AsyncStorage.getItem(CHIAVE_DIARIO_INVIATE)
          : null;
        let inviate = Number(suo ?? vecchio) || 0;
        if (inviate > righe) inviate = 0;
        if (righe <= inviate) return;

        const testo = await Diario.leggi(inviate);
        if (!testo) return;
        sig.sendSignal({ kind: 'diario', testo });
        await AsyncStorage.setItem(chiave, String(righe));
      } catch {
        /* il diario non vale un errore in faccia a nessuno */
      }
    };

    // Il primo giro poco dopo essersi trovati, poi ogni cinque minuti.
    // Basta che l'altro sia COLLEGATO, non che siate nel canale: i
    // diari si scambiano anche mentre state solo in attesa.
    const primo = setTimeout(manda, 60_000);
    const timer = setInterval(manda, SCAMBIO_DIARIO_MS);
    return () => { vivo = false; clearTimeout(primo); clearInterval(timer); };
  }, [peerPresent, cfg?.pair?.id]);

  /**
   * Se stiamo passando dal relay, si tenta una volta la strada diretta.
   *
   * ICE non torna indietro da solo: scelta una strada che funziona, non
   * la riconsidera più, nemmeno quando ne ricompare una molto migliore -
   * tornando sul wifi il collegamento continuava a rimbalzare dal server
   * all'infinito. Una rinegoziazione rifà la raccolta dei candidati e fa
   * rivalutare le coppie: se la locale c'è, vince per priorità.
   *
   * Una volta sola per collegamento: se anche così resta il relay, vuol
   * dire che di meglio non c'è, e insistere costerebbe interruzioni.
   */
  useEffect(() => {
    // Il contrassegno NON si azzera qui. Azzerandolo a ogni uscita da
    // "connected" si innescava un ciclo: il tentativo interrompe la
    // connessione, l'interruzione riabilita il tentativo, e da fuori si
    // vedeva "collegamento interrotto" ogni dieci secondi per sempre.
    // Si riprova solo dopo un vero cambio di rete - vedi `onJoined`.
    if (connState !== 'connected') return;
    if (videoStats.percorso !== 'relay' || relayRiprovato.current) return;
    const t = setTimeout(() => {
      if (!inChannelRef.current || !peerActiveRef.current) return;
      relayRiprovato.current = true;
      console.log('[duetto-rtc]', 'passiamo dal relay: provo a cercare una strada diretta');
      if (politeRef.current) signalingRef.current?.sendSignal({ kind: 'renegotiate' });
      else sessionRef.current?.restartIce();
    }, 8000);
    return () => clearTimeout(t);
  }, [connState, videoStats.percorso]);

  // Quale profilo l'interfaccia sta DAVVERO mostrando: distingue "non è
  // arrivato" da "è arrivato ma non si vede".
  useEffect(() => {
    if (cfg) console.log('[duetto-ui]', 'profilo mostrato:', cfg.videoQuality);
  }, [cfg?.videoQuality]);

  // Sapere se siamo in primo piano decide se mostrare una notifica o no.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const wasActive = appStateRef.current === 'active';
      appStateRef.current = s;
      if (s !== 'active') return;

      Foreground.clearNotification().catch(() => {});
      // Riaprire l'app è già dire "ci sono": se ci si era staccati, la
      // presenza torna da sé. Chi vuole restare invisibile non riapre.
      setDisponibile(true);
      // Tornando in primo piano non ha senso aspettare il prossimo
      // tentativo programmato: si riprova subito.
      signalingRef.current?.reconnectNow();
      // E si ridomanda dov'è l'altro: il telefono può aver dormito per
      // ore, e i conti alla rovescia dormono con lui. Chi riaccende lo
      // schermo guarda quella riga per prima cosa, e deve trovarla
      // fresca, non ferma a com'era prima della notte.
      if (inChannelRef.current) signalingRef.current?.chiediPresenza();
      // Tornare in primo piano - da icona o toccando la notifica - vuol
      // dire voler stare nel canale: si rientra senza chiedere nulla.
      if (!wasActive && !inChannelRef.current && signalingRef.current) {
        enterChannelRef.current?.();
      }
    });
    return () => sub.remove();
  }, []);

  // Cosa sa fare questo telefono: si chiede una volta sola all'avvio.
  useEffect(() => {
    Codecs.hasHardwareVp9Encoder().then((v: boolean) => {
      setLocalVp9(!!v);
      sessionRef.current?.setLocalVp9(!!v);
    }).catch(() => {});
  }, []);

  /**
   * Diciamo all'altro quando smettiamo di guardare, così spegne la sua
   * trasmissione: un video verso uno schermo spento costa ~300 kB/s a chi
   * lo manda, che su rete cellulare si paga.
   *
   * Non usiamo AppState: su Android segnala la pausa dell'activity, e in
   * Picture-in-Picture l'activity è in pausa pur essendo visibile.
   */
  useEffect(() => {
    Visibility.get().then((v: boolean) => {
      sessionRef.current?.setLocalWatching(!!v);
    }).catch(() => {});
    return Visibility.subscribe((visible: boolean) => {
      sessionRef.current?.setLocalWatching(visible);
    });
  }, []);

  // --- avvio ---------------------------------------------------------------
  useEffect(() => {
    (async () => {
      // Prima della configurazione: se arrivasse dopo, il riquadrino
      // comparirebbe al suo posto di nascita e poi salterebbe.
      await caricaPosizionePip();
      const c = await loadConfig();
      setCfg(c);
      leggiLaPropriaMorte();
      // La voce dell'altro resta come l'avevi lasciata: chi l'ha
      // abbassata una volta l'ha abbassata per come suona quel telefono,
      // e domani suonerà uguale.
      try {
        const g = Number(await AsyncStorage.getItem(CHIAVE_GUADAGNO));
        if (g >= GUADAGNO_MIN && g <= GUADAGNO_MAX) setGuadagno(g);
      } catch { /* niente di grave */ }
      // Il canale di notifica va preparato prima che serva: nasce con
      // suono e vibrazione dentro, e crearlo al primo avviso vorrebbe
      // dire farlo mentre lo si sta già usando.
      Avvisi.configura(c.avvisoVibra, c.avvisoSuono, c.avvisoSuonoUri).catch(() => {});
      if (!isServerConfigured(c)) setScreen('settings');
      else if (!isPaired(c)) setScreen('pairing');
      // Le impostazioni di sistema si propongono una volta sola, appena
      // c'è una coppia: prima non avrebbe senso spiegarle.
      else if (!c.setupShown) setScreen('setup');
      // Aprire l'app significa voler entrare nel canale: niente pulsanti
      // di mezzo. Lo stato "in ascolto" resta per dopo aver premuto Esci.
      else setScreen('channel');
    })();
  }, []);

  /**
   * Cosa, cambiando, obbliga davvero a rifare la connessione.
   *
   * Prima l'effetto dipendeva da `cfg` intero: cambiare la qualità video
   * - che è solo un parametro dell'encoder - abbatteva signaling e
   * sessione e li ricostruiva. Si vedeva il proprio video spegnersi,
   * l'altro leggeva "collegamento interrotto", e le preferenze si
   * chiudevano da sole perché rientrare nel canale cambia schermata.
   */
  const connKey = cfg
    ? [
        cfg.serverUrl, cfg.displayName,
        cfg.pair?.id, cfg.pair?.side, cfg.pair?.key,
      ].join('|')
    : '';

  /**
   * Il nome vero dell'altro, ricordato nel collegamento.
   *
   * All'accoppiamento il nome può mancare - è facoltativo - o essere
   * cambiato dopo. Con più collegamenti in elenco è l'unica cosa che li
   * distingue: l'impronta della stanza non dice niente a nessuno. Si
   * scrive solo quando cambia davvero, quindi non costa nulla farlo a
   * ogni ingresso.
   */
  const segnaNome = useCallback((n: string) => {
    setPeerName(n);
    setCfg((prev) => {
      if (!prev?.pair) return prev;
      const next = ricordaNomeCoppia(prev, prev.pair.id, n);
      if (!next) return prev;
      saveConfig(next).catch(() => { /* noop */ });
      return next;
    });
  }, []);

  // --- connessione persistente --------------------------------------------
  // Vive finché c'è una coppia: passare da "in ascolto" a "nel canale"
  // non riconnette nulla, cambia solo lo stato dichiarato al server.
  useEffect(() => {
    if (!cfg || !isPaired(cfg) || !isServerConfigured(cfg) || !disponibile) return;
    const pair = cfg.pair!;

    // Se la presenza era tenuta viva dal servizio senza interfaccia
    // (riavvio del telefono), ora il comando passa all'app: due
    // connessioni dallo stesso dispositivo si scalzerebbero a vicenda.
    stopListening();
    let cancelled = false;

    (async () => {
      const perms = await requestAllPermissions();
      cameraGranted.current = perms.camera;
      if (!perms.mic) {
        Alert.alert('Permesso negato', 'Senza microfono non puoi usare il canale.');
        setScreen('settings');
        return;
      }
      if (cancelled) return;

      Foreground.start(testoNotificaRef.current, false).catch(() => {});

      const sig = new Signaling(
        {
          serverUrl: cfg.serverUrl.trim(),
          room: pair.id,
          displayName: cfg.displayName || 'Qualcuno',
          key: pair.key,
          side: pair.side,
          mode: 'listening',
        },
        {
          onStatus: (st) => {
            setStatus(st);
            if (st === 'offline') signalingWasDown.current = true;
          },

          onJoined: ({ peerPresent: present, peerActive, peerName: n, turn }) => {
            // Ritrovandolo collegato, qualunque cosa avesse fatto prima
            // non conta più.
            if (present) setPeerStaccato(false);
            // Il relay lo configura il server: sui telefoni non si digita nulla.
            serverTurnRef.current = turn ? [turn] : [];
            sessionRef.current?.setServerIceServers(serverTurnRef.current);
            // Se eravamo rimasti senza server, qualunque offerta partita
            // nel frattempo è andata persa: si riparte da zero.
            const afterOutage = signalingWasDown.current;
            signalingWasDown.current = false;
            // Solo un vero cambio di rete rende sensato ricercare una
            // strada diretta: è l'unico momento in cui può esserne
            // comparsa una che prima non c'era.
            if (afterOutage) relayRiprovato.current = false;
            // Il ruolo NON può dipendere da chi entra per primo: la
            // connessione si riaggancia a ogni cambio di rete, e chi era
            // "primo" può ritrovarsi secondo. Sono bastate due
            // riconnessioni sfortunate perché entrambi si credessero
            // quello che deve offrire, e le offerte si scontrassero.
            //
            // Il lato dell'accoppiamento invece è fissato per sempre e
            // per costruzione è diverso sui due telefoni.
            politeRef.current = pair.side === 'A';
            peerActiveRef.current = peerActive;
            setPeerPresent(present);
            if (n) segnaNome(n);
            if (peerActive && inChannelRef.current) {
              if (afterOutage) riprendiDopoCaduta(); else attachPeer();
            }
          },

          onPeerJoined: (n, mode) => {
            setPeerPresent(true);
            setPeerStaccato(false);
            segnaNome(n);
            // È tornato: l'attesa che stava per dimenticarlo si annulla.
            fermaAttesa();
            peerActiveRef.current = mode === 'active';
            if (mode === 'active' && inChannelRef.current) attachPeer(true);
          },

          onPeerLeft: (motivo) => {
            setPeerPresent(false);
            setPeerVisto(false);
            setPeerStaccato(motivo === 'bye');
            peerActiveRef.current = false;
            sessionRef.current?.detachPeer();
            // Se ha salutato è uscito davvero; se è caduto gli si tiene il
            // posto qualche secondo, che è il tempo di un cambio di rete.
            scordaAltro(motivo === 'bye');
            setConnState('new');
          },

          /**
           * La risposta a "c'è ancora?".
           *
           * Di solito conferma quello che già si sapeva. Quando non lo
           * conferma - l'altro risulta nel canale e noi non ce n'eravamo
           * accorti - vuol dire che un annuncio è andato perso, e questa
           * è l'occasione per rimettersi in pari invece di restare a
           * guardare una schermata di attesa mentre lui aspetta noi.
           */
          onPresence: ({ peerPresent: present, peerActive, peerName: n }) => {
            setPeerPresent(present);
            if (present) setPeerStaccato(false);
            if (n) segnaNome(n);
            peerActiveRef.current = peerActive;
            if (peerActive) {
              fermaAttesa();
              setStatus('together');
              if (inChannelRef.current) attachPeer();
            }
          },

          onPeerMode: (mode, n) => {
            if (n) segnaNome(n);
            peerActiveRef.current = mode === 'active';
            if (mode === 'active') {
              fermaAttesa();
              if (inChannelRef.current) attachPeer();
            } else {
              sessionRef.current?.detachPeer();
              // Uscita voluta: ha premuto "Esci" ed è tornato in ascolto.
              scordaAltro(true);
              setConnState('new');
            }
          },

          onNotify: (reason, n) => {
            segnaNome(n);
            setKnockPending(false);
            // Il nome è facoltativo: senza, si evita di scrivere "Qualcuno".
            const named = n && n !== 'Qualcuno';
            // Con più collegamenti configurati, "ti stanno chiamando" non
            // basta: chiama uno solo dei due o tre che conosci, e sapere
            // quale è metà dell'informazione. Con un collegamento solo il
            // titolo resta "Duetto", che non ha niente da disambiguare.
            const titolo = titoloAvvisoRef.current;

            if (reason === 'knock') {
              // Un richiamo esplicito passa sempre, anche con l'app aperta:
              // chi bussa lo fa proprio perché l'altro non risponde, e il
              // telefono può essere acceso sul tavolo senza nessuno davanti.
              Foreground.notify(
                titolo,
                named ? `${n} ti sta chiamando` : 'Ti stanno chiamando',
              ).catch(() => {});
              // La vibrazione non si fa più da qui: sta nel canale della
              // notifica, insieme al suono, perché è lì che si possono
              // regolare - e perché vibrando anche di nostro, con la
              // vibrazione del canale accesa, si sentirebbe due volte.
              return;
            }

            // L'arrivo dell'altro, invece, in primo piano si vede già:
            // notificarlo sarebbe solo rumore.
            if (appStateRef.current !== 'active') {
              Foreground.notify(
                titolo,
                named ? `${n} è nel canale` : 'C’è qualcuno nel canale',
              ).catch(() => {});
            }
          },

          onSignal: async (msg) => {
            const sess = sessionRef.current;
            if (!sess) return;
            // L'altro è rimasto senza collegamento e ci chiede di
            // rifare l'offerta: tocca a noi, che siamo quelli che offrono.
            if (msg.kind === 'renegotiate') {
              if (!politeRef.current && inChannelRef.current) attachPeer(true);
              return;
            }
            // L'altro ha cambiato la qualità: vale per tutti e due, così
            // non ci si ritrova con due impostazioni diverse senza sapere
            // quale delle due si sta vedendo. Non si rimanda indietro:
            // sarebbe un rimpallo senza fine.
            if (msg.kind === 'quality') {
              applyQuality(msg.value as DuoConfig['videoQuality'], false);
              return;
            }
            // Come la risoluzione: vale per tutti e due, e chi la riceve
            // non la rimanda indietro.
            if (msg.kind === 'audio') {
              applyAudio(msg.migliore, false);
              return;
            }
            // Il diario dei consumi dell'altro telefono, che finisce in
            // un file accanto al nostro: così collegando UN solo telefono
            // si leggono tutti e due. Passa dalla busta cifrata come il
            // resto: il server lo inoltra senza poterlo leggere.
            // L'altro è morto e ora è tornato: dirlo, senza far suonare
            // niente. È una notizia, non una chiamata.
            if (msg.kind === 'morte') {
              // Questo racconto contiene già il ritorno: l'annuncio
              // generico non serve più.
              scordaRitorno();
              const testo = fraseMorte(
                Number(msg.quando), String(msg.causa), shownNameRef.current,
              );
              Foreground.nota(titoloAvvisoRef.current, testo).catch(() => {});
              setAvviso(testo);
              Diario.segna(`morte-altrui:${msg.causa}`).catch(() => {});
              return;
            }

            // Un suono per svegliarci: lo suona questo telefono, forte,
            // dal volume della sveglia. Arriva solo da chi è nel canale
            // con noi, cioè da una persona sola al mondo.
            if (msg.kind === 'sveglia') {
              Sveglia.suona(String(msg.suono ?? '')).catch(() => {});
              Diario.segna(`sveglia:${msg.suono}`).catch(() => {});
              return;
            }

            if (msg.kind === 'diario') {
              Diario.aggiungiAltro(String(msg.testo ?? ''), chiaveDiarioRef.current)
                .catch(() => {});
              return;
            }
            // Se l'altro ha ricostruito prima di noi, la sua offerta
            // arriva quando ancora non abbiamo nulla per riceverla e
            // verrebbe scartata: prima ci prepariamo, poi la trattiamo.
            if (!sess.hasPeer() && inChannelRef.current && peerActiveRef.current) {
              try { await sess.attachPeer(politeRef.current); } catch { /* noop */ }
            }
            sess.onSignal(msg);
          },

          onKnockResult: (ok, error) => {
            if (ok) {
              // Solo una conferma a schermo: il pulsante resta premibile,
              // perché insistere è precisamente ciò che si vuole fare
              // quando il primo avviso non ha ottenuto risposta.
              setKnockPending(true);
              setTimeout(() => setKnockPending(false), 2000);
            } else if (error === 'peer-offline') {
              Alert.alert('Non raggiungibile', 'L’altro telefono non è collegato in questo momento.');
            }
          },

          onError: (code) => {
            if (code === 'room-full' || code === 'replaced') {
              // Quasi sempre transitorio: la connessione precedente non è
              // ancora stata dichiarata morta, o il telefono si è riagganciato
              // altrove. Il riaggancio automatico ci pensa da solo: un avviso
              // qui sarebbe solo allarmismo.
            }
            else if (code === 'decrypt-failed') {
              Alert.alert(
                'Chiavi diverse',
                'I due telefoni non condividono la stessa chiave: rifate l’accoppiamento.',
              );
            }
          },
        },
      );

      signalingRef.current = sig;
      sig.connect();

      // Ingresso automatico. setMode aggiorna lo stato dichiarato anche
      // prima che il WebSocket sia aperto, e il join che parte dopo lo
      // porta già corretto: non serve aspettare la connessione.
      if (!cancelled) await enterChannel();
    })();

    return () => {
      cancelled = true;
      sessionRef.current?.leaveChannel();
      sessionRef.current = null;
      // Si saluta solo se ce ne andiamo davvero, cioè se qualcuno ha
      // scelto di rendersi non disponibile o ha sciolto il collegamento.
      // Tutte le altre chiusure sono passaggi di mano, e l'altro non
      // deve leggere "si è staccato" per una connessione che si rifà.
      signalingRef.current?.close(salutiamo.current);
      salutiamo.current = false;
      signalingRef.current = null;
      Foreground.stop().catch(() => {});
      try { InCallManager.stop(); } catch { /* noop */ }
      Audio.useCallVolumeKeys(false).catch(() => {});
    };
    // attachPeer è stabile: usa solo ref. `cfg` si legge dalla chiusura
    // ma non è una dipendenza: solo connKey deve far rifare tutto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connKey, disponibile]);

  /**
   * Assicura un collegamento diretto vivo, quando siamo entrambi nel canale.
   *
   * `force` serve quando l'altro si è appena ricollegato: la sua
   * connessione è nuova per definizione, quindi la nostra è comunque da
   * rifare, anche se dal nostro lato sembrasse ancora buona.
   *
   * Senza questo, dopo un'interruzione di rete restava in piedi una
   * connessione morta e non si vedeva più nulla finché non si chiudeva
   * l'app: il codice trovava una connessione già presente e non faceva
   * nulla.
   */
  const timerAssenza = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fermaAttesa = useCallback(() => {
    if (timerAssenza.current) {
      clearTimeout(timerAssenza.current);
      timerAssenza.current = null;
    }
  }, []);

  /**
   * L'altro non c'è più: microfono e camera suoi non sono più di nessuno.
   *
   * Finché quello stato resta acceso, il posto grande continua ad
   * aspettare un video che non arriverà: è quello che teneva il proprio
   * video piccolo dopo che l'altro era uscito.
   *
   * @param subito vero se se n'è andato lui, falso se è caduta la rete
   */
  const scordaAltro = useCallback((subito: boolean) => {
    fermaAttesa();
    const spegni = () => setPeerState({ audio: true, video: false });
    if (subito) { spegni(); return; }
    timerAssenza.current = setTimeout(() => {
      timerAssenza.current = null;
      spegni();
    }, ATTESA_RITORNO_MS);
  }, [fermaAttesa]);

  useEffect(() => fermaAttesa, [fermaAttesa]);

  const attachPeer = useCallback(async (force = false) => {
    const sig = signalingRef.current;
    const s = sessionRef.current;
    if (!sig || !s) return;
    if (force || !s.isPeerHealthy()) s.detachPeer();

    // Chi risponde non ricostruisce nulla di propria iniziativa: aspetta
    // l'offerta, che farà nascere la connessione al momento giusto
    // (vedi onSignal). Ricostruirla subito significherebbe demolire, un
    // istante dopo, proprio quella che l'offerta in arrivo sta creando:
    // è così che nascevano tre ricostruzioni in due secondi.
    if (politeRef.current) return;

    try {
      await s.attachPeer(politeRef.current);
      s.broadcastState();
    } catch (e: any) {
      // Qui dentro ora si apre anche il microfono, che può essere negato
      // (permesso revocato mentre l'app era aperta). Prima era un errore
      // impossibile e si poteva ignorare: ora se si tace, l'altro entra e
      // non si collega niente, senza che nulla lo spieghi.
      console.log('[duetto-rtc]', 'attachPeer fallita:', String(e?.message ?? e));
      // Solo se è mancato il microfono. Le altre cadute di attachPeer
      // capitano durante le riconnessioni e si risolvono da sole: un
      // avviso a ogni tentativo sarebbe rumore, e coprirebbe questo.
      if (!s.hasMic()) Alert.alert('Errore microfono', String(e?.message ?? e));
    }
  }, []);

  /**
   * Ritorno della rete: si riaccende ICE, non si ricostruisce tutto.
   *
   * Ricostruire distrugge la traccia dell'altro, e con lei la superficie
   * che la disegnava: da qui lo schermo nero a ogni cambio di rete.
   * Riaccendendo ICE invece decodificatore e superficie restano in piedi
   * e l'immagine resta ferma sull'ultimo fotogramma finché i pacchetti
   * non riprendono - che è quello che si vede fare alle altre app.
   *
   * La ricostruzione resta come rete di sicurezza: se dopo sei secondi
   * non siamo collegati, si demolisce e si rifà. Era la via principale
   * perché un'offerta mandata mentre il server era irraggiungibile va
   * persa; ma qui il server è appena tornato, e l'offerta parte adesso.
   */
  const riprendiDopoCaduta = useCallback(() => {
    const s = sessionRef.current;
    if (!s || !s.hasPeer()) { attachPeer(true); return; }

    console.log('[duetto-rtc]', 'rete tornata: riaccendo ICE senza ricostruire');
    if (politeRef.current) signalingRef.current?.sendSignal({ kind: 'renegotiate' });
    else s.restartIce();

    clearRecovery();
    hardTimer.current = setTimeout(() => {
      if (connStateRef.current === 'connected') return;
      if (!inChannelRef.current || !peerActiveRef.current) return;
      console.log('[duetto-rtc]', 'la riaccensione non è bastata: ricostruisco');
      attachPeer(true);
    }, 6000);
  }, [attachPeer, clearRecovery]);

  // --- entrare e uscire dal canale ----------------------------------------
  const enterChannel = useCallback(async () => {
    const sig = signalingRef.current;
    if (!sig || !cfg) return;

    if (!sessionRef.current) {
      sessionRef.current = new ChannelSession(cfg, sig, {
        onLocalStream: (st) => {
          setLocalStream(st);
          // Le proporzioni si rileggono a ogni cambio della propria
          // ripresa, non solo accendendo il video: cambiando profilo la
          // camera si riapre dentro la sessione, senza passare di qui, e
          // il riquadrino restava della forma vecchia.
          setLocalAspect(sessionRef.current?.getLocalVideoAspect());
        },
        onRemoteStream: setRemoteStream,
        onConnectionState: (st) => {
          setConnState(st);
          connStateRef.current = st;

          if (st === 'connected') { clearRecovery(); return; }
          if (st !== 'failed' && st !== 'disconnected') return;

          // ICE si riprende spesso da solo, anche da "failed": nel log si
          // è visto passare da failed a connected senza alcun aiuto.
          // Demolire subito interrompeva audio e video proprio mentre si
          // stava risistemando, ed era la causa della maggior parte delle
          // interruzioni visibili. Ora: si aspetta, si tenta la riparazione
          // leggera, e solo se non basta si ricostruisce.
          clearRecovery();
          softTimer.current = setTimeout(async () => {
            if (connStateRef.current === 'connected') return;
            if (signalingWasDown.current) return;
            if (!inChannelRef.current || !peerActiveRef.current) return;

            if (politeRef.current) {
              // Non possiamo offrire: lo chiediamo all'altro.
              signalingRef.current?.sendSignal({ kind: 'renegotiate' });
            } else {
              await sessionRef.current?.restartIce();
            }

            hardTimer.current = setTimeout(() => {
              if (connStateRef.current === 'connected') return;
              if (signalingWasDown.current) return;
              if (inChannelRef.current && peerActiveRef.current) attachPeer(true);
            }, 8000);
          }, st === 'failed' ? 4000 : 12000);
        },
        onVideoStats: setVideoStats,
        onPeerState: (st) => {
          setPeerVisto(true);
          // Se ci manda il suo stato è tornato, qualunque cosa dicesse il
          // conto alla rovescia: senza fermarlo, poco dopo spegnerebbe uno
          // stato appena arrivato.
          fermaAttesa();
          setPeerState(st);
          setPeerVp9(st.hwVp9 === true);
        },
        onRemoteVideo: (present) => {
          setRemoteHasVideo(present);
          // Solo quando il video RICOMPARE dopo essere mancato.
          //
          // Ricreare la vista serve a non riagganciarsi a una superficie
          // morta, che resterebbe nera. Ma farlo a ogni conferma di
          // "video presente" - e ne arriva una a ogni cambio di
          // risoluzione, quando l'encoder scende o risale - distruggeva e
          // ricostruiva l'immagine di continuo: un lampo che sembra un
          // ricollegamento, e non lo è.
          if (present && !avevaVideoRemoto.current) {
            setRemoteVideoKey((k) => k + 1);
          }
          avevaVideoRemoto.current = present;
        },
      });
    }
    sessionRef.current.setServerIceServers(serverTurnRef.current);
    // Il microfono non si apre qui: lo apre la sessione quando l'altro
    // arriva davvero. Chi entra per primo può aspettare a lungo, e in
    // quell'attesa non c'è nulla da trasmettere.
    setAudioOn(sessionRef.current.isAudioEnabled());

    try {
      InCallManager.start({ media: 'audio' });
    } catch { /* noop */ }

    // I tasti del volume vanno detti a mano: senza, su certi telefoni
    // regolano il multimedia e non hanno effetto sulla voce dell'altro.
    Audio.useCallVolumeKeys(true).catch(() => {});

    setInChannel(true);
    inChannelRef.current = true;
    setScreen('channel');
    sig.setMode('active');

    if (peerActiveRef.current) attachPeer();
  }, [cfg, attachPeer, fermaAttesa]);

  useEffect(() => { enterChannelRef.current = enterChannel; }, [enterChannel]);

  const leaveChannel = useCallback((restaDisponibile = true) => {
    const sig = signalingRef.current;
    sessionRef.current?.leaveChannel();
    sessionRef.current = null;
    try { InCallManager.stop(); } catch { /* noop */ }
    Audio.useCallVolumeKeys(false).catch(() => {});
    Foreground.setCameraActive(false).catch(() => {});
    setLocalStream(null);
    setRemoteStream(null);
    setRemoteHasVideo(false);
    setVideoOn(false);
    setLocalAspect(undefined);
    setConnState('new');
    setInChannel(false);
    inChannelRef.current = false;
    sig?.setMode('listening');
    // Staccarsi non è una cosa da fare a mano qui: basta dichiararsi non
    // disponibili, e l'effetto della connessione smonta tutto da sé -
    // sessione, signaling, servizio in primo piano - come fa a ogni
    // cambio di coppia.
    if (!restaDisponibile) {
      salutiamo.current = true;
      setDisponibile(false);
    }

    // Uscire dal canale è uscire dall'app: la finestra sparisce. Il
    // processo però resta vivo, così continui a essere raggiungibile e
    // ricevi la notifica quando l'altro entra. Riaprendo l'app si rientra
    // direttamente nel canale.
    AppWindow.minimize().catch(() => {});
  }, []);

  /**
   * Rete di sicurezza contro il collegamento che non riparte.
   *
   * Chi risponde non può offrire: se resta senza connessione e l'altro
   * non se ne accorge - perché dal suo lato sembra tutto a posto -
   * aspetterebbe all'infinito. Ogni pochi secondi, chi si trova senza
   * collegamento mentre entrambi sono nel canale se ne occupa: chi offre
   * ricostruisce, chi risponde lo chiede.
   */
  useEffect(() => {
    if (screen !== 'channel') return;
    const timer = setInterval(() => {
      const sess = sessionRef.current;
      const sig = signalingRef.current;
      if (!sess || !sig?.connected) return;
      if (!inChannelRef.current || !peerActiveRef.current) return;
      if (sess.isPeerHealthy()) return;

      if (politeRef.current) sig.sendSignal({ kind: 'renegotiate' });
      else attachPeer(true);
    }, 5000);
    return () => clearInterval(timer);
  }, [screen, attachPeer]);

  // --- tasto Indietro: Picture-in-Picture ----------------------------------
  const pipSupported = useRef(false);
  useEffect(() => {
    Pip.isSupported().then((v) => { pipSupported.current = v; }).catch(() => {});
  }, []);

  const stageAspect =
    (peerState.video ? peerState.aspect : undefined) ??
    (videoOn ? localAspect : undefined) ??
    9 / 16;

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Dalle impostazioni il tasto Indietro riporta nel canale, invece
      // di chiudere l'app lasciandoti senza via d'uscita.
      if (screen === 'settings' && cfg && isPaired(cfg)) {
        setScreen('channel');
        return true;
      }
      // Dall'accoppiamento si torna sempre alle impostazioni: da lì si
      // rientra nel canale, o si cambia server. Senza questo, il tasto
      // Indietro sulla schermata «Collega i due telefoni» chiudeva
      // l'app - e chi ci era arrivato per aggiungere un collegamento non
      // aveva nessun modo di tornare da dove era venuto.
      if (screen === 'pairing') {
        setScreen('settings');
        return true;
      }
      if (screen !== 'channel') return false;
      if (!pipSupported.current) return false;
      Pip.enter(stageAspect).catch(() => {});
      return true;
    });
    return () => sub.remove();
  }, [screen, stageAspect, cfg]);

  // Ruotando cambiano le proporzioni del proprio video: vanno ricomunicate.
  useEffect(() => {
    if (screen !== 'channel') return;
    const sub = Dimensions.addEventListener('change', () => {
      const s = sessionRef.current;
      if (!s || !s.isVideoEnabled()) return;
      setLocalAspect(s.getLocalVideoAspect());
      s.broadcastState();
    });
    return () => sub.remove();
  }, [screen]);

  const onToggleVideo = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    if (s.isVideoEnabled()) {
      setVideoOn(await s.disableVideo());
      setLocalAspect(undefined);
      Foreground.setCameraActive(false).catch(() => {});
      return;
    }
    if (!cameraGranted.current) {
      const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      cameraGranted.current = res === 'granted';
      if (!cameraGranted.current) {
        Alert.alert('Permesso negato', 'Serve il permesso camera per attivare il video.');
        return;
      }
    }
    await Foreground.setCameraActive(true).catch(() => {});
    try {
      setVideoOn(await s.enableVideo());
      setLocalAspect(s.getLocalVideoAspect());
      // La camera si apre su quella scelta, che può essere stata cambiata
      // a video spento: qui si allinea solo l'icona.
      setCameraFrontale(s.isCameraFrontale());
    } catch (e: any) {
      Foreground.setCameraActive(false).catch(() => {});
      Alert.alert('Errore camera', String(e?.message ?? e));
    }
  }, []);

  // --- salvataggi ----------------------------------------------------------
  /**
   * Cambia la qualità video su ENTRAMBI i telefoni.
   *
   * Il profilo agisce sull'encoder di chi trasmette, quindi da solo
   * cambierebbe solo cosa vede l'altro. Tenendoli allineati la scelta
   * significa "come guardiamo", che è quello che uno intende; se non va
   * bene, l'altro la ricambia e torna allineata di nuovo.
   */
  const applyQuality = useCallback(
    (q: DuoConfig['videoQuality'], tell: boolean) => {
      setCfg((prev) => {
        if (!prev || prev.videoQuality === q) return prev;
        const next = { ...prev, videoQuality: q };
        saveConfig(next).catch(() => {});
        return next;
      });
      sessionRef.current?.setVideoQuality(q);
      if (tell) signalingRef.current?.sendSignal({ kind: 'quality', value: q });
    },
    [],
  );

  /**
   * Le opzioni audio, su tutti e due i telefoni.
   *
   * "Voce più ricca" alzata da una parte sola migliora solo una delle
   * due direzioni, e chi l'ha alzata non sente nessuna differenza:
   * l'audio che ascolta lo manda l'altro.
   */
  const applyAudio = useCallback((migliore: boolean, tell: boolean) => {
    setCfg((prev) => {
      if (!prev || prev.audioMigliore === migliore) return prev;
      const next = { ...prev, audioMigliore: migliore };
      saveConfig(next).catch(() => {});
      return next;
    });
    sessionRef.current?.setAudioOptions(migliore);
    if (tell) signalingRef.current?.sendSignal({ kind: 'audio', migliore });
  }, []);

  const onSaveSettings = useCallback(async (scritta: DuoConfig) => {
    // Il server appena scritto è il server di questa coppia: se resta
    // solo nell'app, tornando qui da un altro collegamento si
    // riporterebbe dietro l'indirizzo vecchio.
    const next = allineaServerCoppia(scritta);
    await saveConfig(next);
    setCfg(next);
    // La qualità è già stata applicata al tocco, ma applicarla di nuovo
    // non costa nulla e copre il caso di una config arrivata da altrove.
    applyQuality(next.videoQuality, true);
    setScreen(isPaired(next) ? 'channel' : 'pairing');
  }, [applyQuality]);

  const onPaired = useCallback(async (pair: PairInfo) => {
    if (!cfg) return;
    // Non sostituisce il collegamento di prima: gli si affianca, e passa
    // in testa. Chi si accoppia con qualcun altro non sta dicendo di
    // volersi dimenticare del primo.
    const next = registraCoppia(cfg, pair);
    await saveConfig(next);
    setCfg(next);
    setPeerName(pair.peerName);
    setScreen(next.setupShown ? 'channel' : 'setup');
  }, [cfg]);

  /**
   * Passa a un altro collegamento già configurato.
   *
   * Non c'è niente da smontare a mano: cambiando la coppia cambia
   * `connKey`, e l'effetto della connessione si rifà da capo - chiude il
   * vecchio, apre il nuovo, rientra nel canale. Qui si spegne solo ciò
   * che si vede, che altrimenti resterebbe a mostrare la persona
   * appena lasciata.
   */
  const onSwitchPair = useCallback(async (id: string) => {
    if (!cfg) return;
    const next = passaACoppia(cfg, id);
    if (next === cfg) return;
    await saveConfig(next);
    setCfg(next);
    setPeerName(next.pair?.peerName || '');
    setPeerPresent(false);
    peerActiveRef.current = false;
    setPeerState({ audio: true, video: false });
    setPeerVisto(false);
    setPeerVp9(false);
    setRemoteStream(null);
    setRemoteHasVideo(false);
    setConnState('new');
    fermaAttesa();
    setScreen('channel');
  }, [cfg, fermaAttesa]);

  /**
   * Il nome che do io a un collegamento.
   *
   * Non viaggia da nessuna parte: l'altro non lo vede e non lo saprà
   * mai. Serve qui, dove i collegamenti stanno in fila e senza un nome
   * si assomigliano tutti.
   */
  const onRenamePair = useCallback(async (id: string, nome: string) => {
    if (!cfg) return;
    const next = rinominaCoppia(cfg, id, nome);
    await saveConfig(next);
    setCfg(next);
  }, [cfg]);

  /**
   * Manda all'altro un suono che lo svegli.
   *
   * Non passa dal server come l'avviso: viaggia dentro la busta cifrata
   * della conversazione, che c'è già perché siete tutti e due nel
   * canale. Il server non sa nemmeno che è successo.
   */
  const onSveglia = useCallback((suono: string) => {
    signalingRef.current?.sendSignal({ kind: 'sveglia', suono });
    Diario.segna(`sveglia-mandata:${suono}`).catch(() => {});
  }, []);

  const onForgetPair = useCallback(async (id: string) => {
    if (!cfg) return;
    // Sciogliere un collegamento è un addio vero: chi resta dall'altra
    // parte deve sapere che non si tratta di una caduta.
    if (cfg.pair?.id === id) salutiamo.current = true;
    const next = dimenticaCoppia(cfg, id);
    await saveConfig(next);
    setCfg(next);
    if (cfg.pair?.id === id) {
      setPeerName(next.pair?.peerName || '');
      setPeerPresent(false);
      peerActiveRef.current = false;
      setRemoteStream(null);
      setRemoteHasVideo(false);
      setConnState('new');
      // Sciogliendo l'ultimo non resta nulla a cui collegarsi; se invece
      // ne resta un altro si è già passati a quello.
      setScreen(isPaired(next) ? 'channel' : 'pairing');
    }
  }, [cfg]);

  // --- resa ----------------------------------------------------------------
  if (screen === 'loading' || !cfg) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#2f7cf6" />
      </View>
    );
  }

  if (screen === 'settings') {
    return (
      <View style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <SettingsScreen
          initial={cfg}
          onSave={onSaveSettings}
          onForgetPair={onForgetPair}
          onSwitchPair={onSwitchPair}
          onRenamePair={onRenamePair}
          // Non si tocca nessun collegamento esistente: quello nuovo si
          // aggiunge, se e quando riesce.
          onRepair={() => setScreen('pairing')}
          onClose={isPaired(cfg) ? () => setScreen('channel') : undefined}
          onOpenSetup={() => { setSetupFrom('impostazioni'); setScreen('setup'); }}
          onQualityChange={(q) => applyQuality(q, true)}
          onLive={(patch) => setCfg((prev) => {
            if (!prev) return prev;
            const next = { ...prev, ...patch };
            saveConfig(next).catch(() => {});
            // Le opzioni audio vanno anche applicate: il tetto a caldo,
            // le elaborazioni riaprendo il microfono.
            if ('audioMigliore' in patch) applyAudio(next.audioMigliore, true);
            // Suono e vibrazione dell'avviso stanno nel canale di
            // notifica, che va rifatto da capo a ogni cambiamento.
            if ('avvisoVibra' in patch || 'avvisoSuono' in patch || 'avvisoSuonoUri' in patch) {
              Avvisi.configura(next.avvisoVibra, next.avvisoSuono, next.avvisoSuonoUri)
                .catch(() => {});
            }
            return next;
          })}
          vp9Here={localVp9}
          vp9Peer={peerVp9}
        />
      </View>
    );
  }

  if (screen === 'setup') {
    return (
      <View style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <SetupScreen
          onDone={async () => {
            if (!cfg.setupShown) {
              const next = { ...cfg, setupShown: true };
              await saveConfig(next);
              setCfg(next);
            }
            setScreen(setupFrom === 'impostazioni' ? 'settings' : 'channel');
          }}
        />
      </View>
    );
  }

  if (screen === 'pairing') {
    return (
      <View style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <PairingScreen
          cfg={cfg}
          onPaired={onPaired}
          onBack={() => setScreen('settings')}
        />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ChannelScreen
        collegamento={collegamento}
        peerName={shownName}
        peerAvatar={face}
        peerPresent={peerPresent}
        peerStaccato={peerStaccato}
        videoStats={videoStats}
        qualityLabel={(VIDEO_PROFILES[cfg.videoQuality] ?? VIDEO_PROFILES.standard).etichetta}
        showStats={cfg.mostraDiagnostica}
        comandi={cfg.comandi}
        avviso={avviso}
        onAvvisoLetto={() => setAvviso(null)}
        guadagno={guadagnoVisibile ? guadagno : null}
        guadagnoAltro={guadagno}
        onGuadagno={cambiaGuadagno}
        avvisoVersione={avvisoVersione}
        cameraFrontale={cameraFrontale}
        quality={cfg.videoQuality}
        onSelectQuality={(q) => applyQuality(q, true)}
        localStream={localStream}
        remoteStream={remoteStream}
        status={status}
        connectionState={connState}
        audioOn={audioOn}
        videoOn={videoOn}
        peerState={peerState}
        remoteHasVideo={remoteHasVideo && peerState.video}
        remoteVideoKey={remoteVideoKey}
        localAspect={localAspect}
        remoteAspect={peerState.aspect}
        knockPending={knockPending}
        audioRoute={audio.route}
        audioRoutes={audio.available}
        onToggleAudio={() => setAudioOn(sessionRef.current?.toggleAudio() ?? false)}
        onToggleVideo={onToggleVideo}
        onSwitchCamera={() => {
          const s = sessionRef.current;
          if (!s) return;
          // La verità sta nella sessione, anche a video spento: è lei che
          // ricorda con quale camera si aprirà.
          setCameraFrontale(s.switchCamera());
        }}
        onSelectRoute={audio.select}
        onKnock={() => signalingRef.current?.knock()}
        onLeave={leaveChannel}
        onSveglia={onSveglia}
        onOpenSettings={() => setScreen('settings')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0e14' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0e14' },
});
