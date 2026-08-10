# Architettura di DuoTalk

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
- **Ruoli**: chi arriva per primo è `polite`, il secondo è `impolite`. Assegnazione
  deterministica, così i due ruoli non coincidono mai (serve alla perfect negotiation).
- **Inoltro**: gira i messaggi `signal` da un peer all'altro **senza leggerne il
  contenuto**, e i messaggi `pair` durante l'accoppiamento.
- **Avvisi**: `notify` quando qualcuno entra nel canale o preme "Avvisa" (con un freno di
  15 secondi contro le pressioni ripetute).

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

**`pairId` è deliberatamente costoso da calcolare.** Otto cifre sono solo 10⁸
combinazioni: con un hash normale il server potrebbe provarle tutte in pochi secondi,
risalire al codice e fingersi l'altra persona. Per questo `pairId` è il risultato di
**200.000 hash concatenati**: provare tutti i codici costa 2×10¹³ operazioni, fuori
portata nei 90 secondi che dura un accoppiamento. Per noi sono ~600 ms su PC, 2-3 secondi
su telefono, una volta sola. Il calcolo cede il controllo ogni 10.000 giri, così
l'interfaccia non si congela.

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
- Aggiungere o togliere una traccia richiede una **rinegoziazione**. Se entrambi accendono
  il video nello stesso istante si ha una collisione di offerte: la risolviamo con la
  **perfect negotiation** — il `polite` annulla la propria offerta e accetta quella
  dell'altro, l'`impolite` ignora quella in arrivo.
- Gli **ICE candidate** arrivati prima della remote description finiscono in coda e
  vengono applicati dopo, altrimenti andrebbero persi.
- Un messaggio cifrato `state` comunica all'altro se hai mic/camera attivi e **con quali
  proporzioni** stai inquadrando.

### 5. Servizio nativo (`app/modules/duotalk-platform`)

Modulo Kotlin locale, agganciato dall'**autolinking** tramite
`"duotalk-platform": "file:modules/duotalk-platform"`: così non si tocca
`MainApplication`, che `bootstrap.sh` rigenera e sovrascriverebbe.

| Aspetto | Scelta |
|---|---|
| Tipo servizio | `microphone`, più `camera` quando accendi il video |
| Notifica fissa | obbligatoria, canale a importanza `LOW` (silenziosa) |
| Notifiche di avviso | canale separato a importanza `HIGH` |
| Riavvio | `START_STICKY`: se Android lo uccide per memoria, riparte |
| Wake lock | `PARTIAL_WAKE_LOCK` con scadenza di sicurezza a 8 ore |

Contiene anche il **Picture-in-Picture**: il tasto Indietro chiama
`enterPictureInPictureMode` invece di uscire dal canale, con le proporzioni di ciò che sta
a schermo intero (Android accetta rapporti fra 0.4184 e 2.39, quindi il valore viene
limitato).

Per accorgersi di essere in PiP **non serve intercettare il callback dell'Activity**: in
PiP la finestra si rimpicciolisce, quindi sotto i 340 dp di larghezza l'interfaccia passa
in modalità compatta. Questo evita di dover modificare `MainActivity`.

### 6. Layout video (`app/src/VideoStage.tsx`)

- Chi è a schermo intero usa `objectFit: contain`: **mai tagliato**.
- Il riquadrino ha **le proporzioni della camera che mostra**. Ricavarle non è banale: la
  camera consegna sempre un fotogramma orizzontale (1280×720) che viene ruotato in base a
  come tieni il telefono. `getLocalVideoAspect()` legge `track.getSettings()` e fa seguire
  il lato lungo all'orientamento; il risultato viaggia nel messaggio cifrato `state`, così
  anche l'altro sa che forma dargli.
- Trascinabile e ridimensionabile: maniglia d'angolo e pizzico a due dita, gestiti dallo
  stesso `PanResponder` guardando `nativeEvent.touches.length`.
- Tocco e trascinamento si distinguono con una soglia di 4 px.

### 7. Uscita audio (`app/src/audioRoute.ts`)

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

- **Riavvio del telefono**: la connessione di ascolto vive nel JavaScript, quindi dopo un
  riavvio bisogna aprire l'app una volta. Spostare il WebSocket dentro il servizio Kotlin,
  con un ricevitore `BOOT_COMPLETED`, è il prossimo passo.
- **OEM aggressivi**: Xiaomi, Huawei, Samsung chiudono i servizi in background nonostante
  le regole di Android. Serve escludere l'app dall'ottimizzazione batteria; non c'è modo
  di ottenerlo da codice.
- **Consumo**: wake lock e connessione sempre aperta costano batteria. È il prezzo della
  presenza continua.
- **Codice di sicurezza visivo**: si potrebbe mostrare un SAS derivato dalla chiave, da
  confrontare a voce, per chi volesse una conferma in più dopo l'accoppiamento.
- **Chat testuale**: un `RTCDataChannel` sulla connessione esistente sarebbe già cifrato.
