import { NativeModules, Platform } from 'react-native';

const isAndroid = Platform.OS === 'android';
const NativeForeground = NativeModules.DuoTalkForeground;
const NativePip = NativeModules.DuoTalkPip;

const no = async () => false;

/**
 * Foreground service Android.
 *
 * Senza questo, mettendo l'app in background o spegnendo lo schermo Android
 * sospende il processo: la connessione cadrebbe e usciresti dal canale.
 * Un foreground service con tipo "microphone" e' l'unico modo supportato
 * per restare attivi (ed e' anche l'unico modo consentito da Android 14+
 * per continuare a usare il microfono fuori dal primo piano).
 *
 * Il prezzo e' la notifica fissa nella barra di stato: obbligatoria, e'
 * Android che la impone come contropartita per restare vivi.
 */
export const Foreground = isAndroid && NativeForeground
  ? {
      /** Avvia il servizio. `withCamera` aggiunge il tipo camera al servizio. */
      start: (text = 'Sei nel canale', withCamera = false) =>
        NativeForeground.start(String(text), !!withCamera),

      /**
       * Aggiorna il tipo di servizio quando accendi/spegni il video.
       * Su Android 14+ usare la camera in background richiede che il
       * servizio dichiari anche il tipo "camera".
       */
      setCameraActive: (active) => NativeForeground.setCameraActive(!!active),

      /** Aggiorna il testo della notifica (es. "Anna e' nel canale"). */
      setText: (text) => NativeForeground.setText(String(text)),

      /** Ferma il servizio e rilascia il wake lock. */
      stop: () => NativeForeground.stop(),
    }
  : { start: no, setCameraActive: no, setText: no, stop: no };

/**
 * Picture-in-Picture di sistema: la finestrella che resta sopra le altre
 * app. Usata dal tasto Indietro, per non uscire dal canale per sbaglio.
 */
export const Pip = isAndroid && NativePip
  ? {
      /** Vero se il telefono supporta il PiP (Android 8+ e feature presente). */
      isSupported: () => NativePip.isSupported(),

      /**
       * Entra in PiP con le proporzioni date (larghezza/altezza).
       * Risolve false se il sistema rifiuta.
       */
      enter: (aspect = 9 / 16) => NativePip.enter(Number(aspect) || 9 / 16),
    }
  : { isSupported: no, enter: no };
