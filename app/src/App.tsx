import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StatusBar, Platform, PermissionsAndroid, Alert, View, AppState,
  ActivityIndicator, StyleSheet, BackHandler, Dimensions, Vibration,
} from 'react-native';
import { MediaStream } from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import { Foreground, Pip, AppWindow, Visibility, Codecs } from 'duotalk-platform';
import {
  DuoConfig, PairInfo, loadConfig, saveConfig,
  isServerConfigured, isPaired, VIDEO_PROFILES,
} from './config';
import { Signaling, PresenceStatus, Mode } from './signaling';
import { ChannelSession } from './webrtc';
import type { VideoStats } from './webrtc';
import SettingsScreen from './SettingsScreen';
import SetupScreen from './SetupScreen';
import PairingScreen from './PairingScreen';
import ChannelScreen from './ChannelScreen';
import { useAudioRoute } from './audioRoute';
import { stopListening } from './presence';
import { avatarFor, peerAvatar } from './avatar';

// Nessuna schermata intermedia: o si configura, o ci si accoppia, o si è
// nel canale. Aprire l'app - da icona o da notifica - significa entrarci.
type Screen = 'loading' | 'settings' | 'pairing' | 'setup' | 'channel';

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
  const [peerName, setPeerName] = useState('');
  const [connState, setConnState] = useState('new');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(false);
  const [localAspect, setLocalAspect] = useState<number | undefined>(undefined);
  const [peerState, setPeerState] = useState<{
    audio: boolean; video: boolean; aspect?: number;
  }>({ audio: true, video: false });
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

  const clearRecovery = useCallback(() => {
    if (softTimer.current) { clearTimeout(softTimer.current); softTimer.current = null; }
    if (hardTimer.current) { clearTimeout(hardTimer.current); hardTimer.current = null; }
  }, []);

  const audio = useAudioRoute(inChannel);

  /** Il nome è facoltativo: se manca non mostriamo il segnaposto del server. */
  const shownName =
    peerName && peerName !== 'Qualcuno'
      ? peerName
      : cfg?.pair?.peerName && cfg.pair.peerName !== 'Qualcuno'
        ? cfg.pair.peerName
        : '';

  /**
   * L'immagine da mostrare al posto del video dell'altro.
   *
   * Dipende solo dalla coppia, quindi non cambia mai; prima del primo
   * accoppiamento non serve a nulla, ma un valore deve esserci.
   */
  const face = React.useMemo(
    () => (cfg?.pair ? peerAvatar(cfg.pair.id, cfg.pair.side) : avatarFor('duotalk')),
    [cfg?.pair],
  );

  useEffect(() => { inChannelRef.current = inChannel; }, [inChannel]);

  // Quale profilo l'interfaccia sta DAVVERO mostrando: distingue "non è
  // arrivato" da "è arrivato ma non si vede".
  useEffect(() => {
    if (cfg) console.log('[duotalk-ui]', 'profilo mostrato:', cfg.videoQuality);
  }, [cfg?.videoQuality]);

  // Sapere se siamo in primo piano decide se mostrare una notifica o no.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const wasActive = appStateRef.current === 'active';
      appStateRef.current = s;
      if (s !== 'active') return;

      Foreground.clearNotification().catch(() => {});
      // Tornando in primo piano non ha senso aspettare il prossimo
      // tentativo programmato: si riprova subito.
      signalingRef.current?.reconnectNow();
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
      const c = await loadConfig();
      setCfg(c);
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
        cfg.serverUrl, cfg.accessToken, cfg.displayName,
        cfg.turnUrl, cfg.turnUser, cfg.turnPass,
        cfg.pair?.id, cfg.pair?.side, cfg.pair?.key,
      ].join('|')
    : '';

  // --- connessione persistente --------------------------------------------
  // Vive finché c'è una coppia: passare da "in ascolto" a "nel canale"
  // non riconnette nulla, cambia solo lo stato dichiarato al server.
  useEffect(() => {
    if (!cfg || !isPaired(cfg) || !isServerConfigured(cfg)) return;
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

      Foreground.start('In ascolto', false).catch(() => {});

      const sig = new Signaling(
        {
          serverUrl: cfg.serverUrl.trim(),
          accessToken: cfg.accessToken,
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
            // Il relay lo configura il server: sui telefoni non si digita nulla.
            serverTurnRef.current = turn ? [turn] : [];
            sessionRef.current?.setServerIceServers(serverTurnRef.current);
            // Se eravamo rimasti senza server, qualunque offerta partita
            // nel frattempo è andata persa: si riparte da zero.
            const afterOutage = signalingWasDown.current;
            signalingWasDown.current = false;
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
            if (n) setPeerName(n);
            if (peerActive && inChannelRef.current) attachPeer(afterOutage);
          },

          onPeerJoined: (n, mode) => {
            setPeerPresent(true);
            setPeerName(n);
            peerActiveRef.current = mode === 'active';
            if (mode === 'active' && inChannelRef.current) attachPeer(true);
          },

          onPeerLeft: () => {
            setPeerPresent(false);
            peerActiveRef.current = false;
            sessionRef.current?.detachPeer();
            setPeerState({ audio: true, video: false });
            setConnState('new');
          },

          onPeerMode: (mode, n) => {
            if (n) setPeerName(n);
            peerActiveRef.current = mode === 'active';
            if (mode === 'active') {
              if (inChannelRef.current) attachPeer();
            } else {
              sessionRef.current?.detachPeer();
              setConnState('new');
            }
          },

          onNotify: (reason, n) => {
            setPeerName(n);
            setKnockPending(false);
            // Il nome è facoltativo: senza, si evita di scrivere "Qualcuno".
            const named = n && n !== 'Qualcuno';

            if (reason === 'knock') {
              // Un richiamo esplicito passa sempre, anche con l'app aperta:
              // chi bussa lo fa proprio perché l'altro non risponde, e il
              // telefono può essere acceso sul tavolo senza nessuno davanti.
              Foreground.notify(
                'DuoTalk',
                named ? `${n} ti sta chiamando` : 'Ti stanno chiamando',
              ).catch(() => {});
              // Una vibrazione mancata è un richiamo meno evidente, non
              // un motivo per far cadere l'app addosso a chi la riceve.
              try { Vibration.vibrate([0, 400, 200, 400]); } catch { /* noop */ }
              return;
            }

            // L'arrivo dell'altro, invece, in primo piano si vede già:
            // notificarlo sarebbe solo rumore.
            if (appStateRef.current !== 'active') {
              Foreground.notify(
                'DuoTalk',
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
            if (code === 'bad-token') Alert.alert('Token errato', 'Access token non valido.');
            else if (code === 'room-full' || code === 'replaced') {
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
      signalingRef.current?.close();
      signalingRef.current = null;
      Foreground.stop().catch(() => {});
      try { InCallManager.stop(); } catch { /* noop */ }
    };
    // attachPeer è stabile: usa solo ref. `cfg` si legge dalla chiusura
    // ma non è una dipendenza: solo connKey deve far rifare tutto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connKey]);

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
    } catch { /* noop */ }
  }, []);

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
          setPeerState(st);
          setPeerVp9(st.hwVp9 === true);
        },
        onRemoteVideo: (present) => {
          setRemoteHasVideo(present);
          if (present) setRemoteVideoKey((k) => k + 1);
        },
      });
    }
    sessionRef.current.setServerIceServers(serverTurnRef.current);
    try {
      await sessionRef.current.enterChannel();
      setAudioOn(sessionRef.current.isAudioEnabled());
    } catch (e: any) {
      Alert.alert('Errore microfono', String(e?.message ?? e));
      return;
    }

    try {
      InCallManager.start({ media: 'audio' });
    } catch { /* noop */ }

    Foreground.setText('Sei nel canale').catch(() => {});
    setInChannel(true);
    inChannelRef.current = true;
    setScreen('channel');
    sig.setMode('active');

    if (peerActiveRef.current) attachPeer();
  }, [cfg, attachPeer]);

  useEffect(() => { enterChannelRef.current = enterChannel; }, [enterChannel]);

  const leaveChannel = useCallback(() => {
    const sig = signalingRef.current;
    sessionRef.current?.leaveChannel();
    sessionRef.current = null;
    try { InCallManager.stop(); } catch { /* noop */ }
    Foreground.setCameraActive(false).catch(() => {});
    Foreground.setText('In ascolto').catch(() => {});
    setLocalStream(null);
    setRemoteStream(null);
    setRemoteHasVideo(false);
    setVideoOn(false);
    setLocalAspect(undefined);
    setConnState('new');
    setInChannel(false);
    inChannelRef.current = false;
    sig?.setMode('listening');

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

  const onSaveSettings = useCallback(async (next: DuoConfig) => {
    await saveConfig(next);
    setCfg(next);
    // La qualità è già stata applicata al tocco, ma applicarla di nuovo
    // non costa nulla e copre il caso di una config arrivata da altrove.
    applyQuality(next.videoQuality, true);
    setScreen(isPaired(next) ? 'channel' : 'pairing');
  }, [applyQuality]);

  const onPaired = useCallback(async (pair: PairInfo) => {
    if (!cfg) return;
    const next = { ...cfg, pair };
    await saveConfig(next);
    setCfg(next);
    setPeerName(pair.peerName);
    setScreen(next.setupShown ? 'channel' : 'setup');
  }, [cfg]);

  const onUnpair = useCallback(async () => {
    if (!cfg) return;
    const next = { ...cfg, pair: null };
    await saveConfig(next);
    setCfg(next);
    setScreen('pairing');
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
          onUnpair={onUnpair}
          onClose={isPaired(cfg) ? () => setScreen('channel') : undefined}
          onOpenSetup={() => { setSetupFrom('impostazioni'); setScreen('setup'); }}
          onQualityChange={(q) => applyQuality(q, true)}
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
        channel={shownName || 'DuoTalk'}
        peerName={shownName}
        peerAvatar={face}
        videoStats={videoStats}
        qualityLabel={(VIDEO_PROFILES[cfg.videoQuality] ?? VIDEO_PROFILES.standard).etichetta}
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
        onSwitchCamera={() => sessionRef.current?.switchCamera()}
        onSelectRoute={audio.select}
        onKnock={() => signalingRef.current?.knock()}
        onLeave={leaveChannel}
        onOpenSettings={() => setScreen('settings')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0e14' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0e14' },
});
