/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import { deviceKey, signNonce } from './device';
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
 * shown; an invitation carried here is spent here; the key brings the
 * owner home after a reinstall. So the answer to "what am I to you"
 * can be "the owner, as of now".
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
  /** 'bad-key', 'bad-invite', 'bad-signature' */
  error?: string;
};

export type DoorRequest = {
  /** the key of the server, when we have one to say */
  key?: string;
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
    const result: Omit<Visit, 'answer'> = {
      ws,
      ask: (obj) => new Promise((res) => {
        waiting = res;
        send(obj);
      }),
      close: () => { try { ws.close(); } catch { /* noop */ } },
    };

    ws.onerror = () => finish(() => reject(new Error('unreachable')));
    ws.onclose = () => finish(() => reject(new Error('unreachable')));
    ws.onmessage = async (ev: any) => {
      let msg: any;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg.type === 'hello' && !settled) {
        let card: { pub: string; sig: string } | null = null;
        try {
          const key = await deviceKey();
          card = { pub: key.pub, sig: signNonce(key, String(msg.nonce || '')) };
        } catch { /* unable to sign: the server will say so */ }
        send({
          type: 'door',
          pub: card?.pub,
          sig: card?.sig,
          key: ask.key || undefined,
          invite: ask.invite || undefined,
          name: ask.name || undefined,
        });
        return;
      }
      if (!settled) {
        if (msg.type === 'door') {
          finish(() => resolve({
            ...result,
            answer: {
              role: isRole(msg.role) ? msg.role : 'unknown',
              hasOwner: msg.hasOwner === true,
              needsKey: msg.needsKey === true,
              name: typeof msg.name === 'string' ? msg.name : undefined,
              adopted: msg.adopted === true,
              error: typeof msg.error === 'string' ? msg.error : undefined,
            },
          }));
        } else if (msg.type === 'error') {
          // An older server: it does not know the question. Not a
          // refusal - the app goes on as it always did.
          if (msg.error === 'expected-join') {
            finish(() => resolve({
              ...result,
              answer: { role: 'unknown', hasOwner: false, needsKey: false },
            }));
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
      }
    };
  });
}

const isRole = (v: any): v is ServerRole =>
  v === 'owner' || v === 'member' || v === 'guest' || v === 'stranger' || v === 'unknown';

/** What is this server to me? One knock, one word. */
export async function knock(serverUrl: string, ask: DoorRequest): Promise<DoorAnswer> {
  const v = await visit(serverUrl, ask);
  v.close();
  return v.answer;
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
