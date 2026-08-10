import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MediaStream } from 'react-native-webrtc';
import type { PresenceStatus } from './signaling';
import VideoStage from './VideoStage';

type Props = {
  channel: string;
  peerName: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  status: PresenceStatus;
  connectionState: string;
  audioOn: boolean;
  videoOn: boolean;
  peerState: { audio: boolean; video: boolean };
  knockPending: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onSwitchCamera: () => void;
  onKnock: () => void;
  onOpenSettings: () => void;
};

/**
 * La schermata del canale. Non c'e' nulla da "chiamare": sei dentro,
 * e vedi se c'e' anche l'altro. Se non c'e', puoi bussare.
 */
export default function ChannelScreen(props: Props) {
  const {
    channel, peerName, localStream, remoteStream, status, connectionState,
    audioOn, videoOn, peerState, knockPending,
    onToggleAudio, onToggleVideo, onSwitchCamera, onKnock, onOpenSettings,
  } = props;

  const together = status === 'together';
  const linked = connectionState === 'connected';
  const remoteHasVideo =
    !!remoteStream && peerState.video && remoteStream.getVideoTracks().length > 0;
  const localHasVideo =
    !!localStream && videoOn && localStream.getVideoTracks().length > 0;

  return (
    <View style={styles.root}>
      <VideoStage
        localStream={localStream}
        remoteStream={remoteStream}
        localHasVideo={localHasVideo}
        remoteHasVideo={remoteHasVideo}
        placeholder={
          <PresenceCard
            status={status}
            linked={linked}
            peerName={peerName}
            peerAudio={peerState.audio}
          />
        }
      />

      {/* Barra in alto: canale + stato */}
      <View style={styles.topBar}>
        <View style={styles.badge}>
          <View style={[styles.dot, together ? styles.dotGreen : styles.dotGrey]} />
          <Text style={styles.badgeText}>#{channel}</Text>
        </View>
        {together && linked ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{'\u{1F512}'} cifrato E2E</Text>
          </View>
        ) : null}
        <View style={styles.spacer} />
        <TouchableOpacity style={styles.gear} onPress={onOpenSettings}>
          <Text style={styles.gearText}>{'⚙'}</Text>
        </TouchableOpacity>
      </View>

      {/* Controlli */}
      <View style={styles.controls}>
        <CircleButton
          label={audioOn ? 'Microfono' : 'Muto'}
          icon={audioOn ? '\u{1F3A4}' : '\u{1F507}'}
          active={audioOn}
          onPress={onToggleAudio}
        />
        <CircleButton
          label={videoOn ? 'Video' : 'Video off'}
          icon={videoOn ? '\u{1F4F9}' : '\u{1F4F5}'}
          active={videoOn}
          onPress={onToggleVideo}
        />
        {videoOn ? (
          <CircleButton label="Gira" icon={'\u{1F504}'} active onPress={onSwitchCamera} />
        ) : null}
        <CircleButton
          label={knockPending ? 'Inviata' : 'Bussa'}
          icon={'\u{1F514}'}
          highlight={!together}
          disabled={together || knockPending}
          onPress={onKnock}
        />
      </View>
    </View>
  );
}

function PresenceCard(props: {
  status: PresenceStatus;
  linked: boolean;
  peerName: string;
  peerAudio: boolean;
}) {
  const { status, linked, peerName, peerAudio } = props;
  const initial = (peerName || '?').trim().charAt(0).toUpperCase();

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
        <View style={[styles.avatar, styles.avatarEmpty]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.cardTitle}>Sei nel canale</Text>
        <Text style={styles.cardSub}>
          {peerName ? `${peerName} non c'e' ancora.` : 'L’altro non c’e’ ancora.'}
          {'\n'}Tocca <Text style={styles.bold}>Bussa</Text> per farglielo sapere.
        </Text>
      </View>
    );
  }

  // together
  return (
    <View style={styles.card}>
      <View style={[styles.avatar, styles.avatarLive]}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <Text style={styles.cardTitle}>{peerName || 'L’altro'} e’ nel canale</Text>
      <Text style={styles.cardSub}>
        {!linked
          ? 'Sto stabilendo la connessione diretta...'
          : peerAudio
            ? 'Audio collegato · video non attivo'
            : 'Ha il microfono muto'}
      </Text>
    </View>
  );
}

function CircleButton(props: {
  label: string;
  icon: string;
  onPress: () => void;
  active?: boolean;
  highlight?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.ctrlItem}
      onPress={props.onPress}
      disabled={props.disabled}
      activeOpacity={0.7}>
      <View
        style={[
          styles.circle,
          props.highlight ? styles.circleHighlight : props.active ? styles.circleOn : styles.circleOff,
          props.disabled && styles.circleDisabled,
        ]}>
        <Text style={styles.circleIcon}>{props.icon}</Text>
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
  avatarEmpty: { backgroundColor: '#1a1f29', borderColor: '#2a313d' },
  avatarLive: { backgroundColor: '#14361f', borderColor: '#38d16a' },
  avatarText: { color: '#e6ebf1', fontSize: 42, fontWeight: '700' },
  avatarGhost: { fontSize: 54, marginBottom: 16 },
  cardTitle: { color: '#e6ebf1', fontSize: 21, fontWeight: '700', textAlign: 'center' },
  cardSub: { color: '#8892a0', fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 22 },
  bold: { color: '#c9d2de', fontWeight: '700' },

  topBar: {
    position: 'absolute', top: 14, left: 14, right: 14,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  spacer: { flex: 1 },
  badge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18,
  },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 7 },
  dotGreen: { backgroundColor: '#38d16a' },
  dotGrey: { backgroundColor: '#6b7686' },
  badgeText: { color: '#e6ebf1', fontSize: 13, fontWeight: '600' },
  gear: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  gearText: { color: '#e6ebf1', fontSize: 18 },

  controls: {
    position: 'absolute', bottom: 34, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-end',
  },
  ctrlItem: { alignItems: 'center' },
  circle: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  circleOn: { backgroundColor: 'rgba(255,255,255,0.20)' },
  circleOff: { backgroundColor: 'rgba(255,255,255,0.38)' },
  circleHighlight: { backgroundColor: '#2f7cf6' },
  circleDisabled: { opacity: 0.35 },
  circleIcon: { fontSize: 26 },
  ctrlLabel: { color: '#dfe5ec', marginTop: 7, fontSize: 12 },
});
