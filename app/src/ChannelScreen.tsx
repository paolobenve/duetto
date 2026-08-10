import React, { useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated,
  useWindowDimensions,
} from 'react-native';
import { MediaStream } from 'react-native-webrtc';
import type { PresenceStatus } from './signaling';
import VideoStage from './VideoStage';
import { AudioRoute, ROUTE_ICON, ROUTE_LABEL } from './audioRoute';

/** Dopo quanto i pulsanti si attenuano, e quanto restano visibili. */
const IDLE_MS = 4000;
const DIM_OPACITY = 0.4;

/**
 * Sotto questa larghezza siamo nella finestrella Picture-in-Picture:
 * li' comandi e badge non ci starebbero, mostriamo solo il video.
 */
const COMPACT_WIDTH = 340;

type Props = {
  channel: string;
  peerName: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  status: PresenceStatus;
  connectionState: string;
  audioOn: boolean;
  videoOn: boolean;
  peerState: { audio: boolean; video: boolean; aspect?: number };
  /** traccia video dell'altro davvero in arrivo */
  remoteHasVideo: boolean;
  /** proporzioni dei due video, per la forma del riquadrino */
  localAspect?: number;
  remoteAspect?: number;
  knockPending: boolean;
  audioRoute: AudioRoute;
  canCycleRoute: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onSwitchCamera: () => void;
  onCycleRoute: () => void;
  onKnock: () => void;
  onLeave: () => void;
};

/**
 * La schermata del canale. Non c'e' nulla da "chiamare": sei dentro,
 * e vedi se c'e' anche l'altro. Se non c'e', puoi avvisarlo.
 */
export default function ChannelScreen(props: Props) {
  const {
    channel, peerName, localStream, remoteStream, status, connectionState,
    audioOn, videoOn, peerState, remoteHasVideo, localAspect, remoteAspect,
    knockPending, audioRoute, canCycleRoute,
    onToggleAudio, onToggleVideo, onSwitchCamera, onCycleRoute, onKnock, onLeave,
  } = props;

  // In Picture-in-Picture la finestra e' minuscola: niente comandi.
  const { width: winWidth } = useWindowDimensions();
  const compact = winWidth < COMPACT_WIDTH;

  const together = status === 'together';
  const linked = connectionState === 'connected';
  // remoteHasVideo arriva come prop: e' un evento esplicito della sessione,
  // perche' le tracce entrano dentro lo stesso MediaStream e React non se
  // ne accorgerebbe guardando il riferimento.
  const localHasVideo =
    !!localStream && videoOn && localStream.getVideoTracks().length > 0;

  // I pulsanti restano SEMPRE sullo schermo: non spariscono mai, si
  // attenuano soltanto, e tornano pieni al primo tocco.
  const opacity = useRef(new Animated.Value(1)).current;
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wake = useCallback(() => {
    Animated.timing(opacity, {
      toValue: 1, duration: 120, useNativeDriver: true,
    }).start();
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: DIM_OPACITY, duration: 700, useNativeDriver: true,
      }).start();
    }, IDLE_MS);
  }, [opacity]);

  useEffect(() => {
    wake();
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [wake]);

  /** Ogni pressione riporta i pulsanti in evidenza e poi fa il suo lavoro. */
  const press = useCallback(
    (action: () => void) => () => { wake(); action(); },
    [wake],
  );

  return (
    // onTouchStart non ruba il gesto ai figli: il riquadrino resta
    // trascinabile, ma un tocco ovunque risveglia i pulsanti.
    <View style={styles.root} onTouchStart={wake}>
      <VideoStage
        localStream={localStream}
        remoteStream={remoteStream}
        localHasVideo={localHasVideo}
        remoteHasVideo={remoteHasVideo}
        localAspect={localAspect}
        remoteAspect={remoteAspect}
        compact={compact}
        placeholder={
          <PresenceCard
            status={status}
            linked={linked}
            peerName={peerName}
            peerAudio={peerState.audio}
          />
        }
      />

      {/* In PiP finisce qui: la finestrella mostra solo il video. */}
      {compact ? null : (
        <>
      {/* Barra in alto: canale + stato */}
      <Animated.View style={[styles.topBar, { opacity }]} pointerEvents="none">
        <View style={styles.badge}>
          <View style={[styles.dot, together ? styles.dotGreen : styles.dotGrey]} />
          <Text style={styles.badgeText}>{channel}</Text>
        </View>
        {together && linked ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{'\u{1F512}'} cifrato E2E</Text>
          </View>
        ) : null}
      </Animated.View>

      {/* Controlli: sempre presenti, in basso */}
      <Animated.View style={[styles.controls, { opacity }]}>
        <CircleButton
          label={videoOn ? 'Video' : 'Video off'}
          icon={videoOn ? '\u{1F4F9}' : '\u{1F4F5}'}
          active={videoOn}
          onPress={press(onToggleVideo)}
        />
        <CircleButton
          label={audioOn ? 'Audio' : 'Muto'}
          icon={audioOn ? '\u{1F3A4}' : '\u{1F507}'}
          active={audioOn}
          onPress={press(onToggleAudio)}
        />
        <CircleButton
          label="Gira"
          icon={'\u{1F504}'}
          // Senza camera accesa non c'e' nulla da girare.
          disabled={!videoOn}
          onPress={press(onSwitchCamera)}
        />
        <CircleButton
          // L'etichetta dice sempre dove sta uscendo l'audio adesso.
          label={ROUTE_LABEL[audioRoute]}
          icon={ROUTE_ICON[audioRoute]}
          active
          disabled={!canCycleRoute}
          onPress={press(onCycleRoute)}
        />
        <CircleButton
          label={knockPending ? 'Avvisato' : 'Avvisa'}
          icon={'\u{1F514}'}
          highlight={!together && !knockPending}
          disabled={together || knockPending}
          onPress={press(onKnock)}
        />
        <CircleButton
          label="Esci"
          icon={'\u{1F6AA}'}
          danger
          onPress={press(onLeave)}
        />
      </Animated.View>
        </>
      )}
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
          {'\n'}Tocca <Text style={styles.bold}>Avvisa</Text> per farglielo sapere.
        </Text>
      </View>
    );
  }

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
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.ctrlItem}
      onPress={props.onPress}
      disabled={props.disabled}
      activeOpacity={0.6}>
      <View
        style={[
          styles.circle,
          props.danger
            ? styles.circleDanger
            : props.highlight
              ? styles.circleHighlight
              : props.active
                ? styles.circleOn
                : styles.circleOff,
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
  badge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18,
  },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 7 },
  dotGreen: { backgroundColor: '#38d16a' },
  dotGrey: { backgroundColor: '#6b7686' },
  badgeText: { color: '#e6ebf1', fontSize: 13, fontWeight: '600' },

  controls: {
    // Sei pulsanti: su schermi stretti servono misure contenute.
    position: 'absolute', bottom: 30, left: 2, right: 2,
    flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-end',
  },
  ctrlItem: { alignItems: 'center', flex: 1 },
  circle: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
    // Un bordo chiaro li tiene leggibili anche sopra un video chiaro.
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  circleOn: { backgroundColor: 'rgba(30,36,48,0.82)' },
  circleOff: { backgroundColor: 'rgba(255,255,255,0.34)' },
  circleHighlight: { backgroundColor: '#2f7cf6' },
  circleDanger: { backgroundColor: '#e5484d' },
  circleDisabled: { opacity: 0.45 },
  circleIcon: { fontSize: 21 },
  ctrlLabel: {
    color: '#eef2f7', marginTop: 5, fontSize: 10, fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 4,
  },
});
