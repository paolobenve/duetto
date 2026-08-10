// Dichiarazioni per i moduli senza tipi propri.

declare module 'tweetnacl-util' {
  export function decodeUTF8(s: string): Uint8Array;
  export function encodeUTF8(a: Uint8Array): string;
  export function encodeBase64(a: Uint8Array): string;
  export function decodeBase64(s: string): Uint8Array;
}

declare module 'duotalk-platform' {
  /** Foreground service Android: tiene viva la presenza nel canale. */
  export const Foreground: {
    start(text?: string, withCamera?: boolean): Promise<boolean>;
    setCameraActive(active: boolean): Promise<boolean>;
    setText(text: string): Promise<boolean>;
    stop(): Promise<boolean>;
    notify(title: string, text: string): Promise<boolean>;
    clearNotification(): Promise<boolean>;
  };

  /** Picture-in-Picture di sistema. */
  export const Pip: {
    isSupported(): Promise<boolean>;
    enter(aspect?: number): Promise<boolean>;
  };
}
