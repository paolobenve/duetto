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
import { Foreground, Journal, Alarm } from 'duetto-platform';
import {
  DuoConfig, PairInfo, peerShown, alertSoundFor, myNameOn, loadConfig, saveConfig, rememberPeerName,
  ALERT_GAIN,
} from './config';
import { Signaling } from './signaling';
import { news } from './presence';
import { alarmLabel } from './alarms';
import { logger } from './log';
import { keepCall } from './callsUnseen';
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
  const available = await Foreground.isAvailable().catch(() => true);
  const want = cfg && available ? wanted(cfg) : new Map<string, PairInfo>();
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
    sig.close(false);
    standing.delete(id);
    standingName.delete(id);
    Journal.mark(`standby:close:${id.slice(0, 8)}`).catch(() => { /* noop */ });
  }
  for (const [id, p] of want) {
    if (!standing.has(id)) open(cfg!, p);
  }
}

export function stopStandby() {
  for (const sig of standing.values()) sig.close(false);
  standing.clear();
  standingName.clear();
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
  const channel = pair.label || '';
  let name = pair.peerName || '';
  /** the name last written in the pair, so that it is written once */
  let written = name;
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
        if (standing.get(pair.id) === sig) { standing.delete(pair.id); standingName.delete(pair.id); }
        sig.close(false);
      },
      // The hello goes from here too: the other side of a connection
      // not in use learnt nothing of this phone - its version, its
      // diagnostics - and offered to ask for what was there already.
      onJoined: ({ peerName, peerPresent }) => {
        learn(peerName);
        if (peerPresent) sayHello(sig, pair.id);
      },
      // A new name of theirs, without them leaving the room.
      onPeerName: (peerName) => learn(peerName),
      onPeerJoined: (peerName) => {
        learn(peerName);
        sayHello(sig, pair.id);
      },
      onNotify: (reason, peerName, at) => {
        learn(peerName);
        const who = peerShown(pair, name);
        if (reason === 'knock') {
          const text = news.called(who, channel, at);
          log('call from a connection not in use:', text);
          Journal.mark(`standby:knock:${pair.id.slice(0, 8)}`).catch(() => { /* noop */ });
          Foreground.notifyFor('', text, pair.id, soundOf(pair)).catch(() => { /* noop */ });
          heard(pair.id, text);
          return;
        }
        // Their coming into the channel: said quietly, on the line that
        // does not ring - it is news, not a call.
        Foreground.note('', news.inChannel(who, channel, at)).catch(() => { /* noop */ });
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
              Foreground.note('', saidOfThem('diagAsk.note', peerShown(pair, name))).catch(() => { /* noop */ });
            }
          }).catch(() => { /* noop */ });
          return;
        }
        if (msg.kind === 'diagnosticsAnswer') {
          answerHeard(pair.id, msg.answer).then((st) => {
            const who = peerShown(pair, name);
            if (st === 'on') Foreground.note('', saidOfThem('diagAsk.turnedOn', who)).catch(() => { /* noop */ });
            if (st === 'no') Foreground.note('', saidOfThem('diagAsk.refused', who)).catch(() => { /* noop */ });
          }).catch(() => { /* noop */ });
          return;
        }
        if (msg.kind !== 'alarm') return;
        const who = peerShown(pair, name);
        const text = news.called(who, channel, Number(msg.at) || Date.now(),
          alarmLabel(String(msg.sound ?? '')));
        Journal.mark(`standby:alarm:${pair.id.slice(0, 8)}:${msg.sound}`).catch(() => { /* noop */ });
        Alarm.play(String(msg.sound ?? ''), false, 0,
          ALERT_GAIN[pair.settings?.alertLevel ?? 'full'] ?? 1).catch(() => { /* noop */ });
        Foreground.notifyFor('', text, pair.id, soundOf(pair)).catch(() => { /* noop */ });
        heard(pair.id, text);
      },
    },
  );
  standing.set(pair.id, sig);
  standingName.set(pair.id, myNameOn(cfg, pair));
  sig.connect();
}
