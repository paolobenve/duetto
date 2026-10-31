/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import { deviceKey, deviceModel, deviceName } from './device';
import { signAtDoor } from './doorSign';
import { VERSION_LABEL, BUILD } from './version';
import type { ServerRole } from './config';

/**
 * The door of a server, from the phone's side.
 *
 * Before anything is paired, the app has one question: what is this
 * server to me? The server answers it in a word - owner, member, guest,
 * stranger - and says whether the house has an owner and whether it
 * asks for a key. From that word alone the first screen knows what to
 * ask for, and what not to.
 *
 * Knocking is not only asking. A free server is taken by the first card
 * shown; an invitation carried here is spent here; the key, typed and
 * claimed, brings the owner home after a reinstall, or to a new phone,
 * in the old card's place. So the answer to "what am I to you" can be
 * "the owner, as of now".
 *
 * Each visit is one socket: hello, the card signed, the question, the
 * answer, and the socket is closed. The owner's business - an
 * invitation for somebody - goes through the same door, because a
 * server just taken has no room to join yet, and the card shown at the
 * door is authority enough.
 */
export type DoorAnswer = {
  role: ServerRole;
  /** somebody is on this server's list already */
  hasOwner: boolean;
  /** the operator set a key: it is asked to take the house, and it brings the owner home */
  needsKey: boolean;
  /** the name the server knows us by, when it knows us */
  name?: string;
  /** taken at this very knock */
  adopted?: boolean;
  /** the owner's cards whose place it took, when the house had one */
  replaced?: number;
  /** 'bad-key', 'bad-invite', 'bad-signature' */
  error?: string;
};

export type DoorRequest = {
  /** the key of the server, when somebody has just typed it */
  key?: string;
  /**
   * The house asked for, with the key: at a house that has an owner,
   * the key alone takes nothing - see answerDoor in the server - and
   * this phone takes the owner's place only when the person says so.
   */
  claim?: boolean;
  /** an invitation, spent at this knock if it is good */
  invite?: string;
  /** what we are called: the server writes it down when it adopts us */
  name?: string;
};

/** Nothing in fifteen seconds is a server that is not answering. */
const DOOR_TIMEOUT_MS = 15_000;

type Visit = {
  ws: WebSocket;
  answer: DoorAnswer;
  /** sends one more message and waits for one reply */
  ask: (obj: unknown) => Promise<any>;
  close: () => void;
  /** whatever the server says unasked, after the answer */
  onWord?: (msg: any) => void;
  /** the socket went, after the answer */
  onGone?: () => void;
};

/**
 * Opens the socket, shows the card, and hands back the door's answer
 * with the socket still open for whatever comes next.
 *
 * Throws 'unreachable' when the socket cannot be opened, 'timeout'
 * when nothing comes back in time. A server too old to know the
 * question answers "expected-join": that is a role of 'unknown', and
 * the app carries on as it did before the door existed.
 */
function visit(serverUrl: string, ask: DoorRequest): Promise<Visit> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(serverUrl);
    } catch {
      reject(new Error('unreachable'));
      return;
    }
    let settled = false;
    let waiting: ((msg: any) => void) | null = null;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      finish(() => { try { ws.close(); } catch { /* noop */ } reject(new Error('timeout')); });
    }, DOOR_TIMEOUT_MS);
    const send = (obj: unknown) => {
      try { ws.send(JSON.stringify(obj)); } catch { /* noop */ }
    };
    // One object, handed back as it is: whoever sets `onWord` on it
    // afterwards must be setting it on the one the socket reads. A
    // copy made at resolve time listened to nobody.
    const result: Visit = {
      ws,
      answer: { role: 'unknown', hasOwner: false, needsKey: false },
      ask: (obj) => new Promise((res) => {
        waiting = res;
        send(obj);
      }),
      close: () => { try { ws.close(); } catch { /* noop */ } },
    };

    ws.onerror = () => finish(() => reject(new Error('unreachable')));
    ws.onclose = () => {
      if (settled) { result.onGone?.(); return; }
      finish(() => reject(new Error('unreachable')));
    };
    ws.onmessage = async (ev: any) => {
      let msg: any;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      // A message is an object: see Signaling.handle.
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'hello' && !settled) {
        let card: { pub: string; sig: string; sigv?: 2; host?: string } | null = null;
        try {
          await deviceName();
          const key = await deviceKey();
          // The server's name inside, when it asks for it: see doorSign.ts.
          card = { pub: key.pub, ...signAtDoor(key.sec, String(msg.nonce || ''), serverUrl, msg.door) };
        } catch { /* unable to sign: the server will say so */ }
        send({
          type: 'door',
          pub: card?.pub,
          sig: card?.sig,
          sigv: card?.sigv,
          host: card?.host,
          key: ask.key || undefined,
          claim: ask.claim && ask.key ? true : undefined,
          invite: ask.invite || undefined,
          name: ask.name || undefined,
          model: deviceModel(),
          version: `${VERSION_LABEL} (${BUILD})`,
        });
        return;
      }
      if (!settled) {
        if (msg.type === 'door') {
          result.answer = {
            role: isRole(msg.role) ? msg.role : 'unknown',
            hasOwner: msg.hasOwner === true,
            needsKey: msg.needsKey === true,
            name: typeof msg.name === 'string' ? msg.name : undefined,
            adopted: msg.adopted === true,
            replaced: typeof msg.replaced === 'number' ? msg.replaced : undefined,
            error: typeof msg.error === 'string' ? msg.error : undefined,
          };
          finish(() => resolve(result));
        } else if (msg.type === 'error') {
          // An older server: it does not know the question. Not a
          // refusal - the app goes on as it always did.
          if (msg.error === 'expected-join') {
            finish(() => resolve(result));
          } else {
            finish(() => {
              result.close();
              reject(new Error(String(msg.error || 'refused')));
            });
          }
        }
        return;
      }
      if (waiting) {
        const fn = waiting;
        waiting = null;
        fn(msg);
      } else {
        result.onWord?.(msg);
      }
    };
  });
}

/**
 * A thread kept at the door, for a phone with no pair.
 *
 * Such a phone never joins a room, and so never hears what the server
 * has to say - that it was taken off the list, first of all: it went
 * on offering connections it could not open. Kept at the door, it
 * hears. The word comes as 'removed' from the server - 'new-owner'
 * when another phone has taken the house with its key - or as
 * 'stranger' from the door's own answer on reopening; the caller does
 * the rest. Returns what stops the watching.
 */
export function watchDoor(
  serverUrl: string,
  ask: DoorRequest,
  onWord: (word: 'removed' | 'new-owner' | 'stranger') => void,
): () => void {
  let stopped = false;
  let current: Visit | null = null;
  let again: ReturnType<typeof setTimeout> | null = null;
  const later = () => {
    if (stopped || again) return;
    again = setTimeout(() => { again = null; open(); }, 15_000);
  };
  const open = async () => {
    if (stopped) return;
    let v: Visit;
    try {
      v = await visit(serverUrl, ask);
    } catch {
      later();
      return;
    }
    if (stopped) { v.close(); return; }
    current = v;
    if (v.answer.role === 'stranger') { onWord('stranger'); return; }
    v.onWord = (msg) => {
      if (msg?.type === 'removed') onWord(msg.why === 'new-owner' ? 'new-owner' : 'removed');
    };
    v.onGone = () => { current = null; later(); };
  };
  open();
  return () => {
    stopped = true;
    if (again) clearTimeout(again);
    current?.close();
  };
}

/**
 * A line kept open at the door, for a conversation longer than one
 * question: the hand-over (see handover.ts). Every word after the
 * answer goes to whoever listens.
 */
export type DoorLine = {
  /** what the door said this phone is there */
  role: ServerRole;
  send: (obj: unknown) => void;
  /** hears every word after the answer; gives back what stops hearing */
  listen: (fn: (msg: any) => void) => () => void;
  /** the socket went */
  onGone: (fn: () => void) => void;
  close: () => void;
};

export async function openDoorLine(serverUrl: string, ask: DoorRequest): Promise<DoorLine> {
  const v = await visit(serverUrl, ask);
  const ears = new Set<(msg: any) => void>();
  const gone = new Set<() => void>();
  v.onWord = (msg) => { for (const fn of [...ears]) fn(msg); };
  v.onGone = () => { for (const fn of [...gone]) fn(); };
  return {
    role: v.answer.role,
    send: (obj) => { try { v.ws.send(JSON.stringify(obj)); } catch { /* noop */ } },
    listen: (fn) => { ears.add(fn); return () => { ears.delete(fn); }; },
    onGone: (fn) => { gone.add(fn); },
    close: () => v.close(),
  };
}

const isRole = (v: any): v is ServerRole =>
  v === 'owner' || v === 'member' || v === 'guest' || v === 'stranger' || v === 'unknown';

/**
 * An invitation as one types it: ABCD-2345.
 *
 * Read out or pasted, it comes in any case and with or without the
 * dash; the server does not mind, and neither should the field. The
 * dash is put in after four letters so that what one sees is what was
 * handed over.
 */
export function formatInvitation(raw: string, before = ''): string {
  const clean = (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (clean.length > 4) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  // The dash comes with the fourth letter, while typing forward; while
  // deleting it goes with the fifth, or the fourth could never go.
  if (clean.length === 4 && raw.length > before.length) return `${clean}-`;
  return clean;
}

/** What is this server to me? One knock, one word. */
export async function knock(serverUrl: string, ask: DoorRequest): Promise<DoorAnswer> {
  const v = await visit(serverUrl, ask);
  v.close();
  return v.answer;
}

/**
 * Leaving the server, as a member: one's own decision, like breaking a
 * pair. The owner cannot; the server says so.
 */
export async function leaveServer(serverUrl: string, ask: DoorRequest): Promise<void> {
  const v = await visit(serverUrl, ask);
  try {
    if (v.answer.role === 'owner') throw new Error('not-for-owner');
    if (v.answer.role !== 'member') throw new Error('not-a-member');
    const reply = await v.ask({ type: 'leave' });
    if (reply?.type !== 'left') throw new Error(String(reply?.error || 'refused'));
  } finally {
    v.close();
  }
}

/**
 * An invitation for somebody, made at the door.
 *
 * Only an owner's card is answered; anybody else gets 'not-yours'. The
 * name is for the owner's list and the log - the person invited never
 * sees it.
 */
export async function makeInvitation(
  serverUrl: string,
  ask: DoorRequest,
  person: string,
): Promise<{ name: string; code: string; days: number }> {
  const v = await visit(serverUrl, ask);
  try {
    if (v.answer.role !== 'owner') throw new Error('not-yours');
    const reply = await v.ask({ type: 'invite', name: person });
    if (reply?.type !== 'invited') throw new Error(String(reply?.error || 'refused'));
    return {
      name: String(reply.name || person),
      code: String(reply.code || ''),
      days: Number(reply.days) || 0,
    };
  } finally {
    v.close();
  }
}
