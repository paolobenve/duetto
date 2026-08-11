import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const isAndroid = Platform.OS === 'android';
const NativeForeground = NativeModules.DuoTalkForeground;
const NativePip = NativeModules.DuoTalkPip;
const NativeVisibility = NativeModules.DuoTalkVisibility;

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
    if (__DEV__) console.warn(`[duotalk-platform] metodo nativo assente: ${name}`);
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

      /** Aggiorna il testo della notifica fissa. */
      setText: (text) => call(NativeForeground, 'setText', String(text)),

      /** Ferma il servizio e rilascia il wake lock. */
      stop: () => call(NativeForeground, 'stop'),

      /** Avviso da mostrare quando l'app non è in primo piano. */
      notify: (title, text) =>
        call(NativeForeground, 'notify', String(title), String(text)),

      /** Toglie l'avviso, quando si rientra nell'app. */
      clearNotification: () => call(NativeForeground, 'clearNotification'),

      /** Vero se l'app può restare attiva senza limiti di batteria. */
      isBatteryUnrestricted: () => call(NativeForeground, 'isBatteryUnrestricted'),

      /** Finestra di sistema per concederlo: una spunta e basta. */
      requestBatteryUnrestricted: () =>
        call(NativeForeground, 'requestBatteryUnrestricted'),

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
      clearNotification: unavailable,
      isBatteryUnrestricted: unavailable,
      requestBatteryUnrestricted: unavailable,
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
 * Se l'app sta davvero mostrando qualcosa sullo schermo.
 *
 * Diverso da AppState di React Native, che su Android segnala la pausa
 * dell'activity: in Picture-in-Picture l'activity è in pausa ma la
 * finestrella è ben visibile. Qui contano onStart/onStop, che in PiP non
 * scattano.
 */
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
        const sub = emitter.addListener('duotalk-visibility', (v) => cb(!!v));
        return () => sub.remove();
      },
    }
  : { get: unavailable, subscribe: () => () => {} };
