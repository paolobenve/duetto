import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { RTCView, MediaStream } from 'react-native-webrtc';
import type { SignalingStatus } from './signaling';

type Props = {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  status: SignalingStatus;
  connectionState: string;
  audioOn: boolean;
  videoOn: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onSwitchCamera: () => void;
  onHangUp: () => void;
};

const statusLabel: Record<SignalingStatus, string> = {
  connecting: 'Connessione al server...',
  'waiting-peer': 'In attesa dell’altro...',
  'peer-present': 'Collegato',
  disconnected: 'Disconnesso, riprovo...',
};

/** Schermata chiamata: video remoto a tutto schermo, il proprio in un riquadro. */
export default function CallScreen(props: Props) {
  const {
    localStream, remoteStream, status, connectionState,
    audioOn, videoOn, onToggleAudio, onToggleVideo, onSwitchCamera, onHangUp,
  } = props;

  const connected = connectionState === 'connected';

  return (
    <View style={styles.root}>
      {/* Video remoto a tutto schermo */}
      {remoteStream && videoOnRemote(remoteStream) ? (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={styles.remote}
          objectFit="cover"
          mirror={false}
        />
      ) : (
        <View style={[styles.remote, styles.remotePlaceholder]}>
          <Text style={styles.placeholderText}>
            {connected ? 'Video dell’altro non attivo' : statusLabel[status]}
          </Text>
        </View>
      )}

      {/* Anteprima locale */}
      {localStream && videoOn ? (
        <RTCView
          streamURL={localStream.toURL()}
          style={styles.local}
          objectFit="cover"
          mirror={true}
          zOrder={1}
        />
      ) : (
        <View style={[styles.local, styles.localOff]}>
          <Text style={styles.localOffText}>Camera off</Text>
        </View>
      )}

      {/* Badge stato in alto */}
      <View style={styles.badge}>
        <View style={[styles.dot, connected ? styles.dotGreen : styles.dotAmber]} />
        <Text style={styles.badgeText}>
          {connected ? 'Collegato · cifrato E2E' : statusLabel[status]}
        </Text>
      </View>

      {/* Barra controlli */}
      <View style={styles.controls}>
        <CircleButton
          label={audioOn ? 'Mic' : 'Muto'}
          active={audioOn}
          icon={audioOn ? '\u{1F3A4}' : '\u{1F507}'}
          onPress={onToggleAudio}
        />
        <CircleButton
          label={videoOn ? 'Video' : 'No video'}
          active={videoOn}
          icon={videoOn ? '\u{1F4F9}' : '\u{1F6AB}'}
          onPress={onToggleVideo}
        />
        <CircleButton
          label="Cambia"
          active
          icon={'\u{1F504}'}
          onPress={onSwitchCamera}
        />
        <CircleButton
          label="Chiudi"
          danger
          icon={'\u{1F4F4}'}
          onPress={onHangUp}
        />
      </View>
    </View>
  );
}

function videoOnRemote(stream: MediaStream): boolean {
  const t = stream.getVideoTracks()[0];
  return !!t && t.enabled;
}

function CircleButton(props: {
  label: string;
  icon: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.ctrlItem} onPress={props.onPress}>
      <View
        style={[
          styles.circle,
          props.danger ? styles.circleDanger : props.active ? styles.circleOn : styles.circleOff,
        ]}>
        <Text style={styles.circleIcon}>{props.icon}</Text>
      </View>
      <Text style={styles.ctrlLabel}>{props.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  remote: { ...StyleSheet.absoluteFillObject },
  remotePlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0e1117' },
  placeholderText: { color: '#8892a0', fontSize: 16 },
  local: {
    position: 'absolute', top: 60, right: 16, width: 110, height: 160,
    borderRadius: 12, backgroundColor: '#111', borderWidth: 1, borderColor: '#333',
  },
  localOff: { alignItems: 'center', justifyContent: 'center' },
  localOffText: { color: '#667', fontSize: 12 },
  badge: {
    position: 'absolute', top: 16, left: 16, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
  },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 8 },
  dotGreen: { backgroundColor: '#38d16a' },
  dotAmber: { backgroundColor: '#e5a83a' },
  badgeText: { color: '#e6ebf1', fontSize: 13, fontWeight: '600' },
  controls: {
    position: 'absolute', bottom: 32, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-end',
  },
  ctrlItem: { alignItems: 'center' },
  circle: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  circleOn: { backgroundColor: 'rgba(255,255,255,0.18)' },
  circleOff: { backgroundColor: 'rgba(255,255,255,0.35)' },
  circleDanger: { backgroundColor: '#e5484d' },
  circleIcon: { fontSize: 26 },
  ctrlLabel: { color: '#dfe5ec', marginTop: 6, fontSize: 12 },
});
