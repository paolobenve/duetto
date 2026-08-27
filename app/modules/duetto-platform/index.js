import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const isAndroid = Platform.OS === 'android';
const NativeForeground = NativeModules.DuettoForeground;
const NativePip = NativeModules.DuettoPip;
const NativeVisibility = NativeModules.DuettoVisibility;
const NativeRete = NativeModules.DuettoRete;
const NativeBattito = NativeModules.DuettoBattito;
const NativeProssimita = NativeModules.DuettoProssimita;
const NativeLocale = NativeModules.DuettoLocale;
const NativeCodecs = NativeModules.DuettoCodecs;
const NativeAudio = NativeModules.DuettoAudio;
const NativeAlerts = NativeModules.DuettoAlerts;
const NativeJournal = NativeModules.DuettoJournal;
const NativeVolume = NativeModules.DuettoVolume;
const NativeAlarm = NativeModules.DuettoAlarm;

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
 * The consumption journal.
 *
 * The lines are written by the foreground service, which is alive even
 * when JavaScript is not. From here we only say which state we are in,
 * read what there is to send to the other phone, and put aside what the
 * other one sends us.
 *
 * Mind what it does NOT hold: how much the other apps use. No app can
 * know that - Android keeps that account and shows it only in its own
 * "Battery" screen or through `adb shell dumpsys batterystats`.
 */
export const Journal = isAndroid && NativeJournal
  ? {
      /** "waiting" | "channel" | "channel+video": it ends up on every line. */
      state: (s) => call(NativeJournal, 'state', String(s)),
      /** A line right now, to mark a moment that counts. */
      mark: (why) => call(NativeJournal, 'mark', String(why)),
      lines: () => call(NativeJournal, 'lines'),
      read: (fromLine) => call(NativeJournal, 'read', Number(fromLine) || 0),
      appendOther: (text, who) =>
        call(NativeJournal, 'appendOther', String(text), String(who || '')),
      path: () => call(NativeJournal, 'path'),
      /** How the app died last time; null if the phone does not know. */
      lastDeath: () => call(NativeJournal, 'lastDeath'),
    }
  : {
      state: unavailable,
      mark: unavailable,
      lines: () => Promise.resolve(0),
      read: () => Promise.resolve(''),
      appendOther: unavailable,
      path: () => Promise.resolve(''),
      lastDeath: () => Promise.resolve(null),
    };

/**
 * How the other person's alert has to make itself heard.
 *
 * From Android 8 on, sound and vibration are fixed when the notification
 * channel is born and cannot be changed any more: `configure` creates a
 * new one and throws the old away. It has to be called at start-up, not
 * only when one changes one's mind, because the channel may not exist
 * yet.
 */
export const Alerts = isAndroid && NativeAlerts
  ? {
      /**
       * @param vibration 'default' | 'always' | 'never'
       * @param sound     'default' | 'none' | 'chosen'
       * @param uri       address of the sound, only with 'chosen'
       */
      configure: (vibration, sound, uri = '') =>
        call(NativeAlerts, 'configure', String(vibration), String(sound), String(uri)),

      /**
       * Opens the system's sound picker.
       * Gives back `{uri, name}`, or null if it is cancelled.
       */
      pickSound: (currentUri = '') =>
        call(NativeAlerts, 'pickSound', String(currentUri)),
    }
  : { configure: unavailable, pickSound: () => Promise.resolve(null) };

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
 * La lingua a cui è impostato il telefono, in due lettere.
 *
 * Arriva già pronta all'avvio, senza aspettare una risposta: la prima
 * schermata deve poter essere scritta subito. Vedi LocaleModule.
 */
export const Locale = isAndroid && NativeLocale
  ? {
      language: String(NativeLocale.language || 'en').toLowerCase(),
      current: () => call(NativeLocale, 'current'),
    }
  : { language: 'en', current: () => Promise.resolve('en') };

/**
 * Quando qualcosa copre lo schermo: una tasca, una cover chiusa.
 *
 * Serve a non prendere per scelte i tocchi che arrivano al vetro di un
 * telefono in tasca. Vedi ProssimitaModule.
 */
export const Prossimita = isAndroid && NativeProssimita
  ? {
      /** Com'è adesso. */
      get: () => call(NativeProssimita, 'coperto'),

      /**
       * Chiama `cb(coperto)` a ogni cambiamento, e si mette in ascolto.
       * Restituisce la funzione per smettere.
       */
      subscribe(cb) {
        call(NativeProssimita, 'start');
        const emitter = new NativeEventEmitter(NativeProssimita);
        const sub = emitter.addListener('duetto-prossimita', (v) => cb(!!v));
        return () => {
          sub.remove();
          call(NativeProssimita, 'stop');
        };
      },
    }
  : { get: () => Promise.resolve(false), subscribe: () => () => {} };

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
      /**
       * Fitto mentre si è senza server (un battito ogni quindici
       * secondi), rado quando il collegamento c'è.
       */
      fitto: (svelto) => call(NativeBattito, 'fitto', !!svelto),

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
  : { subscribe: () => () => {}, fitto: unavailable };

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

      /**
       * Dice ad Android che su questa rete il traffico non passa, e che
       * la verifichi adesso. Vedi ReteModule.
       */
      segnalaCheNonPassa: () => call(NativeRete, 'segnalaCheNonPassa'),
    }
  : { subscribe: () => () => {}, segnalaCheNonPassa: unavailable };

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
 * The sounds for calling the other back when they are in the channel but
 * do not answer.
 *
 * They come out of the alarm volume, not the conversation one: see
 * Alarm.kt.
 */
export const Alarm = isAndroid && NativeAlarm
  ? {
      play: (name, echo, maxMs) =>
        call(NativeAlarm, 'play', String(name), !!echo, Number(maxMs) || 0),
      stop: () => call(NativeAlarm, 'stop'),
      list: () => call(NativeAlarm, 'list'),
    }
  : { play: unavailable, stop: unavailable, list: () => Promise.resolve([]) };
