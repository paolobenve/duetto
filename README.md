# DuoTalk

Un mini "Discord" fatto su misura per **due sole persone**. Non è un'app per
*chiamare*: è un **canale permanente**. Apri l'app e sei dentro; se c'è anche l'altro
vi collegate da soli, altrimenti resti in ascolto — e vieni avvisato appena arriva.

Audio e video viaggiano **cifrati end-to-end direttamente tra i due telefoni**. Il tuo
server serve solo a farvi trovare: **non può leggere nulla**.

## Come si installa, dal punto di vista di chi la usa

1. Installi l'app
2. Scrivi il nome del tuo server
3. Su un telefono premi «Crea il codice», sull'altro digiti le otto cifre che appaiono

Fatto, per sempre. Nessun altro servizio da installare, nessuna password da inventare,
nessun canale o passphrase da tenere uguali.

## Come funziona

```
  Telefono A  ⇄  [ tuo server: signaling + TURN di riserva ]  ⇄  Telefono B
      └──────────  audio/video P2P cifrato (DTLS-SRTP)  ──────────┘
```

- **Canale, non chiamata**: entri e resti. Il server tiene la presenza, massimo due.
- **Sempre raggiungibile**: fuori dal canale l'app resta *in ascolto* — microfono chiuso,
  connessione aperta — e ti avvisa quando l'altro entra. La notifica se la mostra l'app
  stessa: nessun servizio di terzi, nessun Firebase.
- **Audio subito, video a richiesta**: entrando si apre il microfono; la camera si accende
  solo se la vuoi, e quando la spegni viene rilasciata davvero.
- **Cifratura**: il media è cifrato da WebRTC (DTLS-SRTP). In più lo è anche il
  **signaling** (SDP/ICE), con la chiave nata dall'accoppiamento: il server inoltra buste
  opache e non può mettersi in mezzo.

## Struttura

```
duotalk/
├── server/              # Signaling WebSocket
│   ├── src/index.js     # presenza, stati listening/active, inoltro buste
│   ├── smoke-test.mjs   # 21 controlli end-to-end
│   └── deploy/          # haproxy, apache, nginx, coturn, systemd
├── app/                 # App Android in React Native
│   ├── src/             # accoppiamento, crypto, signaling, webrtc, UI
│   ├── modules/duotalk-platform/   # modulo nativo Kotlin
│   ├── bootstrap.sh     # genera la parte nativa Android
│   └── scripts/
└── docs/                # architettura e guida al deploy
```

## Avvio rapido

### Server

```bash
cd server
cp .env.example .env      # va bene com'è: il token è facoltativo
npm install
npm run test:smoke        # deve stampare TUTTO OK
npm start
```

Poi esponilo in HTTPS dietro il proxy che già hai — vedi
[docs/DEPLOY.md](docs/DEPLOY.md), che copre HAProxy, Apache e nginx. L'app si collegherà
a `wss://TUODOMINIO/duotalk/ws`.

### App Android

Prerequisiti: Node 18+, JDK 17, Android SDK (`ANDROID_HOME`).

```bash
cd app
./bootstrap.sh          # crea android/, applica manifest e permessi, npm install
npm run build:apk       # APK di release
adb install -g -r android/app/build/outputs/apk/release/app-release.apk
```

Il flag `-g` di `adb` concede tutti i permessi all'installazione, evitando le richieste
al primo avvio. Per il secondo telefono basta copiare lo stesso APK.

## L'accoppiamento

Chi crea la coppia riceve **otto cifre**. L'altro le digita. Da lì in poi i due telefoni
sono accoppiati per sempre e il codice non serve più: buttalo.

Cosa succede sotto:

1. Dal codice si ricava `pairId`, l'unica cosa che il server vede. Il codice **non gli
   arriva mai**.
2. I due telefoni si scambiano chiavi pubbliche e fanno un Diffie-Hellman (X25519),
   mescolando il codice nella derivazione.
3. Ognuno manda una prova di possesso della chiave. Se il codice digitato è sbagliato la
   prova non torna e l'accoppiamento **fallisce dicendolo**, invece di lasciarvi con una
   connessione muta.

Dettale il codice **a voce o di persona**, non per messaggio: chi lo intercetta mentre vi
state accoppiando, e sa anche dov'è il vostro server, potrebbe prendere il posto
dell'altro. Dopo l'accoppiamento non conta più nulla.

## L'interfaccia

**In ascolto** — microfono chiuso, connessione aperta. Vedi se l'altro è raggiungibile,
puoi avvisarlo, e c'è l'ingranaggio per le impostazioni.

**Nel canale** — sei dentro. Sei pulsanti sempre presenti in basso, che dopo 4 secondi si
attenuano al 40% per non coprire l'immagine e tornano pieni al primo tocco ovunque:

| Pulsante | Cosa fa |
|---|---|
| **Video** | accende/spegne la camera |
| **Audio** | mette in muto il microfono |
| **Gira** | frontale ↔ posteriore; spento se il video è off |
| **Uscita audio** | cicla fra vivavoce, auricolare, cuffie, Bluetooth |
| **Avvisa** | manda la notifica all'altro; spento se è già nel canale |
| **Esci** | torna in ascolto |

L'uscita audio scelta viene **ricordata** e ripristinata al rientro, se quel dispositivo è
ancora collegato. L'app non decide mai di testa sua.

### Video

- Chi è a schermo intero **non viene mai tagliato** (`contain`): eventuali bande nere sono
  il prezzo dell'immagine integra.
- Il riquadrino ha **sempre le proporzioni della sua camera**, mai quadrato. È
  trascinabile e ridimensionabile: maniglia nell'angolo o due dita.
- **Toccandolo i due si scambiano** di posto.
- Se uno solo ha il video acceso, quello va a schermo intero e il riquadrino non compare.

### Tasto Indietro

Non fa uscire dal canale: mette l'app nella **finestrella Picture-in-Picture**, che resta
sopra le altre app mentre continui a parlare. Dentro la finestrella restano solo i video.

## Sicurezza

- ✅ Audio/video cifrati end-to-end, anche quando passano dal TURN.
- ✅ Signaling cifrato e autenticato: il server non può leggerlo né alterarlo.
- ✅ La chiave è a 256 bit e nasce da uno scambio Diffie-Hellman, non da una password.
- ✅ Massimo due presenze per coppia; coppie diverse non si vedono fra loro.
- ⚠️ Il momento delicato è **solo l'accoppiamento**: proteggi il codice mentre lo detti.
- ⚠️ Il server vede i **metadati**: quali coppie sono connesse e quando, non cosa vi dite.

Modello di minaccia completo in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Restare raggiungibili

Un *foreground service* tiene viva la connessione anche in background e a schermo spento,
e mostra una **notifica fissa** ("In ascolto" / "Sei nel canale"): non è rimovibile, è
Android che la impone in cambio del diritto di restare attivi.

Su molti telefoni (Xiaomi, Huawei, Samsung, OnePlus…) serve comunque **escludere DuoTalk
dall'ottimizzazione della batteria**: *Impostazioni → App → DuoTalk → Batteria → Senza
restrizioni*.

**Limite attuale**: dopo un riavvio del telefono bisogna aprire l'app una volta per
rimetterla in ascolto. La connessione vive ancora nel JavaScript; spostarla nel servizio
nativo con un ricevitore di avvio è il prossimo passo.

## Licenza

Uso personale.
