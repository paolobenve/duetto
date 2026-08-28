# Duetto's architecture

## The model: a channel, not a call

There is no notion of "calling" or "answering". There is a **permanent channel** for one
pair. You go into it, you stay in it, and when the other person comes in too the link
establishes itself. It is a Discord voice channel cut down to two places.

Three things follow from that:

1. **Presence is the main state** of the interface: "you are alone" / "you are both
   here", not "it is ringing".
2. **A way of alerting is needed**, because the other person may not have the app open.
3. **The connection to the server has to be permanent**, not tied to the screen.

## The two states

Each phone keeps **one** connection to the signalling server, in one of two states:

| State | What it means |
|---|---|
| `listening` | reachable but outside the channel: microphone closed, no media |
| `active` | inside the channel: WebRTC is being negotiated |

Going from one to the other **reconnects nothing**: only the state declared to the server
changes. That is what makes presence continuous instead of intermittent.

When somebody goes to `active` while the other is merely listening, the server sends
`notify` and the app **shows itself** the notification. No outside service, no Firebase,
no third-party app to configure. Whoever is already in the channel is not notified: they
notice by themselves, and it would be noise.

## The parts

### 1. Signalling (`server/src/index.js`)

A minimal WebSocket server in Node.js. It does four things:

- **Presence**: every room accepts at most 2 connections; the third gets `room-full`.
- **Hooking up again**: the side of the pair (`A`/`B`) identifies the *device*, not the
  connection. Whoever hooks up again after a dip in the network takes their own place
  back, dismissing the previous connection: without this, the server would not yet have
  declared the old one dead and the phone would find itself turned away as a third device
  for a good minute. To the other one, nobody has left.
- **Forwarding**: it passes the `signal` messages from one peer to the other **without
  reading their content**, and the `pair` messages during the pairing.
- **Alerts**: `notify` when somebody comes into the channel or presses "Call". There is
  no brake on knocking: one knocks at a single person, who gave you the code in person,
  and a limit would be felt exactly when insisting is what is needed.
- **Relay**: the TURN credentials live in the server's `.env`, and the server tells them
  to the phones in the joining message. Nothing is configured on the devices, and changing
  the password does not mean going back to each of them.
- **A brake on joining**: 120 a minute per address, and only for phones this server does
  not recognise. It makes trying pairing codes wholesale impractical without touching
  anybody at home - where every phone shares one address, and a restart brings them all
  back at once. Counting those too, the budget went in seconds and the phones locked
  themselves out: refused, each answered with another knock half a second later, which is
  how a brake becomes a wall. The app now stands still for a minute when it is told it
  knocks too often.
- **One key per phone**: with `AUTHORISED_KEYS` set, the server greets every connection
  with a number and the join has to come back with the phone's public key and that number
  signed. The secret half never leaves the phone, so getting in cannot be passed on by
  telling somebody something; a signature is worth one connection only, since the number
  changes every time; and one phone can be taken away without touching anybody else's. The
  keys are Ed25519: tweetnacl signs on the phone, node's own crypto verifies here, and the
  raw 32 bytes are wrapped in the twelve that make an SPKI.
- **Three ways to be here, and they are not the same**: the phones written in the `.env`
  may open connections and hand out invitations - somebody had to be at the server to
  write them there. Whoever came in with an invitation may open connections of their own,
  and hands out nothing: otherwise the first person invited could invite the world and the
  list would stop meaning anything. And the other half of somebody's connection may
  neither open one nor hand anything out: their key is worth something in one room.
- **Invitations, made from the app**: the owner's phone asks the server for one over the
  connection it has just been let in by signature - `invite`, `people`, `forget`, answered
  only to a phone whose key is in `AUTHORISED_KEYS`. There is no page to expose, no secret
  in a URL and no session to keep: the authority is the key that opened the door a moment
  earlier. A phone nobody has written down can then get in, once, by carrying a
  code made for one person - the same thing `npm run invite -- anna` does from a shell. The server takes it, writes that
  phone's key down under that name and spends the code. The identity is not an address or
  a document: it is "the person I handed this to", the same trust the pairing code between
  two phones rests on. The list is a small JSON file read at every knock, so taking a
  phone away takes effect at once instead of at the next restart.
- **The other half of a connection**: a phone nobody has written down is let into a room
  where somebody on the list is sitting, and written down for that room alone. So whoever
  is let in can talk to anybody - the person on the other side asks nobody for anything -
  while that person cannot open rooms of their own: the chain stops at one link. The first
  admission asks for the owner to be in the room at that moment, which costs nothing (a
  pairing is made with both phones awake) and keeps a second seat from being taken by
  somebody who has merely learnt a room's name.
- **A key at the door**: with `SERVER_KEY` set, a join that does not carry it is answered
  `not-allowed` and closed — before anything else is said, the TURN credentials included,
  which otherwise travel in the very first message to whoever knocks. The keys are
  compared as digests, in a fixed time, and a wrong one costs an attempt against the brake
  above. It protects the server, not the pair: what keeps a pair apart from everybody else
  is the pairing code, which never comes here.

The room is called `pairId`. Different pairs have different `pairId`s and do not see one
another: the same server serves as many pairs as you like.

### 2. Pairing (`app/src/pairing.ts`)

Whoever creates the pair gets **eight digits**; the other one types them in.

```
Phone A                       SERVER                       Phone B
code: 8147 1828                                        code typed in
    │                                                        │
    ├── pairId = slow_KDF(code) ──▶ room ◀── pairId = slow_KDF(code)
    │                          (it sees only this)            │
    ├── public key A ──────────────▶ forwards ───────────────▶│
    │◀─────────────────────────── forwards ◀───── public key B
    │                                                        │
  key = KDF(Diffie-Hellman, code)          key = KDF(Diffie-Hellman, code)
    │                                                        │
    ├── proof(key, "A") ───────────▶ forwards ──────────────▶│ checks
    │ checks ◀─────────────────────── forwards ◀── proof(key, "B")
```

Three properties, and the reason for each:

**The code never reaches the server.** Only `pairId` does, its fingerprint.

**Working out `pairId` is somewhat costly, but not too much.** Eight digits are only 10⁸
combinations: with an ordinary hash the server could try them all in a few seconds.
Slowing the computation down raises that cost, but it raises it for us as well: the first
version, at 200,000 rounds, made every pairing wait ten seconds, and that was not
acceptable.

Now it is 6,000 rounds, a fraction of a second, and the defence against whoever tries
codes wholesale sits where it costs the attacker and not the user: the **server limits the
joins** (30 a minute per address) and the **app imposes 20 seconds** before trying again
after a failure.

The limit that follows is stated openly: a hostile server, which sees `pairId`, could work
its way back to an 8-digit code and get in the middle *during* the pairing. Afterwards the
key is 256 bits. The countermeasure, if it were needed, is to lengthen the code — not to
slow the computation down.

**The key does not come from the code.** It is born of an X25519 exchange with the code
mixed into the derivation. Whoever listens cannot work it out (they do not have the
private secrets); whoever wanted to get in the middle would have to know the code, and the
final proofs would unmask them. The two proofs are different for the two sides, so nobody
can send back the other one's. Once the pairing is over the key is 256 bits and the
weakness of the code counts no more.

### 3. Encryption of the signalling (`app/src/crypto.ts`)

- **NaCl secretbox** (XSalsa20-Poly1305), a random 24-byte nonce per message.
- The ciphertext is **authenticated**: any tampering makes the opening fail.

The server sees only opaque base64. Being unable to read or rewrite the SDPs, it cannot
replace the **DTLS fingerprint**, which is what would let it get in the middle.

### 4. Media (`app/src/webrtc.ts`)

- Going in opens **the microphone only**. The camera comes on on request, and turning it
  off does `removeTrack` + `track.stop()`: it is really released, and Android's privacy
  indicator goes out.
- The **video channel is opened straight away**, empty as well: turning the camera on
  merely puts the track into it (`replaceTrack`). No renegotiation, no tracks piling up.
  Adding and removing the track at every switch-on — the first approach — produced new
  tracks that overlapped the old ones, and the renderer ended up drawing the dead one:
  a black screen.
- **Only ever one of the two sides offers.** The role comes from the pairing side (`A` =
  answers, `B` = offers), not from the order of arrival in the room: that changes at every
  rehook, and two unlucky reconnections were enough for both to believe themselves the
  offerer and for the offers to collide.
- Whoever answers finds the video channel created **receive-only** — that is how WebRTC
  creates the channels derived from somebody else's offer — and takes it to `sendrecv`
  *before* preparing the answer, so that the right direction travels in the same
  negotiation. Without that, this phone would see the other's video but would not manage
  to send its own.
- The **ICE candidates** that arrive before the remote description are queued and applied
  afterwards, otherwise they would be lost.
- An encrypted `state` message tells the other whether your mic/camera are on and **with
  what proportions** you are framing.
- **Nothing is sent to somebody who is not looking.** When the other's app leaves their
  screen, whoever is sending video detaches the track from the channel: the camera stays
  on for the local preview, but nothing goes out towards the network. Without that, video
  towards a dark screen cost the sender ~300 kB/s, which on a mobile network is paid for.
  The signal travels in the `state` message (the `watching` field); it counts as `true`
  when missing, so an old build or a lost message leaves the video on instead of turning
  it off for good.
- Every event handler **checks that it belongs to the connection in use**. Rebuilding the
  link, several `RTCPeerConnection`s are born within seconds and the superseded ones go on
  emitting events: a connection already dead was slipping its own track into the new
  stream — two live videos, and the renderer drawing the wrong one. Mind the trap:
  **libwebrtc does not mark the tracks of a closed connection as `ended`**, so filtering
  them by `readyState` is of no use whatsoever. The same holds for the states, where the
  damage is worse: a late `failed` made the repair of a healthy connection start up, and
  the rebuilds set each other off.
- The **selected path is recorded** as soon as the link establishes itself — `LOCAL (same
  network)`, `DIRECT through NAT` or `RELAY (through the server)`. The candidates gathered
  do not say which: they are all gathered every time and then one wins, and without this
  fact one cannot tell whether a drop depends on the road the traffic takes.
- The **camera's format is fixed**: proportions declared at capture and
  `degradationPreference: maintain-resolution`. The default behaviour is the opposite —
  with little bandwidth WebRTC lowers the resolution — and many sensors, changing format,
  change the angle of view as well: on the other side the framing could be seen widening
  and narrowing by itself. Better to lose frames than to change what is being framed.

### 5. Recovering after an interruption

It is the part that has needed the most corrections, and every one of them was born of a
log.

**The connection to the server** hooks up again by itself, with waits between 0.5 and 4
seconds. Coming back to the foreground it tries again at once, without waiting for the
scheduled attempt.

**The direct link** dies with the network and has to be repaired, but **gradually**. The
first version tore it down 800 ms after the `failed`, and the log showed that this was the
cause of most of the visible interruptions: ICE was picking itself up — in the log it can
be seen going from `failed` to `connected` with no help at all — and the demolition
arrived in the middle of that.

The order now is:

1. **Wait**: 4 seconds from `failed`, 12 from `disconnected`. On a mobile network the path
   changes constantly and often comes back by itself within a second.
2. **A light repair**: `restartIce()` redoes only the search for a path, keeping the
   connection and the tracks on their feet — audio and video are not interrupted at all.
   The one who offers can do it; the other asks for it with `renegotiate`.
3. **A full rebuild**, only if after another 8 seconds it has not come back.

**Only the one who offers rebuilds.** Whoever answers throws the dead connection away and
waits for the offer, which makes the new one be born at the right moment. With both
rebuilding, the receiver tore down an instant later the very connection the incoming offer
was creating: three rebuilds could be seen in two seconds.

**Nothing is negotiated while the server cannot be reached.** An offer sent at that moment
is dropped in silence and nobody sends it again: a connection was left waiting for an
answer that would never arrive.

**An offer that arrives before our connection** is not lost: it makes it be born on the
spot.

**Whoever answers can ask for the offer.** Being unable to offer, they would wait for ever
if the other did not notice the fault: every five seconds, whoever finds themselves
without a link while both are in the channel sends `renegotiate`. It is the safety net of
an otherwise correct choice — offering from one side only keeps the two offers from
colliding.

### 6. The native service (`app/modules/duetto-platform`)

A local Kotlin module, hooked in by **autolinking** through
`"duetto-platform": "file:modules/duetto-platform"`: that way `MainApplication` is not
touched, which `bootstrap.sh` regenerates and would overwrite.

| Aspect | The choice |
|---|---|
| Service type | `microphone`, plus `camera` when the video is on |
| Standing notification | compulsory, channel at `LOW` importance (silent) |
| Alert notifications | a separate channel at `HIGH` importance |
| Restart | `START_STICKY`: if Android kills it for memory, it comes back |
| Wake lock | `PARTIAL_WAKE_LOCK` with a safety expiry at 8 hours |
| Visibility | the activity's `onStart`/`onStop`, **not** `AppState` |

**Presence after a reboot.** A receiver on `BOOT_COMPLETED` starts `PresenceService`,
which inherits from `HeadlessJsTaskService`: it starts the JavaScript engine **without
opening the interface** and runs a task that puts the listening connection back on its
feet. It reuses all the logic that already exists, instead of rewriting the networking in
Kotlin.

It does not "open the app by itself": from Android 10 on, starting an activity from the
background is forbidden. What starts again is presence, not the window. The task never
finishes on purpose, and it steps aside when the app is opened: two connections from the
same device would push each other out.

The bottleneck is not the code but the maker: **without "auto-start" enabled, phones like
Xiaomi do not even deliver the boot event**. It is not an Android permission and no app
can grant it to itself; the app can only open that screen, and cannot even read the
outcome.

It also holds the **Picture-in-Picture**: the Back key calls `enterPictureInPictureMode`
instead of leaving the channel, with the proportions of what is full-screen (Android
accepts ratios between 0.4184 and 2.39, so the value is clamped).

To notice being in PiP **there is no need to intercept the Activity's callback**: in PiP
the window becomes small, so below 340 dp of width the interface goes into its compact
mode. This saves having to change `MainActivity`.

**Why visibility does not use `AppState`**: on Android that reports the *pause* of the
activity, and in Picture-in-Picture the activity is paused while being perfectly visible —
we would turn the video off exactly in the little window made to go on watching it.
`onStart`/`onStop`, instead, mean what we need: `onStop` arrives when the app really
leaves the view, and in PiP it does not arrive.

### 7. Video layout (`app/src/VideoStage.tsx`)

- Whoever is full-screen uses `objectFit: contain`: **never cropped**.
- The little frame has **the proportions of the camera it is showing**. Working them out is
  not trivial: the camera always delivers a landscape frame (1280×720) which is rotated
  according to how you hold the phone. `getLocalVideoAspect()` reads `track.getSettings()`
  and makes the long side follow the orientation; the result travels in the encrypted
  `state` message, so the other one knows what shape to give it too.
- Draggable and resizable: a corner handle and a two-finger pinch, both handled by the
  same `PanResponder` by looking at `nativeEvent.touches.length`.
- A touch and a drag are told apart with a threshold of 4 px.
- **Zoom** on the big video: pinch up to 5×, drag to move about inside the enlargement
  (bound to the edges), double tap to go back to the whole screen.
- With only one video on, the little frame does not appear and the swap is reset — but
  **not during an interruption**: there the other's video is only missing for a moment,
  and resetting the arrangement would mean finding it changed at every drop of the
  network.
- During an interruption **nothing moves**: the big place stays reserved for the other,
  the frame stays where it is, empty, with the "waiting" label, and a warning explains
  what is happening. Before, one's own video was promoted to full screen and then made
  small again on its return, at every single drop.

One thing that is **not possible**: holding the last frame during an interruption. When
the track dies the renderer empties the surface, and keeping the picture would mean
capturing it separately, frame by frame.

### 8. Audio output (`app/src/audioRoute.ts`)

Four possible outputs — speaker, earpiece, wired headphones, Bluetooth — and there are no
others. The list of the *available* ones changes by itself, so we take it from the
`onAudioDeviceChanged` event instead of guessing it.

The choice is **saved** and restored on coming back if that device is still connected;
otherwise the system's selection is left alone, without imposing one of ours.

### 9. Diagnostics (`app/src/log.ts`, `Journal.kt`)

Everything that exists in order to understand sits behind one switch, off by default and
belonging to the phone rather than to a connection - the journal is one file and the log
one stream, while every other setting travels with the person.

On, four things happen: the two technical lines appear under the buttons; the journal adds
its five-minute sample; the journals are exchanged with the other phone every five
minutes; and the eighty-odd `log()` calls speak.

Off, two of them do not simply stop:

- The journal keeps writing the lines that **events** produce - a death of the process, a
  coming or going, a change of network - and drops only the periodic sample. It costs a
  write now and then, and it is what makes a report worth reading: without it the first
  answer to anybody reporting anything would be "turn it on and wait for it to happen
  again".
- The connection is still measured, only more slowly: `getStats()` every ten seconds
  instead of every two. It cannot be turned off, because two things that are not
  diagnostics at all read those numbers - the voice ceiling, which rises when the video
  goes quiet, and the one attempt at a direct road when the link is going through the
  relay.

## The threat model

| Adversary | Can | Cannot |
|-----------|-----|---------|
| Whoever listens to the network | see that there is traffic | read media or signalling |
| A compromised server | metadata (which pairs, when), DoS | read or alter the contents |
| A compromised server, during the pairing | try to guess the code | manage it in the time available, thanks to the slow KDF |
| A third party who knows the server | open connections, unless there is a key | get into a pair without the code |
| The TURN relay | forward packets | decrypt the media |

The delicate moment is **the pairing alone**. Afterwards the key is 256 bits and random.

## Known limits and possible extensions

- **The phone reboot**: presence starts again by itself, but it takes some tens of seconds
  for the system to give the app room: an alert sent right after the reboot may still not
  find it.
- **Aggressive OEMs**: Xiaomi, Huawei and Samsung close background services in spite of
  Android's rules. The app has to be excluded from battery optimisation; there is no way
  of getting that from code.
- **Consumption**: the wake lock and the always-open connection cost battery. It is the
  price of continuous presence, and it is paid above all while waiting. Two things have
  already been got out of the way: the server's tap, which was every 30 seconds even at
  night — 120 wake-ups of the radio an hour to do nothing — and is now rare as long as one
  is merely listening; and the microphone, which is opened when the other person arrives
  and not on entering the channel. What is left is the continuous wake lock: releasing it
  while waiting is possible, but it needs a native alarm as a fallback, because with the
  CPU suspended the JavaScript timers stop and nobody would rebuild the dropped socket.
- **A visual security code**: a SAS derived from the key could be shown, to be compared
  aloud, for whoever wanted one more confirmation after the pairing.
- **A text chat**: an `RTCDataChannel` on the existing connection would already be
  encrypted.
