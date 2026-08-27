# A guide to deploying on your own server

Two pieces: the **signalling server** (compulsory) and **coturn** for the fallback link
(recommended). Nothing else: the notifications do not go through any outside service.

## 1. The signalling server

On the server:

```bash
sudo mkdir -p /opt/duetto && sudo chown $USER /opt/duetto
```

From your **PC**, to copy the code over:

```bash
rsync -rltvz --no-owner --no-group --exclude node_modules --exclude .env \
  /path/to/duetto/server/ user@YOUR_SERVER:/opt/duetto/server/
```

Back on the **server**:

```bash
cd /opt/duetto/server
cp .env.example .env      # it is fine as it is
npm install --omit=dev
npm run test:smoke        # it has to print ALL OK
```

### Starting it for good

A dedicated service user, which only has to **read** the files:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin duetto
sudo chown -R $USER:duetto /opt/duetto
sudo chmod -R u+rwX,g+rX,o-rwx /opt/duetto
sudo find /opt/duetto -type d -exec chmod g+s {} \;   # new files inherit the group
sudo chmod 640 /opt/duetto/server/.env

sudo cp /opt/duetto/server/deploy/duetto-signaling.service /etc/systemd/system/
sudo sed -i "s|^User=.*|User=duetto|; s|^ExecStart=.*|ExecStart=$(which node) src/index.js|" \
  /etc/systemd/system/duetto-signaling.service

sudo systemctl daemon-reload
sudo systemctl enable --now duetto-signaling
curl -s http://127.0.0.1:8787/healthz      # {"ok":true,"rooms":0}
```

The `g+s` bit on the folders avoids a recurring problem: without it, files copied later
with rsync are born with a group the service cannot read.

## 2. Exposing it over HTTPS

The signalling server stays on `127.0.0.1:8787`; in front of it goes whatever you already
have. In `server/deploy/` there are examples for the three cases.

### HAProxy

If port 443 belongs to HAProxy, send it `/duetto/` **straight** to Node, without going
through the rest of the chain. It is not only convenience: Varnish, if it is there, does
not handle WebSockets without an explicit `pipe`, and a cache in front of the signalling
server would make no sense.

In the frontend for 443, **after** any `http-request` rules:

```
    acl duetto_path path_beg /duetto/
    use_backend duetto_backend if duetto_path
```

At the end of the file:

```
backend duetto_backend
    mode http
    option http-keep-alive
    timeout tunnel 3600s
    timeout server 3600s
    server duetto 127.0.0.1:8787 check
```

⚠️ **`timeout tunnel` is not optional.** Without it, it inherits `timeout
client`/`server` from `defaults` (often 50 seconds) and cuts the WebSocket off
constantly: the symptom is "presence drops by itself now and then", which is extremely
hard to trace back to HAProxy. And `option http-keep-alive` is there to override `option
http-server-close`, if you have it in `defaults`.

### Apache

Inside the existing `<VirtualHost *:443>`, and **before** any other rewrite rules of the
site:

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

See `server/deploy/nginx.conf.example`.

### Checking

```bash
curl -s https://YOUR_DOMAIN/duetto/healthz
```

Expected: `{"ok":true,"rooms":0}`. And the test that really counts, the upgrade to
WebSocket:

```bash
curl -s -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" \
  https://YOUR_DOMAIN/duetto/ws | head -3
```

Expected: `HTTP/1.1 101 Switching Protocols`. If the first answers but the second does
not, the request is not reaching the right backend: nearly always it is the order of the
rules.

## 3. TURN (coturn) — the fallback link

It is needed when the two networks prevent a direct link (symmetric NATs, certain mobile
networks). Even going through the TURN the traffic stays end-to-end encrypted: the relay
forwards packets it cannot read.

```bash
sudo apt install coturn
sudo cp /opt/duetto/server/deploy/coturn.conf.example /etc/turnserver.conf
sudoedit /etc/turnserver.conf     # external-ip, realm, user=..., cert/pkey
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
sudo systemctl enable --now coturn
```

The firewall: **TCP/UDP 3478**, **TCP 5349**, and the relay range (for two people a few
dozen ports are enough: `min-port`/`max-port` in `turnserver.conf`).

```bash
# with firewalld
sudo firewall-cmd --permanent --add-port=3478/tcp --add-port=3478/udp
sudo firewall-cmd --permanent --add-port=5349/tcp
sudo firewall-cmd --permanent --add-port=49160-49200/udp
sudo firewall-cmd --reload

# with ufw
sudo ufw allow 3478/tcp && sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp && sudo ufw allow 49160:49200/udp
```

⚠️ If your provider has a firewall of its own (a web panel), the ports have to be opened
**there as well**: the server knows nothing about it, and from the inside everything looks
fine.

Check that the relay answers **from outside**, not from the server itself:

```bash
node server/tools/stun-check.mjs YOUR_DOMAIN 3478
```

Then tell the signalling server, which will pass it on to the phones: in the `.env`

```
TURN_URL=turn:YOUR_DOMAIN:3478
TURN_USER=duetto
TURN_PASS=...        # the password written in /etc/turnserver.conf
```

and `sudo systemctl restart duetto-signaling`. The health check has to answer
`"turn":true`. **On the phones nothing is configured.**

## 4. On the phones

In the app the **name of the server** is all that is needed. Then the pairing by code, and
nothing else is ever touched.

For presence to really hold:

1. *Settings → Apps → Duetto → Battery → **Unrestricted***. On Xiaomi/Huawei/Samsung look
   for "auto-start" as well and turn it on.
2. Grant the microphone, the camera and **notifications** (without notifications the
   foreground service cannot show its own, and Android closes it).

## 5. If the server came from DuoTalk

The app used to be called DuoTalk: the `/opt/duotalk` folder, the `duotalk-signaling`
service, the `/duotalk/ws` path in the proxy. The code is the same, only the names change.
It is worth adding the new path **first** while leaving the old one: that way the phones
still on DuoTalk go on working until Duetto is installed on them.

In the proxy, next to the rules for `/duotalk/ws` put the same ones for `/duetto/ws` — the
updated `.conf.example` already has them — then reload. From outside:

```bash
curl -s https://YOUR_DOMAIN/duetto/healthz     # {"ok":true,...}
```

Then the folder and the service. `server/deploy/migrate-from-duotalk.sh` does all of it,
keeping the owner, the group and the existing unit — it changes the names and no more —
and if the new service does not answer it puts things back as they were:

```bash
scp server/deploy/migrate-from-duotalk.sh user@YOUR_SERVER:/tmp/
ssh -t user@YOUR_SERVER 'sudo bash /tmp/migrate-from-duotalk.sh'
```

By hand, to see what it does: the `.env` is inside `/opt/duotalk/server` and has to be
kept, which is why it is moved instead of recreated.

```bash
sudo systemctl stop duotalk-signaling
sudo mv /opt/duotalk /opt/duetto
```

From the PC, the new code (`--exclude .env` leaves it untouched):

```bash
rsync -rltvz --no-owner --no-group --exclude node_modules --exclude .env \
  /path/to/duetto/server/ user@YOUR_SERVER:/opt/duetto/server/
```

On the server, the service user and the new unit file:

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

Once both phones have moved to Duetto, take the `/duotalk/ws` rules out of the proxy,
along with the user left behind: `sudo userdel duotalk`.

`TURN_USER` in the `.env` is not to be touched: it is the credential written in
`/etc/turnserver.conf`, and changing it on one side only turns the relay off.

## Troubleshooting

| Symptom | Likely cause | Remedy |
|---------|--------------|--------|
| `Upgrade Required` from healthz | the proxy forwards a path the server does not recognise | update the server: it accepts any prefix |
| healthz answers but the app does not connect | the WebSocket rules are never reached | check the **order** of the rules in the proxy |
| Presence drops every ~50 seconds | `timeout tunnel` not set | set it to 3600s |
| "No answer from the other phone" | a different code, or the other one is not connected | do the pairing again with a new code |
| "The code does not match" | digits typed wrong | that is the check doing its job: generate the code again |
| They connect but there is no sound | the network blocks P2P | configure coturn |
| It stays "connecting" and then "failed" on different networks | the relay is missing, or cannot be reached | `stun-check.mjs` from outside: if it does not answer it is the firewall |
| It leaves the channel in the background | the system closes the app | exclude Duetto from battery optimisation |
| After a phone reboot it is no longer listening | a known limit | open the app once |
