# Architettura di DuoTalk

## Obiettivo

Chiamate audio/video tra **due soli** dispositivi Android, con contenuto **illeggibile
per il server** che li mette in contatto.

## Componenti

### 1. Signaling server (`server/src/index.js`)
WebSocket minimale in Node.js. Ha tre compiti:

1. **Pairing**: mette in comunicazione i due client che indicano la stessa `room`.
2. **Limite a 2**: rifiuta un terzo dispositivo (`room-full`).
3. **Inoltro**: gira i messaggi `signal` da un peer all'altro senza leggerne il contenuto.

Il primo messaggio del client è `join { room, token }`. Il `token` (in chiaro) è un
segreto anti-abuso confrontato con `ACCESS_TOKEN`. La `room` serve solo ad accoppiare.
Tutto il resto viaggia dentro `signal.payload`, che è **cifrato**.

Il secondo client a entrare riceve `initiator: true` e avvia la negoziazione WebRTC.

### 2. Cifratura del signaling (`app/src/crypto.ts`)
- KDF: `SHA-512(passphrase)` troncato a 32 byte → chiave.
- Cifrario: **NaCl secretbox** (XSalsa20-Poly1305), nonce casuale a 24 byte per messaggio.
- Il ciphertext è **autenticato**: qualsiasi manomissione fa fallire `open()`.

Conseguenza: il server (o chi intercetta il WSS) vede solo base64 opaco. Non può leggere
gli SDP/ICE né sostituire il **fingerprint DTLS** per inserirsi nel mezzo, perché non
conosce la passphrase.

### 3. Trasporto media (`app/src/webrtc.ts`)
WebRTC standard tramite `react-native-webrtc`:
- `getUserMedia` per microfono + camera.
- `RTCPeerConnection` con ICE server (STUN pubblico + TURN opzionale).
- Negoziazione offer/answer; ICE candidate scambiati (cifrati) via signaling.
- Il media è **DTLS-SRTP**: cifrato end-to-end per costruzione, anche via TURN relay.

Controlli in chiamata: `toggleAudio`, `toggleVideo`, `switchCamera` agiscono sulle tracce
locali (`track.enabled`) — immediati e senza rinegoziazione.

## Flusso di una chiamata

```
A: join(room, token) ──▶ server ──▶ joined{initiator:false}   (A aspetta)
B: join(room, token) ──▶ server ──▶ joined{initiator:true}    (B è l'initiator)
                          server ──▶ peer-joined ──▶ A

B: createOffer → setLocalDescription
B: signal{ SEAL(offer) } ──▶ server ──▶ A: signal ──▶ OPEN → setRemoteDescription
A: createAnswer → setLocalDescription
A: signal{ SEAL(answer) } ──▶ server ──▶ B: OPEN → setRemoteDescription

A/B: onicecandidate → signal{ SEAL(ice) } ──▶ (reciproco)
      ⇒ ICE trova il percorso migliore: diretto P2P, o via TURN se necessario
      ⇒ DTLS handshake ⇒ media SRTP cifrato scorre tra i due telefoni
```

`SEAL`/`OPEN` = cifra/decifra con la passphrase condivisa.

## Modello di minaccia

| Avversario | Può fare | Non può fare |
|-----------|----------|--------------|
| Chi ascolta la rete (WSS) | vedere che c'è traffico | leggere media o signaling |
| Server compromesso | vedere metadati (chi/quando), fare DoS | leggere/alterare i contenuti (MITM) |
| Terzo con l'URL del server | tentare `join` | entrare senza token; entrare come 3°; decifrare senza passphrase |
| TURN relay | inoltrare pacchetti | decifrare il media (DTLS-SRTP) |

Punto debole principale: la **passphrase**. Va lunga, casuale e scambiata fuori banda.

## Scelte e possibili estensioni

- **SAS/verifica fingerprint**: già coperto implicitamente dalla passphrase (il server non
  può sostituire il fingerprint). Volendo si può mostrare a schermo un "codice di sicurezza"
  derivato dai fingerprint DTLS per conferma visiva.
- **Notifiche/squillo**: ora la chiamata parte quando entrambi aprono l'app. Per uno
  "squillo" servirebbe FCM/push (fuori dallo scopo minimale).
- **Chat testuale**: si può aggiungere un `RTCDataChannel` (già cifrato) riusando lo stesso
  `CallSession`.
