import React from 'react';
import Svg, { Path, Circle, Line, Rect, G } from 'react-native-svg';

/**
 * Le icone dei comandi, disegnate invece che prese dalle emoji.
 *
 * Le emoji hanno colori propri e una forma decisa dal produttore del
 * telefono: sul pannello scuro restavano poco leggibili e somigliavano
 * troppo l'una all'altra - una videocamera e un microfono, in piccolo e
 * a colori spenti, si distinguono male.
 *
 * Qui il tratto è bianco e spesso, la forma è la stessa su ogni
 * telefono, e ogni funzione ha una sagoma diversa dalle altre anche a
 * colpo d'occhio. Quando una funzione è spenta, sopra il simbolo passa
 * una barra: si capisce senza doverne leggere il colore.
 */

type Props = {
  size?: number;
  color?: string;
  /** barra diagonale: la funzione c'è ma è spenta */
  off?: boolean;
  /**
   * Il colore su cui l'icona è appoggiata.
   *
   * Serve alla barra: per staccarsi dal disegno sotto deve avere attorno
   * un filo del colore di FONDO. Sbagliarlo si vede subito - con un alone
   * scuro su un pulsante chiaro la barra diventa la cosa più visibile e
   * l'icona sparisce.
   */
  sfondo?: string;
};

const STROKE = 2.1;

function Barra({ color, sfondo }: { color: string; sfondo: string }) {
  return (
    <>
      {/* Un filo del colore di fondo stacca la barra dal disegno sotto:
          appena accennato, perché con un alone spesso la barra pesa più
          dell'icona e si legge la sbarra invece di ciò che è sbarrato. */}
      <Line
        x1={4.5} y1={19.5} x2={19.5} y2={4.5}
        stroke={sfondo} strokeWidth={STROKE + 1.6} strokeLinecap="round"
      />
      <Line
        x1={4.5} y1={19.5} x2={19.5} y2={4.5}
        stroke={color} strokeWidth={STROKE} strokeLinecap="round"
      />
    </>
  );
}

function Base({ size = 26, color = '#fff', sfondo = '#12141a', off, children }: Props & {
  children: React.ReactNode;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {children}
      {off ? <Barra color={color} sfondo={sfondo} /> : null}
    </Svg>
  );
}

/** Videocamera: corpo squadrato e obiettivo sporgente. */
export function IconaVideo(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <Rect
        x={2.5} y={6.5} width={12} height={11} rx={2.5}
        stroke={c} strokeWidth={STROKE}
      />
      <Path
        d="M14.5 10.5L21 7.5v9l-6.5-3z"
        stroke={c} strokeWidth={STROKE} strokeLinejoin="round"
      />
    </Base>
  );
}

/** Microfono: capsula, arco di sostegno e piedino. */
export function IconaMicrofono(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <Rect
        x={9} y={2.5} width={6} height={11} rx={3}
        stroke={c} strokeWidth={STROKE}
      />
      <Path
        d="M5.5 11v1a6.5 6.5 0 0013 0v-1"
        stroke={c} strokeWidth={STROKE} strokeLinecap="round"
      />
      <Line x1={12} y1={18.5} x2={12} y2={21.5} stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
    </Base>
  );
}

/** Cambio camera: due frecce che si rincorrono attorno a un obiettivo. */
export function IconaGira(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <Path
        d="M4 9a8 8 0 0113.5-3.2M20 15a8 8 0 01-13.5 3.2"
        stroke={c} strokeWidth={STROKE} strokeLinecap="round"
      />
      <Path d="M17.8 2.5v3.6h-3.6" stroke={c} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6.2 21.5v-3.6h3.6" stroke={c} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={12} cy={12} r={2.4} stroke={c} strokeWidth={STROKE} />
    </Base>
  );
}

/**
 * Camera frontale: una persona sola.
 *
 * L'icona dice quale camera è ACCESA, non cosa farà il pulsante: una
 * freccia circolare diceva solo "si gira", e per sapere da che parte si
 * era bisognava guardare l'immagine.
 */
export function IconaFrontale(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <Circle cx={12} cy={8} r={3.6} stroke={c} strokeWidth={STROKE} />
      <Path
        d="M4.8 19.5a7.2 7.2 0 0114.4 0"
        stroke={c} strokeWidth={STROKE} strokeLinecap="round"
      />
    </Base>
  );
}

/** Camera posteriore: più persone, cioè quello che si inquadra girandola. */
export function IconaPosteriore(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <Circle cx={9} cy={8.6} r={3.1} stroke={c} strokeWidth={STROKE} />
      <Path
        d="M2.8 19.4a6.2 6.2 0 0112.4 0"
        stroke={c} strokeWidth={STROKE} strokeLinecap="round"
      />
      <Path
        d="M16.4 6.1a3 3 0 010 5.6M17.6 19.4a6.2 6.2 0 00-2.3-4.8"
        stroke={c} strokeWidth={STROKE} strokeLinecap="round"
      />
    </Base>
  );
}

/**
 * Le quattro uscite audio, in piccolo.
 *
 * Erano emoji su una pastiglia scura: a dieci pixel diventavano una
 * macchia grigia illeggibile. Disegnate a tratto bianco si distinguono
 * anche in un angolo di pulsante.
 */
export function IconaVivavoce(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <Path d="M4 9h3.5L13 4.5v15L7.5 15H4z" stroke={c} strokeWidth={STROKE} strokeLinejoin="round" />
      <Path d="M16.5 9.2a4 4 0 010 5.6M19.2 6.2a8 8 0 010 11.6"
        stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
    </Base>
  );
}

export function IconaTelefono(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <Rect x={6.5} y={2.5} width={11} height={19} rx={2.6} stroke={c} strokeWidth={STROKE} />
      <Line x1={10} y1={5.6} x2={14} y2={5.6} stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
    </Base>
  );
}

export function IconaCuffie(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <Path d="M4 15v-2.5a8 8 0 0116 0V15" stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
      <Rect x={2.6} y={14} width={4.4} height={7} rx={2.2} stroke={c} strokeWidth={STROKE} />
      <Rect x={17} y={14} width={4.4} height={7} rx={2.2} stroke={c} strokeWidth={STROKE} />
    </Base>
  );
}

export function IconaBluetooth(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <Path
        d="M8 7l8 10-4 3.5V3.5L16 7 8 17"
        stroke={c} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round"
      />
    </Base>
  );
}

/** Campanello: la sagoma più riconoscibile fra tutte, anche in piccolo. */
export function IconaAvvisa(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <Path
        d="M6 10a6 6 0 1112 0c0 3.2.8 4.9 1.6 5.9.4.5 0 1.3-.7 1.3H5.1c-.7 0-1.1-.8-.7-1.3C5.2 14.9 6 13.2 6 10z"
        stroke={c} strokeWidth={STROKE} strokeLinejoin="round"
      />
      <Path d="M9.8 20a2.4 2.4 0 004.4 0" stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
    </Base>
  );
}

/**
 * La stessa campanella mentre suona: inclinata, con le onde ai lati.
 *
 * Si mostra per l'istante che segue la pressione, al posto di quella
 * ferma. Il pulsante "Avvisa" si può premere sempre, anche quando l'altro
 * è già nel canale, e senza un segno non si capiva se la pressione fosse
 * stata raccolta: cambiando la sola scritta si notava poco, perché si
 * sta guardando il dito, non l'etichetta.
 */
export function IconaAvvisato(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <G rotation={14} origin="12, 12">
        <Path
          d="M6 10a6 6 0 1112 0c0 3.2.8 4.9 1.6 5.9.4.5 0 1.3-.7 1.3H5.1c-.7 0-1.1-.8-.7-1.3C5.2 14.9 6 13.2 6 10z"
          stroke={c} strokeWidth={STROKE} strokeLinejoin="round"
        />
        <Path d="M9.8 20a2.4 2.4 0 004.4 0" stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
      </G>
      {/* Le onde: corte, staccate dalla campana, una per lato. */}
      <Path d="M2.6 7.2c.5-1.4 1.4-2.6 2.6-3.4" stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
      <Path d="M21.4 7.2c-.5-1.4-1.4-2.6-2.6-3.4" stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
    </Base>
  );
}

/** Uscita: una porta con la freccia che ne esce. */
export function IconaEsci(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <Path
        d="M14 4.5H6.5A2 2 0 004.5 6.5v11a2 2 0 002 2H14"
        stroke={c} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path d="M17 8.5l3.5 3.5L17 15.5" stroke={c} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1={20} y1={12} x2={10.5} y2={12} stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
    </Base>
  );
}

/**
 * Impostazioni: tre cursori, non un ingranaggio.
 *
 * L'ingranaggio a raggi, in piccolo, si leggeva come un sole: i denti
 * partono dal centro e sembrano raggi luminosi. I cursori dicono la
 * stessa cosa - qualcosa da regolare - e non somigliano a nient'altro.
 */
export function IconaImpostazioni(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <Line x1={3} y1={7} x2={21} y2={7} stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1={3} y1={12} x2={21} y2={12} stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1={3} y1={17} x2={21} y2={17} stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
      <Circle cx={8.5} cy={7} r={2.4} fill={p.sfondo ?? "#12141a"} stroke={c} strokeWidth={STROKE} />
      <Circle cx={15.5} cy={12} r={2.4} fill={p.sfondo ?? "#12141a"} stroke={c} strokeWidth={STROKE} />
      <Circle cx={9.5} cy={17} r={2.4} fill={p.sfondo ?? "#12141a"} stroke={c} strokeWidth={STROKE} />
    </Base>
  );
}
