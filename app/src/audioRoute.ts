import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
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

/**
 * La memoria di prima, quando l'uscita era una sola per tutta l'app.
 *
 * Non si scrive più: la legge App una volta, per non far ricominciare
 * da capo chi aveva già scelto. Vedi `impostazioni` dentro PairInfo.
 */
export const CHIAVE_USCITA_VECCHIA = 'duetto.audioRoute.v1';

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
 *
 * @param enabled   attivo solo mentre si è nel canale
 * @param preferita l'uscita ricordata per QUESTO collegamento
 * @param ricorda   chiamata quando l'utente ne sceglie una
 *
 * L'uscita non è più una preferenza dell'app ma del collegamento: con
 * una persona si parla in vivavoce mentre si cucina, con un'altra
 * all'orecchio la sera. Per questo non se la ricorda più da sé - non
 * saprebbe di chi è - ma la riceve e la restituisce a chi tiene i
 * collegamenti.
 */
export function useAudioRoute(
  enabled: boolean,
  preferita?: string,
  ricorda?: (route: AudioRoute) => void,
) {
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

  // La preferenza arriva dal collegamento in uso, e cambia con lui.
  useEffect(() => {
    if (!isRoute(preferita)) return;
    preferred.current = preferita;
    setCurrent(preferita);
    // Fuori dal canale non si applica: l'uscita si sceglie quando c'è
    // un suono da mandare da qualche parte.
    if (enabled) applyRoute(preferita);
  }, [preferita, enabled, applyRoute]);

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
    ricorda?.(next);
  }, [available, current, applyRoute, ricorda]);

  /**
   * Rimette l'uscita scelta, adesso.
   *
   * Serve dopo che qualcun altro ha rimesso mano all'audio: `start` di
   * InCallManager riporta l'uscita a quella predefinita di sistema, e
   * succede a ogni ingresso nel canale - anche quando l'ingresso è la
   * conseguenza di un cambio di collegamento. Senza questo, la scelta
   * veniva applicata a un audio appena spento e poi sovrascritta da chi
   * lo riaccendeva: si salvava e non si vedeva.
   */
  const riapplica = useCallback(() => {
    const want = preferred.current;
    // Il prossimo elenco di dispositivi può ancora rimetterla a posto.
    initialised.current = false;
    if (want) {
      setCurrent(want);
      applyRoute(want);
    }
  }, [applyRoute]);

  /** Sceglie un'uscita precisa, e la ricorda. */
  const select = useCallback((route: AudioRoute) => {
    if (route === current) return;
    setCurrent(route);
    preferred.current = route;
    applyRoute(route);
    ricorda?.(route);
  }, [current, applyRoute, ricorda]);

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
