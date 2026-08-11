import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated,
  useWindowDimensions, Modal, Pressable,
} from 'react-native';
import { MediaStream } from 'react-native-webrtc';
import type { PresenceStatus } from './signaling';
import VideoStage from './VideoStage';
import { AudioRoute, ROUTE_ICON, ROUTE_LABEL } from './audioRoute';
import { VERSION_LABEL } from './version';

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
  onLeave: () => void;
  onOpenSettings: () => void;
};

/**
 * La schermata del canale. Non c'e' nulla da "chiamare": sei dentro,
 * e vedi se c'e' anche l'altro. Se non c'e', puoi avvisarlo.
 */
export default function ChannelScreen(props: Props) {
  const {
    channel, peerName, localStream, remoteStream, status, connectionState,
    audioOn, videoOn, peerState, remoteHasVideo, remoteVideoKey, localAspect, remoteAspect,
    knockPending, audioRoute, audioRoutes,
    onToggleAudio, onToggleVideo, onSwitchCamera, onSelectRoute, onKnock, onLeave, onOpenSettings,
  } = props;

  // In Picture-in-Picture la finestra e' minuscola: niente comandi.
  const { width: winWidth } = useWindowDimensions();
  const compact = winWidth < COMPACT_WIDTH;

  const [routeMenu, setRouteMenu] = useState(false);

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
        remoteVideoKey={remoteVideoKey}
        localAspect={localAspect}
        remoteAspect={remoteAspect}
        compact={compact}
        placeholder={
          <PresenceCard
            status={status}
            linked={linked}
            connectionState={connectionState}
            peerName={peerName}
            peerAudio={peerState.audio}
          />
        }
      />

      {/* In PiP finisce qui: la finestrella mostra solo il video. */}
      {compact ? null : (
        <>
      {/* Barra in alto: canale + stato */}
      <Animated.View style={[styles.topBar, { opacity }]}>
        <TouchableOpacity style={styles.gear} onPress={press(onOpenSettings)}>
          <Text style={styles.gearText}>{'\u2699'}</Text>
        </TouchableOpacity>
        <View style={styles.spacer} pointerEvents="none" />
        <View style={styles.badge} pointerEvents="none">
          <View style={[styles.dot, together ? styles.dotGreen : styles.dotGrey]} />
          <Text style={styles.badgeText}>DuoTalk</Text>
          <Text style={styles.version}>  {VERSION_LABEL}</Text>
        </View>
      </Animated.View>

      {/* Controlli: sempre presenti, in basso, dentro un pannello scuro */}
      <Animated.View style={[styles.panel, { opacity }]}>
        <View style={styles.handle} />
        <View style={styles.controls}>
        <CircleButton
          label={videoOn ? 'Video' : 'Video off'}
          icon={videoOn ? '\u{1F4F9}' : '\u{1F4F5}'}
          active={videoOn}
          onPress={press(onToggleVideo)}
        />
        <CircleButton
          // Tocco: muto/non muto. Pressione prolungata: da dove esce l'audio.
          label={audioOn ? 'Audio' : 'Muto'}
          icon={audioOn ? '\u{1F3A4}' : '\u{1F507}'}
          active={audioOn}
          onPress={press(onToggleAudio)}
          onLongPress={press(() => setRouteMenu(true))}
          badge={ROUTE_ICON[audioRoute]}
        />
        <CircleButton
          label="Gira"
          icon={'\u{1F504}'}
          // Senza camera accesa non c'e' nulla da girare.
          disabled={!videoOn}
          onPress={press(onSwitchCamera)}
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
          icon={'\u{1F4F4}'}
          danger
          onPress={press(onLeave)}
        />
        </View>
      </Animated.View>
        </>
      )}

      {/* Uscita audio: si apre tenendo premuto il pulsante Audio. */}
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
                <Text style={styles.sheetIcon}>{ROUTE_ICON[r]}</Text>
                <Text style={[styles.sheetLabel, r === audioRoute && styles.sheetLabelOn]}>
                  {ROUTE_LABEL[r]}
                </Text>
                {r === audioRoute ? <Text style={styles.sheetCheck}>{'\u2713'}</Text> : null}
              </TouchableOpacity>
            ))}
            {audioRoutes.length < 2 ? (
              <Text style={styles.sheetHint}>
                Collega cuffie o un dispositivo Bluetooth per avere altre scelte.
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function PresenceCard(props: {
  status: PresenceStatus;
  linked: boolean;
  connectionState: string;
  peerName: string;
  peerAudio: boolean;
}) {
  const { status, linked, connectionState, peerName, peerAudio } = props;
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
        {linked
          ? (peerAudio ? 'Audio collegato · video non attivo' : 'Ha il microfono muto')
          : connectionState === 'failed'
            ? 'Collegamento diretto non riuscito.\nSenza un server TURN certe reti lo impediscono.'
            : 'Sto stabilendo la connessione diretta…'}
      </Text>
      {/* Lo stato grezzo aiuta a capire dove si e' fermato. */}
      {linked ? null : (
        <Text style={styles.cardTiny}>stato: {connectionState}</Text>
      )}
    </View>
  );
}

function CircleButton(props: {
  label: string;
  icon: string;
  onPress: () => void;
  onLongPress?: () => void;
  /** piccolo simbolo d'angolo: usato per l'uscita audio attiva */
  badge?: string;
  active?: boolean;
  highlight?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.ctrlItem}
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      delayLongPress={350}
      disabled={props.disabled}
      activeOpacity={0.6}>
      <View
        style={[
          styles.circle,
          // Come su Discord: l'icona sta nuda sul pannello, e prende uno
          // sfondo solo quando la funzione e' spenta o va evidenziata.
          props.danger
            ? styles.circleDanger
            : props.highlight
              ? styles.circleHighlight
              : props.active === false
                ? styles.circleOff
                : null,
          props.disabled && styles.circleDisabled,
        ]}>
        <Text style={styles.circleIcon}>{props.icon}</Text>
        {props.badge ? (
          <View style={styles.miniBadge}>
            <Text style={styles.miniBadgeText}>{props.badge}</Text>
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
  avatarEmpty: { backgroundColor: '#1a1f29', borderColor: '#2a313d' },
  avatarLive: { backgroundColor: '#14361f', borderColor: '#38d16a' },
  avatarText: { color: '#e6ebf1', fontSize: 42, fontWeight: '700' },
  avatarGhost: { fontSize: 54, marginBottom: 16 },
  cardTitle: { color: '#e6ebf1', fontSize: 21, fontWeight: '700', textAlign: 'center' },
  cardSub: { color: '#8892a0', fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 22 },
  bold: { color: '#c9d2de', fontWeight: '700' },
  cardTiny: { color: '#4a5462', fontSize: 12, marginTop: 10 },

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
  spacer: { flex: 1 },
  gear: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  gearText: { color: '#e6ebf1', fontSize: 17 },
  version: { color: 'rgba(230,235,241,0.45)', fontSize: 10 },
  miniBadge: {
    position: 'absolute', right: -2, bottom: -2,
    backgroundColor: '#1e1f22', borderRadius: 9, paddingHorizontal: 3, paddingVertical: 1,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
  },
  miniBadgeText: { fontSize: 10 },
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
  sheetLabelOn: { color: '#7cc4ff', fontWeight: '700' },
  sheetCheck: { color: '#7cc4ff', fontSize: 18, fontWeight: '700' },
  sheetHint: {
    color: '#5a6472', fontSize: 12, paddingHorizontal: 14, paddingTop: 6, lineHeight: 17,
  },

  panel: {
    position: 'absolute', bottom: 22, left: 12, right: 12,
    backgroundColor: 'rgba(30,31,34,0.94)',
    borderRadius: 28,
    paddingTop: 10, paddingBottom: 14, paddingHorizontal: 4,
  },
  // La linguetta in cima, come nei pannelli che si trascinano.
  handle: {
    width: 42, height: 4, borderRadius: 2, alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)', marginBottom: 10,
  },
  controls: {
    flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start',
  },
  ctrlItem: { alignItems: 'center', flex: 1 },
  circle: {
    width: 48, height: 48, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  // Spento: sfondo chiaro, come Discord segnala il microfono in muto.
  circleOff: { backgroundColor: 'rgba(255,255,255,0.92)' },
  circleHighlight: { backgroundColor: '#2f7cf6' },
  circleDanger: { backgroundColor: '#da373c' },
  circleDisabled: { opacity: 0.35 },
  circleIcon: { fontSize: 22 },
  ctrlLabel: {
    color: 'rgba(255,255,255,0.72)', marginTop: 6, fontSize: 10, fontWeight: '600',
  },
});
