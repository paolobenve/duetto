import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import InCallManager from 'react-native-incall-manager';
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
export function useAudioRoute(
  enabled: boolean,
  preferred?: string,
  remember?: (route: AudioRoute) => void,
) {
  // Until the first event arrives, assume the bare minimum.
  const [available, setAvailable] = useState<AudioRoute[]>([
    'SPEAKER_PHONE',
    'EARPIECE',
  ]);
  const [current, setCurrent] = useState<AudioRoute>('SPEAKER_PHONE');

  /** The last output picked by hand, restored on coming back in. */
  const wanted = useRef<AudioRoute | null>(null);
  const initialised = useRef(false);

  /** Applies an output, with a fallback if the library will not choose. */
  const applyRoute = useCallback((route: AudioRoute) => {
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
  }, []);

  // The preference comes from the connection in use, and changes with it.
  useEffect(() => {
    if (!isRoute(preferred)) return;
    wanted.current = preferred;
    setCurrent(preferred);
    // Not applied outside the channel: an output is chosen when there is
    // a sound to send somewhere.
    if (enabled) applyRoute(preferred);
  }, [preferred, enabled, applyRoute]);

  useEffect(() => {
    if (!enabled) {
      initialised.current = false;
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

          if (isRoute(data?.selectedAudioDevice)) {
            setCurrent(data.selectedAudioDevice);
          }

          // On the first event we restore the last output chosen, if it
          // is still plugged in. Otherwise we stay on the system's own:
          // we force nothing of our own accord.
          if (!initialised.current && routes.length > 0) {
            initialised.current = true;
            const want = wanted.current;
            if (want && routes.includes(want) && want !== data?.selectedAudioDevice) {
              setCurrent(want);
              applyRoute(want);
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
    wanted.current = next;
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

  /** Picks one output in particular, and remembers it. */
  const select = useCallback((route: AudioRoute) => {
    if (route === current) return;
    setCurrent(route);
    wanted.current = route;
    applyRoute(route);
    remember?.(route);
  }, [current, applyRoute, remember]);

  return {
    route: current,
    reapply,
    /** only the ones really plugged in, in the order they are shown */
    available: ORDER.filter((r) => available.includes(r)),
    /** with a single output there is nothing to choose */
    canCycle: ORDER.filter((r) => available.includes(r)).length > 1,
    cycle,
    select,
  };
}
