# DuoTalk

Un mini "Discord" fatto su misura per **due sole persone**: chiamate **audio e video**
tra due telefoni Android, con traffico **cifrato end-to-end direttamente tra i due
dispositivi**. Il tuo server serve solo a farvi trovare (signaling) e, se serve, come
relay di fallback — ma **non può leggere né audio/video né i dati di connessione**.

## Come funziona (in breve)

```
  Telefono A  ⇄  [ tuo server: signaling (postino) + TURN (relay) ]  ⇄  Telefono B
      └──────────────  media audio/video P2P cifrato (DTLS-SRTP)  ──────────────┘
```

- **Media (audio/video)**: WebRTC li cifra sempre end-to-end (DTLS-SRTP). Quando la rete
  lo permette vanno **diretti** da telefono a telefono; altrimenti passano dal tuo **TURN**
  (coturn), restando comunque cifrati e illeggibili per il server.
- **Signaling (lo scambio iniziale per "trovarsi")**: i parametri WebRTC (SDP/ICE) vengono
  **cifrati con una passphrase condivisa** nota solo ai due telefoni, con NaCl secretbox.
  Il server inoltra buste opache: non può leggerle né alterarle (niente man-in-the-middle).
- **Solo due utenti**: ogni "stanza" accetta al massimo 2 dispositivi; un eventuale terzo
  viene rifiutato. Un token condiviso fa da ulteriore barriera anti-abuso.

## Struttura del repository

```
duotalk/
├── server/              # Signaling server Node.js (WebSocket) + config di deploy
│   ├── src/index.js
│   └── deploy/          # nginx, apache, coturn, systemd
├── app/                 # App Android in React Native
│   ├── src/             # Tutta la logica: crypto, signaling, webrtc, UI
│   ├── bootstrap.sh     # Genera la parte nativa Android e installa le dipendenze
│   └── scripts/
└── docs/                # Architettura e guida al deploy dettagliata
```

## Avvio rapido

### 1. Server (sul tuo host)

```bash
cd server
cp .env.example .env
# genera un token: openssl rand -base64 32  -> mettilo in ACCESS_TOKEN
npm install
npm start          # ascolta su 127.0.0.1:8787
```

Poi esponilo in HTTPS dietro il tuo reverse proxy (vedi `server/deploy/` e
[docs/DEPLOY.md](docs/DEPLOY.md)). L'app si collegherà a `wss://TUO_DOMINIO/duotalk/ws`.

Per la connettività su reti difficili, installa **coturn** con
`server/deploy/coturn.conf.example`.

### 2. App Android (per ciascuno dei due telefoni)

Prerequisiti: Node 18+, un JDK 17+, Android SDK (`ANDROID_HOME`).

```bash
cd app
./bootstrap.sh     # crea android/, applica i permessi, npm install
npm start          # avvia il bundler Metro
npm run android    # compila e installa sul telefono collegato
```

Per un APK da installare a mano sul secondo telefono:

```bash
npm run build:apk  # -> android/app/build/outputs/apk/release/app-release.apk
```

### 3. Configurazione (uguale sui due telefoni)

All'avvio l'app chiede:

| Campo | Cosa metterci |
|-------|---------------|
| **Server** | `wss://TUO_DOMINIO/duotalk/ws` |
| **Access token** | lo stesso valore di `ACCESS_TOKEN` nel `.env` del server |
| **Stanza** | un nome qualsiasi, **identico** sui due telefoni (es. `casa`) |
| **Passphrase** | segreto condiviso, lungo e casuale — **non lasciarlo passare dal server** |
| TURN (opzionale) | url/utente/password del tuo coturn |

Quando entrambi i telefoni sono nella stessa stanza con la stessa passphrase, la chiamata
parte da sola. In chiamata puoi: **mutare il microfono**, **togliere/mettere il video**,
**cambiare camera**, **chiudere**.

## Sicurezza — cosa garantisce e cosa no

- ✅ Audio/video cifrati end-to-end (WebRTC/DTLS-SRTP), anche se passano dal TURN.
- ✅ Signaling cifrato e autenticato con la passphrase: il server non fa MITM.
- ✅ Massimo due partecipanti per stanza.
- ⚠️ La sicurezza dipende dalla **robustezza della passphrase**: scegline una lunga e
  scambiala di persona/a voce, mai via canali insicuri.
- ⚠️ Il server (metadati): vede *che* due dispositivi sono connessi e *quando*, ma non i
  contenuti. Usa sempre HTTPS/WSS sul reverse proxy.

Dettagli in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Licenza

Uso personale. Vedi il file, adattalo alle tue esigenze.
