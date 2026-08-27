// Dichiarazioni per i moduli senza tipi propri.

declare module 'tweetnacl-util' {
  export function decodeUTF8(s: string): Uint8Array;
  export function encodeUTF8(a: Uint8Array): string;
  export function encodeBase64(a: Uint8Array): string;
  export function decodeBase64(s: string): Uint8Array;
}

declare module 'duetto-platform' {
  /** The sounds for calling the other back: they use the alarm volume. */
  export const Alarm: {
    /** `echo`: played by whoever sent it, and then it comes out quietly */
    play(name: string, echo?: boolean, maxMs?: number): Promise<boolean>;
    stop(): Promise<boolean>;
    list(): Promise<string[]>;
  };

  export const Volume: {
    /** in the channel the app takes the volume keys; outside it leaves them */
    takeKeys(active: boolean): Promise<boolean>;
    /** `cb(+1|-1)` when the system volume did not move */
    subscribe(cb: (direction: number) => void): () => void;
    /** the phone's call volume, and its maximum */
    read(): Promise<{ volume: number; max: number }>;
    /** puts it at an exact value */
    set(value: number): Promise<boolean>;
    /** `cb(value)` when the call volume changes, from outside as well */
    listenToSystem(cb: (value: number) => void): () => void;
  };

  /** La lingua a cui è impostato il telefono, in due lettere. */
  export const Locale: {
    language: string;
    current(): Promise<string>;
  };

  /** When something covers the screen: a pocket, a closed case. */
  export const Proximity: {
    get(): Promise<boolean>;
    subscribe(cb: (covered: boolean) => void): () => void;
  };

  /** A beat every minute, arriving with the screen off too. */
  export const Heartbeat: {
    subscribe(cb: () => void): () => void;
    /** close together while without a server, far apart when connected */
    fast(quick: boolean): Promise<boolean>;
  };

  /** The phone's changes of network: cell, wifi, new address. */
  export const Network: {
    subscribe(cb: (what: string) => void): () => void;
    /** "on this network the traffic does not get through, check it now" */
    reportNotCarrying(): Promise<boolean>;
  };

  /** Android foreground service: keeps presence in the channel alive. */
  export const Foreground: {
    start(text?: string, withCamera?: boolean): Promise<boolean>;
    setCameraActive(active: boolean): Promise<boolean>;
    /** text of the standing notification, and the connection name to put in front */
    setText(text: string, name?: string): Promise<boolean>;
    stop(): Promise<boolean>;
    notify(name: string, text: string): Promise<boolean>;
    /** quiet news: it does not sound and does not buzz */
    note(name: string, text: string): Promise<boolean>;
    /** takes the news away when it is not true any more */
    clearNote(): Promise<boolean>;
    /** starts listening without an interface, when the app is about to go */
    resumePresence(): Promise<boolean>;
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

  /** The alert's vibration and sound. */
  export const Alerts: {
    configure(
      vibration: 'default' | 'always' | 'never',
      sound: 'default' | 'none' | 'chosen',
      uri?: string,
    ): Promise<boolean | string>;
    pickSound(currentUri?: string): Promise<{ uri: string; name: string } | null>;
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
