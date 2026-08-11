import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Configurazione dell'app.
 *
 * Due parti ben distinte:
 *  - `server`: dove sta il signaling. Uguale sui due telefoni, si digita
 *    una volta sola.
 *  - `pair`: nasce dall'accoppiamento a codice e non si digita mai. Una
 *    volta stabilito resta per sempre: il codice non serve più.
 */

export type PairInfo = {
  /** impronta del codice: l'unica cosa che il server vede */
  id: string;
  /** chiave a 256 bit dallo scambio Diffie-Hellman, in base64 */
  key: string;
  /** quale dei due lati siamo: serve solo a distinguere le conferme */
  side: 'A' | 'B';
  /** come si chiama l'altro, per mostrarlo nelle notifiche */
  peerName: string;
  /** quando è stato fatto l'accoppiamento (ISO) */
  pairedAt: string;
};

/**
 * Quanto spendere per il video.
 *
 * Non tocca MAI il formato di acquisizione della camera: cambiarlo fa
 * cambiare anche l'angolo di ripresa su molti sensori, e dall'altra parte
 * si vede l'inquadratura allargarsi e restringersi da sola. Si agisce
 * solo su cosa esce dall'encoder.
 */
export type VideoQuality = 'risparmio' | 'standard' | 'migliore';

export type DuoConfig = {
  /** wss://TUO_DOMINIO/duotalk/ws */
  serverUrl: string;
  /** token anti-abuso, uguale a ACCESS_TOKEN del server */
  accessToken: string;
  /** come mi vede l'altro */
  displayName: string;
  /** null finché non ci si è accoppiati */
  pair: PairInfo | null;
  turnUrl: string;
  turnUser: string;
  turnPass: string;
  /** le impostazioni di sistema sono già state proposte una volta */
  setupShown: boolean;
  /** quanto spendere per il video: banda e batteria */
  videoQuality: VideoQuality;
};

export const DEFAULT_CONFIG: DuoConfig = {
  serverUrl: '',
  accessToken: '',
  displayName: '',
  pair: null,
  turnUrl: '',
  turnUser: '',
  turnPass: '',
  setupShown: false,
  videoQuality: 'standard',
};

const STORAGE_KEY = 'duotalk.config.v3';

export async function loadConfig(): Promise<DuoConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(cfg: DuoConfig): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

/**
 * Dal nome del server all'indirizzo completo.
 *
 * All'utente chiediamo solo "cathopedia.org": il resto lo mettiamo noi,
 * accettando comunque un indirizzo completo se qualcuno lo scrive.
 *
 *   cathopedia.org                  -> wss://cathopedia.org/duotalk/ws
 *   https://cathopedia.org          -> wss://cathopedia.org/duotalk/ws
 *   wss://cathopedia.org/altro/ws   -> lasciato com'e'
 */
export function normalizeServerUrl(raw: string): string {
  let s = (raw || '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '');
  if (!/^wss?:\/\//i.test(s)) s = `wss://${s}`;
  const m = s.match(/^(wss?:\/\/[^/]+)(\/.*)?$/i);
  if (!m) return s;
  const path = m[2] && m[2] !== '/' ? m[2] : '/duotalk/ws';
  return m[1] + path;
}

/** Il minimo per potersi collegare al server e accoppiarsi. */
export function isServerConfigured(cfg: DuoConfig): boolean {
  const url = normalizeServerUrl(cfg.serverUrl);
  return /^wss?:\/\/[^/]+\/.+/.test(url);
}

/** Vero quando c'è già una coppia: si va dritti nel canale. */
export function isPaired(cfg: DuoConfig): boolean {
  return !!cfg.pair && !!cfg.pair.id && !!cfg.pair.key;
}

/**
 * I tre profili, in cifre.
 *
 * `scale` riduce ciò che l'encoder produce, non ciò che la camera
 * acquisisce: l'inquadratura resta identica.
 *
 * `degradation` dice cosa sacrificare quando la banda non basta.
 * "maintain-resolution" perde fotogrammi tenendo ferma l'immagine, ed è
 * quello che si vuole guardando una persona; "balanced" lascia invece
 * scendere anche la risoluzione, e in risparmio è il punto.
 */
export const VIDEO_PROFILES: Record<VideoQuality, {
  maxBitrate: number;
  maxFramerate: number;
  scale: number;
  degradation: string;
  etichetta: string;
  nota: string;
}> = {
  risparmio: {
    maxBitrate: 350_000,
    maxFramerate: 15,
    scale: 2,
    degradation: 'balanced',
    etichetta: 'Risparmio',
    nota: '~45 kB/s · metà definizione, 15 fotogrammi',
  },
  standard: {
    maxBitrate: 1_200_000,
    maxFramerate: 24,
    scale: 1,
    degradation: 'maintain-resolution',
    etichetta: 'Standard',
    nota: '~150 kB/s · definizione piena, 24 fotogrammi',
  },
  migliore: {
    maxBitrate: 2_500_000,
    maxFramerate: 30,
    scale: 1,
    degradation: 'maintain-resolution',
    etichetta: 'Migliore',
    nota: '~310 kB/s · definizione piena, 30 fotogrammi',
  },
};

type RTCIceServer = { urls: string; username?: string; credential?: string };

/** Lista di ICE server: STUN pubblico + TURN di riserva se configurato. */
export function iceServers(cfg: DuoConfig): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (cfg.turnUrl.trim() && cfg.turnPass.trim()) {
    servers.push({
      urls: cfg.turnUrl.trim(),
      username: cfg.turnUser.trim(),
      credential: cfg.turnPass.trim(),
    });
  }
  return servers;
}
