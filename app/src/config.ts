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
 * La camera riprende SEMPRE a 1080p, qualunque profilo: i quattro si
 * ricavano scalando l'uscita. Così nessun cambio ha bisogno di riaprire
 * la camera - l'unico modo di cambiare formato, e quello che lasciava il
 * canale agganciato a una traccia che non produceva più - e scegliendo
 * "Massima" i 1080p ci sono subito, non al prossimo accendi-video.
 *
 * Il prezzo è riprendere a 1080p anche in Risparmio: qualche milliampere
 * in più sul sensore, per un comportamento che si spiega in una riga
 * invece che con un'eccezione.
 *
 * Restano fuori dal cambio a caldo i fotogrammi e `degradationPreference`:
 * toccarli su un encoder acceso è ciò che lo faceva smettere di produrre.
 */
export type VideoQuality = 'risparmio' | 'standard' | 'migliore' | 'massima';

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
  /**
   * `vp9` solo se entrambi i telefoni lo encodano in hardware; altrimenti
   * l'impostazione resta scritta ma non ha effetto, e nell'interfaccia
   * l'opzione non compare nemmeno.
   */
  videoCodec: 'auto' | 'vp9';
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
  videoCodec: 'auto',
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
 * I quattro profili, in cifre.
 *
 * `degradation` dice cosa sacrificare quando la banda non basta.
 * "maintain-resolution" perde fotogrammi tenendo ferma l'immagine, ed è
 * quello che si vuole guardando una persona; "balanced" lascia scendere
 * anche la risoluzione, e in risparmio è il punto.
 *
 * `scale` riduce ciò che esce dall'encoder, non ciò che il sensore
 * riprende: l'inquadratura resta identica in tutti e quattro.
 */
export const VIDEO_PROFILES: Record<VideoQuality, {
  /** di quanto ridurre l'uscita rispetto a ciò che la camera riprende */
  scale: number;
  maxBitrate: number;
  degradation: string;
  etichetta: string;
  nota: string;
}> = {
  risparmio: {
    scale: 3,
    maxBitrate: 300_000,
    degradation: 'balanced',
    etichetta: 'Risparmio',
    nota: '640×360 · tetto 300 kbit/s',
  },
  standard: {
    scale: 2,
    maxBitrate: 1_200_000,
    degradation: 'maintain-resolution',
    etichetta: 'Standard',
    nota: '960×540 · tetto 1,2 Mbit/s',
  },
  migliore: {
    scale: 1.5,
    maxBitrate: 2_500_000,
    degradation: 'maintain-resolution',
    etichetta: 'Migliore',
    nota: '1280×720 · tetto 2,5 Mbit/s',
  },
  massima: {
    scale: 1,
    maxBitrate: 4_000_000,
    // 'balanced' e non 'maintain-resolution': all'accensione la stima di
    // banda parte bassa, e obbligare l'encoder a produrre subito 1080p
    // significa un primo fotogramma chiave che spesso non passa - da cui
    // il video che all'altro non compare finché non lo si riaccende.
    // Scalare l'uscita non cambia l'inquadratura, solo la nitidezza,
    // finché la banda non sale.
    degradation: 'balanced',
    etichetta: 'Massima',
    nota: '1920×1080 · tetto 4 Mbit/s',
  },
};

/** La camera riprende sempre così: i profili scalano solo l'uscita. */
export const CAPTURE = { width: 1920, height: 1080, frameRate: 30 };

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
