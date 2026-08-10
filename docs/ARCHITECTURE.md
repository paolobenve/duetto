# Architettura di DuoTalk

## Modello: canale, non chiamata

Non esiste il concetto di "chiamare" o "rispondere". Esiste un **canale permanente**
per due persone. Ci entri, ci resti, e quando entra anche l'altro il collegamento si
stabilisce da solo. È il modello di un canale vocale Discord, ridotto a due posti.

Ne conseguono tre cose:
1. **L'ingresso è automatico** all'apertura dell'app: non c'è nulla da premere.
2. **Serve un campanello**, perché l'altro potrebbe non avere l'app aperta → ntfy.
3. **La presenza è lo stato principale** dell'interfaccia: "sei solo" / "ci siete
   entrambi", non "sta squillando".

## Componenti

### 1. Signaling e presenza (`server/src/index.js`)

WebSocket minimale in Node.js:

- **Presenza**: ogni canale accetta al massimo 2 connessioni; la terza riceve `room-full`.
- **Ruoli**: chi entra per primo è `polite`, il secondo è `impolite`. Servono alla
  perfect negotiation (sotto). L'assegnazione è deterministica, così i due ruoli non
  coincidono mai.
- **Inoltro**: gira i messaggi `signal` da un peer all'altro **senza leggerne il
  contenuto**.
- **Campanello**: quando qualcuno entra e l'altro *non* c'è, pubblica su ntfy. Se l'altro
  è già presente non notifica nulla: se ne accorge da sé, e sarebbe solo rumore.

Il primo messaggio è `join { room, token, peerTopic, name }`. In chiaro viaggia solo ciò
che serve al server per lavorare; `peerTopic` è il topic **dell'altra persona**, cioè
quello che vogliamo far suonare.

### 2. Notifiche (`server/src/ntfy.js`)

Pubblicazione HTTP verso il tuo ntfy self-hosted. Due casi:

| Evento | Priorità | Testo |
|---|---|---|
| Entri e l'altro non c'è | 4 (alta) | `<nome> e' nel canale` |
| Premi "Avvisa" | 5 (massima) | `<nome> ti aspetta nel canale` |

La notifica porta un `click` con deep link `duotalk://channel`: toccandola si apre
DuoTalk (l'intent filter è aggiunto al manifest da `scripts/patch-android-manifest.js`,
con `launchMode="singleTask"` per non aprire una seconda istanza).

Il testo è volutamente generico: passa dal server ntfy, quindi non contiene nulla della
conversazione. Il pulsante "Avvisa" ha un cooldown di 15 secondi lato server.

### 3. Cifratura del signaling (`app/src/crypto.ts`)

- Chiave: `SHA-512(passphrase)` troncato a 32 byte.
- Cifrario: **NaCl secretbox** (XSalsa20-Poly1305), nonce casuale a 24 byte per messaggio.
- Il ciphertext è **autenticato**: qualsiasi manomissione fa fallire `open()`.

Il server vede solo base64 opaco. Non potendo leggere né riscrivere gli SDP, non può
sostituire il **fingerprint DTLS**, che è ciò che gli permetterebbe di inserirsi nel
mezzo. Senza la passphrase il MITM non è possibile.

### 4. Media (`app/src/webrtc.ts`)

- Entrando nel canale si apre **solo il microfono**.
- La **camera** si accende su richiesta: `getUserMedia` + `addTrack`, e spegnendola si
  fa `removeTrack` + `track.stop()`, così la camera è davvero rilasciata (l'indicatore
  privacy di Android si spegne).
- Aggiungere o togliere una traccia richiede una **rinegoziazione**. Se entrambi
  accendono il video nello stesso istante si ha una *collisione di offerte*: la
  risolviamo con la **perfect negotiation** — il peer `polite` annulla la propria
  offerta (rollback) e accetta quella dell'altro, l'`impolite` ignora quella in arrivo.
- Gli **ICE candidate** che arrivano prima della remote description finiscono in coda e
  vengono applicati dopo, altrimenti andrebbero persi.
- Un messaggio cifrato `state` comunica all'altro se hai mic/camera attivi, per mostrarlo
  nell'interfaccia.

### 5. Presenza in background (`app/modules/duotalk-foreground`)

Un canale permanente che sopravvive solo con l'app aperta non è permanente. Android
sospende i processi in background e a schermo spento, quindi serve un **foreground
service**: è l'unico meccanismo supportato per restare attivi, e da Android 14 il tipo
`microphone` è anche l'unico modo consentito per registrare audio fuori dal primo piano.

È un modulo nativo Kotlin locale, agganciato dall'**autolinking** tramite
`"duotalk-foreground": "file:modules/duotalk-foreground"` in `package.json`: così non
serve modificare `MainApplication`, che è generato da `bootstrap.sh` e verrebbe
sovrascritto.

| Aspetto | Scelta |
|---|---|
| Tipo servizio | `microphone`, più `camera` quando accendi il video |
| Notifica | obbligatoria, canale a importanza `LOW` (silenziosa) |
| Riavvio | `START_STICKY`: se Android lo uccide per memoria, riparte |
| Uscita | `stopWithTask="true"`: scartare l'app dai recenti esce dal canale |
| Wake lock | `PARTIAL_WAKE_LOCK` con scadenza di sicurezza a 8 ore |

Il modulo è scritto per l'architettura classica; `bootstrap.sh` imposta
`newArchEnabled=false`, pienamente supportato in RN 0.76.

### 6. Layout video (`app/src/VideoStage.tsx`)

- Chi è a schermo intero usa `objectFit: contain`: **mai tagliato**, eventuali bande
  nere sono accettate come prezzo dell'integrità dell'immagine.
- L'altro video sta in un riquadrino trascinabile (`PanResponder` + `Animated.ValueXY`),
  vincolato dentro lo schermo e riportato dentro se ruoti il telefono.
- Il tocco si distingue dal trascinamento con una soglia di 4 px: tocco = scambio fra
  grande e piccolo, trascinamento = spostamento.
- Con un solo video acceso il riquadrino non compare e lo scambio viene azzerato.

## Flusso

```
A apre l'app ─▶ join(canale) ─▶ joined{polite:true, peers:0}
                                 └─▶ ntfy: "Anna e' nel canale" ──▶ 📱 telefono di B

B apre l'app ─▶ join(canale) ─▶ joined{polite:false, peers:1}
                                 └─▶ peer-joined ──▶ A     (niente notifica: c'e' gia')

B (impolite) apre la negoziazione:
  createOffer → signal{ SEAL(offer) } ─▶ server ─▶ A: OPEN → setRemoteDescription
  A: createAnswer → signal{ SEAL(answer) } ─▶ server ─▶ B: OPEN
  entrambi: onicecandidate → signal{ SEAL(ice) }

  ⇒ ICE sceglie il percorso: diretto, o via TURN se le reti lo impongono
  ⇒ DTLS handshake ⇒ audio SRTP cifrato tra i due telefoni

Poi, quando uno accende il video: addTrack → negotiationneeded → nuova offerta
```

`SEAL`/`OPEN` = cifra/decifra con la passphrase condivisa.

## Modello di minaccia

| Avversario | Può | Non può |
|-----------|-----|---------|
| Chi ascolta la rete | vedere che c'è traffico | leggere media o signaling |
| Server compromesso | metadati (chi/quando), DoS | leggere o alterare i contenuti |
| Terzo con l'URL | tentare `join` | entrare senza token, entrare come 3°, decifrare |
| TURN relay | inoltrare pacchetti | decifrare il media |
| Server ntfy | vedere *che* c'è un avviso e il nome | sapere cosa vi dite |

Punto debole principale: la **passphrase**. Lunga, casuale, scambiata fuori banda.

## Limiti noti e possibili estensioni

- **OEM aggressivi**: Xiaomi, Huawei, Samsung e altri chiudono i servizi in background
  nonostante le regole di Android. Serve escludere l'app dall'ottimizzazione batteria;
  non c'è modo di ottenerlo solo da codice.
- **Consumo**: wake lock e connessione sempre aperta costano batteria. È il prezzo della
  presenza continua.
- **Codice di sicurezza visivo**: si potrebbe mostrare un SAS derivato dai fingerprint
  DTLS, per confermare a voce che non c'è un MITM. Oggi la garanzia è la passphrase.
- **Chat testuale**: un `RTCDataChannel` sulla connessione esistente sarebbe già cifrato.
