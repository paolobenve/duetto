# Duetto

A tiny "Discord" made to measure for **two people only**. It is not an app for *calling*:
it is a **permanent channel**. Open the app and you are in; if the other person is there
too you connect by yourselves, and otherwise you stay reachable and get told the moment
they arrive.

Audio and video travel **end-to-end encrypted straight between the two phones**. Your
server is only there to let you find each other: **it cannot read anything**.

## How it is installed, from the point of view of whoever uses it

1. You install the app
2. You write the name of your server
3. On one phone you press «Create the code», on the other you type in the eight digits
   that appear
4. You grant two system settings, which the app explains and opens for you

Done, for good. No other service to install, no password to invent, no channel or
passphrase to keep the same.

## How it works

```
  Phone A  ⇄  [ your server: signalling + TURN fallback ]  ⇄  Phone B
     └──────────  P2P encrypted audio/video (DTLS-SRTP)  ─────────┘
```

- **A channel, not a call**: you go in and you stay. The server holds the presence, two at
  most.
- **Always reachable**: outside the channel the app stays *listening* — microphone closed,
  connection open — and tells you when the other person comes in. The notification is
  shown by the app itself: no third-party service, no Firebase.
- **After a reboot too**: presence starts again by itself, without opening the app.
- **Audio at once, video on request**: going in opens the microphone; the camera comes on
  only if you want it, and when you turn it off it is really released.
- **It picks itself up**: if the network drops, on its return the link is rebuilt in about
  a second, with nothing to touch.

## The layout

```
duetto/
├── server/              # WebSocket signalling
│   ├── src/index.js     # presence, states, envelope forwarding, TURN relay
│   ├── smoke-test.mjs   # 42 end-to-end checks
│   ├── tools/           # stun-check.mjs: checks the relay from outside
│   └── deploy/          # haproxy, apache, nginx, coturn, systemd
├── app/                 # Android app in React Native
│   ├── src/             # pairing, crypto, signalling, webrtc, UI
│   ├── modules/duetto-platform/   # the native Kotlin module
│   ├── bootstrap.sh     # generates the Android native part
│   └── scripts/         # module syncing, build number, manifest
└── docs/                # architecture and the deploy guide
```

## A quick start

### The server

```bash
cd server
cp .env.example .env      # it is fine as it is
npm install
npm run test:smoke        # it has to print ALL OK
npm start
```

Then expose it over HTTPS behind the proxy you already have, and add `coturn` for when the
two phones are on different networks — it is all in [docs/DEPLOY.md](docs/DEPLOY.md).

### The Android app

What you need first: Node 18+, JDK 17, the Android SDK (`ANDROID_HOME`).

```bash
cd app
./bootstrap.sh          # creates android/, applies the manifest and permissions, npm install
npm run build:apk       # a release APK, with the build number raised
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

The version appears **at the top right in the app**; the build number, which changes at
every compilation, is at the bottom of the settings. With frequent installations it is
easy to spend a long time trying an old APK believing it is the new one: if you report a
problem, say that number as well.

On some phones (Xiaomi, POCO) `adb install` is blocked until you turn on
*Developer options → Install via USB*. Failing that, copy the APK to the phone and open it
from the file manager.

## The pairing

Whoever creates the pair gets **eight digits**. The other one types them in. From then on
the two phones are paired for good and the code is of no further use: throw it away.

What happens underneath:

1. From the code comes `pairId`, the only thing the server sees. The code **never reaches
   it**.
2. The two phones exchange public keys and do a Diffie-Hellman (X25519), mixing the code
   into the derivation.
3. Each one sends a proof that it holds the key. If the code typed in is wrong the proof
   does not come back and the pairing **fails saying so**, instead of leaving you with a
   mute connection.

Read the code out **aloud or in person**, not by message. After the pairing it counts for
nothing any more.

## The interface

Five buttons in a dark panel at the bottom, always there. After 4 seconds they dim to 40%
so as not to cover the picture, and come back to full at the first touch anywhere; they
stay pressable while dimmed.

| Button | What it does |
|---|---|
| **Video** | turns the camera on and off |
| **Audio** | a touch: mute. **A long press**: where the sound comes out |
| **Turn** | front ↔ back; off when the video is off |
| **Alert** | calls the other back: it works even when they are in the channel but distracted |
| **Leave** | leaves the channel and closes the window, staying reachable |

The possible audio outputs are four and no more: **speaker**, **phone** (the earpiece),
**headphones**, **Bluetooth**. Only the ones connected appear, and the choice is
**remembered** for the next time.

### Video

- **Nothing is sent to somebody who is not looking**: when the other person's app leaves
  their screen, your phone stops sending the video and takes it up again as soon as it
  comes back. The camera stays on for the preview, but the bandwidth does not go off
  towards a dark screen. In Picture-in-Picture the video carries on: there it really is
  being watched.
- Whoever is full-screen is **never cropped**: any black bars are the price of an
  untouched picture.
- The little frame always has **the proportions of its own camera**, never square. It can
  be dragged and resized: the corner handle or two fingers. Sharp corners on purpose — the
  video is a native surface that no rounded border can cut into.
- **It stays where you put it**, even when the app is closed: it remembers which edge you
  rested it against, and how far from it, as a percentage. That way a little frame at the
  bottom left stays there even when the video changes shape and the black bars move.
- **Touching it, the two swap** places. The chosen arrangement **survives the
  interruptions**: nothing moves when the network comes and goes.
- **Pinch to enlarge** up to 5×, drag to move about inside the enlargement, double tap to
  go back to the whole screen.
- During an interruption a warning appears and the frame stays where it is, empty: the
  arrangement never changes.

### Video quality

Four profiles, each with its own **capture resolution** and its own bandwidth ceiling:

| | Capture | Ceiling |
|---|---|---|
| Saver | 640×360 | 300 kbit/s |
| Standard | 960×540 | 1.2 Mbit/s |
| Better | 1280×720 | 2.5 Mbit/s |
| Best | 1920×1080 | 4 Mbit/s |

The choice **holds for both phones**: the profile acts on the encoder of whoever is
sending, so on its own it would change only what the other one sees. Keeping them in step,
the choice means "how we watch"; if it does not suit the other person, they change it
back.

Changing profile **reopens the camera**, and a moment of black can be seen. It is the
price of something found out by measuring: the painless way would be to scale the
encoder's output, and on some phones that works — on others the request is recorded and
then disregarded, and that phone goes on sending 1080p with the "saver" profile on. The
capture resolution, on the other hand, no encoder can ignore.

If the sensor does not have the format asked for it falls back on the nearest one, which
may be 4:3: the proportions change from one profile to another, and the little frame
adapts accordingly. The log says so (`not a 16:9 format`).

Under the buttons there is **what is really going through**, in both directions:

```
Resolution: best   ↑1920×1080·30fps·460kB/s   ↓960×540·24fps·140kB/s
```

The ceilings are not targets: if the scene costs little and the network holds, two
different profiles can give the same result. That line is the only way of knowing.

**VP9** compresses about a third better, but it appears as a choice only if **both** phones
have the encoder in hardware — the app asks the system at start-up. In software it would
cost more battery than the bandwidth it saves, and codec preferences hold for the whole
session: choosing it because one of the two can do it would force the other to encode in
software.

### When there is no video

In place of the picture a **face generated by the pair** appears: a colour and a symbol
that always stay the same, different on the two phones. It is not random at every opening,
so it becomes recognisable as "them". If you have written a name, its initial wins. The
ring turns green when the other person is in the channel.

### The Back key

It does not leave the channel: it puts the app into the **little Picture-in-Picture
window**, which stays on top of the other apps while you go on talking.

## Staying reachable

A *foreground service* keeps the connection alive in the background and with the screen
off, and shows a **standing notification**: it cannot be removed, it is Android that
imposes it in return for the right to stay active.

After the **phone reboots** presence starts again by itself: a receiver starts the
JavaScript engine without opening the interface. It takes some tens of seconds for the
system to give the app room, so an alert sent right after a reboot may still not find it.

⚠️ **Two system settings are indispensable**, and the app offers them at the end of the
pairing (they can be opened again from *the cogwheel → Staying reachable*):

1. **Unrestricted battery use**. On Xiaomi, Huawei and Oppo this is handled by the maker
   and not by Android: the tick in the app can stay grey even after it has been set
   correctly.
2. **Auto-start**. It is not an Android permission but a screen of the maker's own: the app
   can only open it for you, and cannot read its state. It can, though, notice whether it
   worked: it notes down when it starts by itself after a reboot, and only then does it
   count that point as settled. **Without it, after a reboot the phone does not even
   deliver the boot event** and presence does not start again.

## Security

- ✅ Audio/video encrypted end-to-end, even when they go through the TURN.
- ✅ Signalling encrypted and authenticated: the server can neither read nor alter it.
- ✅ The key is 256 bits and comes from a Diffie-Hellman exchange, not from a password.
- ✅ At most two presences per pair; different pairs do not see one another.
- ⚠️ The delicate moment is **the pairing alone**: protect the code while you read it out.
- ⚠️ The server sees the **metadata**: which pairs are connected and when, not what you
  say to each other.

The full threat model is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Working out what went wrong

The app records everything that is needed. With the phone plugged in:

```bash
adb logcat -s ReactNativeJS | grep duetto
```

Three families of lines: `duetto-rtc` for the audio/video link, `duetto-sig` for the
connection to the server (drops included, with the code and how long it lasted),
`duetto-presence` for the listening after a reboot.

The most useful line when something drops is `path:`, which says where the traffic is
going through — `LOCAL (same network)`, `DIRECT through NAT` or `RELAY (through the
server)`. The three roads have different weaknesses, and without knowing which one it is
one ends up blaming the wrong thing.

With two phones plugged in you have to say which: `adb -s <serial> logcat …`

If the app were to close by itself, the stack is minified and has to be translated:

```bash
adb logcat -b crash -d | tail -40 > /tmp/stack.txt
npx metro-symbolicate app/android/app/build/generated/sourcemaps/react/release/index.android.bundle.map < /tmp/stack.txt
```

## History

What changes at every version, from the point of view of whoever uses it:
[CHANGELOG.md](CHANGELOG.md).

The version is raised by hand in `app/version.json`, when a set of changes is worth
announcing: it is a decision, not a counter. The build number, on the other hand, goes up
by itself at every compilation.

## Licence

Personal use.
