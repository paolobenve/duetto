# DuoTalk

Un mini "Discord" fatto su misura per **due sole persone**. Non è un'app per
*chiamare*: è un **canale permanente**. Apri l'app e sei dentro; se c'è anche l'altro
vi collegate da soli, altrimenti resti lì ad aspettare — e puoi **avvisarlo** che sei
arrivato, con una notifica che gli arriva anche ad app chiusa.

Audio e video viaggiano **cifrati end-to-end direttamente tra i due telefoni**. Il tuo
server serve solo a farvi trovare e a suonare il campanello: **non può leggere nulla**.

## Come funziona

```
  Telefono A  ⇄  [ tuo server: signaling + ntfy (campanello) + TURN ]  ⇄  Telefono B
      └──────────────  audio/video P2P cifrato (DTLS-SRTP)  ──────────────┘
```

- **Canale, non chiamata**: entri e resti. Il server tiene la presenza (max 2).
- **Resti dentro anche in background e a schermo spento**, grazie a un *foreground
  service* Android (il modulo nativo `app/modules/duotalk-foreground`). Esci dal canale
  solo chiudendo l'app o scartandola dai recenti.
- **Audio subito, video a richiesta**: entrando si apre il microfono; la camera si
  accende solo se la vuoi — e quando la spegni viene **rilasciata davvero**.
- **Campanello ntfy**: quando entri nel canale e l'altro non c'è, il server pubblica una
  notifica sul suo topic ntfy. Toccandola si apre DuoTalk. C'è anche un pulsante
  **Avvisa** per richiamarlo quando vuoi.
- **Cifratura**: il media è cifrato da WebRTC (DTLS-SRTP). In più il **signaling stesso**
  (SDP/ICE) è cifrato con una passphrase nota solo ai due telefoni, quindi il server
  inoltra buste opache e non può fare da man-in-the-middle.

## Struttura

```
duotalk/
├── server/              # Signaling WebSocket + push ntfy
│   ├── src/index.js     # presenza nel canale, inoltro buste, campanello
│   ├── src/ntfy.js      # pubblicazione notifiche
│   ├── smoke-test.mjs   # test end-to-end del server
│   └── deploy/          # nginx, apache, coturn, systemd
├── app/                 # App Android in React Native
│   ├── src/             # crypto, signaling, webrtc, UI del canale
│   ├── bootstrap.sh     # genera la parte nativa Android
│   └── scripts/
└── docs/                # architettura e guida al deploy
```

## Avvio rapido

### 1. Server

```bash
cd server
cp .env.example .env
# genera il token:  openssl rand -base64 32   -> mettilo in ACCESS_TOKEN
# imposta NTFY_URL con l'indirizzo del tuo ntfy
npm install
npm start                 # ascolta su 127.0.0.1:8787
npm run test:smoke        # verifica che tutto funzioni
```

Poi esponilo in HTTPS dietro il tuo reverse proxy e installa **ntfy** e **coturn**:
tutti i passaggi sono in [docs/DEPLOY.md](docs/DEPLOY.md).

### 2. App Android (su entrambi i telefoni)

Prerequisiti: Node 18+, JDK 17+, Android SDK (`ANDROID_HOME`).

```bash
cd app
./bootstrap.sh     # crea android/, applica permessi e deep link, npm install
npm start          # bundler Metro
npm run android    # compila e installa sul telefono collegato
```

Per il secondo telefono conviene un APK: `npm run build:apk`
(→ `android/app/build/outputs/apk/release/`).

Installa anche l'**app ntfy** su entrambi i telefoni e iscrivi ciascuno al proprio topic.

### 3. Configurazione

Valori **identici** sui due telefoni:

| Campo | Cosa metterci |
|-------|---------------|
| Server | `wss://TUO_DOMINIO/duotalk/ws` |
| Access token | lo stesso di `ACCESS_TOKEN` nel `.env` |
| Nome del canale | es. `casa` |
| Passphrase | segreto lungo e casuale, scambiato a voce |

Valori **incrociati** (quello che per uno è "mio" per l'altro è "dell'altro"):

| Telefono di Anna | Telefono di Bruno |
|---|---|
| Il tuo topic: `duotalk-anna-x7k2` | Il tuo topic: `duotalk-bruno-9m4p` |
| Topic dell'altro: `duotalk-bruno-9m4p` | Topic dell'altro: `duotalk-anna-x7k2` |

Ogni telefono si iscrive **al proprio** topic nell'app ntfy. Usa nomi lunghi e casuali:
su ntfy chi conosce il nome di un topic può leggerlo (a meno di attivare l'autenticazione,
consigliata e spiegata in DEPLOY).

## Sicurezza

- ✅ Audio/video cifrati end-to-end, anche quando passano dal TURN.
- ✅ Signaling cifrato e autenticato: il server non può leggerlo né alterarlo.
- ✅ Massimo due presenze per canale, protette da token.
- ⚠️ Tutto dipende dalla **passphrase**: lunga, casuale, scambiata di persona.
- ⚠️ Le notifiche ntfy contengono solo `"<nome> è nel canale"` — nessun contenuto della
  conversazione — ma passano dal server ntfy: tienilo tuo e con autenticazione attiva.
- ⚠️ Il server vede i **metadati**: chi è connesso e quando, non cosa vi dite.

Dettagli e modello di minaccia in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Video: come viene mostrato

- Chi è **a schermo intero non viene mai tagliato** (`objectFit: contain`): se le
  proporzioni non combaciano si vedono bande nere, ma l'immagine resta integra.
- Il secondo video sta in un **riquadrino trascinabile**: spostalo dove vuoi, resta
  dentro i bordi dello schermo.
- **Toccando il riquadrino i due si scambiano**: vai tu a schermo intero e l'altro nel
  riquadrino, e toccando di nuovo torni indietro.
- Se **uno solo** dei due ha il video acceso, quello va a schermo intero e il riquadrino
  non compare.
- Se nessuno ha il video, al posto dell'immagine c'è lo stato della presenza.

Il riquadrino usa `cover` (riempie, quindi ritaglia un po') perché è una miniatura: se
lo vuoi integro anche lì, cambia `PIP_FIT` in `app/src/VideoStage.tsx`.

## I quattro pulsanti

In basso, **sempre presenti**: `Video`, `Audio`, `Avvisa`, `Esci`. Non spariscono mai —
dopo 4 secondi di inattività si attenuano al 40% per non coprire l'immagine, e tornano
pieni al primo tocco ovunque sullo schermo. Restano premibili anche da attenuati: il
tocco esegue subito l'azione, non serve svegliarli prima.

| Pulsante | Cosa fa |
|---|---|
| **Video** | accende/spegne la camera. **Tenendo premuto**: passa da frontale a posteriore |
| **Audio** | mette in muto il microfono |
| **Avvisa** | manda la notifica all'altro; disattivato se è già nel canale |
| **Esci** | lascia il canale, ferma il servizio e torna alle impostazioni |

Le soglie si regolano da `IDLE_MS` e `DIM_OPACITY` in `app/src/ChannelScreen.tsx`.

## Permessi

Microfono, camera e notifiche vengono chiesti **tutti insieme al primo avvio**, non
spezzettati durante l'uso: dopo la prima volta Android non li richiede più.

Non è possibile concederli **all'installazione**: da Android 6 questi sono *runtime
permissions* e il sistema impone di chiederli all'utente mentre l'app gira. Nessuna app
può aggirarlo — chiederli tutti al primo avvio è il massimo consentito.

## Restare nel canale in background

Il *foreground service* mostra una **notifica fissa** ("Sei nel canale"): non è
rimovibile, è Android che la impone in cambio del diritto di restare attivi. Da Android
14 il tipo `microphone` è anche l'unico modo consentito per usare il microfono fuori dal
primo piano; quando accendi il video il servizio aggiunge il tipo `camera`.

Su molti telefoni (Xiaomi, Huawei, Samsung, OnePlus…) serve comunque **escludere DuoTalk
dall'ottimizzazione della batteria**, altrimenti il sistema lo chiude lo stesso:
*Impostazioni → App → DuoTalk → Batteria → Senza restrizioni*.

Un `PARTIAL_WAKE_LOCK` (con scadenza di sicurezza a 8 ore) tiene sveglia la CPU mentre
sei nel canale. Ha un costo in batteria: è il prezzo di restare sempre raggiungibile.
