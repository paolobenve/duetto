import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const isAndroid = Platform.OS === 'android';
const NativeForeground = NativeModules.DuettoForeground;
const NativePip = NativeModules.DuettoPip;
const NativeVisibility = NativeModules.DuettoVisibility;
const NativeRete = NativeModules.DuettoRete;
const NativeBattito = NativeModules.DuettoBattito;
const NativeCodecs = NativeModules.DuettoCodecs;
const NativeAudio = NativeModules.DuettoAudio;
const NativeAvvisi = NativeModules.DuettoAvvisi;
const NativeDiario = NativeModules.DuettoDiario;
const NativeVolume = NativeModules.DuettoVolume;
const NativeSveglia = NativeModules.DuettoSveglia;

/**
 * Chiama un metodo nativo solo se esiste davvero.
 *
 * Il lato JS e il lato nativo possono disallinearsi: basta un APK
 * costruito con una versione precedente del modulo. Senza questa
 * protezione una chiamata a un metodo mancante fa cadere l'intera app
 * con "undefined is not a function", per giunta lontano dal punto in cui
 * sta il vero problema. Meglio non fare nulla e restituire false.
 */
function call(mod, name, ...args) {
  const fn = mod && mod[name];
  if (typeof fn !== 'function') {
    if (__DEV__) console.warn(`[duetto-platform] metodo nativo assente: ${name}`);
    return Promise.resolve(false);
  }
  try {
    return Promise.resolve(fn.apply(mod, args));
  } catch (e) {
    return Promise.resolve(false);
  }
}

const unavailable = () => Promise.resolve(false);

/**
 * Foreground service Android.
 *
 * Senza questo, mettendo l'app in background o spegnendo lo schermo
 * Android sospende il processo: la connessione cadrebbe e usciresti dal
 * canale. Il tipo "microphone" è anche l'unico modo consentito da
 * Android 14+ per usare il microfono fuori dal primo piano.
 *
 * Il prezzo è la notifica fissa nella barra di stato: obbligatoria,
 * è Android che la impone come contropartita.
 */
export const Foreground = isAndroid && NativeForeground
  ? {
      /** Avvia il servizio. `withCamera` aggiunge il tipo camera. */
      start: (text = 'In ascolto', withCamera = false) =>
        call(NativeForeground, 'start', String(text), !!withCamera),

      /**
       * Da chiamare quando accendi/spegni il video: su Android 14+ usare
       * la camera fuori dal primo piano richiede che il servizio
       * dichiari anche il tipo "camera".
       */
      setCameraActive: (active) =>
        call(NativeForeground, 'setCameraActive', !!active),

      /**
       * Aggiorna la notifica fissa: testo, e nome del collegamento.
       *
       * Il nome va in testa al testo, in corsivo, e lo compone Android:
       * nel titolo non si vede quando la notifica è ripiegata, ed è
       * proprio lì che serve sapere in quale dei collegamenti si è.
       */
      setText: (text, nome) =>
        call(NativeForeground, 'setText', String(text), String(nome || '')),

      /** Ferma il servizio e rilascia il wake lock. */
      stop: () => call(NativeForeground, 'stop'),

      /** Avviso da mostrare quando l'app non è in primo piano. */
      notify: (nome, text) =>
        call(NativeForeground, 'notify', String(nome || ''), String(text)),

      /** Notizia da leggere con comodo: non suona e non vibra. */
      nota: (nome, text) =>
        call(NativeForeground, 'nota', String(nome || ''), String(text)),

      /** Toglie la notizia, quando quello che diceva non vale più. */
      togliNota: () => call(NativeForeground, 'togliNota'),

      /**
       * Passa la mano all'ascolto senza interfaccia: si chiama quando
       * l'interfaccia sta per sparire senza che nessuno l'abbia chiesto.
       */
      riprendiPresenza: () => call(NativeForeground, 'riprendiPresenza'),

      /** Toglie l'avviso, quando si rientra nell'app. */
      clearNotification: () => call(NativeForeground, 'clearNotification'),

      /** Vero se l'app può restare attiva senza limiti di batteria. */
      isBatteryUnrestricted: () => call(NativeForeground, 'isBatteryUnrestricted'),

      /** Finestra di sistema per concederlo: una spunta e basta. */
      requestBatteryUnrestricted: () =>
        call(NativeForeground, 'requestBatteryUnrestricted'),

      /**
       * Quando l'app è ripartita da sola dopo un riavvio (ms), 0 se mai.
       *
       * L'autorizzazione all'avvio automatico non è leggibile da nessuna
       * app: si può però sapere se ha funzionato, che è la cosa che
       * interessa davvero.
       */
      lastAutoStart: () => call(NativeForeground, 'lastAutoStart'),

      /** Da quanto è acceso il telefono, per datare l'ultimo riavvio. */
      uptimeMs: () => call(NativeForeground, 'uptimeMs'),

      /** Vero se questo telefono ha una schermata di avvio automatico. */
      hasAutoStartScreen: () => call(NativeForeground, 'hasAutoStartScreen'),

      /** Apre quella schermata: non è concedibile da codice. */
      openAutoStartSettings: () => call(NativeForeground, 'openAutoStartSettings'),

      /** Ripiego: la scheda dell'app nelle impostazioni di sistema. */
      openAppSettings: () => call(NativeForeground, 'openAppSettings'),
    }
  : {
      start: unavailable,
      setCameraActive: unavailable,
      setText: unavailable,
      stop: unavailable,
      notify: unavailable,
      nota: unavailable,
      togliNota: unavailable,
      riprendiPresenza: unavailable,
      clearNotification: unavailable,
      isBatteryUnrestricted: unavailable,
      requestBatteryUnrestricted: unavailable,
      lastAutoStart: unavailable,
      uptimeMs: unavailable,
      hasAutoStartScreen: unavailable,
      openAutoStartSettings: unavailable,
      openAppSettings: unavailable,
    };

/**
 * Picture-in-Picture di sistema: la finestrella che resta sopra le altre
 * app. Usata dal tasto Indietro, per non uscire dal canale per sbaglio.
 */
export const Pip = isAndroid && NativePip
  ? {
      /** Vero se il telefono lo supporta (Android 8+ e funzione presente). */
      isSupported: () => call(NativePip, 'isSupported'),

      /** Entra in PiP con le proporzioni date (larghezza/altezza). */
      enter: (aspect = 9 / 16) =>
        call(NativePip, 'enter', Number(aspect) || 9 / 16),
    }
  : { isSupported: unavailable, enter: unavailable };

/**
 * La finestra dell'app.
 *
 * "minimize" manda l'app in secondo piano come il tasto Home, senza
 * chiuderla: il processo resta vivo e con esso la connessione che ci
 * tiene raggiungibili. Chiuderla davvero interromperebbe le notifiche.
 */
export const AppWindow = isAndroid && NativePip
  ? { minimize: () => call(NativePip, 'minimize') }
  : { minimize: unavailable };

/**
 * Cosa sa fare la parte video di questo telefono.
 *
 * VP9 comprime meglio di VP8, ma solo se lo encoda l'hardware: in
 * software costa più batteria di quanta banda faccia risparmiare. Va
 * quindi chiesto al telefono, non dedotto dal modello.
 */
export const Codecs = isAndroid && NativeCodecs
  ? { hasHardwareVp9Encoder: () => call(NativeCodecs, 'hasHardwareVp9Encoder') }
  : { hasHardwareVp9Encoder: unavailable };

/**
 * Il diario dei consumi.
 *
 * Le righe le scrive il servizio in primo piano, che è vivo anche quando
 * JavaScript non lo è. Da qui si dice soltanto in che stato siamo, si
 * legge quello che c'è da mandare all'altro telefono, e si mette da parte
 * quello che l'altro manda a noi.
 *
 * Attenzione a cosa NON contiene: quanto consumano le altre app. Nessuna
 * app può saperlo - quel conto lo tiene Android e lo mostra solo nella
 * sua schermata "Batteria" o via `adb shell dumpsys batterystats`.
 */
export const Diario = isAndroid && NativeDiario
  ? {
      /** "ascolto" | "canale" | "canale+video": finisce in ogni riga. */
      stato: (s) => call(NativeDiario, 'stato', String(s)),
      /** Una riga adesso, per segnare un momento che conta. */
      segna: (motivo) => call(NativeDiario, 'segna', String(motivo)),
      righe: () => call(NativeDiario, 'righe'),
      leggi: (daRiga) => call(NativeDiario, 'leggi', Number(daRiga) || 0),
      aggiungiAltro: (testo, chi) =>
        call(NativeDiario, 'aggiungiAltro', String(testo), String(chi || '')),
      percorso: () => call(NativeDiario, 'percorso'),
      /** Com'è morta l'app l'ultima volta; null se il telefono non lo sa. */
      ultimaMorte: () => call(NativeDiario, 'ultimaMorte'),
    }
  : {
      stato: unavailable,
      segna: unavailable,
      righe: () => Promise.resolve(0),
      leggi: () => Promise.resolve(''),
      aggiungiAltro: unavailable,
      percorso: () => Promise.resolve(''),
      ultimaMorte: () => Promise.resolve(null),
    };

/**
 * Come deve farsi sentire l'avviso dell'altro.
 *
 * Da Android 8 suono e vibrazione si fissano alla nascita del canale di
 * notifica e non si possono più cambiare: `configura` ne crea uno nuovo
 * e butta il vecchio. Va chiamata all'avvio, non solo quando si cambia
 * idea, perché il canale può non esistere ancora.
 */
export const Avvisi = isAndroid && NativeAvvisi
  ? {
      /**
       * @param vibra 'predefinito' | 'sempre' | 'mai'
       * @param suono 'predefinito' | 'nessuno' | 'scelto'
       * @param uri   indirizzo del suono, solo con 'scelto'
       */
      configura: (vibra, suono, uri = '') =>
        call(NativeAvvisi, 'configura', String(vibra), String(suono), String(uri)),

      /**
       * Apre la scelta dei suoni di sistema.
       * Restituisce `{uri, nome}`, o null se si annulla.
       */
      scegliSuono: (uriCorrente = '') =>
        call(NativeAvvisi, 'scegliSuono', String(uriCorrente)),
    }
  : { configura: unavailable, scegliSuono: () => Promise.resolve(null) };

/**
 * I tasti del volume.
 *
 * Il suono della conversazione esce dal volume "chiamata", ma i tasti
 * laterali regolano quello che il sistema crede sia il flusso attivo: per
 * un'app comune il multimedia. Su certi telefoni - Motorola Edge 50
 * Fusion fra questi - premerli non ha quindi alcun effetto sulla voce
 * dell'altro, che resta al volume che ha.
 */
export const Audio = isAndroid && NativeAudio
  ? {
      /** `true` entrando nel canale, `false` uscendone. */
      useCallVolumeKeys: (active) =>
        call(NativeAudio, 'useCallVolumeKeys', !!active),
    }
  : { useCallVolumeKeys: unavailable };

/**
 * Se l'app sta davvero mostrando qualcosa sullo schermo.
 *
 * Diverso da AppState di React Native, che su Android segnala la pausa
 * dell'activity: in Picture-in-Picture l'activity è in pausa ma la
 * finestrella è ben visibile. Qui contano onStart/onStop, che in PiP non
 * scattano.
 */
/**
 * Il battito che arriva anche a schermo spento.
 *
 * I timer di JavaScript, in React Native, seguono il ritmo dei
 * fotogrammi dello schermo: spento lo schermo non scadono più. Questo
 * invece nasce da un Handler nativo ed è un evento, e gli eventi il
 * motore JavaScript li riceve comunque. Vedi BattitoModule.
 */
export const Battito = isAndroid && NativeBattito
  ? {
      /** Chiama `cb()` a ogni battito. Restituisce la funzione per smettere. */
      subscribe(cb) {
        call(NativeBattito, 'start');
        const emitter = new NativeEventEmitter(NativeBattito);
        const sub = emitter.addListener('duetto-battito', () => cb());
        return () => {
          sub.remove();
          call(NativeBattito, 'stop');
        };
      },
    }
  : { subscribe: () => () => {} };

/**
 * I cambi di rete del telefono: cella, wifi, indirizzo nuovo.
 *
 * Serve a rifare la connessione appena c'è una rete nuova, invece di
 * aspettare che qualcuno inciampi nel socket morto. Vedi ReteModule.
 */
export const Rete = isAndroid && NativeRete
  ? {
      /**
       * Chiama `cb(cosa)` a ogni cambiamento: "arrivata", "persa",
       * "indirizzo", "valida". Restituisce la funzione per smettere.
       */
      subscribe(cb) {
        call(NativeRete, 'start');
        const emitter = new NativeEventEmitter(NativeRete);
        const sub = emitter.addListener('duetto-rete', (v) => cb(String(v || '')));
        return () => sub.remove();
      },
    }
  : { subscribe: () => () => {} };

export const Visibility = isAndroid && NativeVisibility
  ? {
      /** Vero se l'app è visibile in questo momento. */
      get: () => call(NativeVisibility, 'isVisible'),

      /**
       * Chiama `cb(visibile)` a ogni cambiamento. Restituisce la funzione
       * per smettere.
       */
      subscribe(cb) {
        call(NativeVisibility, 'start');
        const emitter = new NativeEventEmitter(NativeVisibility);
        const sub = emitter.addListener('duetto-visibility', (v) => cb(!!v));
        return () => sub.remove();
      },
    }
  : { get: unavailable, subscribe: () => () => {} };


/**
 * I tasti del volume, mentre si è nel canale.
 *
 * L'app li prende in mano e li gira al sistema; l'evento arriva qui solo
 * quando il sistema NON si è mosso, perché il volume di chiamata è al
 * suo limite - cosa che su parecchi telefoni, in vivavoce, è la
 * normalità. In quel caso tocca all'app alzare la voce dell'altro per
 * conto suo.
 */
export const Volume = isAndroid && NativeVolume
  ? {
      /** Nel canale sì, fuori no: fuori i tasti sono del sistema. */
      prendiTasti: (attivo) => call(NativeVolume, 'prendiTasti', !!attivo),

      /**
       * Chiama `cb(+1 | -1)` quando il volume di sistema non si muove.
       * Restituisce la funzione per smettere di ascoltare.
       */
      subscribe(cb) {
        const emitter = new NativeEventEmitter(NativeVolume);
        const sub = emitter.addListener('duetto-volume', (d) => cb(Number(d) || 0));
        return () => sub.remove();
      },

      /**
       * Il volume di chiamata del telefono: `{ volume, max }`.
       *
       * È metà di quello che si sente - l'altra metà è il guadagno di
       * Duetto - ed è la metà che Android ricorda separatamente per ogni
       * uscita e che si muove anche da fuori.
       */
      leggi: () => call(NativeVolume, 'leggi'),

      /** Lo mette a un valore preciso, senza suoni né barretta di sistema. */
      metti: (valore) => call(NativeVolume, 'metti', Math.round(Number(valore) || 0)),

      /**
       * Chiama `cb(valore)` quando il volume di chiamata cambia, anche
       * per mano di un'altra app.
       */
      ascoltaSistema(cb) {
        call(NativeVolume, 'ascoltaSistema');
        const emitter = new NativeEventEmitter(NativeVolume);
        const sub = emitter.addListener('duetto-volume-sistema', (v) => cb(Number(v)));
        return () => sub.remove();
      },
    }
  : {
      prendiTasti: unavailable,
      subscribe: () => () => {},
      leggi: () => Promise.resolve({ volume: 0, max: 0 }),
      metti: unavailable,
      ascoltaSistema: () => () => {},
    };


/**
 * I suoni per richiamare l'altro quando è nel canale ma non risponde.
 *
 * Escono dal volume della sveglia, non da quello della conversazione:
 * vedi Sveglia.kt.
 */
export const Sveglia = isAndroid && NativeSveglia
  ? {
      suona: (nome, eco, maxMs) =>
        call(NativeSveglia, 'suona', String(nome), !!eco, Number(maxMs) || 0),
      ferma: () => call(NativeSveglia, 'ferma'),
      elenco: () => call(NativeSveglia, 'elenco'),
    }
  : { suona: unavailable, ferma: unavailable, elenco: () => Promise.resolve([]) };
