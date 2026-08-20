// Dichiarazioni per i moduli senza tipi propri.

declare module 'tweetnacl-util' {
  export function decodeUTF8(s: string): Uint8Array;
  export function encodeUTF8(a: Uint8Array): string;
  export function encodeBase64(a: Uint8Array): string;
  export function decodeBase64(s: string): Uint8Array;
}

declare module 'duetto-platform' {
  export const Volume: {
    /** nel canale l'app prende i tasti del volume; fuori li lascia */
    prendiTasti(attivo: boolean): Promise<boolean>;
    /** `cb(+1|-1)` quando il volume di sistema non si è mosso */
    subscribe(cb: (direzione: number) => void): () => void;
  };

  /** Foreground service Android: tiene viva la presenza nel canale. */
  export const Foreground: {
    start(text?: string, withCamera?: boolean): Promise<boolean>;
    setCameraActive(active: boolean): Promise<boolean>;
    setText(text: string): Promise<boolean>;
    stop(): Promise<boolean>;
    notify(title: string, text: string): Promise<boolean>;
    /** notizia silenziosa: non suona e non vibra */
    nota(title: string, text: string): Promise<boolean>;
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

  /** Diario dei consumi: righe scritte dal servizio, lette da qui. */
  export const Diario: {
    stato(s: string): Promise<boolean>;
    segna(motivo: string): Promise<boolean>;
    righe(): Promise<number>;
    leggi(daRiga: number): Promise<string>;
    aggiungiAltro(testo: string): Promise<boolean>;
    percorso(): Promise<string>;
    /** com'è morta l'app l'ultima volta; null se il telefono non lo sa */
    ultimaMorte(): Promise<{
      quando: number; causa: string; era: string; descrizione: string;
    } | null>;
  };

  /** Vibrazione e suono dell'avviso. */
  export const Avvisi: {
    configura(
      vibra: 'predefinito' | 'sempre' | 'mai',
      suono: 'predefinito' | 'nessuno' | 'scelto',
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
