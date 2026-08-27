/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LanguageChoice } from './i18n';
import { fromItalianStorage } from './legacy';

/**
 * The app's configuration.
 *
 * Two clearly separate parts:
 *  - `server`: where the signalling lives. The same on both phones,
 *    typed in once.
 *  - `pair`: comes out of the code pairing and is never typed. Once
 *    settled it stays for good: the code is of no further use.
 */

export type PairInfo = {
  /** the code's fingerprint: the only thing the server gets to see */
  id: string;
  /** the 256-bit key from the Diffie-Hellman exchange, in base64 */
  key: string;
  /** which of the two sides we are: only used to tell the proofs apart */
  side: 'A' | 'B';
  /** what the other person is called, to show it in the notifications */
  peerName: string;
  /**
   * The name of the CONNECTION, not of the person.
   *
   * The other person is called whatever they called themselves, or
   * nothing at all; this is the name of the thread between you -
   * "Home", "Office" - and it is only for this side, to know which of
   * the connections you are in. It travels nowhere: the other side
   * never sees it and will never know it.
   */
  label?: string;
  /** when the pairing was done (ISO) */
  pairedAt: string;
  /**
   * The server this pairing was born on.
   *
   * A pair lives inside a server: the room is there, and looking for it
   * elsewhere is looking where it is not. While there is a single
   * server nothing changes; with several connections on different
   * servers, moving from one to the other carries its address along,
   * which would otherwise stay the previous one and the connection
   * would never come up, with no way to see why.
   *
   * Missing in configurations written before this existed: then the
   * app's own is used, which was the only one there was.
   */
  serverUrl?: string;
  /**
   * The settings of THIS connection.
   *
   * Nearly everything one chooses is about a particular person rather
   * than about the app: video quality depends on the network they have,
   * the alert sound is how you recognise them without looking, the
   * volume of their voice depends on how their microphone is recorded,
   * and the audio output on how the two of you are together - on
   * speaker while cooking, against the ear in the evening.
   *
   * Kept once for the whole app, changing connection dragged along the
   * choices made for somebody else. Here they travel with them.
   *
   * Missing for connections born before this existed: then the ones in
   * use apply, and become theirs at the first save.
   */
  settings?: PairSettings;
};

/**
 * What belongs to the connection rather than to the app.
 *
 * Only three things stay outside, and for a reason: the pairs
 * (`pair`/`pairs`), which are the list itself, and `setupShown`, which
 * remembers a screen shown once in the life of the phone.
 */
export type PairSettings = {
  displayName: string;
  videoQuality: VideoQuality;
  richerAudio: boolean;
  controls: 'dim' | 'faint' | 'hidden';
  videoCodec: 'auto' | 'vp9';
  alertVibration: 'default' | 'always' | 'never';
  alertSound: 'default' | 'none' | 'chosen';
  alertSoundUri: string;
  alertSoundName: string;
  /** which language the app speaks: 'auto' follows the phone */
  language: LanguageChoice;
  /** where the sound comes out: 'SPEAKER_PHONE', 'EARPIECE', ... */
  audioOutput: string;
  /** how much to lift the other voice ABOVE the phone's own top, per output */
  gains: Record<string, number>;
  /** which camera films */
  frontCamera: boolean;
};

/** The fields that travel with the connection, in one place. */
const PAIR_FIELDS: (keyof PairSettings)[] = [
  'displayName', 'videoQuality', 'richerAudio', 'controls',
  'videoCodec', 'alertVibration', 'alertSound', 'alertSoundUri', 'alertSoundName',
  'audioOutput', 'gains', 'frontCamera', 'language',
];

/** The settings in use, taken from the configuration. */
export function settingsInUse(cfg: DuoConfig): PairSettings {
  const out = {} as PairSettings;
  for (const k of PAIR_FIELDS) (out as any)[k] = (cfg as any)[k];
  return out;
}

/**
 * Writes the settings in use into the connection in use.
 *
 * Called at every save: this way the connection always holds the last
 * word said while it was the one in use, and finding it again tomorrow
 * means finding it as it was.
 */
export function storeSettingsInPair(cfg: DuoConfig): DuoConfig {
  if (!cfg.pair) return cfg;
  const pair: PairInfo = { ...cfg.pair, settings: settingsInUse(cfg) };
  return { ...cfg, pair, pairs: cfg.pairs.map((p) => (p.id === pair.id ? pair : p)) };
}

/**
 * Puts a connection's settings back in use.
 *
 * The ones it does not have - because it was born earlier, or because
 * it has just been created - stay as they are: better to inherit than
 * to wipe.
 */
function applySettings(cfg: DuoConfig, p: PairInfo): DuoConfig {
  const theirs = p.settings;
  if (!theirs) return cfg;
  const out = { ...cfg };
  for (const k of PAIR_FIELDS) {
    const v = (theirs as any)[k];
    if (v !== undefined) (out as any)[k] = v;
  }
  return out;
}

/**
 * How much to spend on video.
 *
 * Each profile has its own CAPTURE resolution, and changing it reopens
 * the camera.
 *
 * The painless way would be to scale the encoder's output
 * (`scaleResolutionDownBy`), and on some phones it works. On others it
 * does not: the MediaTek in the POCO records the requested scale -
 * reading the parameters back confirms it - and then produces full
 * resolution anyway. It is the encoder, and from the code's side there
 * is no way to talk it round.
 *
 * The capture resolution, on the other hand, no encoder can ignore. The
 * price is a moment of black at the change, while the camera reopens.
 *
 * Frame rate and `degradationPreference` stay out of the hot change:
 * touching those on a running encoder is what made it stop producing
 * anything at all.
 */
export type VideoQuality = 'saver' | 'standard' | 'better' | 'best';

export type DuoConfig = {
  /** wss://YOUR_DOMAIN/duetto/ws */
  serverUrl: string;
  /** how the other person sees me */
  displayName: string;
  /** the connection in use; null until a pairing has been made */
  pair: PairInfo | null;
  /**
   * Every connection this phone knows, the one in use first.
   *
   * A pairing costs something: two people, phones in hand, reading a
   * code out to each other. Throwing it away to talk to somebody else,
   * and doing it again to come back, is a price there is no reason to
   * pay: the keys take thirty bytes and stay valid until the other side
   * breaks the pair.
   *
   * Normally the first of the list is picked up again, which is the one
   * used last.
   */
  pairs: PairInfo[];
  /** the system settings have already been offered once */
  setupShown: boolean;
  /** how much to spend on video: bandwidth and battery */
  videoQuality: VideoQuality;
  /**
   * Lifts the audio ceiling from ~32 to 64 kbit/s.
   *
   * With Opus you can hear the difference: the voice stops sounding
   * "telephone-like". It costs 4 kB/s more per direction, nothing next
   * to the video. Off by default, because the default is enough for
   * talking.
   */
  richerAudio: boolean;
  /**
   * Diagnostics: everything that exists in order to understand, and
   * that is of no use to whoever only wants to talk.
   *
   * It gathers four things that used to be either always on or scattered
   * about: the two technical lines under the buttons, the journal's
   * five-minute sampling, the exchange of journals with the other phone,
   * and the log lines that `adb logcat` reads.
   *
   * Off, the journal does not stop: it goes on writing the lines that
   * tell a story - a death of the process, a coming and going, a change
   * of network - and drops only the periodic sample with the battery
   * and traffic counters. Whoever reports a problem is not left with
   * empty hands.
   *
   * It belongs to the phone and not to the connection: the journal is
   * one file, and the logs are one stream. This is the only setting of
   * the interface that does not travel with the person.
   */
  diagnostics: boolean;
  /**
   * The wait, written as one number instead of two.
   *
   * Off, the technical line says the two directions: which of them is
   * the slow one says on which of the two phones the wait sits, and the
   * total alone cannot. On, only the total: it is the one being lived
   * through while talking, and for whoever is not hunting for a cause
   * it is the only one worth reading.
   */
  delayTotalOnly: boolean;
  /**
   * How far the controls step aside while a video is playing.
   *
   * "dim" keeps them legible (40%), "faint" reduces them to a shadow
   * (15%), "hidden" takes them away entirely. In all three cases they
   * can still be pressed, and a touch anywhere brings them back: all
   * that changes is how much of the picture they leave you.
   */
  controls: 'dim' | 'faint' | 'hidden';
  /**
   * `vp9` only if both phones encode it in hardware; otherwise the
   * setting stays written but has no effect, and the option does not
   * even appear in the interface.
   */
  videoCodec: 'auto' | 'vp9';

  /**
   * How the other person's alert should make itself heard.
   *
   * "default" lets Android decide, since it already knows what you are
   * doing right now - silent mode, do not disturb, headphones. The
   * other two choices force it: somebody with the phone in a pocket
   * wants the vibration even on silent, somebody with it on the
   * bedside table at night wants nothing at all.
   */
  alertVibration: 'default' | 'always' | 'never';
  alertSound: 'default' | 'none' | 'chosen';
  /** A sound picked from the phone's own: a system address. */
  alertSoundUri: string;
  /** Its name, so it can be shown without having to ask for it again. */
  alertSoundName: string;

  /**
   * Where the sound comes out.
   *
   * It used to live in a memory of its own, outside here: it came back
   * in when the settings became the connection's, because it is among
   * the most personal of them - their microphone, the way the two of
   * you are together.
   */
  audioOutput: string;

  /**
   * Which language the app speaks.
   *
   * It sits among the connection's settings like the others: with one
   * person you write in English, with another in Italian, and the same
   * phone can do both. 'auto' means following the phone's own language.
   */
  language: LanguageChoice;

  /**
   * How far the other voice is lifted ABOVE the phone's own top.
   *
   * One per output, because the right level against the ear is not the
   * right level on speaker. Below the phone's top it is not needed:
   * there the call volume is in charge, and Android already remembers
   * that separately for each output. This is only the part above, and
   * it is 1 until somebody asks for more.
   */
  gains: Record<string, number>;

  /**
   * The multipliers have already been reset once.
   *
   * Duetto's volume started life as a single multiplier, applied on top
   * of a call volume nobody was looking at. When it became the product
   * of the two halves that number changed meaning: 125% no longer said
   * "a little louder than the phone" but "a quarter more on top of
   * whatever", on every output - and against the ear it sounded like a
   * speakerphone. Carrying it over was a mistake: it is reset once, and
   * from then on the work is done by the phone's own knob, which
   * already has a memory for each output.
   */
  gainsReset: boolean;

  /**
   * Which camera films: front or back.
   *
   * It used to be remembered nowhere - every session started from the
   * front one - and yet it is a lasting choice: with one person you
   * look each other in the face, with another you point at what you are
   * doing.
   */
  frontCamera: boolean;
};

export const DEFAULT_CONFIG: DuoConfig = {
  serverUrl: '',
  displayName: '',
  pair: null,
  pairs: [],
  setupShown: false,
  // We start from the high profile: it is a ceiling, not a demand, and
  // with "balanced" a poor network brings it down by itself. Starting
  // low would have left anybody who never opens the settings in reduced
  // definition, however good their network.
  videoQuality: 'better',
  richerAudio: false,
  diagnostics: false,
  delayTotalOnly: false,
  controls: 'dim',
  videoCodec: 'auto',
  alertVibration: 'default',
  alertSound: 'default',
  alertSoundUri: '',
  alertSoundName: '',
  audioOutput: 'SPEAKER_PHONE',
  language: 'auto',
  gains: {},
  gainsReset: false,
  frontCamera: true,
};

const STORAGE_KEY = 'duetto.config.v3';

export async function loadConfig(): Promise<DuoConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    // The names first, then everything else: what follows reads fields
    // that on a phone updating from an earlier Duetto are still
    // written in Italian.
    const stored = fromItalianStorage(JSON.parse(raw));
    return tidyPairs(oneDiagnostics({ ...DEFAULT_CONFIG, ...stored }));
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * The diagnostics switch used to be one per connection.
 *
 * It was called `showDiagnostics` and lived among the settings that
 * travel with the person, because back then it only turned the two
 * lines under the buttons on. Now that it also decides what gets
 * written and what is sent, it is the phone's business - and whoever
 * had it on anywhere gets it on.
 */
function oneDiagnostics(cfg: any): DuoConfig {
  if (typeof cfg.diagnostics === 'boolean') return cfg;
  const anywhere = cfg.showDiagnostics === true
    || (Array.isArray(cfg.pairs)
      && cfg.pairs.some((p: any) => p?.settings?.showDiagnostics === true));
  return { ...cfg, diagnostics: anywhere };
}

function tidyPairs(cfg: DuoConfig): DuoConfig {
  const list = Array.isArray(cfg.pairs) ? cfg.pairs.filter((p) => p && p.id && p.key) : [];
  const active = cfg.pair && cfg.pair.id && cfg.pair.key ? cfg.pair : null;
  if (!active) return { ...cfg, pairs: list };
  // The one in use is always at the head, and appears once: that is
  // where the interface reads "the one used last" from.
  const others = list.filter((p) => p.id !== active.id);
  return { ...cfg, pair: active, pairs: [active, ...others] };
}

/**
 * Adds a pairing just made and puts it in use.
 *
 * If it remakes a connection to the same room - which can only happen
 * by repeating the same code - it replaces the old one instead of
 * sitting next to it.
 */
export function addPair(cfg: DuoConfig, pair: PairInfo): DuoConfig {
  // It is born with the settings you have right now: they are the only
  // reasonable thing to give it, and from then on they are its own.
  const fresh: PairInfo = {
    serverUrl: cfg.serverUrl,
    settings: settingsInUse(cfg),
    ...pair,
  };
  return {
    ...cfg,
    pair: fresh,
    pairs: [fresh, ...cfg.pairs.filter((p) => p.id !== fresh.id)],
  };
}

/**
 * Moves to a connection already set up.
 *
 * It carries along the server that pair was born on: that is where its
 * room is.
 */
export function switchToPair(cfg: DuoConfig, id: string): DuoConfig {
  const chosen = cfg.pairs.find((p) => p.id === id);
  if (!chosen || chosen.id === cfg.pair?.id) return cfg;
  // First the settings of the one being left are put away, then the
  // new one's are fetched: without that first step, the last choices
  // made with one would land on the other.
  const stored = storeSettingsInPair(cfg);
  const after: DuoConfig = {
    ...stored,
    serverUrl: chosen.serverUrl || stored.serverUrl,
    pair: chosen,
    pairs: [chosen, ...stored.pairs.filter((p) => p.id !== id)],
  };
  return applySettings(after, chosen);
}

/**
 * Forgets a connection.
 *
 * Breaking the one in use moves to the most recent of those left:
 * asking for a fresh pairing from somebody who has others ready would
 * be asking them to redo something already done.
 */
export function forgetPair(cfg: DuoConfig, id: string): DuoConfig {
  const left = cfg.pairs.filter((p) => p.id !== id);
  if (cfg.pair?.id !== id) return { ...cfg, pairs: left };
  const next = left[0] ?? null;
  const after: DuoConfig = {
    ...cfg,
    serverUrl: next?.serverUrl || cfg.serverUrl,
    pair: next,
    pairs: left,
  };
  return next ? applySettings(after, next) : after;
}

/**
 * Writes down what the other person is really called.
 *
 * At pairing time the name can be missing, or be the placeholder one:
 * the real one arrives at every entry into the channel. With several
 * connections in the list the name is the only thing that tells them
 * apart - the room's fingerprint means nothing to anybody - so it is
 * worth keeping up to date.
 *
 * Returns `null` when there is nothing to change, so the caller does
 * not rewrite the configuration for nothing.
 */
export function rememberPeerName(cfg: DuoConfig, id: string, name: string): DuoConfig | null {
  if (!name || name === 'Qualcuno' || name === 'Someone') return null;
  const target = cfg.pairs.find((p) => p.id === id);
  if (!target || target.peerName === name) return null;
  const pairs = cfg.pairs.map((p) => (p.id === id ? { ...p, peerName: name } : p));
  return {
    ...cfg,
    pair: cfg.pair?.id === id ? { ...cfg.pair, peerName: name } : cfg.pair,
    pairs,
  };
}

/**
 * What to call a connection in a list.
 *
 * First the name I gave it, then - having given it none - the name of
 * whoever is at the other end, which is still the most natural way of
 * telling it apart. If there is neither, nothing: the caller decides
 * what to put in place of nothing.
 */
export function pairName(p: PairInfo | null | undefined): string {
  if (!p) return '';
  if (p.label) return p.label;
  const n = p.peerName;
  return n && n !== 'Qualcuno' && n !== 'Someone' ? n : '';
}

/**
 * What this connection is called inside file names.
 *
 * The journal needs it, since it keeps one file per connection: inside
 * there is the name you gave it - so whoever downloads the files can
 * tell whose they are - and a piece of the room's fingerprint, which
 * tells them apart even when the names look alike or are missing.
 */
export function pairFileKey(p: PairInfo | null | undefined): string {
  if (!p) return '';
  const name = (p.label || p.peerName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const fingerprint = (p.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase();
  return name ? `${name}-${fingerprint}` : fingerprint;
}

/** Renames the connection. Empty = it has no name. */
export function renamePair(cfg: DuoConfig, id: string, label: string): DuoConfig {
  const clean = label.trim().slice(0, 32);
  const touch = (p: PairInfo) => (p.id === id ? { ...p, label: clean || undefined } : p);
  return {
    ...cfg,
    pair: cfg.pair ? touch(cfg.pair) : cfg.pair,
    pairs: cfg.pairs.map(touch),
  };
}

/**
 * A server just typed in applies to the pair in use as well.
 *
 * Without this, changing the server in the settings would change it for
 * the app alone: at the first move to another connection and back, the
 * pair would drag its old address along.
 */
export function alignPairServer(cfg: DuoConfig): DuoConfig {
  if (!cfg.pair || cfg.pair.serverUrl === cfg.serverUrl) return cfg;
  const pair = { ...cfg.pair, serverUrl: cfg.serverUrl };
  return {
    ...cfg,
    pair,
    pairs: cfg.pairs.map((p) => (p.id === pair.id ? pair : p)),
  };
}

export async function saveConfig(cfg: DuoConfig): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

/**
 * From the server's name to the full address.
 *
 * We only ask for "example.org": the rest we add ourselves, while
 * still accepting a full address if somebody types one.
 *
 *   example.org                  -> wss://example.org/duetto/ws
 *   https://example.org          -> wss://example.org/duetto/ws
 *   wss://example.org/other/ws   -> left as it is
 */
export function normalizeServerUrl(raw: string): string {
  let s = (raw || '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '');
  if (!/^wss?:\/\//i.test(s)) s = `wss://${s}`;
  const m = s.match(/^(wss?:\/\/[^/]+)(\/.*)?$/i);
  if (!m) return s;
  const path = m[2] && m[2] !== '/' ? m[2] : '/duetto/ws';
  return m[1] + path;
}

/**
 * How to show it again in the settings.
 *
 * We ask for the domain but save the full address: reopening the
 * settings you used to find "wss://yourserver.org/duetto/ws" in a field
 * that asks for "yourserver.org". If the address is the standard one we
 * show the domain alone; if somebody typed a path of their own it stays
 * whole, because there the domain would not be enough.
 */
export function displayServer(url: string): string {
  const m = (url || '').match(/^wss?:\/\/([^/]+)\/duetto\/ws$/i);
  return m ? m[1] : (url || '');
}

/** The least that is needed to reach the server and pair. */
export function isServerConfigured(cfg: DuoConfig): boolean {
  const url = normalizeServerUrl(cfg.serverUrl);
  return /^wss?:\/\/[^/]+\/.+/.test(url);
}

/** True when a pair already exists: straight into the channel. */
export function isPaired(cfg: DuoConfig): boolean {
  return !!cfg.pair && !!cfg.pair.id && !!cfg.pair.key;
}

/**
 * The four profiles, in figures.
 *
 * `degradation` is "balanced" in all of them: when there is not enough
 * bandwidth, the encoder may come down in resolution instead of merely
 * throwing frames away. With "maintain-resolution" a high profile on a
 * bad network did not give a slightly worse picture, it gave a sharp
 * slide show - measured: 1920x1072 at ONE frame per second.
 *
 * This way the profile really is a ceiling: you take the best the
 * network allows, and come down gracefully when it does not.
 *
 * All four stay 16:9, so the framing does not change moving from one to
 * another: what changes is the definition, not what fits in the shot.
 */
export const VIDEO_PROFILES: Record<VideoQuality, {
  /** how the camera films: the one lever no encoder ignores */
  capture: { width: number; height: number };
  maxBitrate: number;
  degradation: string;
  /** the key of its name and of its note in the dictionaries */
  key: string;
}> = {
  saver: {
    capture: { width: 640, height: 360 },
    maxBitrate: 300_000,
    degradation: 'balanced',
    key: 'saver',
  },
  standard: {
    capture: { width: 960, height: 540 },
    maxBitrate: 1_200_000,
    degradation: 'balanced',
    key: 'standard',
  },
  better: {
    capture: { width: 1280, height: 720 },
    maxBitrate: 2_500_000,
    degradation: 'balanced',
    key: 'better',
  },
  best: {
    capture: { width: 1920, height: 1080 },
    maxBitrate: 4_000_000,
    // 'balanced' rather than 'maintain-resolution': at switch-on the
    // bandwidth estimate starts low, and forcing the encoder to produce
    // 1080p straight away means a first key frame that often does not
    // get through - hence the video that never appeared on the other
    // side until you switched it off and on. Scaling the output does
    // not change the framing, only the sharpness, until the bandwidth
    // comes up.
    degradation: 'balanced',
    key: 'best',
  },
};

/** Frames asked of the camera, the same for every profile. */
export const CAPTURE_FPS = 30;

type RTCIceServer = { urls: string; username?: string; credential?: string };

/**
 * Where the search for a way to the other side begins.
 *
 * Only the public STUN is here, which is what tells a phone its own
 * address as seen from outside. The relay - which comes into play when
 * the direct road does not open - is announced by the server in the
 * joining message, credentials included: that way there is a single
 * thing to maintain, and changing the password means touching no phone
 * at all.
 */
export function iceServers(): RTCIceServer[] {
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}
