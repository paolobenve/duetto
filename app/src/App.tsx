import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StatusBar, Platform, PermissionsAndroid, Alert, View, AppState,
  ActivityIndicator, StyleSheet, BackHandler, Dimensions,
} from 'react-native';
import { MediaStream } from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import { Foreground, Pip } from 'duotalk-platform';
import {
  DuoConfig, PairInfo, loadConfig, saveConfig,
  isServerConfigured, isPaired,
} from './config';
import { Signaling, PresenceStatus, Mode } from './signaling';
import { ChannelSession } from './webrtc';
import SettingsScreen from './SettingsScreen';
import PairingScreen from './PairingScreen';
import ListeningScreen from './ListeningScreen';
import ChannelScreen from './ChannelScreen';
import { useAudioRoute } from './audioRoute';

type Screen = 'loading' | 'settings' | 'pairing' | 'listening' | 'channel';

/**
 * Chiede TUTTI i permessi in un colpo solo, al primo avvio.
 *
 * Nota: da Android 6 microfono, camera e notifiche sono "runtime
 * permissions" e il sistema NON permette di concederle al momento
 * dell'installazione. Chiederle tutte insieme e' la cosa piu' vicina:
 * dopo la prima volta Android non le richiede piu'.
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
  const [knockPending, setKnockPending] = useState(false);

  const signalingRef = useRef<Signaling | null>(null);
  const sessionRef = useRef<ChannelSession | null>(null);
  const politeRef = useRef(false);
  const peerActiveRef = useRef(false);
  const cameraGranted = useRef(false);
  const inChannelRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);

  const audio = useAudioRoute(inChannel);

  useEffect(() => { inChannelRef.current = inChannel; }, [inChannel]);

  // Sapere se siamo in primo piano decide se mostrare una notifica o no.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      appStateRef.current = s;
      if (s === 'active') Foreground.clearNotification().catch(() => {});
    });
    return () => sub.remove();
  }, []);

  // --- avvio ---------------------------------------------------------------
  useEffect(() => {
    (async () => {
      const c = await loadConfig();
      setCfg(c);
      if (!isServerConfigured(c)) setScreen('settings');
      else if (!isPaired(c)) setScreen('pairing');
      else setScreen('listening');
    })();
  }, []);

  // --- connessione persistente --------------------------------------------
  // Vive finche' c'e' una coppia: passare da "in ascolto" a "nel canale"
  // non riconnette nulla, cambia solo lo stato dichiarato al server.
  useEffect(() => {
    if (!cfg || !isPaired(cfg) || !isServerConfigured(cfg)) return;
    const pair = cfg.pair!;
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
          mode: 'listening',
        },
        {
          onStatus: setStatus,

          onJoined: ({ polite, peerPresent: present, peerActive, peerName: n }) => {
            politeRef.current = polite;
            peerActiveRef.current = peerActive;
            setPeerPresent(present);
            if (n) setPeerName(n);
            if (peerActive && inChannelRef.current) attachPeer();
          },

          onPeerJoined: (n, mode) => {
            setPeerPresent(true);
            setPeerName(n);
            peerActiveRef.current = mode === 'active';
            if (mode === 'active' && inChannelRef.current) attachPeer();
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
            // In primo piano la notifica sarebbe rumore: si vede gia' tutto.
            if (appStateRef.current !== 'active') {
              Foreground.notify(
                'DuoTalk',
                reason === 'knock' ? `${n} ti aspetta nel canale` : `${n} è nel canale`,
              ).catch(() => {});
            }
          },

          onSignal: (msg) => { sessionRef.current?.onSignal(msg); },

          onKnockResult: (ok, error) => {
            if (ok) {
              setKnockPending(true);
              setTimeout(() => setKnockPending(false), 15000);
            } else if (error === 'peer-offline') {
              Alert.alert('Non raggiungibile', 'L’altro telefono non è collegato in questo momento.');
            } else if (error === 'too-soon') {
              Alert.alert('Aspetta un momento', 'Hai già avvisato da poco.');
            }
          },

          onError: (code) => {
            if (code === 'bad-token') Alert.alert('Token errato', 'Access token non valido.');
            else if (code === 'room-full') Alert.alert('Coppia occupata', 'Ci sono già due dispositivi.');
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
    // attachPeer e' stabile: usa solo ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  /** Collega il WebRTC, quando siamo entrambi nel canale. */
  const attachPeer = useCallback(async () => {
    const sig = signalingRef.current;
    const s = sessionRef.current;
    if (!sig || !s) return;
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
        onLocalStream: setLocalStream,
        onRemoteStream: setRemoteStream,
        onConnectionState: setConnState,
        onPeerState: setPeerState,
      });
    }
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

  const leaveChannel = useCallback(() => {
    const sig = signalingRef.current;
    sessionRef.current?.leaveChannel();
    sessionRef.current = null;
    try { InCallManager.stop(); } catch { /* noop */ }
    Foreground.setCameraActive(false).catch(() => {});
    Foreground.setText('In ascolto').catch(() => {});
    setLocalStream(null);
    setRemoteStream(null);
    setVideoOn(false);
    setLocalAspect(undefined);
    setConnState('new');
    setInChannel(false);
    inChannelRef.current = false;
    sig?.setMode('listening');
    setScreen('listening');
  }, []);

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
    if (screen !== 'channel') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!pipSupported.current) return false;
      Pip.enter(stageAspect).catch(() => {});
      return true;
    });
    return () => sub.remove();
  }, [screen, stageAspect]);

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
  const onSaveSettings = useCallback(async (next: DuoConfig) => {
    await saveConfig(next);
    setCfg(next);
    setScreen(isPaired(next) ? 'listening' : 'pairing');
  }, []);

  const onPaired = useCallback(async (pair: PairInfo) => {
    if (!cfg) return;
    const next = { ...cfg, pair };
    await saveConfig(next);
    setCfg(next);
    setPeerName(pair.peerName);
    setScreen('listening');
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
        <SettingsScreen initial={cfg} onSave={onSaveSettings} onUnpair={onUnpair} />
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

  if (screen === 'listening') {
    return (
      <View style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <ListeningScreen
          peerName={peerName || cfg.pair?.peerName || ''}
          status={status}
          peerPresent={peerPresent}
          knockPending={knockPending}
          onEnter={enterChannel}
          onKnock={() => signalingRef.current?.knock()}
          onSettings={() => setScreen('settings')}
        />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ChannelScreen
        channel={peerName || cfg.pair?.peerName || 'canale'}
        peerName={peerName || cfg.pair?.peerName || ''}
        localStream={localStream}
        remoteStream={remoteStream}
        status={status}
        connectionState={connState}
        audioOn={audioOn}
        videoOn={videoOn}
        peerState={peerState}
        localAspect={localAspect}
        remoteAspect={peerState.aspect}
        knockPending={knockPending}
        audioRoute={audio.route}
        canCycleRoute={audio.canCycle}
        onToggleAudio={() => setAudioOn(sessionRef.current?.toggleAudio() ?? false)}
        onToggleVideo={onToggleVideo}
        onSwitchCamera={() => sessionRef.current?.switchCamera()}
        onCycleRoute={audio.cycle}
        onKnock={() => signalingRef.current?.knock()}
        onLeave={leaveChannel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0e14' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0e14' },
});
