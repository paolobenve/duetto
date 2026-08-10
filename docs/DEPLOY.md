# Guida al deploy sul tuo server

Tre pezzi: il **signaling** (obbligatorio), **ntfy** per le notifiche, **coturn** per il
fallback di rete. Signaling e ntfy stanno dietro il reverse proxy che hai già.

## 1. Signaling server

```bash
sudo mkdir -p /opt/duotalk
sudo chown $USER /opt/duotalk
cp -R server /opt/duotalk/server
cd /opt/duotalk/server

cp .env.example .env
sed -i "s|ACCESS_TOKEN=|ACCESS_TOKEN=$(openssl rand -base64 32)|" .env
cat .env      # annota l'ACCESS_TOKEN: va messo nell'app

npm install --omit=dev
npm run test:smoke     # verifica presenza, inoltro e campanello
```

Avvio permanente:

```bash
sudo cp deploy/duotalk-signaling.service /etc/systemd/system/
# adatta User=, WorkingDirectory=, EnvironmentFile= e il path di node (which node)
sudo systemctl daemon-reload
sudo systemctl enable --now duotalk-signaling
sudo systemctl status duotalk-signaling
```

## 2. Reverse proxy (TLS)

Il signaling resta su `127.0.0.1:8787`; il proxy gli dà TLS e lo espone.

**nginx**: inserisci `server/deploy/nginx.conf.example` nel `server {}` del tuo dominio,
poi `sudo nginx -t && sudo systemctl reload nginx`.

**Apache**:
```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite
# inserisci server/deploy/apache.conf.example nel VirtualHost :443
sudo apachectl configtest && sudo systemctl reload apache2
```

Verifica: `curl https://TUO_DOMINIO/duotalk/healthz` → deve rispondere
`{"ok":true,...,"ntfy":true}`.

## 3. ntfy (notifiche)

### Installazione

```bash
sudo apt install ntfy       # oppure: docker run -d -p 2586:80 binwiederhier/ntfy serve
sudo systemctl enable --now ntfy
```

In `/etc/ntfy/server.yml`:

```yaml
base-url: "https://ntfy.TUO_DOMINIO"
listen-http: "127.0.0.1:2586"
auth-file: "/var/lib/ntfy/user.db"
auth-default-access: "deny-all"     # importante: niente topic pubblici
```

Esponilo con il reverse proxy su `https://ntfy.TUO_DOMINIO` (proxy verso
`127.0.0.1:2586`, con supporto WebSocket come per il signaling).

### Autenticazione (consigliata)

Con `deny-all` nessuno può leggere i vostri topic senza credenziali.

```bash
# utente per i due telefoni (riceve)
sudo ntfy user add duo
sudo ntfy access duo "duotalk-*" rw

# token per il server DuoTalk (pubblica)
sudo ntfy user add --role=admin duotalk-server
sudo ntfy token add duotalk-server     # -> copia il token in NTFY_TOKEN nel .env
```

Poi in `/opt/duotalk/server/.env`:

```
NTFY_URL=https://ntfy.TUO_DOMINIO
NTFY_TOKEN=tk_xxxxxxxxxxxxxxxx
```

e `sudo systemctl restart duotalk-signaling`.

### Sui telefoni

Installa l'app **ntfy** (F-Droid o Play Store) su entrambi:
1. impostazioni → server predefinito → `https://ntfy.TUO_DOMINIO`, con utente `duo`;
2. iscrivi ciascun telefono **al proprio** topic (es. `duotalk-anna-x7k2`);
3. togli ntfy dall'ottimizzazione batteria, o le notifiche arriveranno in ritardo.

Scegli nomi di topic lunghi e casuali: `duotalk-<nome>-$(openssl rand -hex 3)`.

Prova manuale:
```bash
curl -H "Authorization: Bearer tk_xxx" \
     -d '{"topic":"duotalk-anna-x7k2","message":"prova"}' \
     https://ntfy.TUO_DOMINIO
```

## 4. TURN (coturn) — fallback

```bash
sudo apt install coturn
sudo cp server/deploy/coturn.conf.example /etc/turnserver.conf
sudoedit /etc/turnserver.conf     # external-ip, realm, user=..., cert/pkey
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
sudo systemctl enable --now coturn
```

Apri sul firewall: **TCP/UDP 3478**, **TCP 5349**, **UDP 49152-65535**.

## 5. Configurazione dell'app

Vedi la tabella nel [README](../README.md#3-configurazione). In sintesi: server, token,
canale e passphrase **identici**; i due topic ntfy **incrociati**.

## Troubleshooting

| Sintomo | Causa probabile | Rimedio |
|---------|-----------------|---------|
| "Token errato" | ACCESS_TOKEN diverso | allinea app e `.env` |
| Resta "Sei nel canale" | canale diverso, o l'altro non ha aperto l'app | stesso nome canale; usa "Avvisa" |
| "Passphrase diversa" | le due passphrase non coincidono | riallineale |
| Notifiche mai ricevute | NTFY_URL vuoto, topic non iscritto, batteria | `/duotalk/healthz` deve dire `ntfy:true`; controlla l'iscrizione |
| Notifica arriva ma non apre l'app | deep link mancante | rilancia `node scripts/patch-android-manifest.js` e ricompila |
| Si collegano ma niente audio | rete che blocca il P2P | configura coturn |
| Esci dal canale in background | il sistema chiude l'app | escludi DuoTalk dall'ottimizzazione batteria (vedi sotto) |
| Nessuna notifica fissa "Sei nel canale" | permesso notifiche negato | concedilo: il servizio ne ha bisogno per restare vivo |

## 6. Impostazioni sui telefoni

Perché la presenza nel canale regga davvero:

1. **DuoTalk**: *Impostazioni → App → DuoTalk → Batteria → Senza restrizioni*.
   Su Xiaomi/Huawei/Samsung cerca anche "avvio automatico" e attivalo.
2. **DuoTalk**: concedi microfono, camera e **notifiche** (senza notifiche il foreground
   service non può mostrare la sua notifica fissa).
3. **ntfy**: stessa esenzione dalla batteria, o gli avvisi arriveranno in ritardo.
