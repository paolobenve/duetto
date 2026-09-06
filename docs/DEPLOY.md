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
  --exclude devices.json \
  /path/to/duetto/server/ user@YOUR_SERVER:/opt/duetto/server/
```

Both `.env` and `devices.json` belong to the installation and not to the code: the first
holds the relay's password, the second the phones let in. Copying them over from a
developer's machine would replace what the server knows with somebody else's list.

Back on the **server**:

```bash
cd /opt/duetto/server
cp .env.example .env      # it is fine as it is
npm install --omit=dev
npm run test:smoke        # it has to print ALL OK
```

### The key of the house

The door shuts by itself: the first phone that knocks at a server nobody has taken becomes
its owner, and from then on a stranger is turned away before being told anything — the TURN
credentials included. On a public address, though, "the first phone that knocks" may not
be yours. One line in the `.env` makes the first knock have to know a word:

```bash
openssl rand -hex 12          # something like 3f9c1a77e4b20d58c6a1
```

```
SERVER_KEY=3f9c1a77e4b20d58c6a1
```

The app asks for it when the server does, and only then. It does two things: it decides
who may take the house, and it brings the owner home — a reinstalled phone is known by a
new card, and with the key it is written down as the owner again. Without a key the owner
of a server they have lost the card to has no way in but a terminal.

It is not an identity and it protects nothing of the conversation: whoever has it can take
this house, and no further. What keeps a pair apart from everybody else is the pairing
code, which never reaches the server.

### One key per phone

A key of the house is a word, and a word gets repeated: it cannot be taken back from one
person without changing it for everybody, and when it turns up elsewhere there is no
telling who passed it on.

A phone carries a key of its own. It makes one the first time it is asked for, and the
secret half never leaves it; the other half — the card — is what the server writes down,
and at every connection the server picks a number and the phone signs it. Normally the
server writes it down by itself: the first card at the door takes the house, the others
come in by invitation. The list lives in `devices.json`, beside the server.

The same can be written by hand in the `.env`, for whoever prefers to see the list in a
file of their own:

```
AUTHORISED_KEYS=anna:kK9v…Q=,bruno:7Yt2…w=
```

The cards are in `devices.json` and in the log. To take one phone away, its entry goes and
nobody else notices.

### Inviting somebody

Writing keys into the `.env` works for the two or three phones of whoever owns the server.
It stops working the moment somebody else is to be let in: you would have to be at a
keyboard, with their card in front of you, at the moment they ask.

So there is an invitation instead — a short code, made for one person, spent once. It is
made **from the app**, on a phone of yours: *the cogwheel → Who may use this server →
Invite somebody*. Write the name, touch, and the code appears, ready to be handed over.
Below it is the list of who is in, with «take away» beside each name.

Nothing new proves who you are: the phone asking has just shown a card this server
recognised, so it already knows whose it is. Only the owner's phones may do it — the one
that took the server, and those written in `AUTHORISED_KEYS`.

So there are three ways to be on this server, and it is worth keeping them apart:

| | may open connections | may invite |
|---|---|---|
| took the server, or written in `AUTHORISED_KEYS` | yes | yes |
| came in with an invitation | yes | no |
| the other half of somebody's connection | no — that one room | no |

The people you talk to need none of it: they are the other half of your connections, and
they are let in beside you without asking anybody for anything. The app says as much at
the door — "this server has an owner" — and offers the two ways in.

The same from a terminal, when the app is not at hand — or when you have shut yourself
out and the app cannot connect at all:

```bash
sudo -u duetto npm run invite -- anna
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

⚠️ The service has to be **allowed to write it**. The unit here hardens the server with
`ProtectSystem=strict`, which makes the whole filesystem read-only — right for something
that only forwards envelopes, and wrong from the moment it keeps a list. The line that
opens the one door it needs is already in the example:

```
ReadWritePaths=/opt/duetto/server
```

Without it the server says `cannot write …: read-only file system` and carries on with no
memory: phones are let in and forgotten at the next restart. Whoever set the server up
before this existed has to add the line and `systemctl daemon-reload`.

The file is written by the service, as its own user. So the commands above are run as that
user too:

```bash
sudo -u duetto npm run invite -- anna
```

⚠️ The door is shut as soon as **one** phone is on the list — the one that took the
server, one from the `.env`, or one from an invitation. So knock with a phone of yours
first: otherwise the first phone to arrive shuts the door on you. On a public address,
set a `SERVER_KEY` before starting, and only whoever knows it can take the house.

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

### A copy of the list

`devices.json` is the phones, the invitations and the rooms: losing it means pairing
everybody again. A timer in `deploy/` copies it once a day into `/var/backups/duetto/`,
dated, and keeps a month of copies. It runs as root, which may read the file whoever owns
it; the path in the unit is the server's folder, to adjust if yours is elsewhere:

```bash
sudo cp /opt/duetto/server/deploy/duetto-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now duetto-backup.timer
sudo systemctl start duetto-backup.service     # the first copy, now
ls -l /var/backups/duetto/
```

To put a copy back: stop the service, copy the file over `devices.json` with the same owner
and mode, start the service.

### A relay user per phone

With one TURN credential shared by everybody, whoever takes it out of a phone keeps the
relay for good, and a phone taken off the list keeps it too. Coturn has a user database
(`/var/lib/turn/turndb` on Debian) that it consults at every request, and the server can
keep one user per phone in it: made the first time the phone is let in, handed to that
phone alone with `joined`, dropped when the phone leaves, is taken off, or its pair is
forgotten. The shared credential stays in `turnserver.conf` as the fallback.

The making and the dropping are plain writes to that database with `sqlite3` (the
long-term key coturn keeps is `md5("user:realm:password")`, never the password). The
service runs with no new privileges, so there is no sudo in the way: its user joins
coturn's group, the database is group-writable, and the unit is allowed to write there:

```bash
sudo apt-get install sqlite3
sudo usermod -aG turnserver duetto
sudo chmod 660 /var/lib/turn/turndb
sudo systemctl edit duetto-signaling      # add, under [Service]:
#   SupplementaryGroups=turnserver
#   ReadWritePaths=/var/lib/turn
```

then, in the server's `.env`:

```
TURN_DB=/var/lib/turn/turndb
TURN_REALM=example.org
```

and `systemctl daemon-reload` plus a restart. `sudo turnadmin -l` lists the users: one per
phone, named by a piece of the card's fingerprint. The server's log says when one is made
or dropped.

### Keeping the insistent out

The server counts the attempts at its door by itself (`JOIN_LIMIT` per address,
`JOIN_LIMIT_ALL` for everybody together) and turns away whoever exceeds them. With
fail2ban the block can move to the firewall, so that whoever keeps trying does not even
reach node: every phone turned away is one line in the log, with its address, and the
filter and jail in `deploy/fail2ban/` read them from the journal:

```bash
sudo cp /opt/duetto/server/deploy/fail2ban/duetto-door.conf /etc/fail2ban/filter.d/
sudo cp /opt/duetto/server/deploy/fail2ban/duetto-door-jail.conf /etc/fail2ban/jail.d/duetto-door.conf
sudo fail2ban-regex systemd-journal /etc/fail2ban/filter.d/duetto-door.conf   # a dry run
sudo fail2ban-client reload
sudo fail2ban-client status duetto-door
```

Thirty refusals in ten minutes ban the address for an hour. The app stops knocking after
one refusal, so that is somebody trying codes - but an address is often a whole household,
and a phone with an old version of the app, retrying every few seconds, would ban the
family along with it. Keep the numbers generous.

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
sudoedit /etc/turnserver.conf     # external-ip, realm, user=...
sudo chgrp turnserver /etc/turnserver.conf && sudo chmod 640 /etc/turnserver.conf

# the relay's TLS door: a copy of the certificates coturn can read,
# and the hook that keeps the copy fresh at every renewal
sudo mkdir -p /etc/coturn-certs
sudo cp -L /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem \
           /etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem /etc/coturn-certs/
sudo chown turnserver:turnserver /etc/coturn-certs/*.pem && sudo chmod 600 /etc/coturn-certs/*.pem
sudoedit /opt/duetto/server/deploy/letsencrypt-coturn-hook.sh   # LINEAGE=...
sudo install -m 755 /opt/duetto/server/deploy/letsencrypt-coturn-hook.sh \
     /etc/letsencrypt/renewal-hooks/deploy/coturn

# the log directory (/var/log itself is not writable by turnserver)
sudo mkdir -p /var/log/coturn && sudo chown turnserver:turnserver /var/log/coturn

sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
sudo systemctl enable --now coturn
journalctl -u coturn -n 50 | grep "Cannot find config"   # must find NOTHING
```

⚠️ That `chgrp` is not cosmetic. The service runs as the `turnserver` user, and when that
user cannot read `/etc/turnserver.conf`, coturn does not stop: it starts **with its
built-in defaults** — no TLS, no credentials, no log — and the only sign is one line in
the journal. Hence the final check.

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
TURN_URL=turns:YOUR_DOMAIN:5349?transport=tcp
STUN_URL=stun:YOUR_DOMAIN:3478
TURN_USER=duetto
TURN_PASS=...        # the password written in /etc/turnserver.conf
```

TLS alone, on purpose: certain mobile networks kill every non-web flow on a clock —
UDP and plain TCP alike — and only a relay leg dressed as web traffic survives. Where
the road is direct the relay carries nothing, so the dress costs nothing. `STUN_URL` is
needed with it: it can no longer be derived from the relay's address.

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
| "This server does not let you in" | `SERVER_KEY` set on the server and wrong on the phone | write the right one in the app under the address |
| "This server does not know this phone" | the server has an owner, and this phone is not on its list | an invitation from the owner, or their pairing code; if the server is yours, its key brings you home |
| "The invitation does not work" | wrong, already spent, or expired | make another one |
| "No answer from the other phone" | a different code, or the other one is not connected | do the pairing again with a new code |
| "The code does not match" | digits typed wrong | that is the check doing its job: generate the code again |
| They connect but there is no sound | the network blocks P2P | configure coturn |
| It stays "connecting" and then "failed" on different networks | the relay is missing, or cannot be reached | `stun-check.mjs` from outside: if it does not answer it is the firewall |
| It leaves the channel in the background | the system closes the app | exclude Duetto from battery optimisation |
| After a phone reboot it is no longer listening | a known limit | open the app once |
