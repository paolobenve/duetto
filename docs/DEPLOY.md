# Guida al deploy sul tuo server

Due pezzi: il **signaling** (obbligatorio) e **coturn** per il collegamento di riserva
(consigliato). Nient'altro: le notifiche non passano da servizi esterni.

## 1. Signaling server

Sul server:

```bash
sudo mkdir -p /opt/duetto && sudo chown $USER /opt/duetto
```

Dal **PC**, per copiare il codice:

```bash
rsync -rltvz --no-owner --no-group --exclude node_modules --exclude .env \
  /percorso/duetto/server/ utente@TUO_SERVER:/opt/duetto/server/
```

Di nuovo sul **server**:

```bash
cd /opt/duetto/server
cp .env.example .env      # va bene com'è
npm install --omit=dev
npm run test:smoke        # deve stampare TUTTO OK
```

### Avvio permanente

Un utente di servizio dedicato, che deve solo **leggere** i file:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin duetto
sudo chown -R $USER:duetto /opt/duetto
sudo chmod -R u+rwX,g+rX,o-rwx /opt/duetto
sudo find /opt/duetto -type d -exec chmod g+s {} \;   # i nuovi file ereditano il gruppo
sudo chmod 640 /opt/duetto/server/.env

sudo cp /opt/duetto/server/deploy/duetto-signaling.service /etc/systemd/system/
sudo sed -i "s|^User=.*|User=duetto|; s|^ExecStart=.*|ExecStart=$(which node) src/index.js|" \
  /etc/systemd/system/duetto-signaling.service

sudo systemctl daemon-reload
sudo systemctl enable --now duetto-signaling
curl -s http://127.0.0.1:8787/healthz      # {"ok":true,"rooms":0}
```

Il bit `g+s` sulle cartelle evita un problema ricorrente: senza, i file copiati in
seguito con rsync nascono con un gruppo che il servizio non può leggere.

## 2. Esporlo in HTTPS

Il signaling resta su `127.0.0.1:8787`; davanti ci va quello che già hai.
In `server/deploy/` trovi gli esempi per i tre casi.

### HAProxy

Se la 443 è di HAProxy, mandagli `/duetto/` **direttamente** a Node, senza attraversare
il resto della catena. Non è solo comodità: Varnish, se c'è, non gestisce i WebSocket
senza un `pipe` esplicito, e una cache davanti al signaling non avrebbe senso.

Nel frontend della 443, **dopo** le eventuali regole `http-request`:

```
    acl duetto_path path_beg /duetto/
    use_backend duetto_backend if duetto_path
```

In fondo al file:

```
backend duetto_backend
    mode http
    option http-keep-alive
    timeout tunnel 3600s
    timeout server 3600s
    server duetto 127.0.0.1:8787 check
```

⚠️ **`timeout tunnel` non è facoltativo.** Senza, eredita `timeout client`/`server` da
`defaults` (spesso 50 secondi) e tronca il WebSocket di continuo: il sintomo è "la
presenza cade da sola ogni tanto", difficilissimo da ricondurre a HAProxy.
E `option http-keep-alive` serve a scavalcare `option http-server-close`, se l'hai in
`defaults`.

### Apache

Dentro il `<VirtualHost *:443>` esistente, e **prima** di eventuali altre regole di
rewrite del sito:

```apache
RewriteEngine On
RewriteCond %{HTTP:Upgrade} =websocket [NC]
RewriteRule ^/duetto/ws$ ws://127.0.0.1:8787/ [P,L]
ProxyPass        /duetto/healthz http://127.0.0.1:8787/healthz
ProxyPassReverse /duetto/healthz http://127.0.0.1:8787/healthz
ProxyTimeout 3600
```

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite
sudo apachectl configtest && sudo systemctl reload apache2
```

### nginx

Vedi `server/deploy/nginx.conf.example`.

### Verifica

```bash
curl -s https://TUO_DOMINIO/duetto/healthz
```

Atteso: `{"ok":true,"rooms":0}`. E il collaudo che conta davvero, l'upgrade a WebSocket:

```bash
curl -s -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" \
  https://TUO_DOMINIO/duetto/ws | head -3
```

Atteso: `HTTP/1.1 101 Switching Protocols`. Se il primo risponde ma il secondo no, la
richiesta non sta arrivando al backend giusto: quasi sempre è l'ordine delle regole.

## 3. TURN (coturn) — collegamento di riserva

Serve quando le due reti impediscono il collegamento diretto (NAT simmetrici, certe reti
mobili). Anche passando dal TURN il traffico resta cifrato end-to-end: il relay inoltra
pacchetti che non può leggere.

```bash
sudo apt install coturn
sudo cp /opt/duetto/server/deploy/coturn.conf.example /etc/turnserver.conf
sudoedit /etc/turnserver.conf     # external-ip, realm, user=..., cert/pkey
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
sudo systemctl enable --now coturn
```

Firewall: **TCP/UDP 3478**, **TCP 5349**, e l'intervallo di relay (per due persone
bastano poche decine di porte: `min-port`/`max-port` in `turnserver.conf`).

```bash
# con firewalld
sudo firewall-cmd --permanent --add-port=3478/tcp --add-port=3478/udp
sudo firewall-cmd --permanent --add-port=5349/tcp
sudo firewall-cmd --permanent --add-port=49160-49200/udp
sudo firewall-cmd --reload

# con ufw
sudo ufw allow 3478/tcp && sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp && sudo ufw allow 49160:49200/udp
```

⚠️ Se il tuo provider ha un firewall proprio (pannello web), le porte vanno aperte
**anche lì**: il server non ne sa nulla, e dall'interno tutto sembra a posto.

Verifica che il relay risponda **dall'esterno**, non dal server stesso:

```bash
node server/tools/stun-check.mjs TUO_DOMINIO 3478
```

Poi dillo al signaling, che lo comunichera' ai telefoni: nel `.env`

```
TURN_URL=turn:TUO_DOMINIO:3478
TURN_USER=duetto
TURN_PASS=...        # la password scritta in /etc/turnserver.conf
```

e `sudo systemctl restart duetto-signaling`. Il controllo di salute deve rispondere
`"turn":true`. **Sui telefoni non si configura nulla.**

## 4. Sui telefoni

Nell'app basta il **nome del server**. Poi accoppiamento a codice, e non si tocca più
nulla.

Perché la presenza regga davvero:

1. *Impostazioni → App → Duetto → Batteria → **Senza restrizioni***. Su
   Xiaomi/Huawei/Samsung cerca anche "avvio automatico" e attivalo.
2. Concedi microfono, camera e **notifiche** (senza notifiche il foreground service non
   può mostrare la sua, e Android lo chiude).

## 5. Se il server veniva da DuoTalk

L'app si chiamava DuoTalk: cartella `/opt/duotalk`, servizio `duotalk-signaling`, percorso
`/duotalk/ws` nel proxy. Il codice è lo stesso, cambiano solo i nomi. Conviene **prima**
aggiungere il percorso nuovo lasciando il vecchio: così i telefoni ancora con DuoTalk
continuano a funzionare finché non hanno installato Duetto.

Nel proxy, accanto alle regole di `/duotalk/ws` metti le stesse per `/duetto/ws` — il
`.conf.example` aggiornato le ha già — poi ricarica. Da fuori:

```bash
curl -s https://TUO_DOMINIO/duetto/healthz     # {"ok":true,...}
```

Poi la cartella e il servizio. Fa tutto `server/deploy/migra-da-duotalk.sh`, che conserva
proprietario, gruppo e unit esistente — cambia i nomi e basta — e se il servizio nuovo non
risponde rimette le cose com'erano:

```bash
scp server/deploy/migra-da-duotalk.sh utente@TUO_SERVER:/tmp/
ssh -t utente@TUO_SERVER 'sudo bash /tmp/migra-da-duotalk.sh'
```

A mano, per capire cosa fa: il `.env` sta dentro `/opt/duotalk/server` e va conservato,
per questo si sposta invece di ricreare.

```bash
sudo systemctl stop duotalk-signaling
sudo mv /opt/duotalk /opt/duetto
```

Dal PC, il codice nuovo (`--exclude .env` lo lascia intatto):

```bash
rsync -rltvz --no-owner --no-group --exclude node_modules --exclude .env \
  /percorso/duetto/server/ utente@TUO_SERVER:/opt/duetto/server/
```

Sul server, l'utente di servizio e il nuovo unit file:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin duetto
sudo chown -R $USER:duetto /opt/duetto
sudo find /opt/duetto -type d -exec chmod g+s {} \;
sudo chmod 640 /opt/duetto/server/.env

sudo cp /opt/duetto/server/deploy/duetto-signaling.service /etc/systemd/system/
sudo sed -i "s|^User=.*|User=duetto|; s|^ExecStart=.*|ExecStart=$(which node) src/index.js|" \
  /etc/systemd/system/duetto-signaling.service

sudo systemctl disable duotalk-signaling
sudo rm /etc/systemd/system/duotalk-signaling.service
sudo systemctl daemon-reload
sudo systemctl enable --now duetto-signaling
curl -s http://127.0.0.1:8787/healthz
```

Quando entrambi i telefoni sono passati a Duetto, togli dal proxy le regole di
`/duotalk/ws` e l'utente rimasto: `sudo userdel duotalk`.

`TURN_USER` nel `.env` non va toccato: è la credenziale scritta in
`/etc/turnserver.conf`, e cambiarla da una parte sola spegne il relay.

## Troubleshooting

| Sintomo | Causa probabile | Rimedio |
|---------|-----------------|---------|
| `Upgrade Required` da healthz | il proxy inoltra un percorso che il server non riconosce | aggiorna il server: accetta qualsiasi prefisso |
| healthz risponde ma l'app non si collega | le regole del WebSocket non vengono raggiunte | controlla l'**ordine** delle regole nel proxy |
| La presenza cade ogni ~50 secondi | `timeout tunnel` non impostato | mettilo a 3600s |
| "Nessuna risposta dall'altro telefono" | codice diverso, o l'altro non è collegato | rifate l'accoppiamento con un codice nuovo |
| "Il codice non coincide" | cifre digitate male | è la verifica che funziona: rigenerate il codice |
| Si collegano ma niente audio | la rete blocca il P2P | configura coturn |
| Resta in "connecting" poi "failed" su reti diverse | manca il relay, o è irraggiungibile | `stun-check.mjs` dall'esterno: se non risponde è il firewall |
| Esce dal canale in background | il sistema chiude l'app | escludi Duetto dall'ottimizzazione batteria |
| Dopo il riavvio del telefono non è più in ascolto | limite noto | riapri l'app una volta |
