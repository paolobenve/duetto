import React from 'react';
import Svg, { Path, Circle, Line, Rect } from 'react-native-svg';

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
};

const STROKE = 2.1;

function Barra({ size, color }: { size: number; color: string }) {
  return (
    <>
      {/* Doppio tratto: quello scuro stacca la barra dal disegno sotto. */}
      <Line
        x1={4} y1={20} x2={20} y2={4}
        stroke="#12141a" strokeWidth={STROKE + 2.6} strokeLinecap="round"
      />
      <Line
        x1={4} y1={20} x2={20} y2={4}
        stroke={color} strokeWidth={STROKE} strokeLinecap="round"
      />
    </>
  );
}

function Base({ size = 26, color = '#fff', off, children }: Props & {
  children: React.ReactNode;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {children}
      {off ? <Barra size={size} color={color} /> : null}
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

/** Ingranaggio: otto denti, riconoscibile anche a 20 pixel. */
export function IconaImpostazioni(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <Circle cx={12} cy={12} r={3.1} stroke={c} strokeWidth={STROKE} />
      <Path
        d="M12 2.6v2.6M12 18.8v2.6M4.4 12H1.8M22.2 12h-2.6M6.6 6.6L4.8 4.8M19.2 19.2l-1.8-1.8M17.4 6.6l1.8-1.8M4.8 19.2l1.8-1.8"
        stroke={c} strokeWidth={STROKE} strokeLinecap="round"
      />
    </Base>
  );
}
