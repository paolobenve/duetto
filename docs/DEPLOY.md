# Guida al deploy sul tuo server

Obiettivo: esporre il signaling in `wss://TUO_DOMINIO/duotalk/ws` dietro il tuo web server
esistente, e (opzionale ma consigliato) installare coturn per il fallback.

## 1. Signaling server

```bash
# come utente non-root
sudo mkdir -p /opt/duotalk
sudo chown $USER /opt/duotalk
cp -R server /opt/duotalk/server
cd /opt/duotalk/server

cp .env.example .env
# imposta un token robusto:
sed -i "s|ACCESS_TOKEN=|ACCESS_TOKEN=$(openssl rand -base64 32)|" .env
cat .env      # <-- annota l'ACCESS_TOKEN: dovrai metterlo nell'app

npm install --omit=dev
```

Test manuale:

```bash
npm start
curl http://127.0.0.1:8787/healthz     # -> {"ok":true,...}
```

### Avvio permanente (systemd)

```bash
sudo cp deploy/duotalk-signaling.service /etc/systemd/system/
# adatta User=, WorkingDirectory=, EnvironmentFile= e il path di node (which node)
sudo systemctl daemon-reload
sudo systemctl enable --now duotalk-signaling
sudo systemctl status duotalk-signaling
```

## 2. Reverse proxy (TLS)

Il signaling resta su `127.0.0.1:8787`; è il reverse proxy a dargli TLS e a esporlo.

### nginx
Inserisci `server/deploy/nginx.conf.example` nel `server {}` del tuo dominio HTTPS,
poi `sudo nginx -t && sudo systemctl reload nginx`.

### Apache
Abilita i moduli e inserisci `server/deploy/apache.conf.example` nel tuo VirtualHost 443:

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite
sudo apachectl configtest && sudo systemctl reload apache2
```

Verifica dal tuo PC:

```bash
curl https://TUO_DOMINIO/duotalk/healthz
```

## 3. TURN (coturn) — fallback per reti difficili

```bash
sudo apt install coturn
sudo cp server/deploy/coturn.conf.example /etc/turnserver.conf
sudoedit /etc/turnserver.conf     # imposta external-ip, realm, user=..., cert/pkey
# abilita il servizio:
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
sudo systemctl enable --now coturn
```

Apri sul firewall: **TCP/UDP 3478**, **TCP 5349** (TLS) e l'intervallo **UDP 49152-65535**.

Nell'app inserisci poi:
- TURN url: `turn:TUO_DOMINIO:3478`
- TURN utente / password: quelli in `user=duotalk:...`

Verifica il TURN con il tool online "Trickle ICE" o con `turnutils_uclient`.

## 4. Configura l'app

Su **entrambi** i telefoni, nella schermata iniziale:
- Server: `wss://TUO_DOMINIO/duotalk/ws`
- Access token: quello del `.env`
- Stanza: es. `casa` (uguale sui due)
- Passphrase: un segreto lungo condiviso a voce
- TURN: url/utente/password (se installato)

## Troubleshooting

| Sintomo | Causa probabile | Rimedio |
|---------|-----------------|---------|
| "Token errato" | ACCESS_TOKEN diverso | allinea app e `.env` |
| Resta "In attesa dell'altro" | stanza diversa o secondo telefono non connesso | stessa `room`, controlla rete |
| Si collega ma nessun video | passphrase diversa (buste non decifrabili) | stessa passphrase sui due |
| Audio/video non parte su rete mobile | serve il relay | installa/configura coturn |
| WSS non risponde | proxy/mod mancanti | `nginx -t` / abilita `proxy_wstunnel` |
