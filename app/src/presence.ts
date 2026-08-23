import { AppState } from 'react-native';
import { Foreground, Diario } from 'duetto-platform';
import { loadConfig, isPaired, isServerConfigured, chiaveCoppia, nomeCoppia } from './config';
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
 * secondo piano è vietato. L'app si apre quando tocchi la notifica.
 */

let sig: Signaling | null = null;

/**
 * L'interfaccia ha una sua connessione aperta.
 *
 * Serve a non averne due dallo stesso telefono: il server tiene un
 * posto per lato, e la seconda scalzerebbe la prima a vicenda, per
 * sempre. Lo dice l'app quando apre e quando chiude la sua.
 */
let interfaccia = false;

export function interfacciaAlComando(viva: boolean) {
  interfaccia = viva;
}

/**
 * Come dire a voce alta la causa di una morte.
 *
 * Sta qui perché la usano in due: l'app, e l'ascolto senza interfaccia
 * qui sotto. Un telefono che si è appena rialzato può trovare l'altro in
 * uno qualunque dei due stati, e il racconto dev'essere lo stesso.
 */
export function fraseMorte(quando: number, causa: string, nome: string): string {
  const chi = nome && nome !== 'Qualcuno' ? nome : 'L\u2019altro';
  const perche = (() => {
    switch (causa) {
      case 'memoria-finita': return 'il telefono era senza memoria';
      case 'errore':
      case 'errore-nativo': return 'l\u2019app \u00e8 andata in errore';
      case 'bloccata': return 'l\u2019app si era bloccata';
      case 'arresto-forzato': return 'l\u2019app \u00e8 stata fermata a mano';
      case 'chiusa-dall-utente': return 'l\u2019app \u00e8 stata chiusa';
      case 'troppe-risorse': return 'il telefono l\u2019ha chiusa per consumi';
      case 'permessi-cambiati': return 'sono cambiati i permessi';
      case 'congelata':
      case 'segnale':
      case 'altro': return 'il telefono l\u2019ha chiusa';
      default: return 'non si sa perch\u00e9';
    }
  })();
  const d = new Date(quando);
  const ora = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const quandoScritto = d.toDateString() === new Date().toDateString()
    ? `alle ${ora}`
    : `il ${d.toLocaleDateString()} alle ${ora}`;
  // L'ora del ritorno, al secondo: una notizia letta due ore dopo, senza
  // quel numero, non dice se e' tornato subito o poco fa.
  const adesso = new Date().toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  return `${chi} \u00e8 sparito ${quandoScritto}: ${perche}. Adesso (${adesso}) \u00e8 tornato.`;
}

/**
 * Cosa dice la notifica fissa, in una riga.
 *
 * Sta qui perché la scrivono in due: l'app, che sa tutto, e l'ascolto
 * senza interfaccia qui sotto, che dopo un riavvio del telefono è
 * l'unica cosa che parla all'utente finché non apre l'app. Devono dire
 * le stesse parole, e sono le stesse della schermata di attesa:
 *
 *  - "in attesa": collegato al server, l'avviso gli arriva;
 *  - "non raggiungibile": il suo telefono al server non è collegato, e
 *    l'avviso non ha dove andare.
 */
export function testoPresenza(o: {
  /** siamo noi dentro al canale */
  inChannel: boolean;
  /** l'altro è nel canale */
  peerActive: boolean;
  /** l'altro è almeno collegato al server */
  peerPresent: boolean;
  /**
   * Se n'è andato di proposito: ha staccato, non gli è caduta la linea.
   *
   * Vale la pena distinguerlo: chi legge "non raggiungibile" aspetta
   * che torni da un momento all'altro, chi legge "si è staccato" sa che
   * dipende da lui.
   */
  staccato?: boolean;
  nome: string;
  /**
   * Il nome dato al collegamento in uso, se ne ha uno.
   *
   * Va in testa alla riga, come il nome di una stanza: dice in quale
   * dei collegamenti si sta, cosa che con più di uno configurato è la
   * prima domanda. Non è il nome dell'altro, che resta il suo.
   */
  collegamento?: string;
  /** com'è messo il NOSTRO collegamento al server */
  server?: 'ok' | 'giu' | 'incorso';
}): string {
  const dove = o.collegamento ? `${o.collegamento} \u00b7 ` : '';
  const mio = (o.inChannel ? 'Sei nel canale' : 'In attesa');
  const chi = o.nome && o.nome !== 'Qualcuno' ? o.nome : 'l\u2019altro';
  if (o.server === 'giu') return `${dove}${mio} \u00b7 senza collegamento al server`;
  if (o.server === 'incorso') return `${dove}${mio}`;
  if (o.peerActive) {
    return dove + (o.inChannel
      ? `Nel canale con ${chi}`
      : `${mio} \u00b7 ${chi} \u00e8 nel canale`);
  }
  if (!o.peerPresent) {
    return `${dove}${mio} \u00b7 ${chi} ${o.staccato ? 'si \u00e8 staccato' : 'non raggiungibile'}`;
  }
  return dove + (o.inChannel ? `${mio} \u00b7 ${chi} in attesa` : 'In attesa tutti e due');
}

const log = (...args: any[]) => console.log('[duetto-presenza]', ...args);

/** Attiva l'ascolto, se c'è una coppia configurata. */
export async function startListening(): Promise<boolean> {
  if (sig) return true;
  if (interfaccia) {
    log('l\'app ha gia\' la sua connessione: non ne apro un\'altra');
    return false;
  }

  const cfg = await loadConfig();
  if (!isPaired(cfg) || !isServerConfigured(cfg)) {
    log('nessuna coppia configurata: non c\'e' + ' nulla da ascoltare');
    return false;
  }

  const pair = cfg.pair!;
  log('ascolto avviato');

  /**
   * Su quale collegamento arrivano gli avvisi.
   *
   * Con più collegamenti configurati, "ti aspettano nel canale" non dice
   * abbastanza: ti aspetta uno solo dei due o tre che conosci. Con un
   * collegamento solo non c'è niente da distinguere.
   */
  const titolo = cfg.pairs.length > 1 && nomeCoppia(pair)
    ? `Duetto \u00b7 ${nomeCoppia(pair)}`
    : 'Duetto';

  /**
   * Lo stato dell'altro, per la sola notifica.
   *
   * Qui non si chiede niente a nessuno: dopo un riavvio del telefono
   * nessuno sta guardando uno schermo, e svegliare la radio ogni minuto
   * per aggiornare una riga che nessuno legge sarebbe il contrario di
   * quello che questa parte dell'app cerca di fare. Si ascolta quello
   * che il server manda da sé.
   */
  let presente = false;
  let attivo = false;
  let staccato = false;
  let nome = pair.peerName || '';
  const aggiorna = () => {
    Foreground.setText(testoPresenza({
      inChannel: false, peerActive: attivo, peerPresent: presente, nome,
      staccato, collegamento: pair.etichetta,
    })).catch(() => { /* noop */ });
  };

  sig = new Signaling(
    {
      serverUrl: cfg.serverUrl.trim(),
      room: pair.id,
      displayName: cfg.displayName || 'Qualcuno',
      key: pair.key,
      side: pair.side,
      mode: 'listening',
    },
    {
      onJoined: ({ peerPresent, peerActive, peerName }) => {
        presente = peerPresent;
        if (peerPresent) staccato = false;
        attivo = peerActive;
        if (peerName) nome = peerName;
        aggiorna();
      },
      onPeerJoined: (name, mode) => {
        presente = true;
        staccato = false;
        attivo = mode === 'active';
        if (name) nome = name;
        aggiorna();
      },
      onPeerLeft: (motivo) => {
        presente = false;
        attivo = false;
        staccato = motivo === 'bye';
        aggiorna();
      },
      onPeerMode: (mode, name) => {
        presente = true;
        attivo = mode === 'active';
        if (name) nome = name;
        aggiorna();
      },
      /**
       * Anche senza interfaccia si raccoglie quello che l'altro manda.
       *
       * Senza questo, un diario spedito a un telefono che sta ascoltando
       * senza app aperta - dopo un riavvio, o dopo che il sistema ci ha
       * uccisi - arrivava a un JavaScript che non lo guardava, e chi
       * l'aveva mandato aveva gia' segnato quelle righe come spedite:
       * perse per sempre. Sono proprio le righe che raccontano perche'
       * quel telefono era morto.
       */
      onSignal: (msg) => {
        if (msg.kind === 'diario') {
          Diario.aggiungiAltro(String(msg.testo ?? ''), chiaveCoppia(pair))
            .catch(() => { /* noop */ });
          return;
        }
        if (msg.kind === 'morte') {
          Foreground.nota(
            titolo,
            fraseMorte(Number(msg.quando), String(msg.causa), nome),
          ).catch(() => { /* noop */ });
        }
      },

      onNotify: (reason, name) => {
        const named = name && name !== 'Qualcuno';
        const text = reason === 'knock'
          ? (named ? `${name} ti aspetta nel canale` : 'Ti aspettano nel canale')
          : (named ? `${name} è nel canale` : 'C’è qualcuno nel canale');
        log('avviso:', text);
        Foreground.notify(titolo, text).catch(() => { /* noop */ });
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
  // Senza saluto: non ce ne stiamo andando, stiamo passando la mano
  // all'app che si è appena aperta. Salutare qui faceva scrivere
  // all'altro "si è staccato" ogni volta che questo telefono veniva
  // ripreso in mano.
  sig.close(false);
  sig = null;
}

export function isListening(): boolean {
  return sig !== null;
}

/**
 * Il compito eseguito dal servizio senza interfaccia.
 *
 * Di proposito non si conclude mai: finché vive, vive la connessione.
 * Se l'app viene aperta, `stopListening` la chiude e il compito resta
 * inerte in attesa che l'app la ceda di nuovo.
 */
export async function presenceTask(): Promise<void> {
  // Se l'app è già in primo piano, è lei ad avere il comando.
  if (AppState.currentState === 'active') {
    log('app gia\' aperta: lascio fare a lei');
  } else {
    await startListening();
  }
  return new Promise<void>(() => { /* mai risolto: deve restare vivo */ });
}
