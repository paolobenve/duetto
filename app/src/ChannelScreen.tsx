import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated,
  useWindowDimensions, Modal, Pressable,
} from 'react-native';
import { MediaStream } from 'react-native-webrtc';
import type { PresenceStatus } from './signaling';
import VideoStage from './VideoStage';
import { AudioRoute, ROUTE_LABEL } from './audioRoute';
import { VERSION_LABEL } from './version';
import ChangelogModal from './ChangelogModal';
import type { Avatar } from './avatar';
import { VIDEO_PROFILES } from './config';
import type { VideoQuality } from './config';
import type { VideoStats } from './webrtc';
import {
  IconaVideo, IconaMicrofono, IconaAvvisa, IconaAvvisato, IconaEsci,
  IconaImpostazioni, IconaFrontale, IconaPosteriore,
  IconaVivavoce, IconaTelefono, IconaCuffie, IconaBluetooth,
} from './Icons';

/**
 * Come si spengono i pulsanti: subito, ma piano.
 *
 * Prima restavano fermi qualche secondo e poi calavano di colpo: un
 * salto che attira l'occhio proprio mentre si vuole guardare altro. Un
 * calo continuo di dieci secondi non ha un istante in cui succede
 * qualcosa, e quando ci si accorge che sono sbiaditi lo sono già da un
 * pezzo.
 */
const FADE_MS = 10000;
const DIM_OPACITY = 0.4;

/**
 * Sotto questa larghezza siamo nella finestrella Picture-in-Picture:
 * lì comandi e badge non ci starebbero, mostriamo solo il video.
 */
const COMPACT_WIDTH = 340;

/**
 * Icona su pastiglia chiara: disegno scuro.
 *
 * Il colore di fondo serve anche alla barra dello sbarramento, che si
 * stacca dal disegno con un filo dello stesso colore su cui poggia.
 */
const SU_CHIARO = { color: '#1e1f22', sfondo: 'rgb(243,243,243)' } as const;

/** Il disegno di ogni uscita audio, per la pastiglia e per il menu. */
const ICONA_USCITA: Record<AudioRoute, (p: { size?: number; color?: string }) => JSX.Element> = {
  SPEAKER_PHONE: IconaVivavoce,
  EARPIECE: IconaTelefono,
  WIRED_HEADSET: IconaCuffie,
  BLUETOOTH: IconaBluetooth,
};

type Props = {
  channel: string;
  peerName: string;
  /** immagine dell'altro, quando non ha un nome */
  peerAvatar: Avatar;
  /** risoluzione e banda effettive, in uscita e in entrata */
  videoStats: VideoStats;
  /** profilo scelto: senza, non si capisce da cosa dipendano quei numeri */
  qualityLabel: string;
  /** le due righe tecniche sotto ai pulsanti, spente per impostazione */
  showStats: boolean;
  /** i comandi spariscono del tutto invece di attenuarsi */
  hideControls: boolean;
  /** quale camera sta riprendendo: lo dice l'icona di "Gira" */
  cameraFrontale: boolean;
  /** profilo in uso e come cambiarlo: si apre tenendo premuto "Video" */
  quality: VideoQuality;
  onSelectQuality: (q: VideoQuality) => void;
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
    channel, peerName, peerAvatar, videoStats, qualityLabel, showStats, hideControls, cameraFrontale, quality, onSelectQuality, localStream, remoteStream, status, connectionState,
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
  /**
   * L'ultimo rientro conosciuto, tenuto anche senza video.
   *
   * Spegnendo l'ultima camera il rettangolo del video sparisce e il
   * rientro andrebbe a zero: i comandi scivolavano in fondo allo schermo
   * e il riquadrino cambiava zona, per un cambiamento che dal punto di
   * vista di chi guarda non c'è stato. Restano dove sono, in attesa che
   * l'immagine torni.
   */
  const ultimoInset = useRef({ v: 0, h: 0 });
  const inset = React.useMemo(() => {
    if (winWidth <= 0 || winHeight <= 0) return ultimoInset.current;
    if (!bigAspect) return ultimoInset.current;
    const screen = winWidth / winHeight;
    const v = bigAspect > screen
      ? { v: Math.round((winHeight - winWidth / bigAspect) / 2), h: 0 }
      : { v: 0, h: Math.round((winWidth - winHeight * bigAspect) / 2) };
    ultimoInset.current = v;
    return v;
  }, [bigAspect, winWidth, winHeight]);

  const [routeMenu, setRouteMenu] = useState(false);
  const [novita, setNovita] = useState(false);
  const [menuQualita, setMenuQualita] = useState(false);
  /** chi occupa lo schermo quando c'è un video solo: 'tu', 'altro', o niente */
  const [soloGrande, setSoloGrande] = useState<'tu' | 'altro' | null>(null);

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
  /**
   * Interruzione VERA, non una rinegoziazione.
   *
   * Rinegoziare - cambio di risoluzione, ricerca di una strada diretta,
   * cambio di cella - porta la connessione in "connecting" per qualche
   * secondo senza che nulla si sia rotto: i fotogrammi riprendono da
   * soli. Contare quello stato come interruzione mostrava "collegamento
   * interrotto" proprio mentre il collegamento stava lavorando.
   *
   * Sono interruzioni solo "failed" e "disconnected", che è ciò che ICE
   * dice quando i pacchetti non arrivano davvero.
   */
  const rotto = connectionState === 'failed' || connectionState === 'disconnected';
  const notConnected = serverLost || (together && rotto);

  /**
   * Un'interruzione si dichiara solo se dura.
   *
   * Il ritardo vale sia per l'avviso sia per la DISPOSIZIONE dei
   * riquadri, ed è la seconda a contare di più: prima l'avviso aspettava
   * ma il layout si riordinava subito, quindi il riquadrino saltava a
   * schermo intero e tornava indietro a ogni rinegoziazione - la ricerca
   * di una strada diretta, un cambio di risoluzione - senza che nulla
   * fosse davvero successo.
   *
   * Tre secondi: sotto quella soglia le interruzioni si richiudono da
   * sole, e l'unica cosa peggiore di un video che si ferma un attimo è
   * un'interfaccia che si riordina due volte per dirlo.
   */
  const [showNotice, setShowNotice] = useState(false);
  useEffect(() => {
    if (!notConnected) { setShowNotice(false); return; }
    const t = setTimeout(() => setShowNotice(true), 3000);
    return () => clearTimeout(t);
  }, [notConnected]);

  /**
   * Il posto grande resta dell'altro finché lui dichiara di trasmettere.
   *
   * Questo NON aspetta i tre secondi dell'avviso: l'attesa vale per il
   * messaggio, che è un allarme, non per la disposizione. Ritardandola
   * anche qui restava una finestra in cui il proprio video saliva a
   * schermo intero per poi tornare indietro all'arrivo dell'altro - il
   * ballo che si voleva evitare, spostato di tre secondi.
   *
   * Se invece la camera dell'altro è spenta, il proprio a schermo intero
   * è la cosa giusta: lì non stiamo aspettando nulla.
   */
  const interrupted = peerState.video && !remoteHasVideo;

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

  /** true quando i comandi sono in evidenza: un tocco li fa sparire */
  const pieni = useRef(true);

  /** Il calo: parte subito e dura dieci secondi. */
  const attenua = useCallback((durata = FADE_MS) => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    pieni.current = false;
    Animated.timing(opacity, {
      // Invisibili, ma sempre premibili: un tocco ovunque li richiama.
      toValue: hideControls ? 0 : DIM_OPACITY, duration: durata, useNativeDriver: true,
    }).start();
  }, [opacity, hideControls]);

  /**
   * C'è qualcosa da guardare sotto ai comandi.
   *
   * Senza nessun video i comandi non coprono niente, e attenuarli
   * lascerebbe uno schermo scuro con sopra dei pulsanti sbiaditi: si
   * nascondono per lasciar vedere un'immagine, e se l'immagine non c'è
   * non c'è ragione.
   */
  const daVedere = localHasVideo || remoteHasVideo;

  const wake = useCallback(() => {
    pieni.current = true;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    Animated.timing(opacity, {
      toValue: 1, duration: 120, useNativeDriver: true,
    }).start(({ finished }) => {
      // Il calo riparte appena finito di tornare pieni: nessuna attesa
      // ferma, e quindi nessun istante in cui "scattano" via.
      if (finished && daVedere) attenua();
    });
  }, [opacity, attenua, daVedere]);

  /**
   * Un tocco sull'immagine: se i comandi si vedono, li toglie di mezzo.
   *
   * Aspettare i nove secondi dell'attenuazione automatica, quando si
   * vuole guardare l'immagine e basta, è una piccola prigionia.
   */
  /**
   * L'etichetta segue l'attenuazione degli altri, ma non oltre.
   *
   * Con "Nascondi i comandi" gli altri vanno a zero; questa no, perché
   * l'unica informazione che non si ricava guardando lo schermo è
   * proprio chi si sta guardando.
   */
  const opacitaEtichetta = opacity.interpolate({
    inputRange: [0, 1],
    outputRange: [DIM_OPACITY, 1],
  });

  const tocco = useCallback(() => {
    // Chiedere di toglierli è diverso dal lasciarli calare: qui si vuole
    // vedere l'immagine adesso.
    if (pieni.current) attenua(400); else wake();
  }, [attenua, wake]);

  // `wake` cambia quando cambia `daVedere`: spegnendo l'ultima camera i
  // comandi tornano pieni e ci restano.
  useEffect(() => {
    wake();
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [wake]);

  /** Ogni pressione riporta i pulsanti in evidenza e poi fa il suo lavoro. */
  const press = useCallback(
    (action: () => void) => () => { wake(); action(); },
    [wake],
  );

  /**
   * Campanella che suona subito alla pressione di "Avvisa".
   *
   * `knockPending` arriva dal server, e con la rete lenta può tardare:
   * il dito resterebbe senza risposta proprio nel momento in cui la si
   * aspetta. Questo è solo il ritorno al tocco; la conferma vera resta
   * quella del server, che tiene poi la campanella accesa per i suoi due
   * secondi.
   */
  const [appenaBussato, setAppenaBussato] = useState(false);
  const timerBussata = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timerBussata.current) clearTimeout(timerBussata.current);
  }, []);
  const bussa = useCallback(() => {
    setAppenaBussato(true);
    if (timerBussata.current) clearTimeout(timerBussata.current);
    timerBussata.current = setTimeout(() => setAppenaBussato(false), 700);
    onKnock();
  }, [onKnock]);

  return (
    // Il tocco si raccoglie dentro VideoStage, sulla sola immagine
    // grande: sul riquadrino significa già scambiare i due video, e sui
    // comandi significa premerli.
    <View style={styles.root}>
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
        insetBasso={!compact && showStats ? 36 : 0}
        onSfondo={tocco}
        onSoloGrande={setSoloGrande}
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
      {/* "Tu/Non tu" si attenua con gli altri comandi ma non sparisce
          mai: dice CHI si sta guardando a schermo intero, e con un tocco
          sul riquadrino i due si scambiano - è facile perdere il conto.
          Anche al minimo resta leggibile, che è quanto basta. */}
      {soloGrande ? (
        <Animated.View
          style={[
            styles.chiBadge,
            { top: 14 + inset.v, left: 14 + inset.h, opacity: opacitaEtichetta },
          ]}
          pointerEvents="none">
          <Text style={styles.chiText}>{soloGrande === 'tu' ? 'Tu' : 'Non tu'}</Text>
        </Animated.View>
      ) : null}

      <Animated.View
        style={[styles.topBar, { opacity, top: 14 + inset.v, left: 14 + inset.h, right: 14 + inset.h }]}>
        <View style={styles.spacer} pointerEvents="none" />
        <TouchableOpacity
          style={styles.badge}
          // Il nome dichiara già la versione: è lì che uno va a cercare
          // perché qualcosa è cambiato.
          onPress={press(() => setNovita(true))}>
          <View style={[styles.dot, together ? styles.dotGreen : styles.dotGrey]} />
          <Text style={styles.badgeText}>Duetto</Text>
          <Text style={styles.version}>  {VERSION_LABEL}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.gear} onPress={press(onOpenSettings)}>
          <IconaImpostazioni size={21} color="#e6ebf1" />
        </TouchableOpacity>
      </Animated.View>

      {/* Controlli: sempre presenti, in basso, dentro un pannello scuro */}
      <Animated.View
        style={[
          styles.panel,
          { opacity, bottom: 8 + inset.v, left: 12 + inset.h, right: 12 + inset.h },
        ]}>
        <View style={styles.controls}>
        <CircleButton
          label="Video"
          // Acceso il pulsante è una pastiglia bianca, e allora il
          // disegno va in scuro: è ciò che sta funzionando a doversi
          // vedere di più, non ciò che è spento.
          icon={<IconaVideo off={!videoOn} {...(videoOn ? SU_CHIARO : {})} />}
          active={videoOn}
          onPress={press(onToggleVideo)}
          // Come per l'audio: il tocco accende e spegne, la pressione
          // prolungata apre le scelte. La qualità si giudica guardando,
          // e andarla a cercare nelle impostazioni fa perdere di vista
          // proprio ciò che si sta valutando.
          onLongPress={press(() => setMenuQualita(true))}
        />
        <CircleButton
          // Tocco: muto/non muto. Pressione prolungata: da dove esce l'audio.
          label={audioOn ? 'Audio' : 'Muto'}
          icon={<IconaMicrofono off={!audioOn} {...(audioOn ? SU_CHIARO : {})} />}
          active={audioOn}
          onPress={press(onToggleAudio)}
          onLongPress={press(() => setRouteMenu(true))}
          badge={ICONA_USCITA[audioRoute]}
        />
        <CircleButton
          label="Gira"
          // L'icona dice quale camera è accesa: una persona sola per la
          // frontale, più persone per quella dietro, che è ciò che di
          // solito ci si trova a inquadrare.
          icon={cameraFrontale ? <IconaFrontale /> : <IconaPosteriore />}
          // Premibile anche a video spento: lì non gira niente, sceglie
          // con quale camera si accenderà. Serve a inquadrare qualcosa
          // senza mostrare prima, per un istante, la propria faccia.
          disabled={false}
          onPress={press(onSwitchCamera)}
        />
        <CircleButton
          label={knockPending ? 'Avvisato' : 'Avvisa'}
          // Per i due secondi che seguono la pressione la campanella suona:
          // è il segno che l'avviso è partito. La sola scritta cambiava
          // troppo poco per accorgersene.
          icon={appenaBussato || knockPending ? <IconaAvvisato /> : <IconaAvvisa />}
          // Acceso solo quando l'altro non c'è: lì è la cosa da fare.
          highlight={!together && !knockPending}
          // Sempre premibile: l'altro può essere nel canale ma distratto,
          // e insistere è proprio ciò che si vuole fare quando il primo
          // avviso non ha ottenuto risposta.
          disabled={false}
          onPress={press(bussa)}
        />
        <CircleButton
          label="Esci"
          icon={<IconaEsci sfondo="#da373c" />}
          danger
          onPress={press(onLeave)}
        />
        </View>
        {showStats ? (
          // Altezza fissa: comparendo la seconda riga solo quando il
          // percorso è noto, il pannello cresceva sotto le dita e i
          // pulsanti si spostavano.
          <View style={styles.statsBox}>
            <StatsLine
              stats={videoStats}
              quality={qualityLabel}
              mostraSu={localHasVideo}
              mostraGiu={remoteHasVideo}
            />
          </View>
        ) : null}
      </Animated.View>
        </>
      )}

      {/* Uscita audio: si apre tenendo premuto il pulsante Audio. */}
      <ChangelogModal visible={novita} onClose={() => setNovita(false)} />

      {/* Risoluzione: si apre tenendo premuto il pulsante Video. */}
      <Modal
        visible={menuQualita}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuQualita(false)}>
        <Pressable style={styles.sheetBack} onPress={() => setMenuQualita(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Risoluzione</Text>
            {(Object.keys(VIDEO_PROFILES) as VideoQuality[]).map((q) => (
              <TouchableOpacity
                key={q}
                style={styles.sheetRow}
                onPress={() => { onSelectQuality(q); setMenuQualita(false); }}>
                <View style={styles.sheetText}>
                  <Text style={[styles.sheetLabel, q === quality && styles.sheetLabelOn]}>
                    {VIDEO_PROFILES[q].etichetta}
                  </Text>
                  <Text style={styles.sheetNota}>{VIDEO_PROFILES[q].nota}</Text>
                </View>
                {q === quality ? <Text style={styles.sheetCheck}>{'\u2713'}</Text> : null}
              </TouchableOpacity>
            ))}
            <Text style={styles.sheetHint}>
              Vale per tutti e due i telefoni: cambiandola qui cambia anche
              all’altro.
            </Text>
          </View>
        </Pressable>
      </Modal>

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
                {React.createElement(ICONA_USCITA[r], { size: 22, color: '#e6ebf1' })}
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
/**
 * Risoluzione e banda davvero in gioco, sotto ai comandi.
 *
 * Il profilo scelto è un tetto, non una promessa: quanto passa davvero
 * dipende dalla rete e dalla scena, e sapere che si sta mandando 1080p
 * mentre si riceve 640x352 spiega in un colpo d'occhio perché l'immagine
 * dell'altro è brutta - senza dover leggere un log.
 */
function StatsLine({ stats, quality, mostraSu, mostraGiu }: {
  stats: VideoStats;
  quality: string;
  /** camere davvero accese: le statistiche restano indietro di un campione */
  mostraSu: boolean;
  mostraGiu: boolean;
}) {
  const fmt = (v?: { w: number; h: number; fps: number; kbps: number | null }) => {
    if (!v || !v.w || !v.h) return null;
    // In byte al secondo: è l'unità con cui si guarda il consumo di dati,
    // ed è anche più corta da leggere di sfuggita sotto ai pulsanti.
    const kBs = v.kbps === null ? null : v.kbps / 8;
    const banda = kBs === null ? '' :
      kBs >= 1000 ? `·${(kBs / 1000).toFixed(1)}MB/s` : `·${Math.round(kBs)}kB/s`;
    return `${v.w}×${v.h}·${v.fps}fps${banda}`;
  };
  // Spegnendo una camera il suo flusso RTP resta fra le statistiche con
  // le ultime dimensioni viste: senza questo filtro la riga continuerebbe
  // a dichiarare una risoluzione che non sta più passando.
  const su = mostraSu ? fmt(stats.out) : null;
  const giu = mostraGiu ? fmt(stats.in) : null;
  // Il profilo si mostra sempre, anche a video spento: è la scelta che
  // spiega i numeri accanto, e senza sembrerebbero venire dal nulla.
  /**
   * Da dove passa il traffico.
   *
   * Con i due telefoni su reti diverse è il dato che spiega tutto il
   * resto: se la banda è asimmetrica o l'immagine è brutta, "relay" dice
   * subito che è la strada e non il telefono. Leggerlo dal log a casa
   * dell'altra persona non è praticabile.
   */
  const strada = stats.percorso === 'locale'
    ? 'diretto, stessa rete'
    : stats.percorso === 'diretto'
      ? 'diretto tra i telefoni'
      : stats.percorso === 'relay'
        ? 'passa dal server'
        : null;

  return (
    <>
      <Text
        style={styles.stats}
        numberOfLines={1}
        // Con due video accesi la riga può non starci: meglio
        // rimpicciolirla che vederla tagliata a metà parola.
        adjustsFontSizeToFit
        minimumFontScale={0.6}>
        {`Risoluzione: ${quality.toLowerCase()}`}
        {su ? `  \u2191${su}` : ''}
        {giu ? `  \u2193${giu}` : ''}
      </Text>
      {strada || stats.audioKbps != null ? (
        <Text style={styles.stats} numberOfLines={1}>
          {strada ? `Collegamento: ${strada}` : ''}
          {stats.audioKbps != null
            ? `${strada ? '   ' : ''}audio ${stats.audioKbps} kbit/s`
            : ''}
        </Text>
      ) : null}
    </>
  );
}

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
  icon: React.ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  /** piccolo simbolo d'angolo: usato per l'uscita audio attiva */
  badge?: (p: { size?: number; color?: string }) => JSX.Element;
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
              : props.active === true
                ? styles.circleOn
                : null,
          props.disabled && styles.circleDisabled,
        ]}>
        {props.icon}
        {props.badge ? (
          <View style={styles.miniBadge}>
            <props.badge size={13} color="#e6ebf1" />
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
  statsBox: { height: 36, justifyContent: 'center' },
  stats: {
    color: '#7d8794', fontSize: 10.5, textAlign: 'center',
    letterSpacing: 0.2, lineHeight: 16,
  },
  avatarGhost: { fontSize: 54, marginBottom: 16 },
  cardTitle: { color: '#e6ebf1', fontSize: 21, fontWeight: '700', textAlign: 'center' },
  cardSub: { color: '#8892a0', fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 22 },
  bold: { color: '#c9d2de', fontWeight: '700' },
  cardTiny: { color: '#4a5462', fontSize: 12, marginTop: 10 },

  topBar: {
    position: 'absolute', top: 14, left: 14, right: 14,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  chiBadge: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  chiText: { color: '#e6ebf1', fontSize: 12.5, fontWeight: '700' },
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
    position: 'absolute', right: -4, bottom: -4,
    backgroundColor: '#1e1f22', borderRadius: 10, padding: 2,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.45)',
  },
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
  sheetText: { flex: 1 },
  sheetNota: { color: '#6b7686', fontSize: 12.5, marginTop: 2 },
  sheetLabelOn: { color: '#7cc4ff', fontWeight: '700' },
  sheetCheck: { color: '#7cc4ff', fontSize: 18, fontWeight: '700' },
  sheetHint: {
    color: '#5a6472', fontSize: 12, paddingHorizontal: 14, paddingTop: 6, lineHeight: 17,
  },

  panel: {
    position: 'absolute', bottom: 8, left: 12, right: 12,
    backgroundColor: 'rgba(30,31,34,0.94)',
    borderRadius: 28,
    paddingTop: 14, paddingBottom: 14, paddingHorizontal: 4,
  },
  // La linguetta in cima, come nei pannelli che si trascinano.

  controls: {
    flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start',
  },
  ctrlItem: { alignItems: 'center', flex: 1 },
  circle: {
    width: 48, height: 48, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  // Spento: sfondo chiaro, come Discord segnala il microfono in muto.
  circleOn: { backgroundColor: 'rgba(255,255,255,0.92)' },
  circleHighlight: { backgroundColor: '#2f7cf6' },
  circleDanger: { backgroundColor: '#da373c' },
  circleDisabled: { opacity: 0.35 },
  circleIcon: { fontSize: 22 },
  ctrlLabel: {
    color: 'rgba(255,255,255,0.72)', marginTop: 6, fontSize: 10, fontWeight: '600',
  },
});
