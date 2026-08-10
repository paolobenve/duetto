// Dichiarazioni per i moduli senza tipi propri.

declare module 'tweetnacl-util' {
  export function decodeUTF8(s: string): Uint8Array;
  export function encodeUTF8(a: Uint8Array): string;
  export function encodeBase64(a: Uint8Array): string;
  export function decodeBase64(s: string): Uint8Array;
}

declare module 'duotalk-foreground' {
  /** Foreground service Android: tiene viva la presenza nel canale. */
  const Foreground: {
    start(text?: string, withCamera?: boolean): Promise<boolean>;
    setCameraActive(active: boolean): Promise<boolean>;
    setText(text: string): Promise<boolean>;
    stop(): Promise<boolean>;
  };
  export default Foreground;
}
