import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, StyleSheet, Animated, PanResponder, useWindowDimensions, Text,
} from 'react-native';
import { RTCView, MediaStream } from 'react-native-webrtc';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_ASPECT } from './webrtc';

/**
 * L'area video.
 *
 *  - chi è a schermo intero non viene MAI tagliato: objectFit "contain",
 *    quindi si vedono eventuali bande nere ma l'immagine è integra;
 *  - il secondo video sta in un riquadrino con le PROPORZIONI della sua
 *    camera (mai quadrato), trascinabile e ridimensionabile;
 *  - toccando il riquadrino i due si scambiano di posto;
 *  - se uno solo dei due ha il video acceso, quello va a schermo intero
 *    e il riquadrino non compare proprio.
 */

/**
 * Dove l'utente ha messo il riquadrino, e quanto grande.
 *
 * Fuori dal componente di proposito: entrando nelle impostazioni la
 * schermata del canale viene smontata, e con lei andava persa la
 * posizione scelta - tornando indietro il riquadrino risaltava in alto a
 * destra, dove nasce. Una preferenza espressa trascinando è comunque una
 * preferenza: va rispettata finché l'app è viva.
 *
 * Si ricorda il BORDO a cui è appoggiato e la distanza da quello, non
 * le coordinate: quello che si sceglie è "in basso a sinistra, staccato
 * un dito", non "a 340 pixel dall'angolo dello schermo". Cambiando le
 * proporzioni del video le bande nere si spostano, e con esse i suoi
 * bordi: un riquadrino appoggiato in basso a sinistra deve restare lì,
 * non scivolare verso il centro.
 */
type Ancoraggio = {
  /**
   * A quale bordo del video è appoggiato, e a che distanza da quello.
   *
   * La distanza è una FRAZIONE dello spazio in cui il riquadrino può
   * muoversi, non una misura in pixel: i quadri hanno formati diversi -
   * un 4:3 e un 16:9 lasciano bande nere di altezza diversa - e gli
   * stessi pixel vi peserebbero in modo diverso.
   */
  ax: 'sinistra' | 'destra';
  ay: 'alto' | 'basso';
  ox: number;
  oy: number;
  /** larghezza scelta, in frazione della larghezza dello schermo */
  fw: number;
};

let posizioneScelta: Ancoraggio | null = null;
const CHIAVE_PIP = 'duetto.pip.v2';

/** Scrittura pigra: trascinando si salverebbe a ogni fotogramma. */
let salvaTimer: ReturnType<typeof setTimeout> | null = null;
function salvaPosizione() {
  if (salvaTimer) clearTimeout(salvaTimer);
  salvaTimer = setTimeout(() => {
    if (posizioneScelta) {
      AsyncStorage.setItem(CHIAVE_PIP, JSON.stringify(posizioneScelta)).catch(() => {});
    }
  }, 600);
}

/** Rilettura all'avvio: la posizione è una preferenza, non uno stato. */
export async function caricaPosizionePip(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CHIAVE_PIP);
    if (!raw) return;
    const v = JSON.parse(raw);
    if (typeof v?.ox === 'number' && typeof v?.oy === 'number') posizioneScelta = v;
  } catch { /* una posizione persa non è un guasto */ }
}

const MARGIN = 14;
const TOP_SAFE = 58;     // appena sotto ingranaggio e badge (14 + 36 + 8)
// Sopra il pannello dei comandi: 8 di distacco dal fondo + ~96 di
// pannello (bordi, pulsanti, etichette) + aria. Le righe di diagnostica,
// quando attive, si aggiungono tramite `insetBasso`.
const BOTTOM_SAFE = 114;

/** Larghezza del riquadrino, come frazione della larghezza schermo. */
const START_FRACTION = 0.3;
const MIN_FRACTION = 0.18;
const MAX_FRACTION = 0.62;

const HANDLE = 34; // area di presa per ridimensionare

/** Quanto si può ingrandire il video grande col pizzico. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
/** Ingrandimento del doppio tocco. */
const TAP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 300;

type Props = {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  localHasVideo: boolean;
  remoteHasVideo: boolean;
  /** larghezza/altezza del proprio video, come viene mostrato */
  localAspect?: number;
  /** larghezza/altezza del video dell'altro */
  remoteAspect?: number;
  /** cambia a ogni ripartenza del video remoto: ricrea il visualizzatore */
  remoteVideoKey?: number;
  /**
   * Il video dell'altro è atteso ma momentaneamente assente.
   *
   * Serve a NON promuovere il proprio video a schermo intero durante
   * un'interruzione: il posto grande resta dell'altro, così al ritorno
   * non si vede prima il proprio ingrandirsi e poi rimpicciolirsi.
   */
  awaitingRemote?: boolean;
  /** avviso da sovrapporre al video, es. durante un'interruzione */
  notice?: string;
  /** in Picture-in-Picture: solo il video grande, senza riquadrino */
  compact?: boolean;
  /**
   * La propria immagine va rovesciata come uno specchio.
   *
   * Vale per la camera frontale e solo per quella: chi si guarda si
   * aspetta lo specchio, ed è così che ci si sistema i capelli. Con la
   * camera dietro si sta inquadrando il mondo, e il mondo rovesciato è
   * sbagliato e basta: le scritte si leggono al contrario e ci si
   * muove dalla parte opposta a quella che si vede. L'altro riceve
   * comunque l'immagine come la produce la camera: lo specchio è solo
   * nell'anteprima di qua.
   */
  specchia?: boolean;
  /** mostrato quando non c'è nessun video */
  placeholder: React.ReactNode;
  /**
   * Quanto si è ingrandito, a gesto finito.
   *
   * Serve al diario: durante il pizzico il numero cambia cento volte al
   * secondo, e cento righe non raccontano niente. Quella che conta è
   * dove si è deciso di restare.
   */
  onIngrandimento?: (zoom: number) => void;
  /**
   * Segno da mettere accanto a "Non tu": lo stato audio dell'altro.
   * Solo per il suo video, ovviamente: sul proprio non direbbe nulla che
   * non si sappia già dai pulsanti.
   */
  segnoAltro?: React.ReactNode;
  /** lo stesso, per la propria immagine: uscita e volume con cui l'altro ci sente */
  segnoMio?: React.ReactNode;
  /**
   * Proporzioni del video a schermo intero, `null` se non ce n'è nessuno.
   *
   * Serve a chi disegna i comandi sopra: con "contain" il video non
   * riempie lo schermo, e una barra posizionata sui bordi dello schermo
   * finisce a metà sull'immagine e metà sul nero.
   */
  onBigAspect?: (aspect: number | null) => void;
  /**
   * Di quanto i comandi sono rientrati rispetto ai bordi dello schermo.
   *
   * I comandi seguono il bordo del VIDEO, non quello dello schermo: senza
   * saperlo, il riquadrino userebbe zone di rispetto misurate dallo
   * schermo e finirebbe sotto l'ingranaggio o sotto il pannello.
   */
  insetV?: number;
  insetH?: number;
  /** spazio in più occupato in basso, es. le righe di diagnostica */
  insetBasso?: number;
  /**
   * Tocco sull'immagine grande, riquadrino escluso.
   *
   * Serve a chi disegna i comandi sopra: un tocco sullo sfondo li mostra
   * o li nasconde. Il riquadrino ne resta fuori perché lì il tocco ha già
   * un significato suo - scambia grande e piccolo.
   */
  onSfondo?: () => void;
  /**
   * Chi occupa lo schermo grande.
   *
   * L'etichetta la disegna chi fa la barra in alto, per tenerla sulla
   * riga del nome. Vale sempre, anche col riquadrino presente: scambiando
   * i due video con un tocco è facile perdere il conto di chi si sta
   * guardando, e il riquadrino da solo non lo dice.
   */
  onSoloGrande?: (chi: 'tu' | 'altro' | null) => void;
  /**
   * Cosa scrivere nel riquadrino quando dentro non c'è nessuna immagine.
   *
   * Lo decide chi ci sta sopra, perché è lui a sapere come sta l'altro:
   * qui si sa solo che un video non c'è, e "in attesa" - che è quello
   * che c'era scritto sempre - è vero quando la sua immagine sta per
   * tornare, ma non quando è nel canale con la camera spenta o non è
   * raggiungibile affatto.
   */
  etichettaVuoto?: string;
};

export default function VideoStage(props: Props) {
  const {
    localStream, remoteStream, localHasVideo, remoteHasVideo,
    localAspect, remoteAspect, remoteVideoKey, compact, placeholder, segnoAltro, segnoMio,
    specchia = true, onIngrandimento, etichettaVuoto,
    awaitingRemote, notice,
  } = props;
  const { width, height } = useWindowDimensions();
  const { onBigAspect, insetV = 0, insetH = 0, insetBasso = 0, onSfondo, onSoloGrande } = props;

  // false = l'altro è grande (default), true = sono io ad essere grande
  const [selfBig, setSelfBig] = useState(false);
  const bothHaveVideo = localHasVideo && remoteHasVideo;

  /**
   * Si torna al default solo quando di mio non c'è niente da mostrare.
   *
   * Prima si tornava indietro appena i video non erano due, e con la
   * camera accesa da solo lo scambio non teneva: si toccava il
   * riquadrino, la propria immagine saliva e nello stesso istante
   * ridiscendeva. Ma lì la scelta esiste eccome - la propria immagine
   * grande, o il riepilogo di dov'è l'altro con la propria immagine nel
   * riquadrino - ed è di chi guarda.
   *
   * NON si azzera durante un'interruzione: lì il video dell'altro manca
   * solo momentaneamente, e azzerare significherebbe ritrovarsi la
   * disposizione cambiata a ogni caduta di rete.
   */
  useEffect(() => {
    if (!localHasVideo && selfBig && !awaitingRemote) setSelfBig(false);
  }, [localHasVideo, selfBig, awaitingRemote]);

  // --- Chi va dove --------------------------------------------------------
  let bigStream: MediaStream | null = null;
  let bigIsSelf = false;
  let pipStream: MediaStream | null = null;
  let pipIsSelf = false;
  // Riquadrino da disegnare comunque, anche senza immagine dentro:
  // toglierlo e rimetterlo a ogni interruzione fa ballare il layout.
  let pipEmpty = false;

  if (bothHaveVideo) {
    bigIsSelf = selfBig;
    bigStream = selfBig ? localStream : remoteStream;
    pipIsSelf = !selfBig;
    pipStream = selfBig ? remoteStream : localStream;
  } else if (remoteHasVideo) {
    bigStream = remoteStream;
  } else if (awaitingRemote && localHasVideo) {
    // Interruzione in corso: si mantiene la disposizione scelta, così
    // al ritorno nulla si sposta.
    if (selfBig) {
      // Avevi messo te stesso davanti: resti davanti, e il riquadrino
      // dell'altro resta al suo posto in attesa dell'immagine.
      bigStream = localStream;
      bigIsSelf = true;
      pipEmpty = true;
    } else {
      // Il posto grande resta dell'altro, vuoto con l'avviso sopra:
      // promuovere il proprio farebbe vedere il proprio ingrandirsi e
      // poi rimpicciolirsi appena l'altro torna.
      pipStream = localStream;
      pipIsSelf = true;
    }
  } else if (localHasVideo) {
    /**
     * Solo la mia camera accesa: di norma la mia immagine sta nel
     * RIQUADRINO e il posto grande resta al riepilogo.
     *
     * Prima la mia faccia prendeva tutto lo schermo, e con lei spariva
     * l'unica cosa che dicesse dov'era l'altro: accendendo il video non
     * si sapeva più se fosse nel canale, in attesa o irraggiungibile.
     * La propria immagine serve a controllare l'inquadratura, e per
     * quello un riquadrino basta e avanza.
     *
     * Ma è la norma, non un divieto: un tocco sul riquadrino porta la
     * propria immagine a schermo intero, e il riquadrino resta lì vuoto
     * - con il segno di come sta l'altro - per tornare indietro.
     */
    if (selfBig) {
      bigStream = localStream;
      bigIsSelf = true;
      pipEmpty = true;
    } else {
      pipStream = localStream;
      pipIsSelf = true;
    }
  }

  /**
   * Il riquadrino è disegnato in questo momento.
   *
   * Serve a non ricollocare quello che non c'è: una posizione scritta
   * mentre la vista non esiste non la vede nessuno, e resta a divergere
   * da quella disegnata.
   */
  const pipVivo = !compact && (!!pipStream || pipEmpty);

  // Chi guarda da fuori ha bisogno di sapere quanto spazio occupa
  // davvero il video grande, per non appoggiarci sopra i comandi a metà.
  const bigAspect = bigStream
    ? (bigIsSelf ? localAspect : remoteAspect) || DEFAULT_ASPECT
    : null;
  useEffect(() => { onBigAspect?.(bigAspect); }, [bigAspect, onBigAspect]);

  const soloGrande = bigStream
    ? (bigIsSelf ? 'tu' : 'altro') as 'tu' | 'altro'
    : null;
  useEffect(() => { onSoloGrande?.(soloGrande); }, [soloGrande, onSoloGrande]);

  // Le proporzioni sono SEMPRE quelle della camera che il riquadrino mostra.
  const pipAspect =
    (pipIsSelf ? localAspect : remoteAspect) || DEFAULT_ASPECT;

  // --- Dimensione ---------------------------------------------------------
  const [pipWidth, setPipWidth] = useState(
    () => Math.round(width * (posizioneScelta?.fw ?? START_FRACTION)),
  );
  useEffect(() => {
    if (posizioneScelta) {
      posizioneScelta = { ...posizioneScelta, fw: pipWidth / width };
      salvaPosizione();
    }
  }, [pipWidth, width]);
  const pipHeight = Math.max(1, Math.round(pipWidth / pipAspect));

  // Serve dentro i PanResponder, che non vedono lo stato aggiornato.
  const sizeRef = useRef({ w: pipWidth, h: pipHeight });
  useEffect(() => { sizeRef.current = { w: pipWidth, h: pipHeight }; }, [pipWidth, pipHeight]);

  const aspectRef = useRef(pipAspect);
  useEffect(() => { aspectRef.current = pipAspect; }, [pipAspect]);

  /**
   * Cambia larghezza aggiornando SUBITO la dimensione di riferimento.
   *
   * Passando solo per lo stato, `sizeRef` si allineava un fotogramma
   * dopo: ridimensionando in fretta, i limiti venivano calcolati sulla
   * dimensione precedente - più piccola - e il riquadrino poteva
   * finire oltre il bordo.
   */
  const applicaLarghezza = useCallback((w: number) => {
    const h = Math.max(1, Math.round(w / (aspectRef.current || DEFAULT_ASPECT)));
    sizeRef.current = { w, h };
    setPipWidth(w);
  }, []);

  /**
   * Quanto può essere larga: oltre ai limiti di gusto, non deve mai
   * uscire dallo spazio fra le barre - e a decidere l'ingombro in
   * altezza sono le proporzioni, non la larghezza.
   */
  const clampWidth = useCallback(
    (w: number) => {
      const a = aspectRef.current || DEFAULT_ASPECT;
      const maxPerLarghezza = width - 2 * MARGIN - 2 * insetH;
      const maxPerAltezza = (height - TOP_SAFE - BOTTOM_SAFE - insetBasso - 2 * insetV) * a;
      const tetto = Math.min(width * MAX_FRACTION, maxPerLarghezza, maxPerAltezza);
      return Math.round(
        Math.min(Math.max(w, width * MIN_FRACTION), Math.max(width * MIN_FRACTION, tetto)),
      );
    },
    [width, height, insetV, insetH, insetBasso],
  );

  // --- Posizione ----------------------------------------------------------

  /**
   * Lo spazio in cui il riquadrino può stare: i bordi del VIDEO, non
   * dello schermo, meno le zone occupate dai comandi.
   */
  const spazio = useCallback(() => {
    const { w, h } = sizeRef.current;
    const minX = MARGIN + insetH;
    // I comandi seguono il bordo del video: la zona di rispetto anche,
    // altrimenti il riquadrino finisce sotto l'ingranaggio.
    const minY = TOP_SAFE + insetV;
    return {
      minX,
      minY,
      maxX: Math.max(minX, width - w - MARGIN - insetH),
      maxY: Math.max(minY, height - h - BOTTOM_SAFE - insetBasso - insetV),
    };
  }, [width, height, insetV, insetH, insetBasso]);

  const posIniziale = useRef<{ x: number; y: number } | null>(null);
  if (posIniziale.current === null) {
    const w = Math.round(width * (posizioneScelta?.fw ?? START_FRACTION));
    const minX = MARGIN + insetH;
    const minY = TOP_SAFE + insetV;
    const maxX = Math.max(minX, width - w - MARGIN - insetH);
    const maxY = Math.max(minY, height - Math.round(w / DEFAULT_ASPECT) - BOTTOM_SAFE - insetBasso - insetV);
    const a = posizioneScelta;
    posIniziale.current = a
      ? {
          x: a.ax === 'sinistra'
            ? minX + a.ox * (maxX - minX) : maxX - a.ox * (maxX - minX),
          y: a.ay === 'alto'
            ? minY + a.oy * (maxY - minY) : maxY - a.oy * (maxY - minY),
        }
      : { x: maxX, y: minY };  // in alto a destra
  }
  const pan = useRef(new Animated.ValueXY(posIniziale.current)).current;
  // Da dove parte davvero, non da (0,0): il primo riallineamento leggeva
  // questo valore e avrebbe portato il riquadrino in alto a sinistra.
  const posRef = useRef({ ...posIniziale.current });
  const dragged = useRef(false);

  /**
   * Registra a quale bordo è appoggiato e a che distanza.
   *
   * Si sceglie sempre il bordo PIÙ VICINO: chi mette il riquadrino in
   * basso a sinistra sta esprimendo "in basso a sinistra", e lì deve
   * restare anche quando il quadro cambia forma.
   */
  const ricorda = useCallback(() => {
    const { minX, minY, maxX, maxY } = spazio();
    const dx = Math.max(1, maxX - minX);
    const dy = Math.max(1, maxY - minY);
    const daSinistra = posRef.current.x - minX;
    const daDestra = maxX - posRef.current.x;
    const daAlto = posRef.current.y - minY;
    const daBasso = maxY - posRef.current.y;
    const frazione = (v: number, tot: number) =>
      Math.min(1, Math.max(0, v / tot));
    posizioneScelta = {
      ax: daSinistra <= daDestra ? 'sinistra' : 'destra',
      ay: daAlto <= daBasso ? 'alto' : 'basso',
      ox: frazione(Math.min(daSinistra, daDestra), dx),
      oy: frazione(Math.min(daAlto, daBasso), dy),
      fw: sizeRef.current.w / width,
    };
    salvaPosizione();
  }, [spazio, width]);

  /**
   * Rete di sicurezza: la posizione non può stare fuori, comunque ci sia
   * arrivata.
   *
   * Finora il riquadrino veniva rimesso dentro solo alla fine di un
   * gesto o al cambio di forma del quadro. Ogni strada che lo spostava
   * senza passare di lì - e ne sono spuntate tre in una notte, ogni volta
   * per un motivo diverso - lo lasciava fuori. Qui si controlla il valore
   * stesso, che è l'unico punto da cui passano tutti.
   *
   * Durante un gesto no: lì comanda il dito, e si rimette dentro al
   * rilascio.
   */
  /** vero mentre siamo noi a scrivere la posizione, non il dito */
  const stiamoSistemando = useRef(false);

  useEffect(() => {
    /**
     * Riagganciato ogni volta che il riquadrino ricompare.
     *
     * Non e' un eccesso di prudenza: in React Native, quando una vista
     * animata si smonta, il valore si stacca - e staccandosi butta via
     * TUTTI i suoi ascoltatori. Si legge in Libraries/Animated/nodes/
     * AnimatedNode.js:
     *
     *     __detach(): void {
     *       this.removeAllListeners();
     *
     * Spegnendo il video il riquadrino spariva, il valore si staccava e
     * questo ascoltatore moriva per sempre: la vista continuava a
     * muoversi - il valore la muove lo stesso - ma nessuno diceva piu'
     * al codice dov'era finita. Il codice restava fermo all'ultima
     * posizione vista, e al trascinamento successivo il riquadrino
     * saltava li'.
     *
     * Quindi: si riaggancia alla ricomparsa, e si riparte dal valore
     * vero - che e' quello animato, non la nostra copia, perche' e' lui
     * ad aver mosso la vista mentre non ascoltavamo.
     */
    posRef.current = {
      x: (pan.x as any).__getValue(),
      y: (pan.y as any).__getValue(),
    };
    const id = pan.addListener((v) => {
      posRef.current = v;
      if (gestoInCorso.current || stiamoSistemando.current) return;
      const { minX, minY, maxX, maxY } = spazio();
      const x = Math.min(Math.max(v.x, minX), maxX);
      const y = Math.min(Math.max(v.y, minY), maxY);
      if (Math.abs(x - v.x) > 1 || Math.abs(y - v.y) > 1) {
        // Scrivere qui dentro fa riscattare questo stesso ascoltatore:
        // senza il fermo, ogni correzione ne chiama un'altra e la pila
        // delle chiamate si esaurisce - l'app cadeva accendendo il video.
        stiamoSistemando.current = true;
        posRef.current = { x, y };
        pan.setValue({ x, y });
        stiamoSistemando.current = false;
      }
    });
    return () => pan.removeListener(id);
  }, [pan, spazio, pipVivo]);

  /**
   * Rimette il riquadrino dove l'utente l'ha scelto, ricalcolandolo sui
   * bordi attuali del video. Cambiando le proporzioni le bande nere si
   * spostano: restando fermo in pixel, il riquadrino uscirebbe dal video
   * o si staccherebbe dal bordo a cui era appoggiato.
   */
  const riposiziona = useCallback((animate = true) => {
    if (gestoInCorso.current) return;
    const { minX, minY, maxX, maxY } = spazio();
    const a = posizioneScelta;
    const dx = maxX - minX;
    const dy = maxY - minY;
    const x = !a ? maxX : a.ax === 'sinistra'
      ? minX + a.ox * dx : maxX - a.ox * dx;
    const y = !a ? minY : a.ay === 'alto'
      ? minY + a.oy * dy : maxY - a.oy * dy;
    if (Math.abs(x - posRef.current.x) < 0.5 && Math.abs(y - posRef.current.y) < 0.5) return;
    posRef.current = { x, y };
    if (animate) {
      Animated.spring(pan, {
        toValue: { x, y }, useNativeDriver: false, friction: 8,
      }).start();
    } else {
      pan.setValue({ x, y });
    }
  }, [pan, spazio]);

  /**
   * Le stesse coordinate, riportate dentro i bordi.
   *
   * Serve DURANTE il gesto, non solo alla fine: prima il riquadrino si
   * poteva trascinare dove si voleva e rientrava al rilascio, il che
   * regge finché il rilascio arriva. Se il gesto viene rubato da un
   * altro, o il riquadrino smette di esistere sotto il dito, quel
   * rientro non avviene mai e il riquadrino resta fuori dallo schermo -
   * senza più niente che lo riporti dentro, perché tutte le reti di
   * sicurezza tacciono finché un gesto risulta in corso. Fermandolo al
   * bordo mentre lo si muove, la posizione è sempre buona: non c'è
   * nessun momento in cui debba essere qualcuno a rimediare.
   */
  const dentro = useCallback((x: number, y: number) => {
    const { minX, minY, maxX, maxY } = spazio();
    return {
      x: Math.min(Math.max(x, minX), maxX),
      y: Math.min(Math.max(y, minY), maxY),
    };
  }, [spazio]);

  const clampIntoScreen = useCallback((animate = true) => {
    const { minX, minY, maxX, maxY } = spazio();
    const x = Math.min(Math.max(posRef.current.x, minX), maxX);
    const y = Math.min(Math.max(posRef.current.y, minY), maxY);
    if (x === posRef.current.x && y === posRef.current.y) { ricorda(); return; }
    // La posizione finale si registra subito: aspettando la fine
    // dell'animazione si ricorderebbe quella di partenza.
    posRef.current = { x, y };
    ricorda();
    if (animate) {
      Animated.spring(pan, {
        toValue: { x, y }, useNativeDriver: false, friction: 8,
      }).start();
    } else {
      pan.setValue({ x, y });
    }
  }, [pan, spazio, ricorda]);

  // Cambiando schermo, proporzioni o dimensione del riquadrino, si torna
  // alla posizione SCELTA ricalcolata sui bordi nuovi - non si riporta
  // dentro quella vecchia, che era espressa in pixel di un altro quadro.
  // Senza animazione: ridimensionando, questo scatta a ogni fotogramma e
  // la molla resterebbe indietro rispetto al dito. Si vedeva il
  // riquadrino scivolare verso destra mentre cresceva - perché cresce
  // dall'angolo in alto a sinistra - e tornare al suo posto solo
  // mollandolo. Ricollocandolo subito, il bordo a cui è ancorato resta
  // fermo e la crescita va verso l'interno.
  useEffect(() => {
    // Non mentre il riquadrino non c'è: vedi qui sotto.
    if (!pipVivo) return;
    riposiziona(false);
  }, [pipVivo, width, height, pipWidth, pipHeight, insetV, insetH, riposiziona]);

  /**
   * Ricomparendo, il riquadrino si rimette dove va.
   *
   * Un fotogramma dopo, non subito: la vista è appena nata, e il quadro
   * in cui deve stare - bande nere, ingombro delle righe tecniche - si
   * assesta insieme a lei.
   */
  useEffect(() => {
    if (!pipVivo) return;
    const id = requestAnimationFrame(() => riposiziona(false));
    return () => cancelAnimationFrame(id);
  }, [pipVivo, riposiziona]);

  // --- Trascinamento (e pizzico a due dita per ridimensionare) ------------
  const pinchStart = useRef<{ dist: number; w: number } | null>(null);
  const inizioTrascinamento = useRef({ x: 0, y: 0 });
  /**
   * Lo spostamento del dito al primo movimento del gesto.
   *
   * Non è zero come ci si aspetterebbe. Il conteggio di React Native
   * riparte da zero quando il gesto viene concesso, ma il segnalibro su
   * quali movimenti ha già contato viene azzerato solo al rilascio: chi
   * riceve il gesto al TOCCO - il riquadrino e la sua maniglia - al primo
   * movimento si vede arrivare anche il residuo dei tocchi precedenti, e
   * saltava di colpo altrove per poi seguire il dito regolarmente.
   *
   * Si prende quel primo valore come punto zero e si conta da lì.
   */
  const partenzaDito = useRef<{ dx: number; dy: number } | null>(null);
  /**
   * Un dito è appoggiato sul riquadrino.
   *
   * Mentre lo si muove, la ricollocazione automatica non deve
   * intervenire: l'ancoraggio nuovo viene registrato solo al rilascio,
   * quindi riporterebbe il riquadrino a quello vecchio - e da fuori si
   * vede saltare da solo sotto il dito.
   */
  const gestoInCorso = useRef(false);

  const twoFingerDistance = (touches: any[]) => {
    const [a, b] = touches;
    return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
  };

  const dragResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
        onPanResponderGrant: () => {
          gestoInCorso.current = true;
          dragged.current = false;
          pinchStart.current = null;
          partenzaDito.current = null;
          // Niente `extractOffset`: la posizione resta in coordinate
          // assolute per tutta la durata del gesto. Con l'offset attivo
          // la ricollocazione automatica - che scrive coordinate assolute
          // - si SOMMAVA all'offset invece di sostituirlo, e durante un
          // pizzico il riquadrino schizzava fuori dallo schermo per poi
          // rientrare al rilascio.
          inizioTrascinamento.current = { ...posRef.current };
        },
        onPanResponderMove: (e, g) => {
          const touches = e.nativeEvent.touches ?? [];

          // Due dita: si ridimensiona, non si sposta.
          if (touches.length >= 2) {
            dragged.current = true;
            // Tolto un dito si torna a trascinare: da qui, non da dove il
            // trascinamento era cominciato prima del pizzico.
            partenzaDito.current = null;
            inizioTrascinamento.current = { ...posRef.current };
            const dist = twoFingerDistance(touches);
            if (!pinchStart.current) {
              pinchStart.current = { dist, w: sizeRef.current.w };
            } else if (pinchStart.current.dist > 0) {
              const ratio = dist / pinchStart.current.dist;
              applicaLarghezza(clampWidth(pinchStart.current.w * ratio));
              // Crescendo, il riquadrino sfora dal bordo a cui è
              // appoggiato: la ricollocazione automatica qui non entra,
              // perché un gesto è in corso.
              pan.setValue(dentro(posRef.current.x, posRef.current.y));
            }
            return;
          }

          pinchStart.current = null;
          if (!partenzaDito.current) partenzaDito.current = { dx: g.dx, dy: g.dy };
          const dx = g.dx - partenzaDito.current.dx;
          const dy = g.dy - partenzaDito.current.dy;
          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragged.current = true;
          pan.setValue(dentro(
            inizioTrascinamento.current.x + dx,
            inizioTrascinamento.current.y + dy,
          ));
        },
        onPanResponderRelease: () => {
          gestoInCorso.current = false;
          pinchStart.current = null;
          if (dragged.current) {
            // clampIntoScreen registra da sé la posizione finale.
            clampIntoScreen();
          } else {
            // Tocco secco: scambia grande e piccolo.
            setSelfBig((v) => !v);
          }
        },
        onPanResponderTerminate: () => {
          gestoInCorso.current = false;
          pinchStart.current = null;
          clampIntoScreen();
        },
      }),
    [pan, dentro, clampIntoScreen, clampWidth, applicaLarghezza],
  );

  // --- Maniglia d'angolo per ridimensionare con un dito -------------------
  const resizeStart = useRef(0);
  /** punto zero del dito sulla maniglia, come `partenzaDito` */
  const partenzaManiglia = useRef<number | null>(null);
  const resizeResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          resizeStart.current = sizeRef.current.w;
          partenzaManiglia.current = null;
        },
        onPanResponderMove: (_e, g) => {
          // Come per il trascinamento: il primo movimento porta con sé un
          // residuo, e senza il punto zero il riquadrino cambiava taglia
          // di scatto appena si toccava la maniglia.
          if (partenzaManiglia.current === null) partenzaManiglia.current = g.dx;
          applicaLarghezza(clampWidth(resizeStart.current + g.dx - partenzaManiglia.current));
          pan.setValue(dentro(posRef.current.x, posRef.current.y));
        },
        onPanResponderRelease: () => clampIntoScreen(),
        onPanResponderTerminate: () => clampIntoScreen(),
      }),
    [pan, dentro, clampWidth, clampIntoScreen, applicaLarghezza],
  );

  // --- Zoom sul video grande ----------------------------------------------
  // Pizzico per ingrandire, trascinamento per spostarsi dentro
  // l'ingrandimento, doppio tocco per tornare a schermo pieno.
  const zoom = useRef(new Animated.Value(1)).current;
  const zoomRef = useRef(1);
  const shift = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const shiftRef = useRef({ x: 0, y: 0 });
  const zoomStart = useRef(1);
  const pinchBase = useRef(0);
  const shiftStart = useRef({ x: 0, y: 0 });
  const lastTap = useRef(0);
  const movedInGesture = useRef(false);
  /** attesa che distingue un tocco singolo dal primo di un doppio */
  const attesaTocco = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Quanto siamo ingranditi, secondo noi.
   *
   * L'ingrandimento vero lo fa il motore nativo, che di quel numero non
   * ci rende conto: gli ascoltatori qui sotto smettono di essere
   * chiamati appena il valore passa al nativo, e la nostra copia resta
   * ferma a 1 mentre lo schermo è a 2,5. Da lì tre guai in fila: il
   * pizzico ripartiva dal 100%, il rilascio credeva che non avessi
   * ingrandito e riportava tutto indietro come un elastico, e il doppio
   * tocco non tornava mai a schermo pieno.
   *
   * La copia va scritta da noi, nello stesso istante in cui muoviamo
   * l'immagine: siamo noi a decidere quel numero, non c'è ragione di
   * andarlo a chiedere a qualcuno che può non rispondere.
   *
   * Gli ascoltatori restano: quando il valore non è ancora passato al
   * nativo funzionano, e due fonti concordi non fanno danno.
   */
  const segnaZoom = useCallback((z: number) => {
    zoomRef.current = z;
  }, []);
  const segnaShift = useCallback((x: number, y: number) => {
    shiftRef.current = { x, y };
  }, []);

  useEffect(() => {
    const z = zoom.addListener((v) => { zoomRef.current = v.value; });
    const p2 = shift.addListener((v) => { shiftRef.current = v; });
    return () => { zoom.removeListener(z); shift.removeListener(p2); };
  }, [zoom, shift]);

  const resetZoom = useCallback(() => {
    segnaZoom(1);
    segnaShift(0, 0);
    Animated.parallel([
      Animated.timing(zoom, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(shift, { toValue: { x: 0, y: 0 }, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [zoom, shift, segnaZoom, segnaShift]);

  /**
   * Cambiando CHI sta a schermo grande, l'ingrandimento non ha più senso:
   * stavi guardando il dettaglio di un'altra immagine.
   *
   * Non vale invece quando l'immagine dell'altro viene solo ricostruita
   * - cosa che succede a ogni suo video che va e viene, e sulla rete
   * mobile succede spesso: è la stessa persona, e chi stava guardando
   * un dettaglio non ha chiesto di tornare indietro.
   */
  useEffect(() => { resetZoom(); }, [bigIsSelf, resetZoom]);

  /** Non lasciare che l'immagine ingrandita esca dai bordi. */
  const clampShift = useCallback(() => {
    const z = zoomRef.current;
    const maxX = Math.max(0, (width * (z - 1)) / 2);
    const maxY = Math.max(0, (height * (z - 1)) / 2);
    const x = Math.min(Math.max(shiftRef.current.x, -maxX), maxX);
    const y = Math.min(Math.max(shiftRef.current.y, -maxY), maxY);
    if (x !== shiftRef.current.x || y !== shiftRef.current.y) {
      shiftRef.current = { x, y };
      Animated.spring(shift, {
        toValue: { x, y }, useNativeDriver: true, friction: 8,
      }).start();
    }
  }, [shift, width, height]);

  const zoomResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (e, g) =>
          (e.nativeEvent.touches?.length ?? 0) >= 2 ||
          (zoomRef.current > 1.01 && (Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3)),
        onPanResponderGrant: () => {
          movedInGesture.current = false;
          zoomStart.current = zoomRef.current;
          shiftStart.current = { ...shiftRef.current };
          pinchBase.current = 0;
        },
        onPanResponderMove: (e, g) => {
          const touches = e.nativeEvent.touches ?? [];
          if (touches.length >= 2) {
            movedInGesture.current = true;
            const [a, b] = touches;
            const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
            if (!pinchBase.current) {
              pinchBase.current = dist;
              zoomStart.current = zoomRef.current;
              return;
            }
            const next = Math.min(
              Math.max((dist / pinchBase.current) * zoomStart.current, MIN_ZOOM),
              MAX_ZOOM,
            );
            zoom.setValue(next);
            segnaZoom(next);
            return;
          }
          if (zoomRef.current > 1.01) {
            if (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4) movedInGesture.current = true;
            const sx = shiftStart.current.x + g.dx;
            const sy = shiftStart.current.y + g.dy;
            shift.setValue({ x: sx, y: sy });
            segnaShift(sx, sy);
          }
        },
        onPanResponderRelease: () => {
          if (!movedInGesture.current) {
            // Doppio tocco: ingrandisce, o torna a schermo pieno.
            const now = Date.now();
            if (now - lastTap.current < DOUBLE_TAP_MS) {
              lastTap.current = 0;
              if (attesaTocco.current) {
                clearTimeout(attesaTocco.current);
                attesaTocco.current = null;
              }
              if (zoomRef.current > 1.01) resetZoom();
              else {
                segnaZoom(TAP_ZOOM);
                Animated.timing(zoom, {
                  toValue: TAP_ZOOM, duration: 180, useNativeDriver: true,
                }).start();
              }
              onIngrandimento?.(zoomRef.current);
              return;
            }
            lastTap.current = now;
            // Tocco singolo: mostra o nasconde i comandi, ma solo dopo
            // aver escluso che sia il primo di un doppio tocco - che
            // significa ingrandire, ed è un'altra cosa.
            if (attesaTocco.current) clearTimeout(attesaTocco.current);
            attesaTocco.current = setTimeout(() => {
              attesaTocco.current = null;
              onSfondo?.();
            }, DOUBLE_TAP_MS);
            return;
          }
          if (zoomRef.current <= 1.01) resetZoom();
          else clampShift();
          onIngrandimento?.(zoomRef.current);
        },
        onPanResponderTerminate: () => clampShift(),
      }),
    [zoom, shift, resetZoom, clampShift, onSfondo, segnaZoom, segnaShift, onIngrandimento],
  );

  return (
    <View style={styles.root}>
      {bigStream ? (
        <Animated.View
          {...zoomResponder.panHandlers}
          style={[
            styles.big,
            {
              transform: [
                { translateX: shift.x },
                { translateY: shift.y },
                { scale: zoom },
              ],
            },
          ]}>
          <RTCView
            key={bigIsSelf ? 'big-self' : `big-remote-${remoteVideoKey ?? 0}`}
            streamURL={bigStream.toURL()}
            style={styles.bigVideo}
            objectFit="contain"
            mirror={bigIsSelf && specchia}
            zOrder={0}
          />
        </Animated.View>
      ) : (
        <View style={[styles.big, styles.placeholder]} onTouchStart={onSfondo}>
          {/* Durante un'interruzione: nero, non il riepilogo.
              Il video dell'altro sta per tornare, e rimettere la
              schermata "l'altro è nel canale" a ogni cambio di rete la
              trasforma in un lampeggio. Il nero non dice nulla, ed è
              esattamente ciò che serve: non è successo nulla che valga la
              pena raccontare.
              Con un avviso in sovrimpressione vale lo stesso: due
              messaggi sovrapposti direbbero la stessa cosa. */}
          {notice || awaitingRemote ? null : placeholder}
        </View>
      )}

      {notice ? (
        <View style={styles.notice} pointerEvents="none">
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {(pipStream || pipEmpty) && !compact ? (
        <Animated.View
          {...dragResponder.panHandlers}
          style={[
            styles.pip,
            {
              width: pipWidth,
              height: pipHeight,
              transform: [{ translateX: pan.x }, { translateY: pan.y }],
            },
          ]}>
          {/* Anche qui "contain": il riquadrino ha già le proporzioni
              giuste, quindi non c'è nulla da tagliare. */}
          {pipStream ? (
            <RTCView
              key={pipIsSelf ? 'pip-self' : `pip-remote-${remoteVideoKey ?? 0}`}
              streamURL={pipStream.toURL()}
              style={styles.pipVideo}
              objectFit="contain"
              mirror={pipIsSelf && specchia}
              zOrder={1}
            />
          ) : (
            <View style={styles.pipWaiting} />
          )}
          <View style={styles.pipTag} pointerEvents="none">
            <Text style={styles.pipTagText}>
              {pipStream ? (pipIsSelf ? 'Tu' : 'Non tu') : (etichettaVuoto || 'in attesa')}
            </Text>
            {pipIsSelf ? segnoMio : segnoAltro}
          </View>
        </Animated.View>
      ) : null}

      {/* La maniglia è SORELLA del riquadrino, non figlia: Android non
          consegna i tocchi a un figlio che sta oltre i bordi del genitore,
          e dentro sarebbe coperta dalla superficie del video. */}
      {(pipStream || pipEmpty) && !compact ? (
        <Animated.View
          {...resizeResponder.panHandlers}
          style={[
            styles.handle,
            {
              transform: [
                { translateX: Animated.add(pan.x, pipWidth - HANDLE / 2) },
                { translateY: Animated.add(pan.y, pipHeight - HANDLE / 2) },
              ],
            },
          ]}>
          <View style={styles.handleGrip} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject },
  big: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  bigVideo: { flex: 1 },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0e14' },
  pip: {
    position: 'absolute', top: 0, left: 0,
    /**
     * Angoli vivi, di proposito.
     *
     * RTCView è una SurfaceView: disegna in un livello grafico proprio e
     * nessun genitore può ritagliarla - né `overflow: hidden` né
     * `borderRadius` la toccano. Con la cornice arrotondata i suoi angoli
     * quadrati sbordavano, e l'unico rimedio era rimpicciolire il video
     * dentro un margine. Meglio un rettangolo netto che un arrotondamento
     * che il video non può rispettare.
     */
    backgroundColor: '#000',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  pipVideo: { flex: 1 },
  pipWaiting: { flex: 1, backgroundColor: '#14171d' },
  notice: {
    position: 'absolute', left: 0, right: 0, top: '46%',
    alignItems: 'center', paddingHorizontal: 24,
  },
  noticeText: {
    color: '#e6ebf1', fontSize: 15, textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20,
    paddingVertical: 10, paddingHorizontal: 18, overflow: 'hidden',
  },
  /**
   * Una pastiglia, non una fascia.
   *
   * La striscia grigia da bordo a bordo copriva una fetta di immagine e
   * non somigliava all'etichetta del video grande, che è la stessa cosa
   * detta nello stesso momento.
   */
  pipTag: {
    position: 'absolute', top: 5, left: 5,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  pipTagText: { color: '#e6ebf1', fontSize: 10, fontWeight: '700' },
  /**
   * La maniglia sta FUORI dall'angolo, non sopra il video.
   *
   * Il video del riquadrino usa `zOrder={1}`, cioè viene disegnato sopra
   * le viste normali - serve, altrimenti finirebbe dietro al video
   * grande, che è anch'esso una superficie nativa. Ma così copriva la
   * maniglia: c'era ed era premibile, solo invisibile, e si finiva per
   * trascinare il riquadrino invece di ridimensionarlo.
   */
  handle: {
    position: 'absolute', top: 0, left: 0,
    width: HANDLE, height: HANDLE,
    alignItems: 'center', justifyContent: 'center',
  },
  /** Un bottoncino, non un angolo: fuori dal riquadro serve che si veda. */
  handleGrip: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(20,22,28,0.92)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.75)',
  },
});
