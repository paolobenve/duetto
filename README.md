# Duetto

A tiny "Discord" made to measure for **two people only**. It is not an app for *calling*:
it is a **permanent channel**. Open the app and you are in; if the other person is there
too you connect by yourselves, and otherwise you stay reachable and get told the moment
they arrive.

Audio and video travel **end-to-end encrypted straight between the two phones**. Your
server is only there to let you find each other: **it cannot read anything**.

## How it is installed, from the point of view of whoever uses it

1. You install the app
2. You write the name of your server, and the key it asks for, if it asks for one
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
- **More than one pairing**: the phone can hold several connections, each with its own
  name, its own server and its own settings. You are in one at a time.

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

### From nothing to talking

The whole thing, in order, for whoever is setting up both ends. It matters that the door
is shut last: a server that already asks who you are, before the phones have anything to
show, locks out the very person installing it.

1. **Put the server up** with the door open — no `SERVER_KEY`, no `AUTHORISED_KEYS` — and
   check it answers: `curl -s https://YOUR_DOMAIN/duetto/healthz`.
2. **Install the app** on both phones. It opens on the settings, because there is nothing
   it could do before knowing where to go.
3. **Write the name of the server** — the domain alone is enough, the app builds the rest
   of the address — and save. Nothing else needs typing.
4. **Pair the two phones**: «Create the code» on one, the eight digits typed on the other.
   From this moment they are a pair for good.
5. **Grant the two system settings** the app offers at the end of the pairing: unrestricted
   battery, and auto-start where the maker asks for it. Without them presence does not
   survive the night.
6. **Then, if you want, shut the door.** Take each phone's card from *the cogwheel → This
   phone's card*, put them in `AUTHORISED_KEYS`, and restart the server. From then on only
   those phones get in, and any one of them can be taken away without touching the others.

Adding a third phone later is the same from step 2, plus its card in the list.

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

### More than one connection

The pairing can be done more than once, and the connections stay: *the cogwheel →
Connections* lists them, «Add a connection» adds one — showing a new code, or taking the
other person's. It remains an app for two: **two at a time**. You are in one connection,
and while you are there you are reachable in that one and no longer in the one you left.
At start-up the app takes up the last one used.

Each of them carries its own things, and that is the point of them being separate:

- **A name that is yours alone.** Not the person's: the name of the thread between you —
  "Home", "Office", "Mountains". It shows on the pill at the top and in the standing
  notification, so you know which connection you are in. It never travels: the other
  person does not see it and will never know it.
- **Its own server.** A pair lives inside the server it was born on. Two connections can
  be on two different servers, and moving from one to the other carries the address along.
- **Its own settings, all of them.** The video quality, the richer voice, the technical
  lines, how much the controls step aside, the codec, the vibration and the sound of the
  alert, where the sound comes out and how much the other voice is lifted for each output,
  which camera opens, and **the language**: the same phone can speak English with somebody
  and Italian with somebody else.
- **Its own journal**, in a file of its own: the consumption of two different phones does
  not end up mixed into lines that do not say whose they are.

Nearly everything one chooses is about a person rather than about the app — the quality
depends on the network they have, the alert sound is how you recognise them without
looking, the volume of their voice on how their microphone was recorded. Kept once for the
whole app, changing connection dragged along the choices made for somebody else.

Breaking one is «Break the connection with…», and it takes a new pairing to have it back.
On the other phone there is nothing to break: from there «Add a connection» is enough.

## The interface

Five buttons in a dark panel at the bottom, always there. After 4 seconds they dim to 40%
so as not to cover the picture, and come back to full at the first touch anywhere; they
stay pressable while dimmed.

| Button | A touch | Held down |
|---|---|---|
| **Video** | turns the camera on and off | the **video quality**: the four profiles |
| **Audio** | mute and unmute | **where the sound comes out** |
| **Turn** | front ↔ back camera | — |
| **Call** | calls the other back | the **sounds** to call them with |
| **Leave** | opens the two ways out | the same panel |

These three choices live under the finger that is already there because they are made in
the moment, while looking at what they change: the quality is judged by looking at the
video, and going to fetch it in the settings loses sight of the very thing being judged.
Only the quality is also in the settings; the audio output and the sounds are here alone.

The **video quality** is described further down. The possible **audio outputs** are four
and no more: **speaker**, **phone** (the earpiece), **headphones**, **Bluetooth**. Only
the ones connected appear, and the choice is **remembered** for the next time.

The **sounds to call them with** are five — a drum roll, a drum kit, a fanfare, a car horn
and a rooster — and they play on the other phone at the **alarm volume**, not the
conversation one: they are heard even with the ringer low and the phone across the room.
They appear only while you are both in the channel: outside it there is no phone on which
they could play, while the plain call, that one, goes through the server.

**Turn** can be pressed with the video off as well: there it turns nothing, it chooses
which camera will open. It is for framing something without first showing one's own face
for an instant.

**Leave** never leaves on a single touch. A touch and a long press open the same panel in
the middle of the screen, with the two ways out written in full: **leave and stay
available** — the channel closes but their call still comes through — and **leave and
become unavailable**, which disconnects Duetto altogether until you open it again. It used
to leave straight away, and exits appeared that nobody had pressed: it is a corner of the
screen where touches happen.

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
| Saver | 640×360 | 37 kB/s |
| Standard | 960×540 | 150 kB/s |
| Better | 1280×720 | 312 kB/s |
| Best | 1920×1080 | 500 kB/s |

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

Under the buttons — with **Diagnostics** on — there is **what is really going through**,
in both directions:

```
Resolution: best   ↑1920×1080·30fps·460kB/s   ↓960×540·24fps·140kB/s
link: direct   audio 4.2kB/s   latency ↑↓42ms   delay ↑~140 ↓~120ms
```

The ceilings are not targets: if the scene costs little and the network holds, two
different profiles can give the same result. That line is the only way of knowing — and it
is in bytes a second like the ceilings above, so the two can be compared without doing
arithmetic in one's head.

The last two numbers are the wait, one in each direction, like the bandwidth above: up is
your voice going, down is theirs coming.

A journey has three pieces. The phone that sends adds the **encoder** and the wait in its
**send queue**; the road adds **half the round trip**; the phone that receives adds the
**jitter buffer**, the **decoder** and its **loudspeaker**, which on Android is worth more
than the decoder is. Neither phone can time a whole journey — each only holds the pieces
made at home — so the two tell each other the halves they measure, and both write the two
directions. Nothing in those numbers is borrowed or guessed.

What is still missing is what no API offers: the camera and the microphone, from the light
and the air to the first byte. So the true wait is a little longer than what is written,
never shorter, and that is what the tilde says. If the arrows are missing, the other side
has not said its halves yet, or is running a Duetto too old to say them at all.

With the video on it is the picture's wait, and the voice follows it — WebRTC keeps lips in
step by **holding the sound back** until the frame is ready. With no video it is the
voice's, and that is the fastest this app goes.

Added up, the two are what you live through while talking: if the other person answers the
instant you stop, what comes back has waited twice. For whoever wants that one number
instead of the two arrows there is *the cogwheel → Diagnostics → The total delay only* —
but the arrows are what say which of the two phones the wait sits on, and the road is the
same in both directions while the phones at its ends are not.

Three things are added up, all read from the connection itself: half the round trip, how
long a packet sat in the jitter buffer, and the time to decode it. What is not in there,
and cannot be from this side, is the camera and the microphone of the phone that is
sending, its encoder, and the audio output of this one, which on Android is worth some
tens of milliseconds. So the true wait is a little longer than what is written, never
shorter — that is what the tilde is for. It is measured on what arrives, so the two phones
show two different numbers, and rightly: with different chips, and different audio paths,
the wait is not the same in the two directions.

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

### The phones it has been tried on

Duetto is built against the Android 14 SDK (`targetSdk 34`, compiled with 35) and asks for
Android 7 as a floor (`minSdk 24`) — but a floor is a declaration, not a test. What it has
really lived on, day after day:

| Phone | Android | |
|---|---|---|
| POCO X8 Pro (Xiaomi) | 16 · HyperOS 3.0 | the maker's own rules: auto-start has to be granted by hand, and the tick for unrestricted battery can stay grey even once it is |
| Motorola edge 50 fusion | 14 | the phone that showed the volume keys moving the call volume index and changing nothing at all in the ear — which is why, in the channel, those keys are the app's |
| Motorola moto g82 5G | 13 | |

It is a small sample: two makers and three versions of Android. On anything else it has
never been switched on, which does not mean it will not work — it means nobody has looked.

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
- ✅ The server can ask for **a key at the door**, so that not everybody who learns its
  address can use it — or be handed the relay's credentials.
- ⚠️ The delicate moment is **the pairing alone**: protect the code while you read it out.
- ⚠️ The server sees the **metadata**: which pairs are connected and when, not what you
  say to each other.

The full threat model is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Working out what went wrong

Everything below this line asks for **Diagnostics** first: *the cogwheel → Diagnostics →
Turn diagnostics on*. Off — which is how it comes — the app measures itself less closely,
says nothing to the log and sends nothing to the other phone: it is machinery for
understanding, and whoever only wants to talk should not be carrying it around.

What stays on either way is the journal's account of **what happens**: the app dying, a
coming or going, a change of network. So a problem that has already happened can still be
told afterwards, even by somebody who had never turned any of this on.

With Diagnostics on and the phone plugged in:

```bash
adb logcat -s ReactNativeJS | grep duetto
```

Three families of lines: `duetto-rtc` for the audio/video link, `duetto-sig` for the
connection to the server (drops included, with the code and how long it lasted),
`duetto-presence` for the listening after a reboot.

One thing is said without asking for any of this: **different versions**. If the other
phone is running an older Duetto, a line above the buttons says so — while merely waiting
as well, which is where one would rather know before going in. It is not a technical
number: it is the explanation of things one notices by using the app, a sound that does
not go off over there, a piece of news that never arrives.

The most useful line when something drops is `path:`, which says where the traffic is
going through — `LOCAL (same network)`, `DIRECT through NAT` or `RELAY (through the
server)`. The three roads have different weaknesses, and without knowing which one it is
one ends up blaming the wrong thing.

With two phones plugged in you have to say which: `adb -s <serial> logcat …`

### The journal

Beside the log there is a **journal of consumption**, which the foreground service writes
and which survives the app: a line every five minutes with the battery, how much of the
interval the screen was on, the network, what Duetto was doing and how much CPU and
traffic it used, plus a line at every moment that counts. It is what explains a phone that
drains, or an app that dies at night — and it says why the process died, which Android
knows and tells nobody until it is asked.

`app/scripts/read-journal.sh` pulls it all off a plugged-in phone. With Diagnostics on the
two phones **exchange journals** through the encrypted envelope, so plugging ONE phone in
gives you both: the other one, in somebody else's hands, no cable ever reaches. There is
nothing personal in there — battery numbers and app states, nothing of what you say to
each other.

If the app were to close by itself, the stack is minified and has to be translated:

```bash
adb logcat -b crash -d | tail -40 > /tmp/stack.txt
npx metro-symbolicate app/android/app/build/generated/sourcemaps/react/release/index.android.bundle.map < /tmp/stack.txt
```

## History

What changes at every version, from the point of view of whoever uses it:
[CHANGELOG.md](CHANGELOG.md).

The version is raised by hand in `app/version.json`, when a set of changes is worth
announcing: it is a decision, not a counter. Publishing starts at **0.9.0** and goes on
with 0.9.1, 0.9.2 and so on; 1.0.0 will come when the thing feels finished enough to be
called that.

The build number is a separate matter and goes up by itself at every compilation. It is
what tells two APKs that call themselves the same version apart, so it is beside the
version at the bottom of the settings: when you report a problem, say that number too.

## Licence

Duetto is free software, under the **GNU General Public License, version 3 or later**
([LICENSE](LICENSE)). It can be used, studied and changed by anybody; whoever
redistributes it, changed or not, has to pass the same freedom on, with the source.

    Duetto - a permanent voice and video channel for two people
    Copyright (C) 2026 Paolo Benvenuto

    This program is free software: you can redistribute it and/or modify it under the
    terms of the GNU General Public License as published by the Free Software Foundation,
    either version 3 of the License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY
    WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
    PARTICULAR PURPOSE. See the GNU General Public License for more details.

    You should have received a copy of the GNU General Public License along with this
    program. If not, see <https://www.gnu.org/licenses/>.

### The libraries

Everything Duetto is built on is permissive and asks nothing beyond keeping its copyright
notices: React Native, react-native-webrtc, react-native-svg, async-storage,
react-native-get-random-values and `ws` are MIT; react-native-incall-manager is ISC;
tweetnacl and tweetnacl-util are in the public domain (Unlicense); and the libwebrtc that
does the real work, packaged as `org.jitsi:webrtc`, is Google's, BSD-3-Clause. There is no
copyleft library in the tree: the GPL here is a choice, not an obligation.

### The sounds

The sounds for calling the other person back are not code and have licences of their own,
listed in `app/assets/make-sounds.py` and in the app under *Where the sounds come from*.
The car horn and the knock are made by the app itself. The drum roll, the drum kit, the
fanfare and the rooster are recordings published on freesound.org, **all of them CC0**: no
rights reserved. They are named out of fairness rather than duty — and it is worth keeping
it that way, because a sound that asked for something in return would ask it of everybody
who takes this code.
