# Architettura di Duetto

## Modello: canale, non chiamata

Non esiste il concetto di "chiamare" o "rispondere". Esiste un **canale permanente** per
una coppia. Ci entri, ci resti, e quando entra anche l'altro il collegamento si stabilisce
da solo. È un canale vocale Discord ridotto a due posti.

Ne conseguono tre cose:

1. **La presenza è lo stato principale** dell'interfaccia: "sei solo" / "ci siete
   entrambi", non "sta squillando".
2. **Serve un modo di avvisare**, perché l'altro potrebbe non avere l'app aperta.
3. **La connessione al server dev'essere permanente**, non legata alla schermata.

## I due stati

Ogni telefono tiene **una** connessione al signaling, in uno di due stati:

| Stato | Cosa significa |
|---|---|
| `listening` | raggiungibile ma fuori dal canale: microfono chiuso, nessun media |
| `active` | dentro il canale: si negozia il WebRTC |

Passare dall'uno all'altro **non riconnette nulla**: cambia solo lo stato dichiarato al
server. È quello che rende la presenza continua invece che a intermittenza.

Quando qualcuno passa a `active` mentre l'altro sta solo ascoltando, il server manda
`notify` e l'app **si mostra da sé** la notifica. Nessun servizio esterno, nessun
Firebase, nessuna app di terzi da configurare. Chi è già nel canale non viene notificato:
se ne accorge da solo, e sarebbe rumore.

## Componenti

### 1. Signaling (`server/src/index.js`)

WebSocket minimale in Node.js. Fa quattro cose:

- **Presenza**: ogni stanza accetta al massimo 2 connessioni; la terza riceve `room-full`.
- **Riaggancio**: il lato della coppia (`A`/`B`) identifica il *dispositivo*, non la
  connessione. Chi si riaggancia dopo un calo di rete si riprende il proprio posto,
  congedando la connessione precedente: senza questo, il server non avrebbe ancora
  dichiarato morta la vecchia e il telefono si vedrebbe respinto come un terzo
  dispositivo per un minuto buono. All'altro non risulta nessuna uscita.
- **Inoltro**: gira i messaggi `signal` da un peer all'altro **senza leggerne il
  contenuto**, e i messaggi `pair` durante l'accoppiamento.
- **Avvisi**: `notify` quando qualcuno entra nel canale o preme "Avvisa" (con un freno di
  15 secondi contro le pressioni ripetute).
- **Relay**: le credenziali del TURN stanno nel `.env` del server, che le comunica ai
  telefoni nel messaggio di ingresso. Sui dispositivi non si configura nulla, e cambiando
  la password non si deve rimettere mano a ognuno.
- **Freno agli ingressi**: 30 al minuto per indirizzo. Non dà fastidio a nessuno, e rende
  impraticabile provare codici di accoppiamento a tappeto.

La stanza si chiama `pairId`. Coppie diverse hanno `pairId` diversi e non si vedono fra
loro: lo stesso server serve quante coppie vuoi.

### 2. Accoppiamento (`app/src/pairing.ts`)

Chi crea la coppia riceve **otto cifre**; l'altro le digita.

```
Telefono A                    SERVER                    Telefono B
codice: 8147 1828                                    codice digitato
    │                                                        │
    ├── pairId = KDF_lento(codice) ──▶ stanza ◀── pairId = KDF_lento(codice)
    │                              (vede solo questo)         │
    ├── chiave pubblica A ─────────▶ inoltra ────────────────▶│
    │◀──────────────────────────── inoltra ◀── chiave pubblica B
    │                                                        │
  chiave = KDF(Diffie-Hellman, codice)      chiave = KDF(Diffie-Hellman, codice)
    │                                                        │
    ├── prova(chiave, "A") ────────▶ inoltra ───────────────▶│ verifica
    │ verifica ◀───────────────────── inoltra ◀── prova(chiave, "B")
```

Tre proprietà, e il motivo di ciascuna:

**Il codice non arriva mai al server.** Ci arriva solo `pairId`, la sua impronta.

**Il calcolo di `pairId` è un po' costoso, ma non troppo.** Otto cifre sono solo 10⁸
combinazioni: con un hash normale il server potrebbe provarle tutte in pochi secondi.
Rallentare il calcolo alza quel costo, ma lo alza anche per noi: la prima versione, a
200.000 giri, faceva aspettare dieci secondi a ogni accoppiamento, e non era accettabile.

Ora sono 6.000 giri, una frazione di secondo, e la difesa contro chi prova codici a
tappeto sta dove costa a chi attacca e non a chi usa l'app: il **server limita gli
ingressi** (30 al minuto per indirizzo) e l'**app impone 20 secondi** prima di ritentare
dopo un fallimento.

Il limite che ne deriva è dichiarato: un server ostile, che vede `pairId`, potrebbe
risalire a un codice di 8 cifre e inserirsi *durante* l'accoppiamento. Dopo, la chiave è a
256 bit. La contromisura, se servisse, è allungare il codice — non rallentare il calcolo.

**La chiave non deriva dal codice.** Nasce da uno scambio X25519 con il codice mescolato
nella derivazione. Chi ascolta non può calcolarla (non ha i segreti privati); chi volesse
mettersi in mezzo dovrebbe conoscere il codice, e le prove finali lo smaschererebbero.
Le due prove sono diverse per i due lati, così nessuno può rimandare indietro quella
dell'altro. Finito l'accoppiamento la chiave è a 256 bit e la debolezza del codice non
conta più.

### 3. Cifratura del signaling (`app/src/crypto.ts`)

- **NaCl secretbox** (XSalsa20-Poly1305), nonce casuale a 24 byte per messaggio.
- Il ciphertext è **autenticato**: qualsiasi manomissione fa fallire l'apertura.

Il server vede solo base64 opaco. Non potendo leggere né riscrivere gli SDP, non può
sostituire il **fingerprint DTLS**, che è ciò che gli permetterebbe di inserirsi nel
mezzo.

### 4. Media (`app/src/webrtc.ts`)

- Entrando si apre **solo il microfono**. La camera si accende su richiesta e spegnendola
  si fa `removeTrack` + `track.stop()`: viene rilasciata davvero, e l'indicatore privacy
  di Android si spegne.
- Il **canale video viene aperto subito**, anche vuoto: accendere la camera si limita a
  metterci dentro la traccia (`replaceTrack`). Nessuna rinegoziazione, nessuna traccia che
  si accumula. Aggiungere e togliere la traccia a ogni accensione — l'approccio iniziale —
  produceva tracce nuove che si accavallavano alle vecchie, e il renderer finiva per
  disegnare quella morta: schermo nero.
- **Offre sempre e solo una delle due parti**. Il ruolo viene dal lato dell'accoppiamento
  (`A` = risponde, `B` = offre), non dall'ordine di arrivo nella stanza: quello cambia a
  ogni riaggancio, e bastavano due riconnessioni sfortunate perché entrambi si credessero
  l'offerente e le offerte si scontrassero.
- Chi risponde trova il canale video creato **in sola ricezione** — è così che WebRTC crea i
  canali derivati da un'offerta altrui — e lo porta a `sendrecv` *prima* di preparare la
  risposta, così la direzione corretta viaggia nella stessa negoziazione. Senza, quel
  telefono vedrebbe il video dell'altro ma non riuscirebbe a inviare il proprio.
- Gli **ICE candidate** arrivati prima della remote description finiscono in coda e
  vengono applicati dopo, altrimenti andrebbero persi.
- Un messaggio cifrato `state` comunica all'altro se hai mic/camera attivi e **con quali
  proporzioni** stai inquadrando.
- **Non si trasmette a chi non guarda.** Quando l'app dell'altro sparisce dallo schermo,
  chi manda il video stacca la traccia dal canale: la camera resta accesa per l'anteprima
  locale, ma verso la rete non esce nulla. Senza, un video verso uno schermo spento
  costava ~300 kB/s a chi lo mandava, che su rete cellulare si paga. Il segnale viaggia
  nel messaggio `state` (campo `watching`); vale `true` quando manca, così una build
  vecchia o un messaggio perso lasciano il video acceso invece di spegnerlo per sempre.
- Ogni gestore di evento **verifica di appartenere alla connessione in uso**. Ricostruendo
  il collegamento nascono più `RTCPeerConnection` in pochi secondi e quelle superate
  continuano a emettere eventi: una connessione già morta infilava la propria traccia
  nello stream nuovo — due video vivi, e il renderer disegnava quello sbagliato. Attenzione
  alla trappola: **libwebrtc non marca `ended` le tracce di una connessione chiusa**,
  quindi filtrarle per `readyState` non serve a nulla. Vale anche per gli stati, dove il
  danno è peggiore: un `failed` in ritardo faceva ripartire la riparazione di una
  connessione sana, e le ricostruzioni si innescavano a vicenda.
- Il **percorso selezionato viene registrato** appena il collegamento si stabilisce —
  `LOCALE (stessa rete)`, `DIRETTO attraverso NAT` o `RELAY (passa dal server)`. I
  candidati raccolti non lo dicono: si raccolgono sempre tutti e poi ne vince uno, e senza
  questo dato non si può dire se una caduta dipenda dalla strada che il traffico prende.
- Il **formato della camera è fissato**: proporzioni dichiarate in acquisizione e
  `degradationPreference: maintain-resolution`. Il comportamento predefinito è l'opposto —
  sotto banda scarsa WebRTC abbassa la risoluzione — e molti sensori cambiando formato
  cambiano anche l'angolo di ripresa: dall'altra parte si vedeva l'inquadratura allargarsi
  e restringersi da sola. Meglio perdere fotogrammi che cambiare cosa si inquadra.

### 5. Recupero dopo un'interruzione

È la parte che ha richiesto più correzioni, e ognuna è nata da un log.

**La connessione al server** si riaggancia da sola, con attese fra 0,5 e 4 secondi.
Tornando in primo piano si riprova subito, senza aspettare il tentativo programmato.

**Il collegamento diretto** muore con la rete e va riparato, ma **con gradualità**. La
prima versione demoliva 800 ms dopo il `failed`, e il log ha mostrato che era la causa
della maggior parte delle interruzioni visibili: ICE si stava riprendendo da solo — nel
log si vede passare da `failed` a `connected` senza alcun aiuto — e la demolizione
arrivava nel mezzo.

L'ordine ora è:

1. **Aspettare**: 4 secondi da `failed`, 12 da `disconnected`. Su rete mobile il percorso
   cambia di continuo e spesso rientra da sé in un secondo.
2. **Riparazione leggera**: `restartIce()` rifà solo la ricerca del percorso, tenendo in
   piedi connessione e tracce — audio e video non si interrompono affatto. Può farla chi
   offre; l'altro la chiede con `renegotiate`.
3. **Ricostruzione completa**, solo se dopo altri 8 secondi non è tornato.

**Solo chi offre ricostruisce.** Chi risponde butta via la connessione morta e aspetta
l'offerta, che fa nascere quella nuova al momento giusto. Ricostruendo entrambi, chi
riceve demoliva un istante dopo proprio la connessione che l'offerta in arrivo stava
creando: si vedevano tre ricostruzioni in due secondi.

**Non si negozia mentre il server è irraggiungibile.** Un'offerta mandata in quel momento
viene scartata in silenzio e nessuno la rimanda: restava una connessione in attesa di una
risposta che non sarebbe mai arrivata.

**Un'offerta che arriva prima della nostra connessione** non viene persa: la fa nascere
sul momento.

**Chi risponde può chiedere l'offerta.** Non potendo offrire, resterebbe in attesa
all'infinito se l'altro non si accorgesse del guasto: ogni cinque secondi, chi si trova
senza collegamento mentre entrambi sono nel canale manda `renegotiate`. È la rete di
sicurezza di una scelta altrimenti corretta — offrire da una parte sola evita che le due
offerte si scontrino.

### 6. Servizio nativo (`app/modules/duetto-platform`)

Modulo Kotlin locale, agganciato dall'**autolinking** tramite
`"duetto-platform": "file:modules/duetto-platform"`: così non si tocca
`MainApplication`, che `bootstrap.sh` rigenera e sovrascriverebbe.

| Aspetto | Scelta |
|---|---|
| Tipo servizio | `microphone`, più `camera` quando accendi il video |
| Notifica fissa | obbligatoria, canale a importanza `LOW` (silenziosa) |
| Notifiche di avviso | canale separato a importanza `HIGH` |
| Riavvio | `START_STICKY`: se Android lo uccide per memoria, riparte |
| Wake lock | `PARTIAL_WAKE_LOCK` con scadenza di sicurezza a 8 ore |
| Visibilità | `onStart`/`onStop` dell'activity, **non** `AppState` |

**Presenza dopo il riavvio.** Un ricevitore su `BOOT_COMPLETED` avvia `PresenceService`,
che eredita da `HeadlessJsTaskService`: fa partire il motore JavaScript **senza aprire
l'interfaccia** ed esegue un compito che rimette in piedi la connessione di ascolto. Riusa
tutta la logica già esistente, invece di riscrivere la rete in Kotlin.

Non "apre l'app da sola": da Android 10 avviare un'activity dal secondo piano è vietato.
Riparte la presenza, non la finestra. Il compito non si conclude mai di proposito, e si fa
da parte quando l'app viene aperta: due connessioni dallo stesso dispositivo si
scalzerebbero a vicenda.

Il collo di bottiglia non è il codice ma il produttore: **senza "avvio automatico"
abilitato, telefoni come Xiaomi non consegnano nemmeno l'evento di avvio**. Non è
un'autorizzazione di Android e nessuna app può concederselo; l'app può solo aprire quella
schermata, e non può nemmeno leggerne l'esito.

Contiene anche il **Picture-in-Picture**: il tasto Indietro chiama
`enterPictureInPictureMode` invece di uscire dal canale, con le proporzioni di ciò che sta
a schermo intero (Android accetta rapporti fra 0.4184 e 2.39, quindi il valore viene
limitato).

Per accorgersi di essere in PiP **non serve intercettare il callback dell'Activity**: in
PiP la finestra si rimpicciolisce, quindi sotto i 340 dp di larghezza l'interfaccia passa
in modalità compatta. Questo evita di dover modificare `MainActivity`.

**Perché la visibilità non usa `AppState`**: su Android quello segnala la *pausa*
dell'activity, e in Picture-in-Picture l'activity è in pausa pur essendo perfettamente
visibile — spegneremmo il video proprio nella finestrella fatta per continuare a guardarlo.
`onStart`/`onStop` hanno invece il significato che serve: `onStop` arriva quando l'app
sparisce davvero dalla vista, e in PiP non arriva.

### 7. Layout video (`app/src/VideoStage.tsx`)

- Chi è a schermo intero usa `objectFit: contain`: **mai tagliato**.
- Il riquadrino ha **le proporzioni della camera che mostra**. Ricavarle non è banale: la
  camera consegna sempre un fotogramma orizzontale (1280×720) che viene ruotato in base a
  come tieni il telefono. `getLocalVideoAspect()` legge `track.getSettings()` e fa seguire
  il lato lungo all'orientamento; il risultato viaggia nel messaggio cifrato `state`, così
  anche l'altro sa che forma dargli.
- Trascinabile e ridimensionabile: maniglia d'angolo e pizzico a due dita, gestiti dallo
  stesso `PanResponder` guardando `nativeEvent.touches.length`.
- Tocco e trascinamento si distinguono con una soglia di 4 px.
- **Zoom** sul video grande: pizzico fino a 5×, trascinamento per spostarsi dentro
  l'ingrandimento (vincolato ai bordi), doppio tocco per tornare a schermo pieno.
- Con un solo video acceso il riquadrino non compare e lo scambio si azzera — ma **non
  durante un'interruzione**: lì il video dell'altro manca solo momentaneamente, e azzerare
  la disposizione significherebbe ritrovarsela cambiata a ogni caduta di rete.
- Durante un'interruzione **nulla si sposta**: il posto grande resta riservato all'altro,
  il riquadro resta al suo posto vuoto con l'etichetta "in attesa", e un avviso spiega
  cosa sta succedendo. Prima il proprio video veniva promosso a schermo intero e poi
  rimpicciolito al ritorno, a ogni singola caduta.

Una cosa che **non è possibile**: trattenere l'ultimo fotogramma durante un'interruzione.
Quando la traccia muore il renderer svuota la superficie, e conservare l'immagine
richiederebbe catturarla a parte fotogramma per fotogramma.

### 8. Uscita audio (`app/src/audioRoute.ts`)

Quattro uscite possibili — vivavoce, auricolare, cuffie con filo, Bluetooth — e non ne
esistono altre. L'elenco di quelle *disponibili* cambia da solo, quindi lo prendiamo
dall'evento `onAudioDeviceChanged` invece di indovinarlo.

La scelta viene **salvata** e ripristinata al rientro se quel dispositivo è ancora
collegato; altrimenti si lascia la selezione di sistema, senza imporne una nostra.

## Modello di minaccia

| Avversario | Può | Non può |
|-----------|-----|---------|
| Chi ascolta la rete | vedere che c'è traffico | leggere media o signaling |
| Server compromesso | metadati (quali coppie, quando), DoS | leggere o alterare i contenuti |
| Server compromesso, durante l'accoppiamento | tentare di indovinare il codice | riuscirci nei tempi utili, grazie al KDF lento |
| Terzo che conosce il server | aprire connessioni | entrare in una coppia senza il codice |
| TURN relay | inoltrare pacchetti | decifrare il media |

Il momento delicato è **solo l'accoppiamento**. Dopo, la chiave è a 256 bit e casuale.

## Limiti noti e possibili estensioni

- **Riavvio del telefono**: la presenza riparte da sola, ma servono qualche decina di
  secondi perché il sistema dia spazio all'app: un avviso mandato subito dopo il riavvio
  può ancora non trovarla.
- **OEM aggressivi**: Xiaomi, Huawei, Samsung chiudono i servizi in background nonostante
  le regole di Android. Serve escludere l'app dall'ottimizzazione batteria; non c'è modo
  di ottenerlo da codice.
- **Consumo**: wake lock e connessione sempre aperta costano batteria. È il prezzo della
  presenza continua.
- **Codice di sicurezza visivo**: si potrebbe mostrare un SAS derivato dalla chiave, da
  confrontare a voce, per chi volesse una conferma in più dopo l'accoppiamento.
- **Chat testuale**: un `RTCDataChannel` sulla connessione esistente sarebbe già cifrato.
