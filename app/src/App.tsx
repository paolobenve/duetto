import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  SafeAreaView, StatusBar, Platform, PermissionsAndroid, Alert, View,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { MediaStream } from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import Foreground from 'duotalk-foreground';
import { DuoConfig, loadConfig, saveConfig, isConfigComplete } from './config';
import { Signaling, PresenceStatus } from './signaling';
import { ChannelSession } from './webrtc';
import SettingsScreen from './SettingsScreen';
import ChannelScreen from './ChannelScreen';

type Screen = 'loading' | 'settings' | 'channel';

/**
 * Chiede TUTTI i permessi in un colpo solo, al primo avvio.
 *
 * Nota: da Android 6 microfono, camera e notifiche sono "runtime
 * permissions" e il sistema NON permette di concederle al momento
 * dell'installazione. Chiederle tutte insieme all'avvio e' la cosa piu'
 * vicina possibile: dopo la prima volta Android non le richiede piu'.
 */
async function requestAllPermissions(): Promise<{ mic: boolean; camera: boolean }> {
  if (Platform.OS !== 'android') return { mic: true, camera: true };

  const wanted: any[] = [
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    PermissionsAndroid.PERMISSIONS.CAMERA,
  ];
  // Android 13+: senza questo non si vede la notifica del foreground service.
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

  const [status, setStatus] = useState<PresenceStatus>('connecting');
  const [connState, setConnState] = useState('new');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(false);
  const [peerState, setPeerState] = useState({ audio: true, video: false });
  const [peerName, setPeerName] = useState('');
  const [knockPending, setKnockPending] = useState(false);

  const signalingRef = useRef<Signaling | null>(null);
  const sessionRef = useRef<ChannelSession | null>(null);
  const politeRef = useRef(false);
  const cameraGranted = useRef(false);

  // All'avvio: se la configurazione c'e', si entra dritti nel canale.
  useEffect(() => {
    (async () => {
      const c = await loadConfig();
      setCfg(c);
      setScreen(isConfigComplete(c) ? 'channel' : 'settings');
    })();
  }, []);

  const teardown = useCallback(() => {
    sessionRef.current?.leaveChannel();
    signalingRef.current?.close();
    sessionRef.current = null;
    signalingRef.current = null;
    Foreground.stop().catch(() => { /* noop */ });
    try { InCallManager.stop(); } catch { /* noop */ }
    setLocalStream(null);
    setRemoteStream(null);
    setVideoOn(false);
    setConnState('new');
  }, []);

  // Ciclo di vita del canale
  useEffect(() => {
    if (screen !== 'channel' || !cfg) return;
    let cancelled = false;

    (async () => {
      const perms = await requestAllPermissions();
      cameraGranted.current = perms.camera;
      if (!perms.mic) {
        Alert.alert('Permesso negato', 'Senza microfono non puoi stare nel canale.');
        setScreen('settings');
        return;
      }
      if (cancelled) return;

      // Foreground service: e' cio' che tiene viva la connessione quando
      // l'app va in background o si spegne lo schermo.
      Foreground.start('Sei nel canale', false).catch(() => { /* noop */ });

      // Audio in vivavoce, come su Discord.
      try {
        InCallManager.start({ media: 'audio' });
        InCallManager.setForceSpeakerphoneOn(true);
      } catch { /* noop */ }

      const signaling = new Signaling(cfg, {
        onStatus: setStatus,

        onJoined: async ({ polite, peerPresent }) => {
          politeRef.current = polite;
          if (!sessionRef.current) {
            sessionRef.current = new ChannelSession(cfg, signaling, {
              onLocalStream: setLocalStream,
              onRemoteStream: setRemoteStream,
              onConnectionState: setConnState,
              onPeerState: setPeerState,
            });
          }
          try {
            await sessionRef.current.enterChannel();
            setAudioOn(sessionRef.current.isAudioEnabled());
            if (peerPresent) {
              await sessionRef.current.attachPeer(polite);
              sessionRef.current.broadcastState();
            }
          } catch (e: any) {
            Alert.alert('Errore microfono', String(e?.message ?? e));
          }
        },

        onPeerJoined: async (name) => {
          setPeerName(name);
          setKnockPending(false);
          Foreground.setText(`${name} e' nel canale`).catch(() => { /* noop */ });
          try {
            await sessionRef.current?.attachPeer(politeRef.current);
            sessionRef.current?.broadcastState();
          } catch { /* noop */ }
        },

        onPeerLeft: () => {
          // L'altro e' uscito: chiudiamo la connessione ma restiamo nel canale.
          sessionRef.current?.detachPeer();
          setPeerState({ audio: true, video: false });
          setConnState('new');
          Foreground.setText('Sei nel canale').catch(() => { /* noop */ });
        },

        onSignal: (msg) => { sessionRef.current?.onSignal(msg); },

        onKnockResult: (ok, error) => {
          if (ok) {
            setKnockPending(true);
            setTimeout(() => setKnockPending(false), 15000);
          } else if (error === 'no-topic') {
            Alert.alert('Notifiche non configurate', 'Imposta il "topic dell’altro" nelle impostazioni.');
          } else if (error === 'too-soon') {
            Alert.alert('Aspetta un momento', 'Hai gia’ bussato da poco.');
          } else {
            Alert.alert('Notifica non inviata', 'Il server ntfy non ha risposto.');
          }
        },

        onError: (code) => {
          if (code === 'bad-token') Alert.alert('Token errato', 'Access token non valido.');
          else if (code === 'room-full') Alert.alert('Canale pieno', 'Ci sono gia’ due dispositivi.');
          else if (code === 'decrypt-failed') {
            Alert.alert('Passphrase diversa', 'I due telefoni hanno passphrase differenti.');
          }
        },
      });

      signalingRef.current = signaling;
      signaling.connect();
    })();

    return () => { cancelled = true; teardown(); };
  }, [screen, cfg, teardown]);

  const onToggleVideo = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    if (s.isVideoEnabled()) {
      setVideoOn(await s.disableVideo());
      // Il servizio torna al solo tipo "microphone".
      Foreground.setCameraActive(false).catch(() => { /* noop */ });
      try { InCallManager.setForceSpeakerphoneOn(true); } catch { /* noop */ }
      return;
    }
    // Normalmente il permesso c'e' gia' dall'avvio; se allora l'avevi
    // negato lo richiediamo qui, invece di lasciarti con un pulsante muto.
    if (!cameraGranted.current) {
      const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      cameraGranted.current = res === 'granted';
      if (!cameraGranted.current) {
        Alert.alert('Permesso negato', 'Serve il permesso camera per attivare il video.');
        return;
      }
    }
    // Android 14+: per usare la camera anche in background il servizio
    // deve dichiarare il tipo "camera" PRIMA di aprirla.
    await Foreground.setCameraActive(true).catch(() => { /* noop */ });
    try {
      setVideoOn(await s.enableVideo());
    } catch (e: any) {
      Foreground.setCameraActive(false).catch(() => { /* noop */ });
      Alert.alert('Errore camera', String(e?.message ?? e));
    }
  }, []);

  const onSave = useCallback(async (next: DuoConfig) => {
    await saveConfig(next);
    setCfg(next);
    setScreen('channel');
  }, []);

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
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <SettingsScreen initial={cfg} onSave={onSave} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ChannelScreen
        channel={cfg.channel}
        peerName={peerName}
        localStream={localStream}
        remoteStream={remoteStream}
        status={status}
        connectionState={connState}
        audioOn={audioOn}
        videoOn={videoOn}
        peerState={peerState}
        knockPending={knockPending}
        onToggleAudio={() => setAudioOn(sessionRef.current?.toggleAudio() ?? false)}
        onToggleVideo={onToggleVideo}
        onSwitchCamera={() => sessionRef.current?.switchCamera()}
        onKnock={() => signalingRef.current?.knock()}
        onLeave={() => setScreen('settings')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0e14' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0e14' },
});
