import { AppState } from 'react-native';
import { Foreground } from 'duotalk-platform';
import { loadConfig, isPaired, isServerConfigured } from './config';
import { Signaling } from './signaling';

/**
 * Presenza senza interfaccia.
 *
 * Serve dopo il riavvio del telefono: un servizio nativo avvia il motore
 * JavaScript senza aprire l'app (vedi PresenceService.kt) ed esegue il
 * compito qui sotto, che rimette in piedi la connessione di ascolto.
 * Da quel momento sei di nuovo raggiungibile e ricevi la notifica quando
 * l'altro entra nel canale, senza aver toccato nulla.
 *
 * Non "apre l'app da sola": da Android 10 avviare un'interfaccia dal
 * secondo piano e' vietato. L'app si apre quando tocchi la notifica.
 */

let sig: Signaling | null = null;

const log = (...args: any[]) => console.log('[duotalk-presenza]', ...args);

/** Attiva l'ascolto, se c'e' una coppia configurata. */
export async function startListening(): Promise<boolean> {
  if (sig) return true;

  const cfg = await loadConfig();
  if (!isPaired(cfg) || !isServerConfigured(cfg)) {
    log('nessuna coppia configurata: non c\'e' + ' nulla da ascoltare');
    return false;
  }

  const pair = cfg.pair!;
  log('ascolto avviato');

  sig = new Signaling(
    {
      serverUrl: cfg.serverUrl.trim(),
      accessToken: cfg.accessToken,
      room: pair.id,
      displayName: cfg.displayName || 'Qualcuno',
      key: pair.key,
      side: pair.side,
      mode: 'listening',
    },
    {
      onNotify: (reason, name) => {
        const named = name && name !== 'Qualcuno';
        const text = reason === 'knock'
          ? (named ? `${name} ti aspetta nel canale` : 'Ti aspettano nel canale')
          : (named ? `${name} è nel canale` : 'C’è qualcuno nel canale');
        log('avviso:', text);
        Foreground.notify('DuoTalk', text).catch(() => { /* noop */ });
      },
    },
  );
  sig.connect();
  return true;
}

/** Cede il posto: l'interfaccia si occupera' della connessione. */
export function stopListening() {
  if (!sig) return;
  log('ascolto ceduto all\'app');
  sig.close();
  sig = null;
}

export function isListening(): boolean {
  return sig !== null;
}

/**
 * Il compito eseguito dal servizio senza interfaccia.
 *
 * Di proposito non si conclude mai: finche' vive, vive la connessione.
 * Se l'app viene aperta, `stopListening` la chiude e il compito resta
 * inerte in attesa che l'app la ceda di nuovo.
 */
export async function presenceTask(): Promise<void> {
  // Se l'app e' gia' in primo piano, e' lei ad avere il comando.
  if (AppState.currentState === 'active') {
    log('app gia\' aperta: lascio fare a lei');
  } else {
    await startListening();
  }
  return new Promise<void>(() => { /* mai risolto: deve restare vivo */ });
}
