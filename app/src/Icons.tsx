import React from 'react';
import Svg, { Path, Circle, Line, Rect, G } from 'react-native-svg';

/**
 * The icons of the controls, drawn rather than taken from the emoji.
 *
 * Emoji have colours of their own and a shape decided by the maker of
 * the phone: on the dark panel they stayed hard to read and looked far
 * too much like one another - a video camera and a microphone, small
 * and in dull colours, are poorly told apart.
 *
 * Here the stroke is white and thick, the shape is the same on every
 * phone, and each function has an outline unlike all the others at a
 * glance. When a function is off, a bar crosses the symbol: it is
 * understood without having to read its colour.
 */

type Props = {
  size?: number;
  color?: string;
  /** a diagonal bar: the function is there but switched off */
  off?: boolean;
  /**
   * The colour the icon rests on.
   *
   * The bar needs it: to stand apart from the drawing underneath it
   * must have a thread of the BACKGROUND colour around it. Getting it
   * wrong shows at once - with a dark halo on a light button the bar
   * becomes the most visible thing and the icon disappears.
   */
  background?: string;
};

const STROKE = 2.1;

function Bar({ color, background }: { color: string; background: string }) {
  return (
    <>
      {/* A thread of the background colour sets the bar apart from the
          drawing underneath: barely there, because with a thick halo
          the bar weighs more than the icon and one reads the crossing
          out instead of what is crossed out. */}
      <Line
        x1={4.5} y1={19.5} x2={19.5} y2={4.5}
        stroke={background} strokeWidth={STROKE + 1.6} strokeLinecap="round"
      />
      <Line
        x1={4.5} y1={19.5} x2={19.5} y2={4.5}
        stroke={color} strokeWidth={STROKE} strokeLinecap="round"
      />
    </>
  );
}

function Base({ size = 26, color = '#fff', background = '#12141a', off, children }: Props & {
  children: React.ReactNode;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {children}
      {off ? <Bar color={color} background={background} /> : null}
    </Svg>
  );
}

/**
 * Video camera: body and jutting lens.
 *
 * The corners of the body are as round as those of the button that
 * holds it. They used to be barely bevelled, and with the video on -
 * where the drawing is dark on a light pill and fills nearly all of it
 * - that almost square rectangle read as if the button itself had sharp
 * corners, unlike all the others in the row.
 */
export function VideoIcon(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <Rect
        x={2.5} y={6.5} width={12} height={11} rx={3.6}
        stroke={c} strokeWidth={STROKE}
      />
      <Path
        d="M14.5 10.5L21 7.5v9l-6.5-3z"
        stroke={c} strokeWidth={STROKE} strokeLinejoin="round"
      />
    </Base>
  );
}

/** Microphone: capsule, supporting arc and little foot. */
export function MicrophoneIcon(p: Props) {
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

/** Camera change: two arrows chasing each other around a lens. */
export function FlipIcon(p: Props) {
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
 * Front camera: a single person.
 *
 * The icon says which camera is ON, not what the button will do: a
 * circular arrow only said "it turns round", and to know which way you
 * were facing you had to look at the picture.
 */
export function FrontCameraIcon(p: Props) {
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

/** Back camera: several people, that is what you frame by turning it. */
export function BackCameraIcon(p: Props) {
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
 * The four audio outputs, small.
 *
 * They used to be emoji on a dark pill: at ten pixels they became an
 * unreadable grey smudge. Drawn in white strokes they can be told apart
 * even in the corner of a button.
 */
export function SpeakerIcon(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <Path d="M4 9h3.5L13 4.5v15L7.5 15H4z" stroke={c} strokeWidth={STROKE} strokeLinejoin="round" />
      <Path d="M16.5 9.2a4 4 0 010 5.6M19.2 6.2a8 8 0 010 11.6"
        stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
    </Base>
  );
}

export function EarpieceIcon(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <Rect x={6.5} y={2.5} width={11} height={19} rx={2.6} stroke={c} strokeWidth={STROKE} />
      <Line x1={10} y1={5.6} x2={14} y2={5.6} stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
    </Base>
  );
}

export function HeadphonesIcon(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <Path d="M4 15v-2.5a8 8 0 0116 0V15" stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
      <Rect x={2.6} y={14} width={4.4} height={7} rx={2.2} stroke={c} strokeWidth={STROKE} />
      <Rect x={17} y={14} width={4.4} height={7} rx={2.2} stroke={c} strokeWidth={STROKE} />
    </Base>
  );
}

export function BluetoothIcon(p: Props) {
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

/** A bell: the most recognisable outline of them all, even small. */
export function BellIcon(p: Props) {
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
 * The same bell while it rings: tilted, with waves at its sides.
 *
 * It is shown for the instant that follows the press, in place of the
 * still one. The Call button can always be pressed, even when the other
 * person is already in the channel, and without a sign there was no
 * telling whether the press had been taken: changing the wording alone
 * was hardly noticed, because one is looking at one's finger, not at
 * the label.
 */
export function BellRingingIcon(p: Props) {
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
      {/* The waves: short, clear of the bell, one on each side. */}
      <Path d="M2.6 7.2c.5-1.4 1.4-2.6 2.6-3.4" stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
      <Path d="M21.4 7.2c-.5-1.4-1.4-2.6-2.6-3.4" stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
    </Base>
  );
}

/** Exit: a door with the arrow coming out of it. */
export function LeaveIcon(p: Props) {
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
 * Settings: three sliders, not a cogwheel.
 *
 * The spoked cogwheel, small, read as a sun: the teeth come out of the
 * centre and look like rays of light. The sliders say the same thing -
 * something to adjust - and look like nothing else.
 */
export function SettingsIcon(p: Props) {
  const c = p.color ?? '#fff';
  return (
    <Base {...p}>
      <Line x1={3} y1={7} x2={21} y2={7} stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1={3} y1={12} x2={21} y2={12} stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1={3} y1={17} x2={21} y2={17} stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
      <Circle cx={8.5} cy={7} r={2.4} fill={p.background ?? "#12141a"} stroke={c} strokeWidth={STROKE} />
      <Circle cx={15.5} cy={12} r={2.4} fill={p.background ?? "#12141a"} stroke={c} strokeWidth={STROKE} />
      <Circle cx={9.5} cy={17} r={2.4} fill={p.background ?? "#12141a"} stroke={c} strokeWidth={STROKE} />
    </Base>
  );
}
