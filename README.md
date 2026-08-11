# DuoTalk

Un mini "Discord" fatto su misura per **due sole persone**. Non è un'app per *chiamare*:
è un **canale permanente**. Apri l'app e sei dentro; se c'è anche l'altro vi collegate da
soli, altrimenti resti raggiungibile e vieni avvisato appena arriva.

Audio e video viaggiano **cifrati end-to-end direttamente tra i due telefoni**. Il tuo
server serve solo a farvi trovare: **non può leggere nulla**.

## Come si installa, dal punto di vista di chi la usa

1. Installi l'app
2. Scrivi il nome del tuo server
3. Su un telefono premi «Crea il codice», sull'altro digiti le otto cifre che appaiono
4. Concedi due impostazioni di sistema, che l'app ti spiega e ti apre

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
- **Anche dopo un riavvio del telefono**: la presenza riparte da sola, senza aprire l'app.
- **Audio subito, video a richiesta**: entrando si apre il microfono; la camera si accende
  solo se la vuoi, e quando la spegni viene rilasciata davvero.
- **Si riprende da solo**: se la rete cade, al ritorno il collegamento si ricostruisce in
  circa un secondo, senza toccare nulla.

## Struttura

```
duotalk/
├── server/              # Signaling WebSocket
│   ├── src/index.js     # presenza, stati, inoltro buste, relay TURN
│   ├── smoke-test.mjs   # 29 controlli end-to-end
│   ├── tools/           # stun-check.mjs: verifica il relay dall'esterno
│   └── deploy/          # haproxy, apache, nginx, coturn, systemd
├── app/                 # App Android in React Native
│   ├── src/             # accoppiamento, crypto, signaling, webrtc, UI
│   ├── modules/duotalk-platform/   # modulo nativo Kotlin
│   ├── bootstrap.sh     # genera la parte nativa Android
│   └── scripts/         # sincronizzazione moduli, numero di build, manifest
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

Poi esponilo in HTTPS dietro il proxy che già hai, e aggiungi `coturn` per quando i due
telefoni sono su reti diverse — tutto in [docs/DEPLOY.md](docs/DEPLOY.md).

### App Android

Prerequisiti: Node 18+, JDK 17, Android SDK (`ANDROID_HOME`).

```bash
cd app
./bootstrap.sh          # crea android/, applica manifest e permessi, npm install
npm run build:apk       # APK di release, con numero di build incrementato
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Il numero di build compare **in alto a destra nell'app**. Con installazioni frequenti è
facile provare a lungo un APK vecchio credendolo nuovo: se segnali un problema, dì anche
quel numero.

Su alcuni telefoni (Xiaomi, POCO) `adb install` è bloccato finché non abiliti
*Opzioni sviluppatore → Installazione tramite USB*. In alternativa copia l'APK sul
telefono e aprilo dal gestore file.

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

Dettale il codice **a voce o di persona**, non per messaggio. Dopo l'accoppiamento non
conta più nulla.

## L'interfaccia

Cinque pulsanti in un pannello scuro in basso, sempre presenti. Dopo 4 secondi si
attenuano al 40% per non coprire l'immagine e tornano pieni al primo tocco ovunque;
restano premibili anche da attenuati.

| Pulsante | Cosa fa |
|---|---|
| **Video** | accende/spegne la camera |
| **Audio** | tocco: muto. **Pressione prolungata**: da dove esce l'audio |
| **Gira** | frontale ↔ posteriore; spento se il video è off |
| **Avvisa** | richiama l'altro: vale anche se è già nel canale ma distratto |
| **Esci** | lascia il canale e chiude la finestra, restando raggiungibile |

Le uscite audio possibili sono quattro e non di più: **vivavoce**, **telefono**
(l'altoparlantino), **cuffie**, **Bluetooth**. Compaiono solo quelle collegate, e la
scelta viene **ricordata** per la volta successiva.

### Video

- **Non si trasmette a chi non guarda**: quando l'app dell'altro sparisce dallo schermo, il
  tuo telefono smette di spedire il video e riprende appena torna. La camera resta accesa
  per l'anteprima, ma la banda non se ne va verso uno schermo spento. In
  Picture-in-Picture il video continua: lì lo stai guardando davvero.
- Chi è a schermo intero **non viene mai tagliato**: eventuali bande nere sono il prezzo
  dell'immagine integra.
- Il riquadrino ha **sempre le proporzioni della sua camera**, mai quadrato. È
  trascinabile e ridimensionabile: maniglia d'angolo o due dita.
- **Toccandolo i due si scambiano** di posto. La disposizione scelta **sopravvive alle
  interruzioni**: nulla si sposta quando la rete va e viene.
- **Pizzico per ingrandire** fino a 5×, trascinamento per spostarti dentro
  l'ingrandimento, doppio tocco per tornare a schermo pieno.
- Durante un'interruzione compare un avviso e il riquadro resta al suo posto, vuoto: la
  disposizione non cambia mai.

### Quando non c'è video

Al posto dell'immagine compare un **volto generato dalla coppia**: un colore e un
simbolo che restano sempre gli stessi, diversi sui due telefoni. Non è casuale a ogni
apertura, così diventa riconoscibile come "lui". Se hai scritto un nome vince l'iniziale.
L'anello diventa verde quando l'altro è nel canale.

### Tasto Indietro

Non fa uscire dal canale: mette l'app nella **finestrella Picture-in-Picture**, che resta
sopra le altre app mentre continui a parlare.

## Restare raggiungibili

Un *foreground service* tiene viva la connessione anche in background e a schermo spento,
e mostra una **notifica fissa**: non è rimovibile, è Android che la impone in cambio del
diritto di restare attivi.

Dopo un **riavvio del telefono** la presenza riparte da sola: un ricevitore avvia il
motore JavaScript senza aprire l'interfaccia. Servono qualche decina di secondi perché il
sistema dia spazio all'app, quindi un avviso mandato subito dopo il riavvio può ancora
non trovarla.

⚠️ **Due impostazioni di sistema sono indispensabili**, e l'app le propone alla fine
dell'accoppiamento (riapribili da *ingranaggio → Restare raggiungibili*):

1. **Uso senza restrizioni di batteria**. Su Xiaomi, Huawei e Oppo questa è gestita dal
   produttore e non da Android: la spunta nell'app può restare grigia anche dopo averla
   impostata correttamente.
2. **Avvio automatico**. Non è un'autorizzazione di Android ma una schermata proprietaria:
   l'app può solo aprirtela, e non può sapere se l'hai attivata. **Senza, dopo un riavvio
   il telefono non consegna nemmeno l'evento di avvio** e la presenza non riparte.

## Sicurezza

- ✅ Audio/video cifrati end-to-end, anche quando passano dal TURN.
- ✅ Signaling cifrato e autenticato: il server non può leggerlo né alterarlo.
- ✅ La chiave è a 256 bit e nasce da uno scambio Diffie-Hellman, non da una password.
- ✅ Massimo due presenze per coppia; coppie diverse non si vedono fra loro.
- ⚠️ Il momento delicato è **solo l'accoppiamento**: proteggi il codice mentre lo detti.
- ⚠️ Il server vede i **metadati**: quali coppie sono connesse e quando, non cosa vi dite.

Modello di minaccia completo in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Diagnosticare un problema

L'app registra tutto quello che serve. Con il telefono collegato:

```bash
adb logcat -s ReactNativeJS | grep duotalk
```

Tre famiglie di righe: `duotalk-rtc` per il collegamento audio/video, `duotalk-sig` per la
connessione al server (comprese le cadute, con codice e durata), `duotalk-presenza` per
l'ascolto dopo il riavvio.

La riga più utile quando qualcosa cade è `percorso:`, che dice da dove sta passando il
traffico — `LOCALE (stessa rete)`, `DIRETTO attraverso NAT` o `RELAY (passa dal server)`.
Le tre strade hanno fragilità diverse, e senza saperlo si finisce per incolpare la cosa
sbagliata.

Con due telefoni collegati serve indicare quale: `adb -s <seriale> logcat …`

Se l'app dovesse chiudersi da sola, lo stack è minificato e va tradotto:

```bash
adb logcat -b crash -d | tail -40 > /tmp/stack.txt
npx metro-symbolicate app/android/app/build/generated/sourcemaps/react/release/index.android.bundle.map < /tmp/stack.txt
```

## Licenza

Uso personale.
