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
  /**
   * Il nome che gli do io.
   *
   * `peerName` lo dichiara l'altro, ed è facoltativo: chi non lo scrive
   * resta "Qualcuno" per sempre, e con più collegamenti in elenco
   * diventano tutti "Senza nome", indistinguibili. Questo invece lo
   * scrivo io da questa parte, non viaggia da nessuna parte e vince su
   * quello dichiarato: è il nome con cui penso a quella persona.
   */
  etichetta?: string;
  /** quando è stato fatto l'accoppiamento (ISO) */
  pairedAt: string;
  /**
   * Il server su cui questo accoppiamento è nato.
   *
   * Una coppia vive dentro un server: la stanza sta lì, e cercarla
   * altrove è cercarla dove non c'è. Finché il server è uno solo non
   * cambia nulla; con più collegamenti su server diversi, passare
   * dall'uno all'altro porta con sé anche il suo indirizzo, che
   * altrimenti resterebbe quello di prima e il collegamento non
   * ripartirebbe mai, senza che si capisca perché.
   *
   * Assente nelle configurazioni scritte prima: allora vale quello
   * dell'app, che era l'unico che ci fosse.
   */
  serverUrl?: string;
};

/**
 * Quanto spendere per il video.
 *
 * Ogni profilo ha la sua risoluzione di RIPRESA, e cambiarlo riapre la
 * camera.
 *
 * La via indolore sarebbe scalare l'uscita dell'encoder
 * (`scaleResolutionDownBy`), e su alcuni telefoni funziona. Su altri no:
 * il MediaTek del POCO registra la scala richiesta - la rilettura dei
 * parametri lo conferma - e poi produce comunque a piena risoluzione. È
 * l'encoder, e dal lato del codice non c'è modo di convincerlo.
 *
 * La risoluzione di ripresa invece nessun encoder può ignorarla. Il
 * prezzo è un attimo di nero al cambio, mentre la camera si riapre.
 *
 * Restano fuori dal cambio a caldo i fotogrammi e `degradationPreference`:
 * toccarli su un encoder acceso è ciò che lo faceva smettere di produrre.
 */
export type VideoQuality = 'risparmio' | 'standard' | 'migliore' | 'massima';

export type DuoConfig = {
  /** wss://TUO_DOMINIO/duetto/ws */
  serverUrl: string;
  /** come mi vede l'altro */
  displayName: string;
  /** il collegamento in uso; null finché non ci si è accoppiati */
  pair: PairInfo | null;
  /**
   * Tutti i collegamenti che questo telefono conosce, quello in uso per
   * primo.
   *
   * Un accoppiamento costa: bisogna essere in due, con i telefoni in
   * mano, e dettarsi un codice a voce. Buttarlo via per parlare con
   * qualcun altro, e rifarlo da capo per tornare indietro, è un prezzo
   * che non c'è motivo di pagare: le chiavi occupano trenta byte e
   * restano valide finché l'altro non scioglie dalla sua parte.
   *
   * Normalmente si riprende il primo della lista, che è l'ultimo usato.
   */
  pairs: PairInfo[];
  /** le impostazioni di sistema sono già state proposte una volta */
  setupShown: boolean;
  /** quanto spendere per il video: banda e batteria */
  videoQuality: VideoQuality;
  /**
   * Le due righe di diagnostica sotto ai pulsanti.
   *
   * Spente: servono a capire perché una chiamata va male, non a
   * guardarsi in faccia. Chi ne ha bisogno sa dove trovarle.
   */
  /**
   * Alza il tetto dell'audio da ~32 a 64 kbit/s.
   *
   * Su Opus la differenza si sente: la voce smette di suonare
   * "telefonica". Costa 4 kB/s in più per direzione, niente rispetto al
   * video. Spento di default perché il predefinito basta per parlare.
   */
  audioMigliore: boolean;
  mostraDiagnostica: boolean;
  /**
   * I comandi spariscono del tutto invece di attenuarsi.
   *
   * Restano premibili anche invisibili, e un tocco ovunque li richiama:
   * chi guarda un video a lungo preferisce l'immagine pulita.
   */
  nascondiComandi: boolean;
  /**
   * `vp9` solo se entrambi i telefoni lo encodano in hardware; altrimenti
   * l'impostazione resta scritta ma non ha effetto, e nell'interfaccia
   * l'opzione non compare nemmeno.
   */
  videoCodec: 'auto' | 'vp9';

  /**
   * Come deve farsi sentire l'avviso dell'altro.
   *
   * "Predefinito" lascia decidere ad Android, che sa già cosa fai in
   * questo momento - modalità silenziosa, non disturbare, auricolari.
   * Le altre due scelte lo forzano: chi tiene il telefono in tasca vuole
   * la vibrazione anche in silenzioso, chi lo tiene sul tavolo di notte
   * non vuole niente.
   */
  avvisoVibra: 'predefinito' | 'sempre' | 'mai';
  avvisoSuono: 'predefinito' | 'nessuno' | 'scelto';
  /** Suono scelto fra quelli del telefono: indirizzo di sistema. */
  avvisoSuonoUri: string;
  /** Il suo nome, per poterlo mostrare senza doverlo richiedere. */
  avvisoSuonoNome: string;
};

export const DEFAULT_CONFIG: DuoConfig = {
  serverUrl: '',
  displayName: '',
  pair: null,
  pairs: [],
  setupShown: false,
  // Si parte dal profilo alto: è un tetto, non una pretesa, e con
  // "balanced" una rete scarsa lo fa scendere da sé. Partire basso
  // avrebbe lasciato in definizione ridotta chi non apre mai le
  // impostazioni, anche avendo una rete ottima.
  videoQuality: 'migliore',
  audioMigliore: false,
  mostraDiagnostica: false,
  nascondiComandi: false,
  videoCodec: 'auto',
  avvisoVibra: 'predefinito',
  avvisoSuono: 'predefinito',
  avvisoSuonoUri: '',
  avvisoSuonoNome: '',
};

const STORAGE_KEY = 'duetto.config.v3';

export async function loadConfig(): Promise<DuoConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return normalizzaCoppie({ ...DEFAULT_CONFIG, ...JSON.parse(raw) });
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * L'elenco dei collegamenti, anche per chi arriva da prima che ce ne
 * fosse uno.
 *
 * Chi aveva già una coppia se la ritrova come primo - e unico - elemento
 * dell'archivio, senza doversi riaccoppiare: la coppia è la stessa, è
 * solo scritta in un posto in più.
 */
function normalizzaCoppie(cfg: DuoConfig): DuoConfig {
  const lista = Array.isArray(cfg.pairs) ? cfg.pairs.filter((p) => p && p.id && p.key) : [];
  const attiva = cfg.pair && cfg.pair.id && cfg.pair.key ? cfg.pair : null;
  if (!attiva) return { ...cfg, pairs: lista };
  // In testa ci sta sempre quella in uso, e una sola volta: è da lì che
  // l'interfaccia legge "l'ultimo usato".
  const altre = lista.filter((p) => p.id !== attiva.id);
  return { ...cfg, pair: attiva, pairs: [attiva, ...altre] };
}

/**
 * Aggiunge un accoppiamento appena fatto e lo mette in uso.
 *
 * Se rifà un collegamento con la stessa stanza - può succedere solo
 * ripetendo lo stesso codice - sostituisce il vecchio invece di
 * affiancarlo.
 */
export function registraCoppia(cfg: DuoConfig, pair: PairInfo): DuoConfig {
  const nuova: PairInfo = { serverUrl: cfg.serverUrl, ...pair };
  return {
    ...cfg,
    pair: nuova,
    pairs: [nuova, ...cfg.pairs.filter((p) => p.id !== nuova.id)],
  };
}

/**
 * Passa a un collegamento già configurato.
 *
 * Porta con sé il server su cui quella coppia era nata: è lì che sta la
 * sua stanza.
 */
export function passaACoppia(cfg: DuoConfig, id: string): DuoConfig {
  const scelta = cfg.pairs.find((p) => p.id === id);
  if (!scelta || scelta.id === cfg.pair?.id) return cfg;
  return {
    ...cfg,
    serverUrl: scelta.serverUrl || cfg.serverUrl,
    pair: scelta,
    pairs: [scelta, ...cfg.pairs.filter((p) => p.id !== id)],
  };
}

/**
 * Dimentica un collegamento.
 *
 * Sciogliendo quello in uso si passa al più recente fra quelli rimasti:
 * chiedere un accoppiamento nuovo a chi ne ha altri pronti sarebbe
 * chiedere di rifare una cosa già fatta.
 */
export function dimenticaCoppia(cfg: DuoConfig, id: string): DuoConfig {
  const restano = cfg.pairs.filter((p) => p.id !== id);
  if (cfg.pair?.id !== id) return { ...cfg, pairs: restano };
  const prossima = restano[0] ?? null;
  return {
    ...cfg,
    serverUrl: prossima?.serverUrl || cfg.serverUrl,
    pair: prossima,
    pairs: restano,
  };
}

/**
 * Segna come si chiama davvero l'altro.
 *
 * Al momento dell'accoppiamento il nome può mancare o essere quello
 * generico: quello vero arriva a ogni ingresso nel canale. Con più
 * collegamenti in elenco, il nome è l'unica cosa che li distingue -
 * l'impronta della stanza non dice niente a nessuno - quindi vale la
 * pena tenerlo aggiornato.
 *
 * Torna `null` se non c'è niente da cambiare: così chi chiama non
 * riscrive la configurazione per nulla.
 */
export function ricordaNomeCoppia(cfg: DuoConfig, id: string, nome: string): DuoConfig | null {
  if (!nome || nome === 'Qualcuno') return null;
  const bersaglio = cfg.pairs.find((p) => p.id === id);
  if (!bersaglio || bersaglio.peerName === nome) return null;
  const pairs = cfg.pairs.map((p) => (p.id === id ? { ...p, peerName: nome } : p));
  return {
    ...cfg,
    pair: cfg.pair?.id === id ? { ...cfg.pair, peerName: nome } : cfg.pair,
    pairs,
  };
}

/**
 * Come si chiama questo collegamento, in una parola sola.
 *
 * Prima il nome che gli ho dato io, poi quello che dichiara lui, e se
 * non c'è né l'uno né l'altro niente: chi chiama decide cosa mettere al
 * posto del niente, perché "Senza nome" in un elenco e la scritta al
 * centro di una schermata d'attesa non sono la stessa cosa.
 */
export function nomeCoppia(p: PairInfo | null | undefined): string {
  if (!p) return '';
  if (p.etichetta) return p.etichetta;
  return p.peerName && p.peerName !== 'Qualcuno' ? p.peerName : '';
}

/** Cambia il nome che do a un collegamento. Vuoto = torna al suo. */
export function rinominaCoppia(cfg: DuoConfig, id: string, etichetta: string): DuoConfig {
  const pulita = etichetta.trim().slice(0, 32);
  const tocca = (p: PairInfo) => (p.id === id ? { ...p, etichetta: pulita || undefined } : p);
  return {
    ...cfg,
    pair: cfg.pair ? tocca(cfg.pair) : cfg.pair,
    pairs: cfg.pairs.map(tocca),
  };
}

/**
 * Il server appena scritto vale anche per la coppia in uso.
 *
 * Senza questo, cambiare server nelle impostazioni lo cambierebbe solo
 * per l'app: al primo passaggio a un altro collegamento e ritorno, la
 * coppia si riporterebbe dietro il vecchio indirizzo.
 */
export function allineaServerCoppia(cfg: DuoConfig): DuoConfig {
  if (!cfg.pair || cfg.pair.serverUrl === cfg.serverUrl) return cfg;
  const pair = { ...cfg.pair, serverUrl: cfg.serverUrl };
  return {
    ...cfg,
    pair,
    pairs: cfg.pairs.map((p) => (p.id === pair.id ? pair : p)),
  };
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
 *   cathopedia.org                  -> wss://cathopedia.org/duetto/ws
 *   https://cathopedia.org          -> wss://cathopedia.org/duetto/ws
 *   wss://cathopedia.org/altro/ws   -> lasciato com'e'
 */
export function normalizeServerUrl(raw: string): string {
  let s = (raw || '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '');
  if (!/^wss?:\/\//i.test(s)) s = `wss://${s}`;
  const m = s.match(/^(wss?:\/\/[^/]+)(\/.*)?$/i);
  if (!m) return s;
  const path = m[2] && m[2] !== '/' ? m[2] : '/duetto/ws';
  return m[1] + path;
}

/**
 * Come rimostrarlo nelle impostazioni.
 *
 * All'utente si chiede il dominio, ma si salva l'indirizzo completo:
 * riaprendo le impostazioni si ritrovava "wss://tuoserver.org/duetto/ws"
 * in un campo che chiede "tuoserver.org". Se l'indirizzo è quello
 * standard si mostra il solo dominio; se qualcuno ha scritto un percorso
 * suo, resta intero, perché lì il dominio da solo non basterebbe.
 */
export function displayServer(url: string): string {
  const m = (url || '').match(/^wss?:\/\/([^/]+)\/duetto\/ws$/i);
  return m ? m[1] : (url || '');
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
 * `degradation` è "balanced" su tutti: quando la banda non basta,
 * l'encoder può scendere di risoluzione invece di limitarsi a buttare
 * fotogrammi. Con "maintain-resolution" un profilo alto su una rete
 * cattiva non dava un'immagine un po' peggiore, dava una diapositiva
 * nitida - misurato: 1920x1072 a UN fotogramma al secondo.
 *
 * Così il profilo è davvero un tetto: si prende il meglio che la rete
 * concede, e si scende con grazia quando non concede.
 *
 * Le proporzioni restano 16:9 in tutti e quattro, così l'inquadratura non
 * cambia passando dall'uno all'altro: cambia la definizione, non cosa
 * entra nel quadro.
 */
export const VIDEO_PROFILES: Record<VideoQuality, {
  /** come riprende la camera: è l'unica leva che nessun encoder ignora */
  capture: { width: number; height: number };
  maxBitrate: number;
  degradation: string;
  etichetta: string;
  nota: string;
}> = {
  risparmio: {
    capture: { width: 640, height: 360 },
    maxBitrate: 300_000,
    degradation: 'balanced',
    etichetta: 'Risparmio',
    nota: 'fino a 640×360 · tetto 300 kbit/s',
  },
  standard: {
    capture: { width: 960, height: 540 },
    maxBitrate: 1_200_000,
    degradation: 'balanced',
    etichetta: 'Standard',
    nota: 'fino a 960×540 · tetto 1,2 Mbit/s',
  },
  migliore: {
    capture: { width: 1280, height: 720 },
    maxBitrate: 2_500_000,
    degradation: 'balanced',
    etichetta: 'Migliore',
    nota: 'fino a 1280×720 · tetto 2,5 Mbit/s',
  },
  massima: {
    capture: { width: 1920, height: 1080 },
    maxBitrate: 4_000_000,
    // 'balanced' e non 'maintain-resolution': all'accensione la stima di
    // banda parte bassa, e obbligare l'encoder a produrre subito 1080p
    // significa un primo fotogramma chiave che spesso non passa - da cui
    // il video che all'altro non compare finché non lo si riaccende.
    // Scalare l'uscita non cambia l'inquadratura, solo la nitidezza,
    // finché la banda non sale.
    degradation: 'balanced',
    etichetta: 'Massima',
    nota: 'fino a 1920×1080 · tetto 4 Mbit/s',
  },
};

/** Fotogrammi chiesti alla camera, uguali per tutti i profili. */
export const CAPTURE_FPS = 30;

type RTCIceServer = { urls: string; username?: string; credential?: string };

/**
 * Da dove si parte per trovare la strada verso l'altro.
 *
 * Qui c'è solo lo STUN pubblico, che serve a scoprire il proprio
 * indirizzo visto da fuori. Il relay - che entra in gioco quando la
 * strada diretta non si apre - lo comunica il server nel messaggio di
 * ingresso, insieme alle credenziali: così resta una cosa sola da
 * mantenere, e cambiando la password non si deve toccare nessun telefono.
 */
export function iceServers(): RTCIceServer[] {
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}
