import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  SafeAreaView, StatusBar, Platform, PermissionsAndroid, Alert, View,
  ActivityIndicator, StyleSheet, Text, TouchableOpacity,
} from 'react-native';
import { MediaStream } from 'react-native-webrtc';
import { DuoConfig, loadConfig, saveConfig, isConfigComplete } from './config';
import { Signaling, SignalingStatus } from './signaling';
import { CallSession } from './webrtc';
import SettingsScreen from './SettingsScreen';
import CallScreen from './CallScreen';

type Screen = 'loading' | 'settings' | 'call';

/** Chiede i permessi runtime di camera e microfono su Android. */
async function ensurePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const res = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ]);
  return (
    res[PermissionsAndroid.PERMISSIONS.CAMERA] === 'granted' &&
    res[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === 'granted'
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [cfg, setCfg] = useState<DuoConfig | null>(null);

  const [status, setStatus] = useState<SignalingStatus>('connecting');
  const [connState, setConnState] = useState<string>('new');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);

  const signalingRef = useRef<Signaling | null>(null);
  const callRef = useRef<CallSession | null>(null);

  useEffect(() => {
    (async () => {
      const c = await loadConfig();
      setCfg(c);
      setScreen(isConfigComplete(c) ? 'call' : 'settings');
    })();
  }, []);

  const teardown = useCallback(() => {
    callRef.current?.stop();
    signalingRef.current?.close();
    callRef.current = null;
    signalingRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  // Avvia signaling + chiamata quando si entra nella schermata call.
  useEffect(() => {
    if (screen !== 'call' || !cfg) return;
    let cancelled = false;

    (async () => {
      const ok = await ensurePermissions();
      if (!ok) {
        Alert.alert('Permessi mancanti', 'Servono camera e microfono per la chiamata.');
        setScreen('settings');
        return;
      }
      if (cancelled) return;

      const signaling = new Signaling(cfg, {
        onStatus: setStatus,
        onJoined: async ({ initiator }) => {
          // Crea la sessione una sola volta
          if (callRef.current) return;
          const call = new CallSession(cfg, signaling, {
            onLocalStream: (s) => { setLocalStream(s); setAudioOn(true); setVideoOn(true); },
            onRemoteStream: setRemoteStream,
            onConnectionState: setConnState,
          });
          callRef.current = call;
          try {
            await call.start(initiator);
          } catch (e: any) {
            Alert.alert('Errore media', String(e?.message ?? e));
          }
        },
        onPeerLeft: () => {
          // L'altro se n'e' andato: chiudiamo la sessione ma restiamo in attesa.
          callRef.current?.stop();
          callRef.current = null;
          setRemoteStream(null);
          setLocalStream(null);
        },
        onSignal: (msg) => { callRef.current?.onSignal(msg); },
        onError: (code) => {
          if (code === 'bad-token') Alert.alert('Token errato', 'Access token non valido.');
          else if (code === 'room-full') Alert.alert('Stanza piena', 'Ci sono gia’ due dispositivi.');
          else if (code === 'decrypt-failed') {
            // Passphrase diversa tra i due telefoni
            setStatus('waiting-peer');
          }
        },
      });
      signalingRef.current = signaling;
      signaling.connect();
    })();

    return () => { cancelled = true; teardown(); };
  }, [screen, cfg, teardown]);

  const onSave = useCallback(async (next: DuoConfig) => {
    await saveConfig(next);
    setCfg(next);
    setScreen('call');
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
      <CallScreen
        localStream={localStream}
        remoteStream={remoteStream}
        status={status}
        connectionState={connState}
        audioOn={audioOn}
        videoOn={videoOn}
        onToggleAudio={() => setAudioOn(callRef.current?.toggleAudio() ?? false)}
        onToggleVideo={() => setVideoOn(callRef.current?.toggleVideo() ?? false)}
        onSwitchCamera={() => callRef.current?.switchCamera()}
        onHangUp={() => { teardown(); setScreen('settings'); }}
      />
      <TouchableOpacity style={styles.settingsLink} onPress={() => { teardown(); setScreen('settings'); }}>
        <Text style={styles.settingsLinkText}>{'⚙'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0e1117' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0e1117' },
  settingsLink: {
    position: 'absolute', top: 14, right: 14, width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)',
  },
  settingsLinkText: { color: '#fff', fontSize: 20 },
});
