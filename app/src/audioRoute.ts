import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import InCallManager from 'react-native-incall-manager';

/**
 * Uscita audio: vivavoce, altoparlantino del telefono, cuffie con filo,
 * Bluetooth.
 * Non ne esistono altre su un telefono.
 *
 * L'elenco di quelle DISPONIBILI cambia da solo: il Bluetooth compare
 * quando accoppi le cuffie, le cuffie con filo quando le infili. Per
 * questo stiamo in ascolto dell'evento invece di indovinare.
 *
 * L'uscita scelta viene ricordata: rientrando nel canale si torna a
 * quella impostata l'ultima volta, non a una decisa dall'app.
 */
export type AudioRoute = 'SPEAKER_PHONE' | 'EARPIECE' | 'WIRED_HEADSET' | 'BLUETOOTH';

/** Ordine con cui il pulsante cicla. */
const ORDER: AudioRoute[] = ['SPEAKER_PHONE', 'EARPIECE', 'WIRED_HEADSET', 'BLUETOOTH'];

const STORAGE_KEY = 'duotalk.audioRoute.v1';

export const ROUTE_LABEL: Record<AudioRoute, string> = {
  SPEAKER_PHONE: 'Vivavoce',
  // "Auricolare" farebbe pensare alle cuffiette: qui è l'altoparlantino
  // che si accosta all'orecchio.
  EARPIECE: 'Telefono',
  WIRED_HEADSET: 'Cuffie',
  BLUETOOTH: 'Bluetooth',
};

export const ROUTE_ICON: Record<AudioRoute, string> = {
  SPEAKER_PHONE: '\u{1F50A}', // altoparlante
  EARPIECE: '\u{1F4DE}',      // cornetta
  WIRED_HEADSET: '\u{1F50C}', // spina
  BLUETOOTH: '\u{1F3A7}',     // cuffie
};

const isRoute = (v: any): v is AudioRoute =>
  typeof v === 'string' && (ORDER as string[]).includes(v);

/**
 * Tiene traccia dell'uscita attiva e di quelle disponibili.
 * @param enabled attivo solo mentre si è nel canale
 */
export function useAudioRoute(enabled: boolean) {
  // Prima che arrivi il primo evento assumiamo il minimo garantito.
  const [available, setAvailable] = useState<AudioRoute[]>([
    'SPEAKER_PHONE',
    'EARPIECE',
  ]);
  const [current, setCurrent] = useState<AudioRoute>('SPEAKER_PHONE');

  /** Ultima uscita scelta a mano, ripresa al rientro nel canale. */
  const preferred = useRef<AudioRoute | null>(null);
  const initialised = useRef(false);

  /** Applica l'uscita, con ripiego se la libreria non espone la scelta. */
  const applyRoute = useCallback((route: AudioRoute) => {
    const icm = InCallManager as any;
    try {
      if (typeof icm.chooseAudioRoute === 'function') {
        const res = icm.chooseAudioRoute(route);
        if (res && typeof res.catch === 'function') res.catch(() => { /* noop */ });
      } else {
        // Ripiego minimo: almeno vivavoce acceso/spento.
        InCallManager.setForceSpeakerphoneOn(route === 'SPEAKER_PHONE');
      }
    } catch {
      /* noop */
    }
  }, []);

  // Preferenza salvata, letta una volta sola all'avvio.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (isRoute(v)) {
          preferred.current = v;
          setCurrent(v);
        }
      })
      .catch(() => { /* noop */ });
  }, []);

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

          // Al primo evento ripristiniamo l'ultima uscita scelta, se è
          // ancora collegata. Altrimenti restiamo su quella di sistema:
          // non forziamo nulla di nostra iniziativa.
          if (!initialised.current && routes.length > 0) {
            initialised.current = true;
            const want = preferred.current;
            if (want && routes.includes(want) && want !== data?.selectedAudioDevice) {
              setCurrent(want);
              applyRoute(want);
            }
          }
        } catch {
          // evento in un formato inatteso: meglio ignorarlo che rompere l'audio
        }
      },
    );

    return () => sub.remove();
  }, [enabled, applyRoute]);

  /** Passa all'uscita successiva fra quelle disponibili, e la ricorda. */
  const cycle = useCallback(() => {
    const options = ORDER.filter((r) => available.includes(r));
    if (options.length < 2) return;
    const i = options.indexOf(current);
    const next = options[(i + 1) % options.length];

    setCurrent(next); // ottimistico: l'evento confermera'
    preferred.current = next;
    applyRoute(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => { /* noop */ });
  }, [available, current, applyRoute]);

  /** Sceglie un'uscita precisa, e la ricorda. */
  const select = useCallback((route: AudioRoute) => {
    if (route === current) return;
    setCurrent(route);
    preferred.current = route;
    applyRoute(route);
    AsyncStorage.setItem(STORAGE_KEY, route).catch(() => { /* noop */ });
  }, [current, applyRoute]);

  /**
   * Riapplica l'uscita corrente senza cambiarla.
   *
   * Serve dopo aver ripreso il microfono: ridichiarando la conversazione
   * il sistema rimette l'uscita predefinita, e quella scelta va imposta
   * di nuovo. `select` non basta, perché ignora una scelta uguale a
   * quella già attiva.
   */
  const riapplica = useCallback(() => { applyRoute(current); }, [applyRoute, current]);

  return {
    route: current,
    riapplica,
    /** solo quelle davvero collegate, nell'ordine di presentazione */
    available: ORDER.filter((r) => available.includes(r)),
    /** con una sola uscita non c'è nulla da scegliere */
    canCycle: ORDER.filter((r) => available.includes(r)).length > 1,
    cycle,
    select,
  };
}
