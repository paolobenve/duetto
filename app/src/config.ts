import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Configurazione dei due telefoni.
 *
 * Alcuni valori sono UGUALI sui due (server, token, canale, passphrase),
 * altri sono INCROCIATI: il "mio topic" di uno e' il "topic dell'altro"
 * per l'altro telefono.
 */
export type DuoConfig = {
  /** wss://TUO_DOMINIO/duotalk/ws */
  serverUrl: string;
  /** token anti-abuso, uguale a ACCESS_TOKEN del server */
  accessToken: string;
  /** nome del canale: identico sui due telefoni */
  channel: string;
  /** passphrase segreta condivisa: cifra il signaling, mai inviata al server */
  secret: string;
  /** come mi vede l'altro nelle notifiche */
  displayName: string;
  /** topic ntfy su cui IO ricevo (da iscrivere nell'app ntfy di questo telefono) */
  myTopic: string;
  /** topic ntfy DELL'ALTRO: e' quello che faccio suonare io */
  peerTopic: string;
  turnUrl: string;
  turnUser: string;
  turnPass: string;
};

export const DEFAULT_CONFIG: DuoConfig = {
  serverUrl: 'wss://TUO_DOMINIO/duotalk/ws',
  accessToken: '',
  channel: 'casa',
  secret: '',
  displayName: '',
  myTopic: '',
  peerTopic: '',
  turnUrl: 'turn:TUO_DOMINIO:3478',
  turnUser: 'duotalk',
  turnPass: '',
};

const STORAGE_KEY = 'duotalk.config.v2';

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

/** Il minimo per poter entrare nel canale. I topic ntfy sono facoltativi. */
export function isConfigComplete(cfg: DuoConfig): boolean {
  return (
    cfg.serverUrl.trim().length > 0 &&
    cfg.channel.trim().length > 0 &&
    cfg.secret.trim().length >= 8
  );
}

type RTCIceServer = { urls: string; username?: string; credential?: string };

/** Lista di ICE server: STUN pubblico + TURN di fallback se configurato. */
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
