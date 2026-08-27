// Dichiarazioni per i moduli senza tipi propri.

declare module 'tweetnacl-util' {
  export function decodeUTF8(s: string): Uint8Array;
  export function encodeUTF8(a: Uint8Array): string;
  export function encodeBase64(a: Uint8Array): string;
  export function decodeBase64(s: string): Uint8Array;
}

declare module 'duetto-platform' {
  /** I suoni per richiamare l'altro: escono dal volume della sveglia. */
  export const Sveglia: {
    /** `eco`: lo suona chi lo ha mandato, e allora esce piano */
    suona(nome: string, eco?: boolean, maxMs?: number): Promise<boolean>;
    ferma(): Promise<boolean>;
    elenco(): Promise<string[]>;
  };

  export const Volume: {
    /** nel canale l'app prende i tasti del volume; fuori li lascia */
    prendiTasti(attivo: boolean): Promise<boolean>;
    /** `cb(+1|-1)` quando il volume di sistema non si è mosso */
    subscribe(cb: (direzione: number) => void): () => void;
    /** il volume di chiamata del telefono, e il suo massimo */
    leggi(): Promise<{ volume: number; max: number }>;
    /** lo mette a un valore preciso */
    metti(valore: number): Promise<boolean>;
    /** `cb(valore)` quando il volume di chiamata cambia, anche da fuori */
    ascoltaSistema(cb: (valore: number) => void): () => void;
  };

  /** La lingua a cui è impostato il telefono, in due lettere. */
  export const Locale: {
    language: string;
    current(): Promise<string>;
  };

  /** Quando qualcosa copre lo schermo: una tasca, una cover chiusa. */
  export const Prossimita: {
    get(): Promise<boolean>;
    subscribe(cb: (coperto: boolean) => void): () => void;
  };

  /** Un battito ogni minuto, che arriva anche a schermo spento. */
  export const Battito: {
    subscribe(cb: () => void): () => void;
    /** fitto mentre si è senza server, rado quando il collegamento c'è */
    fitto(svelto: boolean): Promise<boolean>;
  };

  /** I cambi di rete del telefono: cella, wifi, indirizzo nuovo. */
  export const Rete: {
    subscribe(cb: (cosa: string) => void): () => void;
    /** «su questa rete il traffico non passa, verificala adesso» */
    segnalaCheNonPassa(): Promise<boolean>;
  };

  /** Foreground service Android: tiene viva la presenza nel canale. */
  export const Foreground: {
    start(text?: string, withCamera?: boolean): Promise<boolean>;
    setCameraActive(active: boolean): Promise<boolean>;
    /** testo della notifica fissa, e nome del collegamento da metterci davanti */
    setText(text: string, nome?: string): Promise<boolean>;
    stop(): Promise<boolean>;
    notify(nome: string, text: string): Promise<boolean>;
    /** notizia silenziosa: non suona e non vibra */
    nota(nome: string, text: string): Promise<boolean>;
    /** toglie la notizia quando non è più vera */
    togliNota(): Promise<boolean>;
    /** avvia l'ascolto senza interfaccia, quando l'app sta per sparire */
    riprendiPresenza(): Promise<boolean>;
    clearNotification(): Promise<boolean>;
    isBatteryUnrestricted(): Promise<boolean>;
    requestBatteryUnrestricted(): Promise<boolean>;
    lastAutoStart(): Promise<number>;
    uptimeMs(): Promise<number>;
    hasAutoStartScreen(): Promise<boolean>;
    openAutoStartSettings(): Promise<boolean>;
    openAppSettings(): Promise<boolean>;
  };

  /** Picture-in-Picture di sistema. */
  export const Pip: {
    isSupported(): Promise<boolean>;
    enter(aspect?: number): Promise<boolean>;
  };

  /** La finestra dell'app. */
  export const AppWindow: {
    minimize(): Promise<boolean>;
  };

  /** Cosa sa fare la parte video di questo telefono. */
  export const Codecs: {
    hasHardwareVp9Encoder(): Promise<boolean>;
  };

  /** Consumption journal: lines written by the service, read from here. */
  export const Journal: {
    state(s: string): Promise<boolean>;
    mark(why: string): Promise<boolean>;
    lines(): Promise<number>;
    read(fromLine: number): Promise<string>;
    /** `who`: which connection it comes from, to keep the files apart */
    appendOther(text: string, who?: string): Promise<boolean>;
    path(): Promise<string>;
    /** how the app died last time; null if the phone does not know */
    lastDeath(): Promise<{
      when: number; cause: string; was: string; description: string;
    } | null>;
  };

  /** Vibrazione e suono dell'avviso. */
  export const Avvisi: {
    configura(
      vibra: 'default' | 'always' | 'never',
      suono: 'default' | 'none' | 'chosen',
      uri?: string,
    ): Promise<boolean | string>;
    scegliSuono(uriCorrente?: string): Promise<{ uri: string; nome: string } | null>;
  };

  /** Manda i tasti del volume sul flusso della conversazione. */
  export const Audio: {
    useCallVolumeKeys(active: boolean): Promise<boolean>;
  };

  /**
   * Se l'app sta davvero mostrando qualcosa. Diverso da AppState: in
   * Picture-in-Picture l'activity è in pausa ma la finestrella si vede.
   */
  export const Visibility: {
    get(): Promise<boolean>;
    /** Restituisce la funzione per smettere di ascoltare. */
    subscribe(cb: (visible: boolean) => void): () => void;
  };
}
