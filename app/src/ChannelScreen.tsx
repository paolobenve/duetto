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
import type { Avatar } from './avatar';

/** Dopo quanto i pulsanti si attenuano, e quanto restano visibili. */
const IDLE_MS = 4000;
const DIM_OPACITY = 0.4;

/**
 * Sotto questa larghezza siamo nella finestrella Picture-in-Picture:
 * lì comandi e badge non ci starebbero, mostriamo solo il video.
 */
const COMPACT_WIDTH = 340;

type Props = {
  channel: string;
  peerName: string;
  /** immagine dell'altro, quando non ha un nome */
  peerAvatar: Avatar;
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
 * La schermata del canale. Non c'è nulla da "chiamare": sei dentro,
 * e vedi se c'è anche l'altro. Se non c'è, puoi avvisarlo.
 */
export default function ChannelScreen(props: Props) {
  const {
    channel, peerName, peerAvatar, localStream, remoteStream, status, connectionState,
    audioOn, videoOn, peerState, remoteHasVideo, remoteVideoKey, localAspect, remoteAspect,
    knockPending, audioRoute, audioRoutes,
    onToggleAudio, onToggleVideo, onSwitchCamera, onSelectRoute, onKnock, onLeave, onOpenSettings,
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
  const inset = React.useMemo(() => {
    if (!bigAspect || winWidth <= 0 || winHeight <= 0) return { v: 0, h: 0 };
    const screen = winWidth / winHeight;
    return bigAspect > screen
      ? { v: Math.round((winHeight - winWidth / bigAspect) / 2), h: 0 }
      : { v: 0, h: Math.round((winWidth - winHeight * bigAspect) / 2) };
  }, [bigAspect, winWidth, winHeight]);

  const [routeMenu, setRouteMenu] = useState(false);

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
  const notConnected = serverLost || (together && !linked);

  /**
   * L'avviso di interruzione aspetta un attimo prima di comparire.
   *
   * Rimettendo il wifi il collegamento si ristabilisce in poche centinaia
   * di millisecondi, e l'avviso faceva in tempo a lampeggiare: un allarme
   * per qualcosa che si era già risolto da solo dà l'impressione di
   * un'app fragile proprio mentre sta funzionando bene.
   */
  const [showNotice, setShowNotice] = useState(false);
  useEffect(() => {
    if (!notConnected) { setShowNotice(false); return; }
    const t = setTimeout(() => setShowNotice(true), 1200);
    return () => clearTimeout(t);
  }, [notConnected]);

  /**
   * Riserviamo il posto grande all'altro solo se ci aspettiamo davvero
   * il suo video: se ha la camera spenta, il proprio a schermo intero è
   * la cosa giusta da mostrare.
   */
  const interrupted = notConnected && peerState.video;

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
        awaitingRemote={interrupted}
        notice={notice}
        localAspect={localAspect}
        remoteAspect={remoteAspect}
        compact={compact}
        onBigAspect={setBigAspect}
        insetV={compact ? 0 : inset.v}
        insetH={compact ? 0 : inset.h}
        placeholder={
          <PresenceCard
            status={status}
            linked={linked}
            connectionState={connectionState}
            peerName={peerName}
            peerAvatar={peerAvatar}
            peerAudio={peerState.audio}
          />
        }
      />

      {/* In PiP finisce qui: la finestrella mostra solo il video. */}
      {compact ? null : (
        <>
      {/* Barra in alto: canale + stato */}
      {/* Anche la barra in alto sta dentro il video: fuori, sulla banda
          nera, sembra staccata dall'immagine a cui appartiene. Il
          riquadrino le lascia il posto scendendo, non lei salendo. */}
      <Animated.View
        style={[styles.topBar, { opacity, top: 14 + inset.v, left: 14 + inset.h, right: 14 + inset.h }]}>
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
      <Animated.View
        style={[
          styles.panel,
          { opacity, bottom: 22 + inset.v, left: 12 + inset.h, right: 12 + inset.h },
        ]}>
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
          // Senza camera accesa non c'è nulla da girare.
          disabled={!videoOn}
          onPress={press(onSwitchCamera)}
        />
        <CircleButton
          label={knockPending ? 'Avvisato' : 'Avvisa'}
          icon={'\u{1F514}'}
          // Acceso solo quando l'altro non c'è: lì è la cosa da fare.
          highlight={!together && !knockPending}
          // Sempre premibile: l'altro può essere nel canale ma distratto,
          // e insistere è proprio ciò che si vuole fare quando il primo
          // avviso non ha ottenuto risposta.
          disabled={false}
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
  peerAvatar: Avatar;
  peerAudio: boolean;
}) {
  const { status, linked, connectionState, peerName, peerAvatar, peerAudio } = props;

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
        <Text style={styles.cardTitle}>Sei nel canale</Text>
        <Text style={styles.cardSub}>
          {peerName ? `${peerName} non c’è ancora.` : 'L’altro non c’è ancora.'}
          {'\n'}Tocca <Text style={styles.bold}>Avvisa</Text> per farglielo sapere.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <PeerFace name={peerName} avatar={peerAvatar} live />
      <Text style={styles.cardTitle}>{peerName || 'L’altro'} è nel canale</Text>
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
          // sfondo solo quando la funzione è spenta o va evidenziata.
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
  /** il colore proprio resta: dentro il canale cambia solo l'anello */
  avatarLive: { borderColor: '#38d16a' },
  avatarText: { color: '#e6ebf1', fontSize: 42, fontWeight: '700' },
  avatarSymbol: { fontSize: 52 },
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
