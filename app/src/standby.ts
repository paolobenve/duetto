/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import { Foreground, Journal, Alarm } from 'duetto-platform';
import { DuoConfig, PairInfo, peerShown, alertSoundFor } from './config';
import { Signaling } from './signaling';
import { news } from './presence';
import { alarmLabel } from './alarms';
import { logger } from './log';

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

/** The interface's ear: a call or a sound from a connection not in use. */
type CallHeard = (pairId: string, text: string) => void;
let onCall: CallHeard | null = null;
export function onStandbyCall(cb: CallHeard): () => void {
  onCall = cb;
  return () => { if (onCall === cb) onCall = null; };
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
  const available = await Foreground.isAvailable().catch(() => true);
  const want = cfg && available ? wanted(cfg) : new Map<string, PairInfo>();
  for (const [id, sig] of standing) {
    if (want.has(id)) continue;
    sig.close(false);
    standing.delete(id);
    Journal.mark(`standby:close:${id.slice(0, 8)}`).catch(() => { /* noop */ });
  }
  for (const [id, p] of want) {
    if (!standing.has(id)) open(cfg!, p);
  }
}

export function stopStandby() {
  for (const sig of standing.values()) sig.close(false);
  standing.clear();
}

/**
 * How this connection's calls sound and buzz: its own settings, the
 * ones chosen while it was in use. A connection born before settings
 * travelled with it has none, and the one in use's are heard.
 */
function soundOf(pair: PairInfo) {
  const s = pair.settings;
  if (!s) return {};
  return { vibration: s.alertVibration, sound: s.alertSound, uri: alertSoundFor(s) };
}

function open(cfg: DuoConfig, pair: PairInfo) {
  const channel = pair.label || '';
  let name = pair.peerName || '';
  Journal.mark(`standby:open:${pair.id.slice(0, 8)}`).catch(() => { /* noop */ });
  const sig: Signaling = new Signaling(
    {
      serverUrl: (pair.serverUrl || cfg.serverUrl).trim(),
      serverKey: pair.serverKey ?? cfg.serverKey,
      room: pair.id,
      displayName: pair.settings?.displayName || cfg.displayName || '',
      key: pair.key,
      side: pair.side,
      mode: 'listening',
    },
    {
      // Another connection of ours took the seat: the interface, now
      // that this pair is the one in use. It is its seat now.
      onReplaced: () => {
        if (standing.get(pair.id) === sig) standing.delete(pair.id);
        sig.close(false);
      },
      onJoined: ({ peerName }) => { if (peerName) name = peerName; },
      onPeerJoined: (peerName) => { if (peerName) name = peerName; },
      onNotify: (reason, peerName, at) => {
        if (peerName) name = peerName;
        const who = peerShown(pair, name);
        if (reason === 'knock') {
          const text = news.called(who, channel, at);
          log('call from a connection not in use:', text);
          Journal.mark(`standby:knock:${pair.id.slice(0, 8)}`).catch(() => { /* noop */ });
          Foreground.notifyFor('', text, pair.id, soundOf(pair)).catch(() => { /* noop */ });
          onCall?.(pair.id, text);
          return;
        }
        // Their coming into the channel: said quietly, on the line that
        // does not ring - it is news, not a call.
        Foreground.note('', news.inChannel(who, channel, at)).catch(() => { /* noop */ });
      },
      onSignal: (msg) => {
        if (msg.kind !== 'alarm') return;
        const who = peerShown(pair, name);
        const text = news.called(who, channel, Number(msg.at) || Date.now(),
          alarmLabel(String(msg.sound ?? '')));
        Journal.mark(`standby:alarm:${pair.id.slice(0, 8)}:${msg.sound}`).catch(() => { /* noop */ });
        Alarm.play(String(msg.sound ?? '')).catch(() => { /* noop */ });
        Foreground.notifyFor('', text, pair.id, soundOf(pair)).catch(() => { /* noop */ });
        onCall?.(pair.id, text);
      },
    },
  );
  standing.set(pair.id, sig);
  sig.connect();
}
