import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Configurazione condivisa tra i due telefoni.
 *
 * - serverUrl:  wss://TUO_DOMINIO/duotalk/ws  (il tuo reverse proxy)
 * - accessToken: token anti-abuso, uguale a quello del server (.env)
 * - room:       identificativo della "stanza". Deve coincidere sui due telefoni.
 * - secret:     passphrase segreta condivisa SOLO dai due telefoni.
 *               Da questa si deriva la chiave che cifra il signaling.
 *               NON viene mai inviata al server.
 * - turn*:      credenziali del TURN di fallback (coturn).
 */
export type DuoConfig = {
  serverUrl: string;
  accessToken: string;
  room: string;
  secret: string;
  turnUrl: string;
  turnUser: string;
  turnPass: string;
};

export const DEFAULT_CONFIG: DuoConfig = {
  serverUrl: 'wss://TUO_DOMINIO/duotalk/ws',
  accessToken: '',
  room: 'casa',
  secret: '',
  turnUrl: 'turn:TUO_DOMINIO:3478',
  turnUser: 'duotalk',
  turnPass: '',
};

const STORAGE_KEY = 'duotalk.config.v1';

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

export function isConfigComplete(cfg: DuoConfig): boolean {
  return (
    cfg.serverUrl.trim().length > 0 &&
    cfg.room.trim().length > 0 &&
    cfg.secret.trim().length >= 8
  );
}

/** Costruisce la lista di ICE server (STUN pubblico + eventuale TURN). */
export function iceServers(cfg: DuoConfig): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
  ];
  if (cfg.turnUrl.trim() && cfg.turnPass.trim()) {
    servers.push({
      urls: cfg.turnUrl.trim(),
      username: cfg.turnUser.trim(),
      credential: cfg.turnPass.trim(),
    });
  }
  return servers;
}

// Tipo minimo per RTCIceServer (react-native-webrtc lo accetta cosi').
type RTCIceServer = {
  urls: string;
  username?: string;
  credential?: string;
};
