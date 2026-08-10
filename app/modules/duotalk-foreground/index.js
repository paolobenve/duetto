import { NativeModules, Platform } from 'react-native';

const Native = NativeModules.DuoTalkForeground;

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
const noop = async () => false;

export default Platform.OS === 'android' && Native
  ? {
      /** Avvia il servizio. `withCamera` aggiunge il tipo camera al servizio. */
      start: (text = 'Sei nel canale', withCamera = false) =>
        Native.start(String(text), !!withCamera),

      /**
       * Aggiorna il tipo di servizio quando accendi/spegni il video.
       * Su Android 14+ usare la camera in background richiede che il
       * servizio dichiari anche il tipo "camera".
       */
      setCameraActive: (active) => Native.setCameraActive(!!active),

      /** Aggiorna il testo della notifica (es. "Anna e' nel canale"). */
      setText: (text) => Native.setText(String(text)),

      /** Ferma il servizio e rilascia il wake lock. */
      stop: () => Native.stop(),
    }
  : { start: noop, setCameraActive: noop, setText: noop, stop: noop };
