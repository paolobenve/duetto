/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import { Journal, Call } from 'duetto-platform';
import { t } from './i18n';

/**
 * Audio outputs: speakerphone, the phone's own earpiece, wired
 * headphones, Bluetooth. There are no others on a phone.
 *
 * Which ones are AVAILABLE changes on its own: Bluetooth appears when
 * you pair headphones, the wired one when you plug them in. That is why
 * we listen for the event instead of guessing.
 *
 * The chosen output is remembered: coming back into the channel you get
 * the one you set last time, not one the app decided for you.
 */
export type AudioRoute = 'SPEAKER_PHONE' | 'EARPIECE' | 'WIRED_HEADSET' | 'BLUETOOTH';

/** The order the button cycles through. */
const ORDER: AudioRoute[] = ['SPEAKER_PHONE', 'EARPIECE', 'WIRED_HEADSET', 'BLUETOOTH'];

/** What each output is called on screen. */
export function routeLabel(route: AudioRoute): string {
  return t(`audio.${{
    SPEAKER_PHONE: 'speaker',
    EARPIECE: 'earpiece',
    WIRED_HEADSET: 'wired',
    BLUETOOTH: 'bluetooth',
  }[route]}`);
}

export const ROUTE_ICON: Record<AudioRoute, string> = {
  SPEAKER_PHONE: '\u{1F50A}', // loudspeaker
  EARPIECE: '\u{1F4DE}',      // handset
  WIRED_HEADSET: '\u{1F50C}', // plug
  BLUETOOTH: '\u{1F3A7}',     // headphones
};

const isRoute = (v: any): v is AudioRoute =>
  typeof v === 'string' && (ORDER as string[]).includes(v);

/**
 * Keeps track of the output in use and of the ones available.
 *
 * @param enabled   only while we are in the channel
 * @param preferred the output remembered for THIS connection
 * @param remember  called when the user picks one
 *
 * The output is not a setting of the app any more but of the
 * connection: with one person you talk on speaker while cooking, with
 * another one against your ear in the evening. So this hook no longer
 * remembers it by itself - it would not know whose it is - it receives
 * it and hands it back to whoever keeps the connections.
 */
/** What moves the sound by itself, and when. */
export type AutoOutput = {
  /** the phone at the ear, on speaker: the earpiece takes the sound */
  ear: boolean;
  /** ...even while the video is on */
  earWithVideo: boolean;
  /** video is flowing, one way or the other */
  videoOn: boolean;
  /** a Bluetooth earpiece that connects takes the sound */
  bluetooth: boolean;
  /** a wired headset that is plugged in takes the sound */
  wired: boolean;
  /** for the journal: which Bluetooth device was seen, and its choice */
  btSeen?: string;
};

export function useAudioRoute(
  enabled: boolean,
  preferred?: string,
  remember?: (route: AudioRoute) => void,
  auto?: AutoOutput,
) {
  /** read from inside the listeners, which are born once */
  const autoRef = useRef(auto);
  autoRef.current = auto;
  // Until the first event arrives, assume the bare minimum.
  const [available, setAvailable] = useState<AudioRoute[]>([
    'SPEAKER_PHONE',
    'EARPIECE',
  ]);
  const [current, setCurrent] = useState<AudioRoute>('SPEAKER_PHONE');
  const currentRef = useRef<AudioRoute>('SPEAKER_PHONE');
  useEffect(() => { currentRef.current = current; }, [current]);

  /** The last output picked by hand, restored on coming back in. */
  const wanted = useRef<AudioRoute | null>(null);
  const initialised = useRef(false);
  /**
   * The last built-in output - speaker or earpiece - the sound came out
   * of. When a Bluetooth earpiece or a wired headset goes away, the
   * call library falls back on ITS default (the earpiece, for audio);
   * the person expects the output they had before the headset.
   */
  const builtIn = useRef<AudioRoute>('SPEAKER_PHONE');
  /** the sound was coming out of a headset at the previous event */
  const headsetWas = useRef(false);
  /** the outputs there were at the previous event: what is new is what arrived */
  const known = useRef<AudioRoute[]>([]);
  const noteBuiltIn = (r: AudioRoute) => {
    if (r === 'SPEAKER_PHONE' || r === 'EARPIECE') builtIn.current = r;
  };

  /**
   * Applies an output: through the channel's call when there is one
   * (Calls.kt) - with a call of its own the output is Android's to move
   * as well, and what the app set by the other road was overwritten -
   * else through the call library, with a fallback if it will not
   * choose.
   */
  const applyRoute = useCallback((route: AudioRoute) => {
    Call.setRoute(route).then((through) => {
      if (!through) applyByLibrary(route);
    }).catch(() => applyByLibrary(route));
  }, []);

  const applyByLibrary = (route: AudioRoute) => {
    const icm = InCallManager as any;
    try {
      if (typeof icm.chooseAudioRoute === 'function') {
        const res = icm.chooseAudioRoute(route);
        if (res && typeof res.catch === 'function') res.catch(() => { /* noop */ });
      } else {
        // Bare fallback: at least speakerphone on and off.
        InCallManager.setForceSpeakerphoneOn(route === 'SPEAKER_PHONE');
      }
    } catch {
      /* noop */
    }
  };

  /**
   * Where Android puts the call's sound, when the channel is a call.
   *
   * It moves it by itself as a phone does: a Bluetooth earpiece that
   * connects takes the call. With "only when asked" that is refused and
   * the output of before put back; asked for, or with the automatic
   * choice on, it is kept. And the call, born on Android's default -
   * the earpiece - is put on the output wanted.
   */
  useEffect(() => {
    if (!enabled) return;
    return Call.subscribe((st) => {
      if (st === 'active' || st === 'resumed') {
        const w = wanted.current;
        if (w) setTimeout(() => applyRoute(w), 300);
        return;
      }
      if (!st.startsWith('route:')) return;
      const r = st.slice('route:'.length);
      if (!isRoute(r)) return;
      const a = autoRef.current;
      const headset = r === 'BLUETOOTH' || r === 'WIRED_HEADSET';
      if (headset && wanted.current !== r) {
        const allowed = r === 'BLUETOOTH' ? a?.bluetooth : a?.wired;
        if (!allowed) {
          const back = wanted.current && wanted.current !== r ? wanted.current : builtIn.current;
          Journal.mark(`route:${r === 'BLUETOOTH' ? `bt-declined:${a?.btSeen ?? '?'}` : 'wired-declined'}`)
            .catch(() => { /* noop */ });
          applyRoute(back);
          return;
        }
        wanted.current = r;
      }
      // A headset gone: Android falls back on the earpiece, its own
      // default; the person expects the built-in output of before - on
      // speaker, a Bluetooth earpiece put on and taken off left the call
      // at the ear.
      const was = currentRef.current;
      const wasHeadset = was === 'BLUETOOTH' || was === 'WIRED_HEADSET';
      if (wasHeadset && !headset && r !== builtIn.current && wanted.current !== r) {
        const back = builtIn.current;
        wanted.current = back;
        currentRef.current = back;
        setCurrent(back);
        applyRoute(back);
        Journal.mark(`output:back:${back}`).catch(() => { /* noop */ });
        return;
      }
      // Out of a headset onto the phone's own output: that is what is
      // wanted now. Left on the headset, the speaker the sound came back
      // to was never remembered, and the next restart looked for the
      // headset that had gone.
      if (wasHeadset && !headset) wanted.current = r;
      currentRef.current = r;
      setCurrent(r);
      noteBuiltIn(r);
    });
  }, [enabled, applyRoute]);

  // The preference comes from the connection in use, and changes with it.
  useEffect(() => {
    if (!isRoute(preferred)) return;
    wanted.current = preferred;
    noteBuiltIn(preferred);
    setCurrent(preferred);
    // Not applied outside the channel: an output is chosen when there is
    // a sound to send somewhere.
    if (enabled) applyRoute(preferred);
  }, [preferred, enabled, applyRoute]);

  /**
   * The phone at the ear.
   *
   * On speaker, the sensor covered means the phone has been brought to
   * the ear: the sound goes to the earpiece and the screen goes off,
   * as in a phone call; uncovered, both come back. The choice
   * remembered for the pair is not touched - this is a moment, not a
   * decision - and a choice made by hand in the meantime cancels the
   * way back. Not while a headset carries the sound, and not with the
   * video on unless asked, because then the phone is held to be looked
   * at. The sensor comes from the call library, which listens to it
   * from the start; it cannot tell an ear from a pocket, which is why
   * this is an option.
   */
  const earFrom = useRef<AudioRoute | null>(null);
  useEffect(() => {
    if (!enabled) { earFrom.current = null; return; }
    const sub = DeviceEventEmitter.addListener('Proximity', (data: any) => {
      const a = autoRef.current;
      if (data?.isNear) {
        if (!a?.ear || earFrom.current) return;
        if (a.videoOn && !a.earWithVideo) return;
        if (currentRef.current !== 'SPEAKER_PHONE') return;
        earFrom.current = 'SPEAKER_PHONE';
        currentRef.current = 'EARPIECE';
        setCurrent('EARPIECE');
        applyRoute('EARPIECE');
        try { InCallManager.turnScreenOff(); } catch { /* noop */ }
        Journal.mark('output:ear').catch(() => { /* noop */ });
      } else if (earFrom.current) {
        const back = earFrom.current;
        earFrom.current = null;
        currentRef.current = back;
        setCurrent(back);
        applyRoute(back);
        try { InCallManager.turnScreenOn(); } catch { /* noop */ }
        Journal.mark('output:ear:back').catch(() => { /* noop */ });
      }
    });
    return () => {
      sub.remove();
      if (earFrom.current) {
        earFrom.current = null;
        try { InCallManager.turnScreenOn(); } catch { /* noop */ }
      }
    };
  }, [enabled, applyRoute]);

  useEffect(() => {
    if (!enabled) {
      initialised.current = false;
      // Coming back in, a headset already there counts as arrived.
      known.current = [];
      return;
    }

    const sub = DeviceEventEmitter.addListener(
      'onAudioDeviceChanged',
      (data: any) => {
        try {
          const raw = data?.availableAudioDeviceList;
          const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
          let routes: AudioRoute[] = [];

          if (Array.isArray(list)) {
            routes = list.filter(isRoute) as AudioRoute[];
            if (routes.length > 0) setAvailable(routes);
          }

          const selected: AudioRoute | null = isRoute(data?.selectedAudioDevice)
            ? data.selectedAudioDevice : null;
          if (selected) setCurrent(selected);
          // A headset gone - the one wanted, or simply the one in use:
          // back to the built-in output of before, not to the library's.
          const headsetGone = initialised.current && routes.length > 0
            && selected !== null
            && !routes.includes('BLUETOOTH') && !routes.includes('WIRED_HEADSET')
            && (wanted.current === 'BLUETOOTH' || wanted.current === 'WIRED_HEADSET'
              || headsetWas.current)
            && selected !== builtIn.current && routes.includes(builtIn.current);
          headsetWas.current = selected === 'BLUETOOTH' || selected === 'WIRED_HEADSET';
          if (headsetGone) {
            const back = builtIn.current;
            wanted.current = back;
            setCurrent(back);
            applyRoute(back);
            Journal.mark(`output:back:${back}`).catch(() => { /* noop */ });
          } else if (selected) {
            noteBuiltIn(selected);
          }

          // On the first event we restore the last output chosen, if it
          // is still plugged in. Otherwise we stay on the system's own:
          // we force nothing of our own accord.
          if (!initialised.current && routes.length > 0) {
            initialised.current = true;
            let want = wanted.current;
            // A headset remembered and not here: the phone's own output
            // used last, not Android's default earpiece.
            if (want && !routes.includes(want) && routes.includes(builtIn.current)) {
              want = builtIn.current;
              wanted.current = want;
            }
            if (want && routes.includes(want) && want !== data?.selectedAudioDevice) {
              setCurrent(want);
              applyRoute(want);
            }
          }

          /*
           * A headset that has just appeared takes the sound, if asked
           * to - as the phone does with its own calls. The library would
           * do it by itself, but only while nobody has chosen an output,
           * and we always have: the pair's choice is put back on entry,
           * and from then on the library holds it sovereign. So what is
           * new in the list is looked at here. Arriving with the headset
           * already connected counts as arriving too. Going away, the
           * way back to the built-in output of before is above.
           */
          if (routes.length > 0) {
            const a = autoRef.current;
            const arrived = routes.filter((r) => !known.current.includes(r));
            known.current = routes;
            // With both, Bluetooth wins: a wire plugged in while a
            // Bluetooth earpiece carries the sound changes nothing.
            const take: AudioRoute | null =
              a?.bluetooth && arrived.includes('BLUETOOTH') ? 'BLUETOOTH'
                : a?.wired && arrived.includes('WIRED_HEADSET') && selected !== 'BLUETOOTH'
                  ? 'WIRED_HEADSET'
                  : null;
            if (take && selected !== take) {
              earFrom.current = null;
              wanted.current = take;
              currentRef.current = take;
              setCurrent(take);
              applyRoute(take);
              Journal.mark(`output:auto:${take}`).catch(() => { /* noop */ });
            }
          }
        } catch {
          // an event in an unexpected shape: better ignored than
          // allowed to break the audio
        }
      },
    );

    return () => sub.remove();
  }, [enabled, applyRoute]);

  /** Moves to the next available output, and remembers it. */
  const cycle = useCallback(() => {
    const options = ORDER.filter((r) => available.includes(r));
    if (options.length < 2) return;
    const i = options.indexOf(current);
    const next = options[(i + 1) % options.length];

    setCurrent(next); // hopeful: the event will confirm it
    earFrom.current = null;
    wanted.current = next;
    noteBuiltIn(next);
    applyRoute(next);
    remember?.(next);
  }, [available, current, applyRoute, remember]);

  /**
   * Puts the chosen output back, right now.
   *
   * Needed after somebody else has had a hand in the audio:
   * InCallManager's `start` takes the output back to the system default,
   * and that happens on every entry into the channel - including the
   * entry that follows a change of connection. Without this, the choice
   * was applied to an audio path that had just been switched off, and
   * then overwritten by whoever switched it back on: it was saved and
   * never heard.
   */
  const reapply = useCallback(() => {
    const want = wanted.current;
    // The next device list can still put it right.
    initialised.current = false;
    if (want) {
      setCurrent(want);
      applyRoute(want);
    }
  }, [applyRoute]);

  /**
   * The output really in use, remembered at every change - not only the
   * ones picked by hand. "As it was left" took the last one picked: a
   * Bluetooth earpiece chosen once and taken off later, and the next
   * entry looked for it, did not find it, and sat on the earpiece.
   * The ear's own passing turn, with the phone against the head, is not
   * remembered: it is not a choice.
   */
  useEffect(() => {
    // Only a settled output: the one wanted, reached. On entering,
    // Android passes through its earpiece for a moment, and remembered
    // it would have become the preference while the wanted one was
    // still on its way.
    if (!enabled || earFrom.current || current !== wanted.current) return;
    remember?.(current);
  }, [enabled, current, remember]);

  /**
   * Back in after the app was closed under us - an update, Android: the
   * output that was in use, whatever the entry's setting says. That
   * setting is for entries one makes.
   */
  const resume = useCallback((route: AudioRoute, present = true) => {
    // A headset remembered and not connected: the phone's own output.
    if (!present) route = builtIn.current;
    wanted.current = route;
    noteBuiltIn(route);
    setCurrent(route);
    applyRoute(route);
  }, [applyRoute]);

  /** Picks one output in particular, and remembers it. */
  const select = useCallback((route: AudioRoute) => {
    if (route === current) return;
    setCurrent(route);
    earFrom.current = null;
    wanted.current = route;
    applyRoute(route);
    remember?.(route);
  }, [current, applyRoute, remember]);

  return {
    route: current,
    reapply,
    resume,
    /** only the ones really plugged in, in the order they are shown */
    available: ORDER.filter((r) => available.includes(r)),
    /** with a single output there is nothing to choose */
    canCycle: ORDER.filter((r) => available.includes(r)).length > 1,
    cycle,
    select,
  };
}
