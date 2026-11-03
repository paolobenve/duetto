/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Foreground } from 'duetto-platform';
import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';

/**
 * The card of this phone: a key it makes once and never gives away.
 *
 * A server can ask who is knocking. The plain answer would be a word
 * shared by everybody allowed in - but a word is repeated, sold, and
 * cannot be taken back from one person without changing it for all. So
 * the phone makes a pair of keys instead: the public half is written in
 * the server's list, the secret half never leaves this storage, and at
 * every connection the phone proves it holds it by signing a number the
 * server picks at that moment.
 *
 * What can be given away is the public half, and giving it away costs
 * nothing: with it one cannot sign. What cannot be given away is the
 * ability to get in - not by telling somebody something.
 *
 * It is not an identity: it says "the same phone as last time", nothing
 * more. Whose phone it is, is what an invitation says, and that is a
 * different story from this file.
 */
const KEY = 'duetto.device-key';

export type DeviceKey = { pub: string; sec: string };

/**
 * What deviceKey throws when there is no card to show: the storage did
 * not answer, or a new card could not be written down. Whoever knocks
 * waits, and asks again later.
 */
export const CARD_UNREADABLE = 'card-unreadable';

let mine: DeviceKey | null = null;
/** the read under way, for whoever asks in the meantime */
let reading: Promise<DeviceKey> | null = null;

/**
 * The keys of this phone, made the first time they are asked for.
 *
 * Kept in memory after the first read: it is asked for at every
 * connection, and reading storage each time would be a cost for
 * nothing.
 *
 * Made only when there is none. A read that fails is not "none": a
 * card made then went over the one the server knows, and the phone was
 * a stranger to it from that moment - its house given to nobody, the
 * people it had let in left with an owner who never came back. So:
 * - a storage that does not answer throws CARD_UNREADABLE, and the
 *   knock waits;
 * - something stored that is not a card is kept aside, under a name of
 *   its own, before a new one goes in its place;
 * - a new card that could not be written down is not used: the next
 *   start would not have it, and what it had been given - a house, an
 *   invitation spent - would be lost with it.
 *
 * Two asking at once - two connections at the first start - get the
 * same card, not one each.
 */
export function deviceKey(): Promise<DeviceKey> {
  if (mine) return Promise.resolve(mine);
  if (!reading) reading = readOrMake().finally(() => { reading = null; });
  return reading;
}

async function readOrMake(): Promise<DeviceKey> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(KEY);
  } catch {
    throw new Error(CARD_UNREADABLE);
  }
  if (raw !== null) {
    const stored = asCard(raw);
    if (stored) {
      mine = stored;
      return stored;
    }
    try {
      await AsyncStorage.setItem(`${KEY}.unreadable`, raw);
    } catch {
      throw new Error(CARD_UNREADABLE);
    }
  }

  const pair = nacl.sign.keyPair();
  const fresh: DeviceKey = {
    pub: encodeBase64(pair.publicKey),
    sec: encodeBase64(pair.secretKey),
  };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(fresh));
  } catch {
    throw new Error(CARD_UNREADABLE);
  }
  mine = fresh;
  return fresh;
}

/** The card stored, or null when what is stored is not one. */
function asCard(raw: string): DeviceKey | null {
  try {
    const c = JSON.parse(raw);
    return typeof c?.pub === 'string' && c.pub !== '' && typeof c?.sec === 'string' && c.sec !== ''
      ? { pub: c.pub, sec: c.sec }
      : null;
  } catch {
    return null;
  }
}


/**
 * The phone emptied of Duetto, as on the day it was installed: every
 * one of its keys in storage - the configuration with the pairs, the
 * card, the small memories - and the card in memory. It is what the old
 * phone does at the end of a hand-over (see handover.ts), once the new
 * one has it all. The journal stays, until Duetto is uninstalled.
 */
export async function emptyThisPhone(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]))
    .filter((k) => k.startsWith('duetto.'));
  if (keys.length > 0) await AsyncStorage.multiRemove([...keys]);
  mine = null;
}

/**
 * The card as a person reads it out.
 *
 * The whole key is forty-four characters, which nobody dictates: this
 * is the head and the tail of it, enough to tell one phone from another
 * by eye when looking at a list.
 */
/**
 * What this phone is, for a list that may hold two of one person's.
 *
 * The model as Android reports it - "POCO F5", "moto g82 5G". Sent to
 * the server beside the card, and shown back in "who may use this
 * server", where a name alone does not tell two phones apart.
 */
let knownName: string | null = null;

/**
 * Asks the phone what it is called, once. `deviceModel` below answers
 * from this when it has been asked, so whoever sends the name awaits
 * this first - the same await that fetches the card.
 */
export async function deviceName(): Promise<string> {
  if (knownName !== null) return knownName || deviceModel();
  try {
    knownName = String(await Foreground.deviceName() || '').trim();
  } catch {
    knownName = '';
  }
  return knownName || deviceModel();
}

export function deviceModel(): string {
  if (knownName) return knownName;
  try {
    const c: any = (Platform as any).constants || {};
    const model = String(c.Model || '').trim();
    const brand = String(c.Brand || '').trim();
    if (!model) return brand;
    return model.toLowerCase().startsWith(brand.toLowerCase()) || !brand
      ? model : `${brand} ${model}`;
  } catch {
    return '';
  }
}

export function shortKey(pub: string): string {
  return pub.length > 16 ? `${pub.slice(0, 8)}…${pub.slice(-6)}` : pub;
}
