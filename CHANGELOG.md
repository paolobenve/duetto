# Changes

What changes **for the people who use the app**, version by version. The technical detail
lives in the commit messages; here there is only what one notices while using it.

The first two numbers are raised by hand, in `app/version.json`, when what the app *is*
really changes. The last one moves at every build: that way every APK has a name of its
own, and asking "which version have you got" is enough to know what is running. There is
an entry here only for the versions where something is noticeable.

## 0.9.2 build 177

**The emergency lane asks before it takes everything.** When the link failed with voice or
video flowing and the server did not answer, the app used to conclude "the deaf one is my
wifi" and bound every socket to mobile data — but from one phone a deaf wifi and a server
down for everybody are the same silence: it happened, and the cure broke a direct link that
would have healed by itself. Now, before binding anything, a single question goes out
through the mobile radio alone: "is the server there, on that road?". If it is, the deafness
was the wifi's and the lane opens as always; if it is silent there too, the trouble is his,
nothing is touched, and no more questions until he is heard from again. And if packets from
the other side are still landing, the wifi is not deaf by definition: no lane.

## 0.9.2 build 176

**The volume moved from outside no longer touches the gain.** Raising or lowering the volume
from another app used to clear the amplification chosen in Duetto — and the detector meant to
tell somebody else's presses from one's own could be fooled by a quick run of them, wiping
the gain in the middle of one's own ladder. Now the gain is a Duetto choice and only Duetto
changes it; the level on screen stays the product of both knobs, so nothing one reads is
false. The mute, as ever, is lifted from Duetto alone.

## 0.9.2 build 175

**Coming back to the app is not changing network.** On some phones bringing Duetto to the
foreground makes the system announce the very same network again, and since yesterday that
announcement passed for a real arrival: a link in perfect health was renegotiated at every
return. The announcement is now judged by identity: the network already announced is not an
arrival, and a change of network that happened while one was away still sets the search for
roads going, as it must.

## 0.9.2 build 174

**The delay loses its tilde.** The technical lines say "delay 250ms" instead of "~250ms":
cleaner to read. That the number is an estimate and not an exact measurement is now said by
the note in the diagnostics settings.

## 0.9.2 build 173

**Coming back onto the wifi is really seen.** Network announcements arrive in a volley, and
by keeping the last of the volley a real change of network came out dressed as a twitch —
exactly what a healthy link has learnt to ignore. So, with the wifi switched back on, one
went on talking through the carrier and through the server, never looking for the new roads.
Now the strongest word of the volley wins, and coming back onto the wifi sets the search
going again: a few seconds and the link is direct once more.

## 0.9.2 build 172

**Duetto also speaks Spanish, Portuguese and French.** The whole interface, from the alerts
to the settings. The language still belongs to the connection, as always: the same phone can
speak Spanish with one person and Italian with another; whoever does not choose gets the
phone's own language.

## 0.9.2 build 171

**The relay dresses as the web.** Certain mobile networks reap every flow that does not look
like web traffic on a clock — forty seconds and down it goes — and that was the drop and
rebuild every minute, with holes in the sound and the picture, for anyone going through the
server. Now the relay is reached over TLS alone, the one dress those networks respect: on the
field the link went from a life of forty seconds to no drops at all. Whoever has a direct road
pays nothing: there, the relay carries nothing.

**The gears retire.** The ladder of "everything through the relay", "the relay's TCP door"
existed only because the relay had legs that could be reaped; dressed in TLS, there is no
better gear left to shift into. And with the ladder goes its memory, which on the strength of
a stale lesson forced whole evenings through the server: every entry into the channel now
starts free and really tries the direct roads.

**Where no direct road exists, it is not the app's fault.** On some mobile networks (IPv4
behind the operator's closed NAT, no IPv6) a direct road simply cannot exist: there the
conversation goes through the server — now without drops.

## 0.9.1 build 170

**One clock for every death.** When the patience ran out, two cures set off together — the
old ladder and the change of gear — and the two negotiations trod on each other: that was the
chain of "first one phone, then the other". Now one death is commanded by one clock alone,
which shifts a gear where a gear helps and gives the ordinary medicine where it does not.

**No changing tracks while the stitching is under way.** A drop makes the screens flicker,
the flickering made "watching / not watching" bounce, and every bounce swapped the video's
track — firing a renegotiation into the middle of the repair: that was the chain of double
hiccups, first one phone and then the other. Now the wish is noted down and granted once the
link is whole again.

**The camera's minute measures the interruption, not the last touch.** Coming back a few
seconds after an update, the video did not return: the drawer's clock started from the last
press of the button, perhaps minutes earlier. Now the drawer refreshes itself while one is in
the channel, and the minute counts from when the app really died.

**A healthy link is not renegotiated over a sneeze.** Some phones rotate their wifi addresses
every minute, and every rotation set off a fresh search for roads: a quiet evening at home
filled up with churn that was all ours. Now only a real change of network reshuffles the cards
of a link in good health.

**Patience first, gears after.** On the networks that kill a link like clockwork, it stitches
itself back together within a couple of seconds nearly every time — and immediate cures turned
every invisible stitch into a demolition with a black screen. Now every death is given eight
seconds to undo itself; only one that stays dead earns the next gear. The safety nets have
learnt the same calm: they act on the second sick round, not the first.

**The gears are remembered.** The gear the road taught stays in memory until the network
changes: coming back into the channel one starts in the right one already, without repeating
the lesson to the tune of black screens.

**Changing gear remakes the connection on both sides.** The side that waits for offers used to
send the order and keep its own old connection — old policy and, worse, sockets nailed to the
previous network: back on the wifi one went on going through the carrier. Now it takes its own
down too, and the offer on its way rebuilds it on the right network.

## 0.9.1 build 161

**The motorway's second gear: the relay reached over TCP.** Some carriers' NATs mow down
every UDP path every forty seconds — the motorway included, whose leg towards the relay was
UDP as well. If that dies too, the two phones now keep only the relay's TCP door on the table:
a connection the NAT has to respect. In the panel, beside "relay", one now reads the leg too:
(udp) or (tcp).

## 0.9.1 build 160

**Onto the motorway at the first stumble, when one is already going through the server.** The
patience of three stumbles remains for abandoning a direct road, which costs something; but if
what dies is the mixed road through the relay, there is nothing to regret: one moves to the
all-relay path at once.

**A volume that does not move is no longer believed.** On a good many phones the maker nails
the call volume in speaker mode: the app believed it had lowered it, step by step its notion of
the volume drifted from the truth, and one ended up listening at 46% with the phone in fact at
full blast. Now every move is verified: if the phone did not budge, the press goes to the gain,
which always obeys.

**The journal also says how loudly you were hearing.** Beside the system volume there is now
`level=NN%`, the true product of the two knobs: neither number on its own explained an "I can't
hear you".

## 0.9.1 build 158

**A road that keeps dying is abandoned for the motorway.** On certain mobile networks the link
stumbled every forty seconds: the "cheap" road through the carrier's NAT dies and rises again
without end. At the second relapse the two phones now agree and put everything through their own
relay, on both sides — the road that in the logs stayed up while the others died. The open roads
come back at the first change of network.

**Whoever sends far more than the other lowers a little, and watches.** When the two pictures
are absurdly unequal, the strong sender lowers its own ceiling a step at a time until they are
even enough, and raises it again as soon as the other keeps up. The bandwidth ceiling alone: no
camera to reopen, no black frames.

**The microphone always comes back as it was left.** Before it held for five minutes; now it
holds full stop, even after a whole evening. The camera keeps its window of one minute: switching
itself back on is another matter.

## 0.9.0 build 155

**Leaving the house, the conversation jumps onto mobile data within seconds.** A wifi that is
getting away goes deaf long before the phone lets go of it, and in between there was up to a
minute of silence. Now, if the link falls while voice or video are flowing, the app asks the
server: if it is silent too, the deafness is ours — and mobile data is switched on by the app
itself, carrying the whole conversation over it without waiting for the phone to make up its
mind. When the wifi is back in health one returns to it, unhurried. The lane costs radio and for
that reason it lives only during a conversation: while merely waiting, or with microphones and
cameras off, the slow road that costs nothing remains.

**The buttons follow the video's real edge.** When the encoder squeezes the picture for a lean
network, the frame comes out in a slightly different shape from the camera's, and the buttons
stayed lined up with the edge of a video that was no longer there. Now the declared shape is
corrected with the measurements of the frames that really arrive.

## 0.9.0 build 153

**Changing network, the link looks for the new roads by itself.** A phone often moves from one
network to another without anything breaking — the new one arrives before the old one goes — and
the direct link stayed on the old road: it happened to be on the same wifi and still go through
the server, with the video squeezed to nothing and the connection stumbling every forty seconds.
Now a change of network sets the search going again, and reopens the attempt to leave the relay.

**And a rotten road is abandoned.** Three stumbles in a few minutes are not bad luck: they are
a judgement on the road, and one goes looking for another.

## 0.9.0 build 152

**In the shade, the present comes above the past.** Duetto's notifications now have a fixed
order: first the state of things ("In the channel with the other person"), then the alerts, and
the news at the bottom. Before, the order was by age, and the news "they have disappeared…" sat
above a state that said the opposite. The news of a return, moreover, now begins with the
return: even truncated it says the right thing.

**The technical lines arrange themselves around what is travelling.** With voice alone, two
lines: the bandwidth beside the profile, and below it the road, the latency and the waits. With
video, three: the resolutions fill the first, and the waits have a line of their own instead of
shrinking with the rest.

**"Always visible" is no longer forgotten at start-up.** The translator of the old settings did
not know the new degree and took it back to the default at every start of the app.

**Road and delays no longer vanish on the mobile network.** After a change of network the phone
could not find the winning pair of candidates again and the panel lost the road, the latency and
the waits: now it asks for it the way the standard prescribes, with the older dialects as a
fallback.

## 0.9.0 build 150

**The "establishing the connection" deadlock is beaten.** For as long as anyone remembers, every
now and then the two phones stood there staring at each other: each convinced nothing was broken,
neither of them connected. It happened when the connection offer fell into a hole (a reconnection
at the wrong moment) and the connection stayed "new" for ever — never sick, therefore never cured
by the safety nets. Now a prolonged silence is recognised for what it is, and after ten seconds
the usual medicine is given.

**The little window says only the essentials.** Going into Picture-in-Picture with the back
button, on many phones the little window showed buttons and technical lines stacked on a postage
stamp: the app was never told it had been shrunk. Now Android itself tells it, and in the little
window there remain a face and one word: here, waiting, unreachable.

**A long press on the video chooses how much the buttons fade.** Half a second with the finger
still on the big picture (or on the screen, if there is no video) opens the menu with the degrees
of fading — without going through the settings. And among them there is now "Always visible" too,
for those who want the buttons right there, fixed.

**The delay written down is the delay of what is travelling.** Voice alone: the voice's delay.
With the video on: the frames' delay, to which the voice is held by synchronisation. Before, the
two got mixed up as the chain changed unseen, and the number dropped exactly when you switched
the camera on.

## 0.9.0 build 146

**Waiting costs far less.** The lock that kept the processor awake, held until now at all times,
is held only inside the channel: while waiting, the phone really sleeps. What keeps watch are the
network's announcements, the server's rare packets — which wake the phone by themselves — and a
system alarm that every ten minutes looks to see that the presence is still there. The alarm is
also the safety net that was missing: if the phone kills the listening service, within ten
minutes it is put back on its feet, which nobody used to do.

**Listening without an interface has the same ears as the app.** After a restart, or when the
system takes the app apart, the connection was watched over only by JavaScript's timers — which
do not ring with the screen off. Now the native heartbeat and the network's announcements keep
watch there too: a socket that died in silence is remade within seconds, not discovered after
minutes.

**A call that dies in a pocket is repaired in a pocket.** Every repair of the direct link
depended on timers that stand still with the screen off: the cure set off the instant the screen
came back on. Now the heartbeat gives it too, which in the channel ticks with the screen off as
well, and while the link is unwell it quickens: the repair arrives within some fifteen seconds.

**Whoever falls and comes straight back no longer "leaves".** A change of network made "they have
disconnected" flash on the other phone, only to deny it a moment later. Now the server waits a few
seconds before announcing a drop: if you are already back, nobody notices anything. And a knock
that arrived in exactly that gap no longer disappears: it waits for you on the doorstep and is
delivered when you return.

**Facts no longer get lost in the gaps.** The journal, the "I have not gone away", the sound for
calling you back: if they set off while the server was unreachable or the other side was
reconnecting, they vanished in silence. Now they wait in one's pocket and are delivered as soon as
there is somebody listening again.

**"Leave and become unreachable" survives a restart.** The choice lived only in the app's memory:
restarting the phone made you reachable again without your wanting it. Now it stays written where
a restart does not erase it.

**Refusing the microphone no longer makes you invisible.** By refusing the permission, the app
also gave up listening: you stayed unreachable without knowing. Listening does not need the
microphone — only entering the channel does — and now the listening remains.

**If the battery restrictions come back, it tells you.** The permission asked for at the first
installation can be quietly revoked by the system or by an "optimiser": it was the classic way of
becoming unreachable without knowing. Now the app notices when you reopen it, and tells you.

**No more of Google's servers.** For years a public Google STUN address served as a fallback in
the phones: the only outside dependency of a project that stands on its own. It was not needed:
your relay already answers that too, and now the phones use only addresses of yours.

## 1.1.122

**A phone in a pocket no longer presses anything.** As long as something covers the screen — a
pocket, a closed cover — the controls do not respond. With the speaker on, the system does not
switch the display off, and everything that touched the glass reached the buttons: that is how
exits from the channel appeared that nobody had pressed.

## 1.1.121

**A volume set from another app becomes Duetto's.** If you move the call volume from outside,
Duetto's amplification goes back to 1: setting it to half you find yourself at half, not at three
quarters. The mute, on the other hand, resists: it is lifted from Duetto, and then one starts
again from whatever volume the phone has at that moment.

**"Their phone closed the app on them" only when it counts.** On some phones the window is taken
apart a few seconds after every exit: saying it then too made that sentence — true, but
misleading — appear right after an exit the other person had chosen.

## 1.1.120

**Leaving the house one is back online sooner.** A wifi that is getting away stops carrying data
long before the phone lets go of it — with the screen off, for as much as half a minute — and in
that time Duetto stayed disconnected. Now, after two attempts that come to nothing, it asks
Android to check that network: if it does not lead to the internet, the traffic moves to mobile
data by itself.

**And it tries again four times as often.** With the screen off the only engine running is the
heartbeat, so its pace is also the pace of the attempts: it stays at one a minute when all is
well, and drops to fifteen seconds until one is back online.

**The microphone and the camera come back with two different waits** after an exit: five minutes
the microphone, one minute the camera. A camera that switches itself back on films a room and a
face, and after a minute it is no longer plainly the same scene as before.

## 1.1.119

**Away with the twenty-five per cent too many.** By becoming the product of the two halves,
Duetto's volume changed meaning: the old multiplier, ferried across to the four outputs, stayed
on as a fixed amplification over anything at all — and on the earpiece it sounded like a
loudspeaker. Now it starts again from 1 everywhere, and the level is that of the phone's call
volume, which already has a memory for each output.

**Touching "Leave" does not leave**: it opens the same panel as the long press, with the two ways
out written out in full and a line saying "Stay in the channel". The little confirmation under
the icon could not be seen, and that was precisely in the case where it is needed — when you did
not make that touch yourself.

## 1.1.118

**The volume goes down to silence, and below the phone's lowest step.** On speaker, the first
step of some phones is still very loud, and Android goes no lower: from there on Duetto
attenuates, down to a quarter, and one more touch silences it altogether. From silence, the first
touch upwards goes back to the phone's lowest step.

**Leaving and coming back within ten seconds one picks up where one was**, microphone and camera
included: an exit and an immediate return are almost never a choice, and finding the video to be
switched on again by hand was a punishment for something one had not done.

## 1.1.117

**Leaving the channel asks for confirmation.** The first touch on "Leave" arms the button — it
becomes "Sure?" for three seconds — and only the second one leaves. Exits from the channel
appeared that nobody had pressed, at night and in broad daylight: whatever produces them, one
touch alone is no longer enough. On a long press, the menu with the two ways out stays as it was.

**The journal records every press of the controls** with the point on the screen and how long the
contact lasted. On a distant phone it is the only way to know what really reached the app.

**The fixed notification can be swiped away** on Android 13 and later: the service goes on running
and you stay reachable all the same.

## 1.1.116

**The volume is now a single number, and it tells the truth.** Before, Duetto showed only its own
half, and did not look at the phone's call volume — which has a knob for each output and is moved
by other apps too: you could read 150% while the phone stood at one out of eight. Now the level is
the product of the two, it updates even when you change it from outside, and it is what travels to
the other person: "hears you 25%" has become an exact statement.

**And every output has its own.** Going up, the keys first take the call volume to its top —
which Android already remembers separately for earpiece, speaker, headphones and bluetooth — and
only then multiply; going down they do the opposite. What you had set now holds for all four
outputs, and from there on they part ways.

**When the phone closes the app on somebody, the other one knows.** On some phones Duetto is taken
apart by itself, at night too: the other person saw "waiting", identical to when you leave. Now it
says "waiting (app closed by the phone)", in the panel and in the notification.

**The connection is checked every minute, with the screen off too.** React Native's stopwatches
follow the rhythm of the frames: with the screen off they never run out, and none of the safety
nets set off — one night the connection stayed down for eight and a half minutes, until the moment
the screen came on. Now a native heartbeat wakes the check.

## 1.1.115

**A fix for trouble introduced in 1.1.114**: the two phones saw each other disappear every few
seconds. The listening to network changes was too nervous and remade perfectly healthy
connections. Now, when the network changes, the server is asked first whether the link is still
alive, and it is remade only if it does not answer.

## 1.1.114

**A change of cell is no longer noticeable.** Duetto now notices by itself when the phone's
network changes — cell, wifi, new address — and remakes the link at once instead of waiting for
somebody to stumble over a dead socket. And the line "no link to the server" waits five seconds
before appearing: a change of network sorts itself out in one or two, and does not deserve an
alarm.

## 1.1.113

**"No link to the server" when the link was there.** Changing cell or moving from wifi to mobile
data, the connection dies and the app opens another at once — but the news of the first one's
death arrives minutes later, and ended up declaring a new and perfectly working connection
disconnected. Now whoever speaks has to be the connection in use, and the abandoned one is really
closed.

**The safety net now really does trip.** It was meant to rebuild everything after a few seconds
without a server, and in days of journal it never once set off: the count restarted at every
attempt. Now it counts from the last working connection, and after ten seconds of darkness it
rebuilds.

**The notice of a death gives the true time of the return.** "They came back at 17:04", sent by
whoever came back: before, it gave the time the news reached you, which if you were disconnected
is quite another thing.

## 1.1.112

**An absent-minded touch no longer makes you leave the channel.** With a video on the controls
fade, and if you have not touched them for a minute they now sleep: the first touch wakes them and
nothing more, without pressing anything. It holds for "Leave" too, which used to leave at the
first touch without asking.

## 1.1.111

**The journal said "screen on" with the screen off.** It asked Android for something that
resembles it but is not: during a conversation the phone stays "interactive" while the proximity
sensor switches the display off. Now the state of the real display is read — on, off, or the
always-on clock.

**The audio output no longer goes back by itself.** After an update the speaker could turn back
into the earpiece: an old memory, left over from when there was one output for the whole app, was
poured back at every start whenever the choice was the default one. Now it is read once and
erased. The same held for the volume of the other person's voice.

## 1.1.110

**The little square no longer jumps.** Switching the video off and on again, at the next drag it
jumped somewhere else and carried on from there — and in the worst cases ended up off the screen.
Now it stays where you leave it, always.

## 1.1.107

**Whoever knocks hears knocking.** In place of the drum roll, two knocks on a door: half a second,
the confirmation that the alert really did set off. The roll remains among the sounds to send to
the other person.

**"Call" goes out when there is nowhere to knock.** Grey and unpressable when the other person's
phone is not connected to the server — detached on purpose, or without a network — because there
the alert has nowhere to arrive. It stays lit when they are waiting and also when you are both in
the channel, which is the case where insisting is worth something. With it has gone the little
"Unreachable" window, which said after the fact what one now sees beforehand.

## 1.1.105

**The connection's name is visible in every notification**, in italics, at the head of the text:
"*Home* · You are in the channel · Anna waiting". It used to be in the title, which with the
notification folded is invisible on a good many phones — and "You are in the channel", with
several connections configured, does not say which one. The same name, always in italics, on the
pill at the top and in the summary in the middle.

**A notification swiped away no longer comes back.** It was rewritten every minute to make up for
a lost update, and a rewritten notification is reborn: now it is rewritten only when the text
really changes, and it tries again only if the writing failed.

## 1.1.101

**The little square no longer gets lost off the screen.** It could be dragged anywhere and came
back only at the end of the gesture: if that end never arrived — the gesture stolen by another
touch — it stayed outside, and nothing brought it back. Now the edge stops it while you move it,
like the little windows of WhatsApp or FaceTime, and the same holds while enlarging it.

## 1.1.100

**With the camera on alone you can go full screen.** A touch on the little square brings your own
picture up big, another takes you back to the summary; before, the choice fell in the very instant
you made it. The little square stays there empty, and says how the other person is doing in real
words — their name if they are in the channel, "waiting", "disconnected", "unreachable" — instead
of a "waiting" good for all seasons.

**No more invented old versions.** When the other person left the channel, the app went on saying
"an older one over there": that is the sign by which an old Duetto is recognised, namely not
declaring its version, but on leaving nobody declares it.

## 1.1.99

**The volumes can be read even when only they have video.** Before, with their video full screen,
the summary in the middle (covered) and the little square (which is not there) disappeared
together: with the technical lines on, a second pill appears at the top, "You", with your audio
output and your volume beside theirs.

**In the summary each volume carries the sign of who is listening**: theirs before "hears you",
yours after "you hear". Before there was only one at the head of the line, and it looked as if it
held for both.

## 1.1.98

**One piece of news only.** "They are reachable again" appeared both in Android's shade and in
the panel inside the app: now only in the shade.

**The technical lines no longer run off the screen.** "round trip 42 ms" has become "latency r/t
42 ms", and that line shrinks by itself when needed, as the resolution one already did.

**The volume that travels is right from the first instant.** The session was born announcing 100%
and corrected itself a moment later: if that correction got lost, a number that had never been
true stayed on the other side.

## 1.1.97

**You know at what volume the other person hears you.** With the technical lines on, every pill
says how the phone whose name it carries sounds: beside "Not you", where their sound comes out and
at what volume they are listening to **you**; beside "You", your output and your volume. The
number that counts is theirs: it was the one thing you could not know in any way, and it explains
the "I can't hear you" all by itself — if they have you at 25%, now it shows. The figure travels
by itself and updates as soon as they touch the volume keys.

**If the other person has no video, the little square holds yours.** Before, switching the video
on alone, nothing was left to say that there was somebody on the other side: now the big place
holds the summary of how they are doing, and your video sits in the little square.

**You hear the drum roll too.** Knocking on the other person's door, the sound plays here as well:
it is the confirmation that the alert really did set off.

**The latency among the technical lines.** "Round trip 42 ms": how long the voice takes to do the
loop.

**The notifications all speak the same way, and do not grow old.** The connection's name sits in
the title — "Duetto · Home" — and no longer sometimes there and sometimes in the middle of the
text. "They are reachable again" disappears as soon as they disappear again; "is waiting for you
in the channel" disappears when they leave the channel; and every piece of news removes itself
after ten minutes anyway, instead of staying on to tell of something that happened this morning.
The fixed line is rewritten every minute: if an update gets lost — it happens, the system can
refuse it — a "no link to the server" no longer hangs there with the link long since back.

**The panels inside the app fade.** After ten seconds they go by themselves; touching them removes
them at once, as before.

## 1.1.95

**The presence survives a phone that puts the app away.** On some phones — a recent Motorola, for
instance — the app is dismantled **three seconds** after going into the background, without
anybody having closed it: from then on the other person saw you as "unreachable" until you
reopened Duetto. Now, at that moment, the presence passes to the listening without an interface,
which reopens the connection by itself, and the service no longer goes out together with the
window.

**Every connection remembers its own settings.** The name you go by, the video quality, the richer
voice, the technical lines, the fading of the controls, the sound and the vibration of the alert,
the audio output, the volume of the other person's voice, the camera: changing connection brings
back the ones belonging to that person. Before there was one set for the whole app, and with the
second person you found yourself wearing the choices made for the first. The camera, moreover, was
not remembered at all: every time one started again from the front one.

**On leaving, the journal sets off before the closing.** Pressing "Leave", "Leaving, one moment…"
appears for a fraction of a second: that is the time to send the other phone the last lines, while
the connection is still open. Before they stayed there until the next connection, and if the app
died in the meantime they told a story that never reached anybody.

**The video's zoom no longer springs back like elastic.** The zoom figure was held by the system
and we had a copy of it that stopped updating: the screen zoomed, the code believed otherwise, and
on release it took everything back to full screen. Now the pinch starts again from where you are,
the release holds, and a double tap goes back and forth. And the zoom is no longer cleared when
the other person's picture breaks off and reappears.

**The journal tells what you do.** Microphone, camera, quality, alerts, zoom, exits: your actions
and theirs, each with its own line, plus an opening line saying with which settings that
connection started. It serves to reconstruct afterwards what happened, and to understand what
"I didn't change anything" means.

**Whoever detaches on purpose can be seen.** The server tells whoever says goodbye from whoever
disappears, and for the one left behind the difference is everything: one comes out of a tunnel,
one does not come out of a decision. If the other person chooses "leave and become unavailable",
you now read "has made themselves unreachable: they disconnected Duetto on purpose", instead of an
"unreachable" that looks like a fault to be waited out.

**A long press on "Leave" chooses how to leave.** The touch does what it always did — you close
the channel but stay reachable, and their alert still reaches you. The long press adds the other:
*leave and become unavailable*, which disconnects Duetto altogether — no connection, no
notification, no alerts, and to the other person you are unreachable, which is the truth. It lasts
until you reopen the app: reopening it is already saying "I am here".

**From the "Connect the two phones" screen one can go back.** Whoever got there to add a
connection had no way of changing their mind: the Back key closed the app, and the only road was
"Change server", which promises something else entirely. Now there is "Cancel", and the Back key
takes you back to the settings.

**If the app of one of the two dies, the other one gets to know.** Nobody can give notice while
dying — a process killed by the system receives no warning at all — but on coming back up the
phone remembers how it went, and then says so: "Anna disappeared at 23:04: the phone had run out
of memory. She is back now". It arrives as silent news, not as an alert: it does not sound and
does not vibrate. And if the absence lasted more than a minute without being a death, the return
is announced all the same, a few seconds later — just the time to let the story go first, when
there is one. The same sentence appears inside the app too, on a little card at the top that goes
away when touched: whoever is already looking at the screen does not open the notification shade.

**The app weighs 28 MB instead of 43.** Inside were the native libraries for two architectures:
arm64, which is every phone of the last ten years, and the 32-bit one, which nobody uses any more.
With the second taken out, the file to hand to the other person is nearly half the size, it
installs faster, and there is less code to keep in memory on the phone.

**In the settings it says where the sounds come from.** They are other people's recordings, and
whoever made them deserves naming: the fanfare's licence asks for it (CC BY-NC 4.0), the other
three do not — but naming only the compulsory one would be a courtesy by halves.

**Five sounds for calling somebody back, and they are real recordings**: drums, drum kit, fanfare,
car horn, rooster. Only the car horn is still homemade — a horn is literally two notes with odd
harmonics, and it comes out better that way than by hunting for a clean recording. The other four
were synthesised and it showed: a built "cock-a-doodle-doo" stays a caricature, a built drum kit
is a thud with no skin.

**Holding "Call" down, when you are both in the channel, you can call them back with a sound.** It
is for when they are there but do not answer: they have fallen asleep, or left the phone on the
other side of the room where your voice does not reach. Five sounds, well apart from one
another — **drums**, **drum kit**, **fanfare**, **car horn**, **rooster** — and they play on their
phone at the alarm volume, not the conversation's: they are heard even if the voice was low. They
travel inside the conversation's encrypted envelope, so the server does not even know it happened.

**In the channel, the volume keys set the other person's voice.** Not the phone's volume: how much
Duetto raises that voice before playing it, something no phone can ignore. On pressing, "Their
voice 75%" appears in place of the system bar. The same control is there by hand too, holding
"Audio" down.

The reason is in the data: on a Motorola Edge 50 Fusion the keys arrived at the right place and
the call volume index went down from 4/8 to 2/8 — the system was moving all right — and to the ear
nothing changed. The phone records the number and ignores it, and from outside a volume that goes
down with no effect is indistinguishable from one that really goes down. The system volume stays
where it is and is set outside the channel, like every other volume.

**The journal says which phone it belongs to**: make, model and Android version, on the start-up
line. Reading somebody else's journal it is the first question, because half of the audio's
behaviour depends on it.

**The system bars, top and bottom, are black like the app.** On a phone in a light theme the
status bar came out grey and the navigation one white with dark keys: two light bands at the edges
breaking the picture exactly where it should carry on. Now the ground is the same black as the
app's and the symbols are light, whatever the phone's theme.

**The camcorder symbol has round corners like its button.** They were barely bevelled, and with
the video on — where the drawing is dark on a light pill and nearly fills it — that almost-square
rectangle made it look as if the button were the one with sharp corners, different from all the
others in the row.

**The journal also records how the sound is doing**: which mode the phone's audio goes through,
where the voice volume and the media volume stand, whether the sound comes out of the speaker, and
whether the side keys command the voice. On a distant phone those three things cannot be looked
at, and without them an "I can't hear anything" stays a guess.

**The technical lines under the buttons can be read even when faded.** They were a grey fit for a
footnote: as soon as the controls began to step aside they disappeared, because the fading
multiplies what little contrast there was. Now they are lighter, with a shadow underneath that
lifts them off the picture.

**The controls that step aside now have three modes.** "Barely faded" is the usual one (40%, they
stay legible), "well faded" reduces them to a shadow (15%), "hidden" takes them away altogether.
In all three they stay pressable and a touch anywhere calls them back: only how much picture they
leave visible changes. Whoever had switched "Hide the controls" on finds themselves on "hidden",
without choosing anything again.

**With the video on, the voice turns rich by itself.** The better audio costs 4 kB/s per
direction: beside half a megabit of video it goes unnoticed, and giving up a good voice to save it
is a poor bargain. Now, when the video goes over 320 kbit/s, the audio ceiling rises by itself; it
goes back to the setting when the video drops below 160 or is switched off. The setting is not
touched, and if you switched it on it stays on anyway.

**Swiping the app away from the recents no longer makes you unreachable.** It was a shortcut that
looked reasonable — whoever throws the app away wants to close it — but the journals of three
different phones tell another story: after that gesture the process stayed there without a
service, and half an hour later Android recycled it to make room for something else. Whoever had
swiped the app away merely to tidy up the recents found themselves unreachable without having
asked for it and with no way of noticing. For not being reachable there is "leave and become
unavailable", which says so in its own words — and when that shortcut was written it did not exist
yet.

**Enough of "they have disconnected" said of somebody who has not disconnected at all.** The
goodbye that tells the other person "I am going on purpose" set off at every closing of the
connection — even when it closed to reopen an instant later, which happens every time you pick the
phone up again and the app takes over from the listening without an interface. Whoever was
watching read that the other had detached deliberately, and stopped waiting for them. Now the
goodbye sets off only when it is true: "leave and become unavailable", or the breaking of a
connection. Everything else is a fall, after which coming back is normal.

**With the rear camera the picture is no longer flipped.** The mirror makes sense for the front
camera — whoever looks at themselves expects a mirror, and that is how one does one's hair — but
framing the world it is simply wrong: writing reads backwards and one moves the opposite way from
what one sees. The other person received the right picture anyway: the mirror was only in the
preview.

**The notifications have the new icon too.** They had been left with a system symbol, the same as
a hundred other apps'.

**The app's icon.** Two telephone handsets, one blue and one green, facing each other and joined
by the twisted cord. In place of the template's little robot, which had been there since day one.

**If the controls have gone altogether, they cannot be pressed.** With "hidden" they stayed
pressable even while invisible, and a finger resting where a button used to be switched the video
off or left the channel with nothing to announce it. Now the first touch merely calls them back:
then one decides, looking. Faded to 15%, on the other hand, they can be pressed, since they can
still be seen.

**With several connections, the alert says which one it arrived on.** "Duetto · Home" instead of
"Duetto": whoever is looking for you is one of the two or three you know, and before, to know
which, one had to open the app.

**In the little window, while waiting for the other person, there is now a face and one word.**
Pressing Back the app stays in a rectangle the size of a thumb, and there the summary "You are in
the channel…" did not fit: it ran off the edges and half a word could be read. Whoever pressed
Back is not reading, they are keeping an eye.

**If the two phones have different versions of Duetto, the technical lines say so.** In yellow,
under the buttons: "Different versions: 1.1.65 here, 1.1.55 over there". It is the explanation for
half the oddities — something that is here and not there, a button behaving in two ways — and
before, one had to ask about it out loud. If the versions are the same nothing appears. Whoever
has a version older than this one does not declare theirs: then one reads "an older one over
there", which is the thing that counts anyway.

**Every connection has its own journal, separate from the others.** With several connections
configured everything ended up in a single file: lines identical to one another, from different
phones, and no way of separating them afterwards, because the lines do not say whose they are. Now
the file carries the name you gave the connection. The count of the lines already sent is per
connection too: before there was only one, and what you had sent to one counted as sent to the
other as well, who would never see those lines.

**The journal no longer gets lost when the other person is listening without the app open.** After
a restart of the phone — or after the system has killed the app and the presence has started again
by itself — the other person is reachable but without an interface, and there the journal you sent
them reached a piece of the app that was not looking at it: whoever had sent it had already marked
those lines as sent, and they disappeared. They were precisely the lines that tell why that phone
had died. Now they are collected there too, and the news of the death arrives there too.

**The journal goes across to the other phone every five minutes** instead of every hour: a journal
that arrives at once tells what has just happened on the other side, one that arrives an hour late
tells an old story.

**When the app disappears, it now stays written down why.** Android always knows how a process
died — out of memory, an error, a freeze, a force-stop, or a decision by the maker's battery
manager — but tells nobody until it is asked. Now Duetto asks at every start and puts the answer
in the journal, with how much memory it took up and how much it counted in the system's eyes at
that moment. And since the two phones exchange the journal, one also discovers why it disappeared
on the other person's phone, with no cables and without having to ask them.

**If the system kills the app, the presence comes back by itself.** When Android closes Duetto to
make room for something else, the service started again showing the notification but without a
connection: a presence declared and non-existent. Now in that case the engine that holds the
connection starts again too, by the same road used after a restart of the phone. If instead it is
you who removes the app from the recents, it stays closed: that is a decision, not an accident.

**You can give every connection a name.** It is not the person's name — they give themselves
that, or they have none — it is the name of the thread that joins you: "Home", "Office". With
several connections in a list they all became "Unnamed" and could not be told apart; now the
pencil beside each one opens the field to write it in. The name appears on the pill at the top, in
place of "Duetto", and at the head of the fixed notification, so you always know which connection
you are in. It stays on this phone: the other person does not see it and will never know it. In
each connection's panel there is also the server it was made on.

**One phone can hold several connections and move from one to another.** Before, pairing with
somebody else meant throwing away the earlier connection, and to go back one had to do it all
again — with the other person present, the phone in hand and the code to dictate out loud. Now
every pairing remains: in the settings there is the list, the one in use is first and has a lit
border, and touching another moves to it. At start-up the last one used is always taken up again,
so whoever has only one notices nothing.

Every connection also remembers the server it was born on, and carries it along when it is taken
up again. The other person's name updates by itself at every entry: in a list it is the one thing
that tells one connection from another.

**The waiting screen now says whether the other person is waiting or unreachable.** Before it said
only "they are not here yet", which are two very different things: if they are waiting they are
not in the channel but the alert reaches them; if they are unreachable their phone is not
connected to the server, and the alert has nowhere to go — so you are not even offered the knock.

**The state refreshes itself**: every minute for the first quarter of an hour, then every five,
and at once every time you switch the screen back on. It is needed because a drop of somebody who
is merely waiting is discovered by the server at its leisure — its heartbeat is four minutes, and
that is deliberate, so as not to keep the radio awake all night — and until then the line would
say "waiting" of somebody who is no longer there.

**The fixed notification says it too**, and "Listening" has become "Waiting": "Both waiting" when
you are both there and neither has come in, "Waiting · Anna is in the channel" when she is waiting
for you inside, "You are in the channel · Anna waiting" when you have come in and she has not, "In
the channel with Anna" when you are both there, and "unreachable" in place of the waiting when
their phone is not connected. It holds for the notification that appears by itself after a restart
of the phone too, which is the only thing that speaks until you open the app.

**In the "Not you" panel one can now see how the other person is listening to you.** Beside the
words there is the sign of their audio output — speaker, ear, headphones, bluetooth — and if their
microphone is off the sign is crossed out. They are the two things one asks about out loud all the
time during a conversation, "can you hear me?", "are you on speaker?", and which the phone already
knows. When there is no video at all, the sign sits in the summary in the middle, above the audio
line.

**The "Call" button stays lit even when you are both in the channel.** Before it went out, on the
thought that there was nothing left to alert about; but the button there is very much pressable,
and it is in fact the case where it is needed most — the other person is there and does not
answer. A working button looked broken.

**The little square no longer jumps as soon as one takes hold of it.** At the start of the
movement it shot elsewhere, and only afterwards followed the finger: at the first move it carried
along the residue of the previous touches. Now the count starts from where the finger really
landed. The same held for the handle that resizes it.

## 1.1.38

**The alert's vibration now works even if the phone does not vibrate for other notifications.** It
was the case that counts most: whoever keeps the phone mute and still for everything else, and
wants to feel only this. The vibration was in the notification channel, and from there a system
setting can switch it off; now the app does it, declaring it for what it is — somebody looking for
you, not just any notification.

**And the alert is heard even while you are already connected.** Before it stayed mute at exactly
the moment it is needed most — the other person is there but does not answer — because during a
conversation the phone silences notifications, as it does when you are on a call. Now the sound
goes by the conversation's road, the one used for call-waiting.

## 1.1.37

**The other person's video appeared with difficulty, and sometimes only by restarting the app.**
The fault of a change two versions ago: since the microphone opens only when the other person
arrives, half a second passed between the check "is the connection already there?" and its
creation, and in that half second two of them were born. The second won, the first stayed alive
receiving a video nobody was looking at any more. Now whoever arrives while the connection is
being created waits for that one, instead of making another.

## 1.1.35

**The app keeps a journal of consumption.** One line every five minutes — battery level, screen on
or off, network, and what Duetto was doing — to work out what keeping it listening really costs,
instead of arguing about it. Every phone sends its own journal to the other once an hour, inside
the same encrypted envelope as everything else: that way, by connecting just one to a computer,
one can read them both. There is nothing personal in the journal: battery figures and the app's
state, none of the content of what you say to each other.

## 1.1.33

**The reminder "You are in the channel, touch Call to let them know" is visible with the camera on
too.** Before it sat only in the video's place: switching your own camera on it disappeared, and
your own picture was left with nothing to explain why nothing was happening. Now it appears
overlaid, without the other person's face — over the picture it would weigh too much, and whoever
is looking already knows who they are waiting for — and it fades together with the controls,
because it is a reminder and not an alarm.

## 1.1.32

**One chooses how the alert should make itself heard.** In the settings, under "When the other
person calls you": vibration — as the phone decides, always, never — and sound — the notification
one, none, or one chosen from the phone's own. A sound unlike the others tells you who it is
without looking. It holds for the alerts that reach you: what the other person hears is their own
decision.

**"Call" answers the finger.** On pressing it, the bell starts ringing — tilted, with waves at the
sides — and the button loses its blue for a moment, then lights up again: before, only the words
underneath changed, the blue stayed out for a good two seconds, and knocking again in that gap did
not bring it back at all — it looked like a button that had broken in one's hand. The sign sets
off at the touch, without waiting for the server's confirmation, which can be late precisely when
the network is slow.

**When the other person leaves, your video goes back to full screen at once.** It stayed small,
waiting for a video that would never arrive: on leaving, their state — microphone and camera on —
stayed written down somewhere as if they were still there. Now whoever has gone is told from
whoever has fallen: for whoever falls the place is kept for six seconds, which is the time of a
change of network, so one does not see one's own video go full screen and come back for nothing.
The server says which, since it knows whether the phone said goodbye or disappeared.

**"Flip" lights up when the front camera is filming.** A white pill with the front one, out with
the rear: the only difference between the two shapes — one person or more — is caught by reading
them, while full or empty can be seen from a distance.

## 1.1.31

**Waiting costs far less.** On entering the channel the microphone no longer opens at once: it
opens when somebody really arrives on the other side. Whoever comes in first may wait a long time,
and during that wait the phone was recording for nobody — with the listening indicator on, into
the bargain. Along with this, a change on the server: the tap that keeps the connection alive was
every 30 seconds at night too, that is 120 wakings of the radio every hour to do nothing, and now
it thins out while one is merely listening. It thickens by itself when one enters the channel, and
when somebody knocks the other side is questioned at once: if they are no longer there, one finds
out immediately instead of sitting in front of a "called" addressed to nobody.

**"Flip" can be pressed with the video off too.** It flips nothing there and then: it chooses
which camera will be switched on, and the icon shows it. That way one frames something without
showing one's own face first, for an instant. In the same round a nuisance disappears: changing
resolution while filming with the rear camera, the filming went back to the front one by itself.

## 1.1.30

**The volume keys now set the other person's voice.** On some phones — the Motorola Edge 50 Fusion
among them — pressing them changed nothing: the conversation's sound comes out of the "call"
volume, while the keys acted on the media one, and whoever was listening kept it as it was, often
very high indeed. On other phones it already worked, because Android guessed well; now we tell it,
instead of hoping.

## 1.1.29

**The app is called Duetto.** The name changes everywhere: the icon, the fixed notification, the
alerts, the server's address. For Android, though, it is not the same app with a new name, it is a
different app: the old DuoTalk stays installed until you remove it by hand, and Duetto starts
empty. The pairing has to be done again — dictating the code out loud or in person once more — and
so do the settings, the system ones included (unrestricted battery, automatic start), because
Android keeps them tied to the app and does not transfer them.

## 1.0.28

**The automatic start now tells the truth.** The tick lit up merely because you had opened the
system screen, even without touching anything: it declared "all set" without knowing. No app can
read that authorisation — it is a screen belonging to the maker — but one can know whether it
worked: the app notes down when it starts again by itself after a restart, and only then does the
tick light up. Until you restart the phone it stays open, and that is honest.

## 1.0.27

**The relay's fields have been taken out too** from the advanced settings: the address and the
credentials are sent by the server in the entry message, so typing them on the phone was no longer
needed. One place is left to maintain, on the server, and changing the password touches no phone.

## 1.0.26

**The access token is gone.** It was a field in the advanced settings and a check on the server,
meant against abuse; on the server it had long been off, and the real protection is elsewhere —
the pair's identifier is born of an eight-digit code and nothing that passes through the server
is readable. One setting less to understand.

## 1.0.25

**The app weighs half as much and installs far faster.** The APK contained the libraries for four
architectures: two real ones and two that serve only PC emulators — 46 MB out of 88 that the phone
had to verify and unpack all the same, and they were the thirty seconds of "preparing the app".
Now only the phones' ones are there.

## 1.0.24

**High fidelity is gone**: it did nothing. In react-native-webrtc, noise suppression and
levelling are configured once for the whole app, not on the individual audio capture, and the
constraints passed to the microphone on Android are ignored. The switch really did reopen the
microphone, but with exactly the same parameters. **Richer voice** remains, which can be measured
and heard.

## 1.0.23

**Switching "richer voice" off really does bring the audio back down.** Before, the ceiling was
removed instead of being taken back to the normal value, and removing a limit brings nobody down:
it stayed at 64 kbit/s as if the option had no way back.

## 1.0.22

**The audio options hold for both phones**, as the resolution already did. Changing them on one
changes them on the other — and it is necessary: the voice you hear is sent by them, so raising it
only on your side makes no difference you can hear.

## 1.0.21

**Fix**: switching high fidelity on reopened the microphone mute and the other person stopped
hearing you. Whether it was on was read after stopping it, and stopping it switches it off.

**The technical line also shows the outgoing audio**, so "richer voice" can be verified instead of
believed: switched off it sits around 30 kbit/s, switched on it rises.

**The settings are divided by section**: the screen's options no longer sit under the heading
"Audio", where they looked as if they concerned the sound.

## 1.0.20

**An option for the audio**, off by default, in the settings.

**Richer voice** doubles the audio ceiling, from about 32 to 64 kbit/s: on Opus the difference can
be heard, the voice stops sounding like a telephone. It costs 4 kB/s more per direction, nothing
compared with the video.

## 1.0.19

**The microphone goes back to staying held** for as long as you are in the channel, mute included.
Releasing it when you switch it off seemed right — it let the other apps use it — but on taking it
back the system does not return the precedence, and the keyboard's dictation took it even with the
microphone on. On Android exclusivity cannot be imposed: an unbroken hold is the only thing that
resembles it.

## 1.0.18

**Taking the microphone back, Duetto really takes it back.** By releasing it, the conversation's
audio mode was let go as well, and that is what holds the microphone for us: on switching it back
on it stayed available to other apps — the keyboard took it. Now the mode is declared again,
together with the chosen audio output.

## 1.0.17

**The microphone is released when you switch it off**: before it stayed occupied — Android's
recording indicator stayed on and no other app could use it while you were in the channel. Now
switching it off really frees it, and switching it on takes it back.

**The label on the little square** is a pill like the big video's, no longer a grey band from edge
to edge covering a slice of the picture.

## 1.0.16

**Changing resolution reopens the camera**, with half a second of black, on every phone in the
same way. The attempt to avoid it by going down — reducing only what leaves the encoder — does not
work everywhere, and recognising the phones that honour it required a measurement that proved
unreliable: it declared deaf even a phone that was obeying. A mechanism that never sets off and
does not say so is worse than the flaw it meant to avoid.

## 1.0.14

**The controls go out slowly**, with a continuous ten-second fall that starts at once. Before they
stood still for a few seconds and then dropped all at once: a jump that catches the eye precisely
when one wants to look at something else.

## 1.0.11

**Urgent fix**: switching the video on closed the app. The safety net that keeps the little square
inside the edges wrote the position inside the listener of the position itself, which set it off
again for ever.

## 1.0.10

**The little square can no longer leave the edges**, however it got there: before it was put back
inside only at the end of a gesture, and every road that moved it without passing through there
left it outside.

## 1.0.9

**When the network comes back the picture stays still** on the last frame instead of going black:
the link comes back on without taking the video apart. It is the same reason the other video-call
apps do not show black — they save nothing, they simply destroy nothing.

## 1.0.8

**Holding "Video" down** one chooses among the four resolutions, as one already does with "Audio"
for the sound's output. Quality is judged by looking, and going to hunt for it in the settings
means losing sight of the very thing one is assessing.

## 1.0.7

**"You" / "Not you" fades** together with the other controls, instead of staying lit over the
picture. It never disappears completely: who one is looking at is the one thing that cannot be
worked out by watching the screen.

## 1.0.6

**The release notes scroll** and stay inside the screen. They no longer close when the background
is touched — it was that very convenience that contended the gesture with the scrolling, which
indeed worked only now and then.

## 1.0.5

**"You" / "Not you" always at the top left**, with two videos too: touching the little square the
two swap over, and it is easy to lose track of who one is looking at. It never fades with the
other controls.

**Audio and video switched on are white pills**, switched off they stay dark: what has to be seen
more is what is working.

## 1.0.3

**Legible icons.** The controls no longer use emoji, which have colours of their own and a shape
decided by the phone's maker: camcorder and microphone, at small sizes, were hard to tell apart.
Now they are white line drawings, the same everywhere, with a diagonal bar when the function is
off. The settings cog has become three sliders: with its rays, at small sizes, it looked like a
sun.

**No more card during a change of network.** Changing wifi or cell, "The other person is in the
channel" reappeared, which at every transition became a flicker. Now the black remains: the video
is about to come back, and nothing has happened that is worth telling.

**Your video stays in the little square** when the network changes, instead of going full screen
and coming back an instant later.

**A touch on the picture** hides the controls, instead of merely calling them back.

**The "Flip" button says which camera is on**: one person alone for the front one, several people
for the rear. Before, the circular arrow said only what the button would do, and to know which
side one was on one had to look at the picture.

**With a single video full screen** "You" or "Not you" appears: without the little square there is
no term of comparison, and framing an empty room one cannot tell who one is looking at.

**Touching the app's name** one reads the notes for this version and the earlier ones.

**In the settings**: the quality is applied at the touch without "Save", the server is visible but
is changed only on request, and the controls can be hidden altogether instead of faded. The two
technical lines under the buttons — resolution, bandwidth, road — are now optional and off by
default.

**Every build has its own version number**: the last number moves by itself, so asking "which
version have you got" is enough to know exactly what is running.

## 1.0.0

The first complete version.

**A channel, not a call.** You open the app and you are inside; if the other person is there too
you connect by yourselves, otherwise you stay reachable and are alerted as soon as they arrive —
after a restart of the phone as well.

**Audio and video encrypted end-to-end** straight between the two phones. The server only serves
to let you find each other, and when your networks prevent the direct link it acts as a bridge
without being able to read anything.

**Pairing with eight digits** dictated out loud, once and for all. From an already paired phone
the pairing can be done again without breaking it on the other side too.

**Four quality profiles**, synchronised between the two phones: changing it on one changes it on
the other.

**The video**: whoever is full screen is never cropped, the little square has the proportions of
its own camera, it can be dragged and resized, and it stays where you put it even after closing
the app. The Back key puts the app into the system's little window instead of making you leave.
