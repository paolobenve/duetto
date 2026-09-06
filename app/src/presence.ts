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
import { AppState } from 'react-native';
import { Foreground, Journal, Alarm } from 'duetto-platform';
import { loadConfig, isPaired, isServerConfigured, pairFileKey, pairName } from './config';
import { Signaling } from './signaling';
import { attachWatchdog, Watchdog } from './watchdog';
import { t } from './i18n';
import { logger, setLogging } from './log';
import { VERSION, BUILD } from './version';

/**
 * Presence with no interface.
 *
 * This is what runs after the phone reboots: a native service starts the
 * JavaScript engine without opening the app (see PresenceService.kt) and
 * runs the task at the bottom of this file, which brings the listening
 * connection back up. From that moment you are reachable again and you
 * get the notification when the other person enters the channel,
 * without having touched anything.
 *
 * It does not "open the app by itself": since Android 10 starting an
 * interface from the background is forbidden. The app opens when you
 * touch the notification.
 */

let signaling: Signaling | null = null;

/**
 * The same watchdog the interface uses, because for years this path ran
 * without one - and this is the path the app exists for. After a
 * reboot, with the screen off, JavaScript's own timers do not fire: a
 * socket that died silently stayed dead until the server's unhurried
 * heartbeat tripped over it, minutes later, while the phone believed
 * itself reachable. The native heartbeat and the network's
 * announcements are events, and events arrive even here.
 */
let watchdog: Watchdog | null = null;

/**
 * The interface has a connection of its own.
 *
 * This is here so that one phone never holds two: the server keeps one
 * seat per side, and the second connection would push the first out,
 * back and forth, forever. The app says so when it opens its own and
 * when it closes it.
 */
let uiInCharge = false;

/**
 * The interface went away without anybody asking it to.
 *
 * Not the same thing as leaving: there, somebody chose; here, a phone
 * tore the app down. We remember it so we can tell the other side, as
 * soon as the headless presence reopens the connection.
 */
let tornDown = false;

export function interfaceInCharge(alive: boolean, closedByThePhone = false) {
  uiInCharge = alive;
  if (!alive && closedByThePhone) tornDown = true;
}

/**
 * The placeholder name, in both languages.
 *
 * A phone that has never been given a name introduces itself with this,
 * and the other side must not read it as a person's name. The Italian
 * one is still around: it travelled to the other phone before this file
 * spoke English, and it is stored there.
 */
const NO_NAME = ['Someone', 'Qualcuno'];
export const isRealName = (name?: string | null): boolean =>
  !!name && !NO_NAME.includes(name);
const named = (name: string) => isRealName(name);

/**
 * How to say out loud what killed the app.
 *
 * It lives here because two callers need it: the app, and the headless
 * presence below. A phone that has just got back on its feet can find
 * the other one in either state, and the story has to be the same.
 */
export function deathStory(
  when: number, cause: string, name: string, back?: number,
): string {
  const who = named(name) ? name : t('death.theOther');
  const why = t(`death.${{
    'out-of-memory': 'outOfMemory',
    crash: 'crashed',
    'native-crash': 'crashed',
    frozen: 'frozen',
    'force-stopped': 'stoppedByHand',
    'closed-by-user': 'closed',
    'too-many-resources': 'resources',
    'permissions-changed': 'permissions',
    signal: 'phoneClosedIt',
    other: 'phoneClosedIt',
    // The causes as the older Duetto said them: they arrive from a phone
    // that has not been updated yet. This half of the table goes away
    // with the next version.
    'memoria-finita': 'outOfMemory',
    errore: 'crashed',
    'errore-nativo': 'crashed',
    bloccata: 'frozen',
    'arresto-forzato': 'stoppedByHand',
    'chiusa-dall-utente': 'closed',
    'troppe-risorse': 'resources',
    'permessi-cambiati': 'permissions',
    congelata: 'phoneClosedIt',
    segnale: 'phoneClosedIt',
    altro: 'phoneClosedIt',
  }[cause] ?? 'unknown'}`);

  const died = new Date(when);
  const time = died.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const whenSaid = died.toDateString() === new Date().toDateString()
    ? t('death.atTime', { time })
    : t('death.onDayAtTime', { date: died.toLocaleDateString(), time });

  /**
   * The time of the return, down to the second.
   *
   * It is sent by whoever came back, because they are the only ones who
   * know it: if we were disconnected at that moment, their message
   * reaches us when WE reconnect, and "now" would be the time of our own
   * return. It happened: "disappeared at 17:00, now (19:32) it is back",
   * where 19:32 was the moment the reader came back. An older Duetto
   * does not send it, and then we fall back on now, which is what we
   * used to do.
   */
  const backAt = new Date(back && back > 0 ? back : Date.now())
    .toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

  return t('death.story', { who, when: whenSaid, why, back: backAt });
}

/**
 * What the standing notification says, in one line.
 *
 * It lives here because two callers write it: the app, which knows
 * everything, and the headless presence below, which after a reboot is
 * the only thing that speaks to the user until they open the app. They
 * have to say the same words, and those are the words of the waiting
 * screen.
 *
 * The connection name is not written here: Android puts it in front of
 * the text, in italics, and it does so for every Duetto notification -
 * this line says how things are, the name says which room.
 *
 *  - "waiting": connected to the server, an alert would reach them;
 *  - "unreachable": their phone is not connected to the server, and an
 *    alert has nowhere to go.
 */
export function presenceLine(o: {
  /** we are in the channel */
  inChannel: boolean;
  /** the other person is in the channel */
  peerActive: boolean;
  /** the other person is at least connected to the server */
  peerPresent: boolean;
  /**
   * They left on purpose: they disconnected, the line did not drop.
   *
   * Worth telling apart: whoever reads "unreachable" expects them back
   * any moment, whoever reads "disconnected" knows it is up to them.
   */
  detached?: boolean;
  /**
   * They are waiting because their phone closed the app on them.
   *
   * "Waiting" suggests a choice of theirs, and on some phones it is
   * nothing of the sort: the app gets torn down on its own, at night
   * too.
   */
  tornDown?: boolean;
  name: string;
  /** how OUR own link to the server is doing */
  server?: 'ok' | 'down' | 'connecting';
}): string {
  const ours = o.inChannel ? t('presence.inChannel') : t('presence.waiting');
  const who = named(o.name) ? o.name : t('presence.theOther');
  if (o.server === 'down') return t('presence.noServer', { ours });
  if (o.server === 'connecting') return ours;
  if (o.peerActive) {
    return o.inChannel
      ? t('presence.withPeer', { who })
      : t('presence.peerInChannel', { ours, who });
  }
  if (!o.peerPresent) {
    return o.detached
      ? t('presence.peerDetached', { ours, who })
      : t('presence.peerUnreachable', { ours, who });
  }
  if (!o.inChannel) return t('presence.bothWaiting');
  return o.tornDown
    ? t('presence.peerWaitingTornDown', { ours, who })
    : t('presence.peerWaiting', { ours, who });
}

const log = logger('[duetto-presence]');

/** Starts listening, if a pair has been set up. */
export async function startListening(): Promise<boolean> {
  if (signaling) return true;
  if (uiInCharge) {
    log('the app already has its own connection: not opening another');
    return false;
  }

  const cfg = await loadConfig();
  // Here too, before the first line: the headless side has settings of
  // its own to read, and without this it would talk to a log nobody
  // asked for.
  setLogging(cfg.diagnostics);
  if (!isPaired(cfg) || !isServerConfigured(cfg)) {
    log('no pair set up: there is nothing to listen for');
    // Said to the watchdog alarm too, or it would spend the night
    // starting a service that has nothing to listen for.
    Foreground.watchdogWanted(false).catch(() => { /* noop */ });
    return false;
  }
  Foreground.watchdogWanted(true).catch(() => { /* noop */ });

  const pair = cfg.pair!;
  log('listening');

  /**
   * Which connection the alerts arrive on.
   *
   * With more than one connection set up, "they are waiting for you in
   * the channel" does not say enough: only one of the two or three you
   * know is waiting. With a single connection there is nothing to tell
   * apart.
   *
   * It goes for every notification, the standing one included: the name
   * goes in front of the text, in italics, and Android puts it there.
   */
  const connectionName = cfg.pairs.length > 1 ? pairName(pair) || '' : '';
  /**
   * "You were in the channel: touch to go back in."
   *
   * The presence comes up by itself after a reboot, or after the phone
   * tore the app down - but the channel needs the app open, and from
   * Android 14 the microphone is refused to anything started in the
   * background: nobody can put you back in but your own finger. So
   * the drawer the app writes at every touch is read here: if it says
   * "in the channel" - written by an app that was killed, not by one
   * that left - a notification says so, and one touch opens the app
   * straight into the channel.
   */
  try {
    const raw = await AsyncStorage.getItem('duetto.how-it-was');
    const was = raw ? (JSON.parse(raw)?.[pair.id] ?? null) : null;
    if (was && was.live === true) {
      const who = pair.peerName || t('presence.theOther');
      Foreground.note(connectionName, t('presence.wereInChannel', { who })).catch(() => { /* noop */ });
      Journal.mark('note:were-in-channel').catch(() => { /* noop */ });
    }
  } catch { /* an unreadable drawer says nothing */ }

  /**
   * How the other side is doing, for the notification alone.
   *
   * Nothing is asked for the line's own sake: after a reboot nobody is
   * looking at a screen, and waking the radio to refresh a line nobody
   * reads would be the opposite of what this part of the app is for.
   * We listen to what the server sends of its own accord - and to the
   * answers the watchdog gets to its liveness questions, which cost
   * nothing extra and catch up on any announcement that got lost.
   */
  let present = false;
  let active = false;
  let detached = false;
  let name = pair.peerName || '';

  const refresh = () => {
    Foreground.setText(presenceLine({
      inChannel: false, peerActive: active, peerPresent: present, name, detached,
    }), connectionName, detached ? '' : 'enter',
    { enter: t('presence.enter'), wait: t('presence.wait') }).catch(() => { /* noop */ });
    // A stale alert is worse than no alert: "waiting for you in the
    // channel" is only true while they are actually in there.
    if (!active) Foreground.clearNotification().catch(() => { /* noop */ });
  };

  /** Which Duetto is on this phone: see the same in App.tsx. */
  const sayHello = () => {
    signaling?.sendSignal({ kind: 'hello', version: VERSION, build: BUILD });
  };

  signaling = new Signaling(
    {
      serverUrl: cfg.serverUrl.trim(),
      serverKey: cfg.serverKey,
      invitation: cfg.invitation,
      room: pair.id,
      displayName: cfg.displayName || NO_NAME[0],
      key: pair.key,
      side: pair.side,
      mode: 'listening',
    },
    {
      onJoined: ({ peerPresent, peerActive, peerName }) => {
        // "I did not leave": said once, as soon as we are connected, and
        // only if there is somebody there to hear it.
        if (tornDown && peerPresent) {
          tornDown = false;
          signaling?.sendSignal({ kind: 'tornDown' });
        }
        present = peerPresent;
        if (peerPresent) detached = false;
        active = peerActive;
        if (peerName) name = peerName;
        // Which Duetto is on this phone, said from here too: the app
        // over there shows it while merely waiting, and a phone that is
        // listening with no interface would otherwise look like one
        // that has nothing to say.
        if (peerPresent) sayHello();
        refresh();
      },
      onPeerJoined: (peerName, mode) => {
        present = true;
        detached = false;
        active = mode === 'active';
        if (peerName) name = peerName;
        sayHello();
        refresh();
      },
      onPeerLeft: (why) => {
        present = false;
        active = false;
        detached = why === 'bye';
        refresh();
      },
      onPeerMode: (mode, peerName) => {
        present = true;
        active = mode === 'active';
        if (peerName) name = peerName;
        refresh();
      },
      /**
       * Even with no interface, what the other side sends is kept.
       *
       * Without this, a journal sent to a phone that is listening with
       * no app open - after a reboot, or after the system killed us -
       * reached a JavaScript that was not looking at it, while the
       * sender had already marked those lines as sent: lost for good.
       * And they are exactly the lines that tell why that phone died.
       */
      onSignal: (msg) => {
        if (msg.kind === 'journal') {
          Journal.appendOther(String(msg.text ?? ''), pairFileKey(pair))
            .catch(() => { /* noop */ });
          return;
        }
        if (msg.kind === 'death') {
          Foreground.note(
            connectionName,
            deathStory(
              Number(msg.when), String(msg.cause), name, Number(msg.back) || 0,
            ),
          ).catch(() => { /* noop */ });
          return;
        }
        /**
         * A sound to call somebody back, arriving at a phone with no
         * interface open.
         *
         * It is the case the sounds are for: the other person is not
         * answering, and their phone is across the room. Here there is
         * nobody watching a screen, so along with the sound goes the
         * notification that says who wants them - a rooster on its own,
         * from a phone lying on a table, explains nothing.
         */
        if (msg.kind === 'alarm') {
          Alarm.play(String(msg.sound ?? '')).catch(() => { /* noop */ });
          Journal.mark(`alarm:${msg.sound}`).catch(() => { /* noop */ });
          Foreground.notify(
            connectionName,
            named(name) ? t('alert.callingYouFrom', { who: name }) : t('alert.callingYou'),
          ).catch(() => { /* noop */ });
        }
      },

      /**
       * The watchdog's questions come back here. The answer settles the
       * doubt about the socket - and since it also says how the other
       * side is doing, the notification line catches up with any
       * announcement that got lost along the way.
       */
      onPresence: ({ peerPresent, peerActive, peerName }) => {
        watchdog?.noteAnswer();
        present = peerPresent;
        if (peerPresent) detached = false;
        active = peerActive;
        if (peerName) name = peerName;
        refresh();
      },

      onNotify: (reason, peerName) => {
        const who = peerName;
        const text = reason === 'knock'
          ? (named(who) ? t('alert.knockFrom', { who }) : t('alert.knock'))
          : (named(who) ? t('alert.joinedNamed', { who }) : t('alert.joined'));
        log('alert:', text);
        Foreground.notify(connectionName, text).catch(() => { /* noop */ });
      },
    },
  );
  signaling.connect();
  // Nobody else is watching over this connection: the pace-setting is
  // the watchdog's too (driveFast), one beat a minute when all is well
  // and one every fifteen seconds while the server is out of reach.
  // With no wake lock the beats only come while the CPU is awake anyway
  // - a network change, a packet from the server, the alarm's net - so
  // waiting costs next to nothing.
  watchdog = attachWatchdog(() => signaling, { driveFast: true });
  return true;
}

/** Steps aside: the interface will take the connection over. */
export function stopListening() {
  if (!signaling) return;
  log('connection handed over to the app');
  watchdog?.stop();
  watchdog = null;
  // No goodbye: we are not leaving, we are handing over to the app that
  // has just opened. Saying goodbye here made the other side write
  // "they disconnected" every time this phone was picked up.
  signaling.close(false);
  signaling = null;
}

export function isListening(): boolean {
  return signaling !== null;
}

/**
 * The task the headless service runs.
 *
 * It never finishes, on purpose: as long as it lives, the connection
 * lives. If the app opens, `stopListening` closes the connection and the
 * task sits idle until the app hands it back.
 */
export async function presenceTask(): Promise<void> {
  // The service is often born in the middle of the interface's
  // teardown, when the state still reads as "open": a moment's
  // patience, then the flags speak for themselves - startListening
  // steps aside on its own if the interface really holds the
  // connection.
  if (AppState.currentState === 'active') {
    log('app looks open: waiting a moment before deciding');
    await new Promise<void>((r) => setTimeout(r, 4000));
  }
  if (await startListening()) {
    return new Promise<void>(() => { /* never resolved: it has to stay alive */ });
  }
  // Nothing to hold: the app is in charge, or no pair is set up. This
  // used to park for ever anyway, leaving a foreground service whose
  // notification promised a presence that did not exist. Ending the
  // task lets the service stop and take the notification with it; if
  // the interface later dies without a handover, the watchdog alarm
  // brings presence back.
  log('nothing to hold: stepping down');
}
