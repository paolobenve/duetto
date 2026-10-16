/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import { AppState } from 'react-native';
import { Foreground, Journal, Alarm, Heartbeat } from 'duetto-platform';
import {
  DuoConfig, PairInfo, peerShown, alertSoundFor, myNameOn, loadConfig, saveConfig, rememberPeerName,
  ALERT_GAIN, sharedChoiceHeard,
} from './config';
import { Signaling } from './signaling';
import type { PeerGone } from './signaling';
import { news } from './presence';
import { alarmLabel } from './alarms';
import { logger } from './log';
import { keepCall } from './callsUnseen';
import { callerFor } from './notificationCall';
import { VERSION_LABEL, BUILD } from './version';
import { deliverAsk, answerHeard, noteAskedOfUs, said as saidOfThem } from './diagnosticsAsk';

const log = logger('[duetto-standby]');

/**
 * The connections that are not the one in use, still reachable.
 *
 * Moving to another connection closed the one left behind, and over
 * there one became unreachable: a call from that person went nowhere.
 * Each connection not in use now keeps a seat of its own on its server
 * - listening, nothing more - so that the other person sees us waiting
 * and their calls arrive, with the connection named in the words. The
 * server keeps one seat per side in each room, and the rooms are apart:
 * nothing there had to change.
 *
 * It lives at the module's level, shared by the interface and by the
 * presence with no window, which run in the same engine: whichever
 * calls refreshStandby, the same connections are kept, never two.
 */
const standing = new Map<string, Signaling>();
/**
 * The name each waiting connection last said: a new one is said again
 * without leaving the room (Signaling.setName).
 */
const standingName = new Map<string, string>();
/** Every connection as the configuration has it now: see `live` in open(). */
const latest = new Map<string, PairInfo>();

/**
 * Where the other side of each waiting connection stands, one line each
 * under the standing notification's own (see Foreground.setPairLines):
 * known from the moment the connection is in the room - the server says
 * whether the other is there, in the channel, since when - and kept as
 * it changes. It used to be said only at a coming in or out, so until
 * the first one nothing could be known of the other connections.
 */
type PairState = 'in' | 'waiting' | 'detached' | 'unreachable';
/** "id, state, words", tab apart: the id and the state give the line its buttons */
const pairLines = new Map<string, string>();
let linesSaid = '';
function sayPairLines() {
  const all = [...pairLines.values()].join('\n');
  if (all === linesSaid) return;
  linesSaid = all;
  Foreground.setPairLines(all).catch(() => { /* noop */ });
}
function dropPairLine(id: string) {
  // The line goes, and its "Call" with it.
  callerFor(id, null);
  if (pairLines.delete(id)) sayPairLines();
}

/**
 * The waiting connections' own watch.
 *
 * The connection in use has a watchdog on the native heartbeat, the one
 * clock that rings with the screen off: dead, it is remade; looking
 * alive, it is asked a question, and an answer missing at the next beat
 * means it carries nothing. The waiting ones had none - only the
 * reconnection's JavaScript timers, which stand still with the screen
 * off, and nothing at all for a socket the server had closed without
 * the phone noticing. On 10 October the POCO's connection to the moto's
 * pair dropped four times and stayed down for hours: the moto saw the
 * POCO unreachable while it sat online, in the channel with the edge.
 * Now each waiting connection gets the same two checks at every beat.
 * The question costs a few dozen bytes a minute.
 */
const askedAt = new Map<string, number>();
const answeredAt = new Map<string, number>();
/** since when a connection has been found down, to say it once and its return */
const downSince = new Map<string, number>();
let stopBeat: (() => void) | null = null;

function answered(id: string) {
  answeredAt.set(id, Date.now());
  const since = downSince.get(id);
  if (since === undefined) return;
  downSince.delete(id);
  Journal.mark(`standby:back:${id.slice(0, 8)}:${Math.round((Date.now() - since) / 1000)}s`)
    .catch(() => { /* noop */ });
}

function forgetWatch(id: string) {
  askedAt.delete(id);
  answeredAt.delete(id);
  downSince.delete(id);
}

/** The beat listened to while there is a connection waiting, and only then. */
function watchStanding() {
  if (standing.size === 0) {
    if (stopBeat) { stopBeat(); stopBeat = null; }
    return;
  }
  if (stopBeat) return;
  stopBeat = Heartbeat.subscribe(() => {
    for (const [id, sig] of standing) {
      const asked = askedAt.get(id) ?? 0;
      const silent = asked > 0 && (answeredAt.get(id) ?? 0) < asked;
      if (!sig.connected || silent) {
        if (!downSince.has(id)) {
          downSince.set(id, Date.now());
          Journal.mark(`standby:rebuilt:${id.slice(0, 8)}:${sig.connected ? 'silent' : 'no-socket'}`)
            .catch(() => { /* noop */ });
        }
        askedAt.delete(id);
        sig.rebuild();
        continue;
      }
      askedAt.set(id, Date.now());
      sig.askPresence();
    }
  });
}

/** The interface's ear: a call or a sound from a connection not in use. */
type CallHeard = (pairId: string, text: string) => void;
let onCall: CallHeard | null = null;
/** To the interface, or kept for it when there is none: see callsUnseen.ts. */
function heard(pairId: string, text: string) {
  if (onCall) onCall(pairId, text);
  else keepCall(text, pairId);
}
export function onStandbyCall(cb: CallHeard): () => void {
  onCall = cb;
  return () => { if (onCall === cb) onCall = null; };
}

/**
 * The other side's name, heard on a connection not in use.
 *
 * It was kept only in memory, for that moment's notifications: the name
 * written in the pair was the one of the pairing, and it is the one the
 * pencil offers and the list shows. On 10 October the moto took a name,
 * the POCO waiting on that pair heard it, and went on saying the other
 * had given themselves none. Now it is written in the pair - by the
 * interface, which holds the configuration, or, with no interface,
 * straight into the saved one, as the presence does.
 */
type NameHeard = (pairId: string, name: string) => void;
let onName: NameHeard | null = null;
export function onStandbyName(cb: NameHeard): () => void {
  onName = cb;
  return () => { if (onName === cb) onName = null; };
}
/**
 * A choice that holds for both phones - the resolution, the short
 * packets, the richer voice - heard on a connection not in use.
 *
 * The other phone tells it when it is made, and the server brings it to
 * whoever is in the room: a waiting connection heard it and let it go.
 * So on 10 October the moto went to "saver" with the POCO waiting on
 * that pair, and when the POCO came over the two were apart. Now it is
 * written in the pair - unless the choice here is newer - by the
 * interface or straight into the saved configuration.
 */
type ChoiceMsg = Parameters<typeof sharedChoiceHeard>[2];
type ChoiceHeard = (pairId: string, msg: ChoiceMsg) => void;
let onChoice: ChoiceHeard | null = null;
export function onStandbyChoice(cb: ChoiceHeard): () => void {
  onChoice = cb;
  return () => { if (onChoice === cb) onChoice = null; };
}
function choiceHeard(pairId: string, msg: ChoiceMsg) {
  Journal.mark(`standby:peer-${msg.kind}:${pairId.slice(0, 8)}`).catch(() => { /* noop */ });
  if (onChoice) { onChoice(pairId, msg); return; }
  loadConfig().then((fresh) => {
    const next = sharedChoiceHeard(fresh, pairId, msg);
    return next ? saveConfig(next) : undefined;
  }).catch(() => { /* noop */ });
}

function nameHeard(pairId: string, name: string) {
  Journal.mark(`standby:peer-name:${pairId.slice(0, 8)}`).catch(() => { /* noop */ });
  if (onName) { onName(pairId, name); return; }
  loadConfig().then((fresh) => {
    const next = rememberPeerName(fresh, pairId, name);
    return next ? saveConfig(next) : undefined;
  }).catch(() => { /* noop */ });
}

/**
 * Asked for our diagnostics on a connection not in use: the interface,
 * when there is one, shows its card; see diagnosticsAsk.ts.
 */
type AskHeard = (pairId: string) => void;
let onAsk: AskHeard | null = null;
export function onStandbyAsk(cb: AskHeard): () => void {
  onAsk = cb;
  return () => { if (onAsk === cb) onAsk = null; };
}

/** this phone's diagnostics, as the waiting connections say them */
let diagnosticsOn = false;

/** Which Duetto, and whether its diagnostics are on: the hello, from here too. */
function sayHello(sig: Signaling, pairId: string) {
  sig.sendSignal({ kind: 'hello', version: VERSION_LABEL, build: BUILD, diagnostics: diagnosticsOn });
  deliverAsk(sig, pairId).catch(() => { /* noop */ });
}

/** Diagnostics turned on or off: every waiting connection says it again. */
export function helloStandby(on: boolean) {
  diagnosticsOn = on;
  for (const [id, sig] of standing) if (sig.connected) sayHello(sig, id);
}

/** A word for the other side of a connection not in use, if it is connected. */
export function sendStandby(pairId: string, msg: Parameters<Signaling['sendSignal']>[0]): boolean {
  const sig = standing.get(pairId);
  if (!sig?.connected) return false;
  sig.sendSignal(msg);
  return true;
}

/** The connections that should be waiting: not the one in use, not broken, not switched off. */
function wanted(cfg: DuoConfig): Map<string, PairInfo> {
  const out = new Map<string, PairInfo>();
  for (const p of cfg.pairs) {
    if (p.id === cfg.pair?.id || p.brokenByPeer || p.standby === false) continue;
    out.set(p.id, p);
  }
  return out;
}

/**
 * Brings the waiting connections in line with the configuration: the
 * ones no longer wanted closed - without a goodbye, the seat may be
 * taken up again in a moment by the interface - the missing ones
 * opened. Unavailable by choice, none.
 */
export async function refreshStandby(cfg: DuoConfig | null): Promise<void> {
  if (cfg) diagnosticsOn = cfg.diagnostics === true;
  if (cfg) {
    latest.clear();
    for (const p of cfg.pairs) latest.set(p.id, p);
  }
  const available = await Foreground.isAvailable().catch(() => true);
  const want = cfg && available ? wanted(cfg) : new Map<string, PairInfo>();
  /**
   * Unavailable by choice: the waiting connections say goodbye, as the
   * one in use does. Closed without a word, the other side read a drop -
   * "not reachable" - where the phone in use said "made unavailable".
   */
  const leaving = !cfg || !available;
  for (const [id, sig] of standing) {
    const p = want.get(id);
    if (p) {
      // My name changed on it: said to the other side, staying put.
      const mine = myNameOn(cfg!, p);
      if (mine !== standingName.get(id)) {
        standingName.set(id, mine);
        sig.setName(mine);
        Journal.mark(`standby:renamed:${id.slice(0, 8)}`).catch(() => { /* noop */ });
      }
      continue;
    }
    sig.close(leaving);
    standing.delete(id);
    standingName.delete(id);
    forgetWatch(id);
    // In use, the standing notification's own line says where the other
    // is; made unavailable, nothing of the others is known any more.
    dropPairLine(id);
    Journal.mark(`standby:close:${id.slice(0, 8)}${leaving ? ':bye' : ''}`).catch(() => { /* noop */ });
  }
  for (const [id, p] of want) {
    if (!standing.has(id)) open(cfg!, p);
  }
  watchStanding();
}

export function stopStandby() {
  for (const sig of standing.values()) sig.close(false);
  standing.clear();
  standingName.clear();
  askedAt.clear();
  answeredAt.clear();
  downSince.clear();
  watchStanding();
  for (const id of pairLines.keys()) callerFor(id, null);
  pairLines.clear();
  sayPairLines();
}

/**
 * How this connection's calls sound and buzz: its own settings, the
 * ones chosen while it was in use. A connection born before settings
 * travelled with it has none, and the one in use's are heard.
 */
function soundOf(pair: PairInfo) {
  const s = pair.settings;
  if (!s) return {};
  return {
    vibration: s.alertVibration, sound: s.alertSound, uri: alertSoundFor(s),
    level: ALERT_GAIN[s.alertLevel ?? 'full'] ?? 1,
  };
}

function open(cfg: DuoConfig, pair: PairInfo) {
  /**
   * The connection as it is now, not as it was on opening: its name and
   * the choice of the other's name can change from its pencil while it
   * waits, and the notifications went on with the old ones until it
   * was opened again.
   */
  const live = (): PairInfo => latest.get(pair.id) ?? pair;
  const channelNow = () => live().label || '';
  let name = pair.peerName || '';
  /** the name last written in the pair, so that it is written once */
  let written = name;
  /** where the other side stands, and since when: this connection's line */
  let state: PairState | null = null;
  let stateSince = 0;
  const writeLine = () => {
    if (!state) return;
    const label = channelNow();
    const said = news.pairState(peerShown(live(), name), state, stateSince);
    pairLines.set(pair.id, `${pair.id}\t${state}\t${label ? `${label} · ${said}` : said}`);
    sayPairLines();
  };
  /** `since` 0 when unknown: the time already known stays, if the state is the same */
  const stands = (now: PairState, since: number) => {
    const changed = now !== state;
    if (changed) {
      Journal.mark(`standby:peer-${now}:${pair.id.slice(0, 8)}`).catch(() => { /* noop */ });
    }
    state = now;
    stateSince = since > 0 ? since : changed ? 0 : stateSince;
    writeLine();
  };
  /** what the server says of them, on joining and on each answer */
  const standsAsSaid = (present: boolean, active: boolean, since: number, gone: PeerGone) => {
    if (present) stands(active ? 'in' : 'waiting', since);
    else if (gone) stands(gone.reason === 'bye' ? 'detached' : 'unreachable', gone.at);
    else stands('unreachable', 0);
  };
  const learn = (heardName?: string) => {
    if (!heardName) return;
    name = heardName;
    if (heardName === written || heardName === 'Qualcuno' || heardName === 'Someone') return;
    written = heardName;
    nameHeard(pair.id, heardName);
  };
  Journal.mark(`standby:open:${pair.id.slice(0, 8)}`).catch(() => { /* noop */ });
  const sig: Signaling = new Signaling(
    {
      serverUrl: (pair.serverUrl || cfg.serverUrl).trim(),
      serverKey: pair.serverKey ?? cfg.serverKey,
      room: pair.id,
      displayName: myNameOn(cfg, pair),
      key: pair.key,
      side: pair.side,
      mode: 'listening',
    },
    {
      // Another connection of ours took the seat: the interface, now
      // that this pair is the one in use. It is its seat now.
      onReplaced: () => {
        if (standing.get(pair.id) === sig) {
          standing.delete(pair.id);
          standingName.delete(pair.id);
          forgetWatch(pair.id);
          dropPairLine(pair.id);
        }
        sig.close(false);
      },
      // The hello goes from here too: the other side of a connection
      // not in use learnt nothing of this phone - its version, its
      // diagnostics - and offered to ask for what was there already.
      // The server answering: the socket lives (see watchStanding).
      onPresence: ({ peerPresent, peerActive, peerName, peerSince, peerGone }) => {
        answered(pair.id);
        learn(peerName);
        standsAsSaid(peerPresent, peerActive, peerSince, peerGone);
      },
      onJoined: ({ peerName, peerPresent, peerActive, peerSince, peerGone }) => {
        answered(pair.id);
        learn(peerName);
        standsAsSaid(peerPresent, peerActive, peerSince, peerGone);
        if (peerPresent) sayHello(sig, pair.id);
      },
      // A new name of theirs, without them leaving the room.
      onPeerName: (peerName) => { learn(peerName); writeLine(); },
      onPeerJoined: (peerName, mode, since) => {
        learn(peerName);
        stands(mode === 'active' ? 'in' : 'waiting', since);
        sayHello(sig, pair.id);
      },
      onNotify: (reason, peerName, at) => {
        learn(peerName);
        const who = peerShown(live(), name);
        if (reason === 'knock') {
          const text = news.called(who, channelNow(), at);
          log('call from a connection not in use:', text);
          Journal.mark(`standby:knock:${pair.id.slice(0, 8)}`).catch(() => { /* noop */ });
          Foreground.notifyFor('', text, pair.id, soundOf(live())).catch(() => { /* noop */ });
          heard(pair.id, text);
          return;
        }
        // Their coming into the channel: on this connection's line.
        stands('in', at);
      },
      // In the channel or waiting, and gone - by choice or dropped -
      // each said as it is.
      onPeerMode: (mode, peerName, since) => {
        learn(peerName);
        stands(mode === 'active' ? 'in' : 'waiting', since);
      },
      onPeerLeft: (why, at) => {
        stands(why === 'bye' ? 'detached' : 'unreachable', at);
      },
      onSignal: (msg) => {
        // Asked for our diagnostics: answered here, the card shown by
        // the interface or kept for it. See diagnosticsAsk.ts.
        if (msg.kind === 'askDiagnostics') {
          Journal.mark(`standby:diagnostics-asked:${pair.id.slice(0, 8)}`).catch(() => { /* noop */ });
          if (diagnosticsOn) {
            sig.sendSignal({ kind: 'diagnosticsAnswer', answer: 'already' });
            return;
          }
          sig.sendSignal({ kind: 'diagnosticsAnswer', answer: 'received' });
          noteAskedOfUs(pair.id).then(() => {
            onAsk?.(pair.id);
            // Said quietly too, unless the card is in front of somebody.
            if (!onAsk || AppState.currentState !== 'active') {
              Foreground.note('', saidOfThem('diagAsk.note', peerShown(live(), name))).catch(() => { /* noop */ });
            }
          }).catch(() => { /* noop */ });
          return;
        }
        if (msg.kind === 'diagnosticsAnswer') {
          answerHeard(pair.id, msg.answer).then((st) => {
            const who = peerShown(live(), name);
            if (st === 'on') Foreground.note('', saidOfThem('diagAsk.turnedOn', who)).catch(() => { /* noop */ });
            if (st === 'no') Foreground.note('', saidOfThem('diagAsk.refused', who)).catch(() => { /* noop */ });
          }).catch(() => { /* noop */ });
          return;
        }
        if (msg.kind === 'quality' || msg.kind === 'shortPackets' || msg.kind === 'audio') {
          choiceHeard(pair.id, msg);
          return;
        }
        if (msg.kind !== 'alarm') return;
        const who = peerShown(live(), name);
        const text = news.called(who, channelNow(), Number(msg.at) || Date.now(),
          alarmLabel(String(msg.sound ?? '')));
        Journal.mark(`standby:alarm:${pair.id.slice(0, 8)}:${msg.sound}`).catch(() => { /* noop */ });
        Alarm.play(String(msg.sound ?? ''), false, 0,
          ALERT_GAIN[live().settings?.alertLevel ?? 'full'] ?? 1).catch(() => { /* noop */ });
        // Silent: the sound is the call; see the app's own.
        Foreground.notifyFor('', text, pair.id, { ...soundOf(live()), sound: 'none' })
          .catch(() => { /* noop */ });
        heard(pair.id, text);
      },
    },
  );
  standing.set(pair.id, sig);
  standingName.set(pair.id, myNameOn(cfg, pair));
  // The standing notification's "Call" on this connection's line: only
  // where the other is there to hear it, in the channel or waiting.
  callerFor(pair.id, () => {
    if (standing.get(pair.id) !== sig) return null;
    const hears = sig.connected && (state === 'in' || state === 'waiting');
    if (hears) sig.knock();
    return { sent: hears, who: peerShown(live(), name), channel: channelNow() };
  });
  sig.connect();
}
