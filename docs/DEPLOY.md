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

### The key of the house

A server with no key can be used by anybody who learns its address — and, worse, hands
them the TURN credentials in the very first message, which is your bandwidth paid by you.
One line in the `.env` closes the door:

```bash
openssl rand -hex 12          # something like 3f9c1a77e4b20d58c6a1
```

```
SERVER_KEY=3f9c1a77e4b20d58c6a1
```

Then say it out loud to the people who use your server, as you would the key of a house:
in the app it goes under the address, in the settings. To take it away from somebody,
change it here and tell the others the new one.

It is not an identity and it protects nothing of the conversation: whoever has it can
knock at this door, and no further. What keeps a pair apart from everybody else is the
pairing code, which never reaches the server. And left empty, the server lets everybody in,
as it always did.

### One key per phone

A key of the house is a word, and a word gets repeated: it cannot be taken back from one
person without changing it for everybody, and when it turns up elsewhere there is no
telling who passed it on.

A phone can carry a key of its own instead. It makes one the first time it is asked for,
and the secret half never leaves it; the app shows the other half under *the cogwheel →
This phone's card*. That half can travel by any road — a message, a piece of paper — since
with it alone nobody gets in. At every connection the server picks a number and the phone
signs it.

```
AUTHORISED_KEYS=anna:kK9v…Q=,bruno:7Yt2…w=
```

To take one phone away, its entry goes and nobody else notices. The log says which name
came in. With this set, `SERVER_KEY` is ignored: the door is the signature.

### Inviting somebody

Writing keys into the `.env` works for the two or three phones of whoever owns the server.
It stops working the moment somebody else is to be let in: you would have to be at a
keyboard, with their card in front of you, at the moment they ask.

So there is an invitation instead — a short code, made for one person, spent once. It is
made **from the app**, on a phone of yours: *the cogwheel → Who may use this server →
Invite somebody*. Write the name, touch, and the code appears, ready to be handed over.
Below it is the list of who is in, with «take away» beside each name.

Nothing new proves who you are: the phone asking is at the other end of a connection this
server has just let in by signature, so it already knows whose it is. Only the phones
written in `AUTHORISED_KEYS` may do it — those are yours. Whoever came in with an
invitation is a guest: they can talk to anybody, and hand out nothing.

The same from a terminal, when the app is not at hand — or when you have shut yourself
out and the app cannot connect at all:

```bash
npm run invite -- anna
```

It prints something like `KRT4-9WBH`. Hand it over as you would a pairing code — out loud,
by message, however you like — and the person writes it in the app under the server's
address, once, before connecting. Their phone gets written down under that name, and the
code is spent: whoever it was passed on to finds it worth nothing, which is the cheapest
way of noticing that it was passed on.

```bash
npm run devices                      # who is on the list, and what is still invited
npm run devices -- --remove anna     # takes a phone away, at the next knock
```

**Whoever you let in brings their own people.** Anna does not need an invitation for the
person she pairs with: that phone is let in beside hers, the first time, while she is in
the room — and it is written down for that room alone. With that key it cannot open a room
of its own, so what you let in does not let anybody else in. Taking Anna away takes her
rooms and the people she brought with them.

There is no ceiling on how many connections one person may open: a phone is in one at a
time, so many rooms cost open sockets and not conversations. `npm run devices` shows the
count beside each name, which is worth seeing without being worth forbidding.

Nothing needs restarting: the list is read every time somebody knocks. It lives in
`devices.json` beside the server, or wherever `DEVICES_FILE` says.

⚠️ The door is shut as soon as **one** phone is on the list — from the `.env` or from an
invitation. So put your own phones in first, or make an invitation for each of them and
use them yourself: otherwise the first person to accept an invitation shuts the door on
you. `npm run invite` says so when the list is still empty.

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

## Troubleshooting

| Symptom | Likely cause | Remedy |
|---------|--------------|--------|
| `Upgrade Required` from healthz | the proxy forwards a path the server does not recognise | update the server: it accepts any prefix |
| healthz answers but the app does not connect | the WebSocket rules are never reached | check the **order** of the rules in the proxy |
| Presence drops every ~50 seconds | `timeout tunnel` not set | set it to 3600s |
| "This server does not let you in" | `SERVER_KEY` set on the server and missing, or wrong, on the phone | write it in the app under the address |
| "This server does not let you in", with `AUTHORISED_KEYS` | that phone's card is not in the list, or is in it wrongly | copy it again from *the cogwheel → This phone's card* |
| "No answer from the other phone" | a different code, or the other one is not connected | do the pairing again with a new code |
| "The code does not match" | digits typed wrong | that is the check doing its job: generate the code again |
| They connect but there is no sound | the network blocks P2P | configure coturn |
| It stays "connecting" and then "failed" on different networks | the relay is missing, or cannot be reached | `stun-check.mjs` from outside: if it does not answer it is the firewall |
| It leaves the channel in the background | the system closes the app | exclude Duetto from battery optimisation |
| After a phone reboot it is no longer listening | a known limit | open the app once |
