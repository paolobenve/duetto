// Dichiarazioni per i moduli senza tipi propri.

declare module 'tweetnacl-util' {
  export function decodeUTF8(s: string): Uint8Array;
  export function encodeUTF8(a: Uint8Array): string;
  export function encodeBase64(a: Uint8Array): string;
  export function decodeBase64(s: string): Uint8Array;
}

declare module 'duetto-platform' {
  /** Foreground service Android: tiene viva la presenza nel canale. */
  export const Foreground: {
    start(text?: string, withCamera?: boolean): Promise<boolean>;
    setCameraActive(active: boolean): Promise<boolean>;
    setText(text: string): Promise<boolean>;
    stop(): Promise<boolean>;
    notify(title: string, text: string): Promise<boolean>;
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
