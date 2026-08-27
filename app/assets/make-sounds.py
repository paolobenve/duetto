#!/usr/bin/env python3
# Duetto - a permanent voice and video channel for two people.
# Copyright (C) 2026 Paolo Benvenuto
#
# Free software under the GNU General Public License, version 3 or any
# later version, and with no warranty of any kind. The full text is in
# the LICENSE file at the root of the project, and at
# <https://www.gnu.org/licenses/>.
"""
The sounds for calling the other person back.

They are there to wake up somebody who fell asleep or left the phone on
on the other side of the room: they have to cut through, not to be
pretty. A handful only, clearly different from one another, so that one
picks with confidence without having to listen again.

Two are home-made, the horn and the knock: a car horn is literally two
notes with the odd harmonics, and synthesising it comes out better than
looking for a clean recording. All the others are recordings, because
elsewhere synthesis can be heard - a built "cock-a-doodle-doo" stays a
caricature, and a built drum kit is a thud with no skin on it.

The sources live in assets/, and here is where they come from:

  drumroll.wav   freesound.org #556255, "waveplaysfx"    CC0
  drumkit.wav    freesound.org #695331, "hewnmarrow"     CC0
  fanfare.flac   freesound.org #397355, "plasterbrain"   CC0
  rooster.flac   freesound.org #454174, "kyles"          CC0

CC0 means no rights reserved: not one of them asks for anything, and
they are named out of fairness, not out of duty. It is worth keeping it
that way: a sound that asked for something in return would ask it of
everybody who takes this code, and one that forbade commercial use would
not sit with the licence the rest of it carries.

The script does not touch them except to cut them where they end, to
repeat the ones that are a single bar, and to bring them all to the same
volume: picking from a list, one does not expect one of them to arrive at
half strength.

    python3 assets/make-sounds.py
    -> modules/duetto-platform/android/src/main/res/raw/*.ogg
"""
import os
import subprocess
import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(
    HERE, '..', 'modules', 'duetto-platform', 'android', 'src', 'main', 'res', 'raw',
)

def t(dur):
    return np.linspace(0, dur, int(SR * dur), endpoint=False)

def decay(n, tau):
    """Envelope that falls like a struck bell."""
    return np.exp(-np.linspace(0, n / SR, n) / tau)

def put(base, when, sound, gain=1.0):
    i = int(when * SR)
    end = min(len(base), i + len(sound))
    base[i:end] += sound[:end - i] * gain

def normalise(x, peak=0.89):
    m = np.max(np.abs(x))
    return x if m == 0 else x * (peak / m)

# --- Drum roll -------------------------------------------------------------
# A drum bar of exactly one measure at 120 to the minute - two seconds -
# with the last half second of silence, which is part of the bar. It is
# played once, and that pause is cut: it is the tail of a bar that is not
# followed by another, and closing with half a second of nothing makes
# the sound seem truncated.
DRUMROLL = os.path.join(HERE, 'drumroll.wav')

def sample(path, until=None):
    """The file, mono at 44.1 kHz, shortened if asked."""
    command = ['ffmpeg', '-v', 'error', '-i', path]
    if until is not None:
        command += ['-t', str(until)]
    command += ['-f', 's16le', '-ar', str(SR), '-ac', '1', 'pipe:1']
    raw = subprocess.run(command, check=True, capture_output=True).stdout
    return np.frombuffer(raw, '<i2').astype(np.float64) / 32768

def fade(x, seconds=0.06):
    """A fade at the end: cutting it clean makes a click."""
    tail = int(SR * seconds)
    y = x.copy()
    y[-tail:] *= np.linspace(1, 0, tail)
    return y

def drumroll():
    bar = sample(DRUMROLL)
    # Where the bar stops sounding: from there on it is its own pause.
    loud = np.where(np.abs(bar) > 0.02)[0]
    sound = bar[:loud[-1] + int(SR * 0.05)] if len(loud) else bar
    return normalise(fade(sound))

# --- Drum kit --------------------------------------------------------------
# A whole bar, not a single hit: it lasts one measure - four quarters at
# 130 to the minute, one second eighty-five - and it ends where it starts
# again. One bar, not two: a couple of seconds of drums say what they
# have to say, and a sound that can be sent again with a touch does not
# need to insist by itself.
DRUMKIT = os.path.join(HERE, 'drumkit.wav')

def drumkit():
    bar = sample(DRUMKIT)
    return normalise(fade(bar))

# --- Fanfare ---------------------------------------------------------------
# "Ta-daaa": a second and a half of trumpets that end by themselves. It
# is cut just past the tail - what follows is recorded silence, which
# takes up room in the file and adds nothing to the ear.
FANFARE = os.path.join(HERE, 'fanfare.flac')
FANFARE_END = 1.5

def fanfare():
    return normalise(fade(sample(FANFARE, FANFARE_END), 0.08))

# --- Horn ------------------------------------------------------------------
# A car horn is made of two notes together, a third apart: it is that
# pair that makes it unmistakable and unbearable.
def horn_blast(dur):
    n = int(SR * dur)
    time = t(dur)
    x = np.zeros(n)
    for f in (440.0, 554.4):
        # Falling odd harmonics: an almost square wave, which is the one
        # that cuts through.
        for k, weight in ((1, 1.0), (2, 0.5), (3, 0.42), (4, 0.22), (5, 0.18), (7, 0.1)):
            x += np.sin(2 * np.pi * f * k * time) * weight
    # Immediate attack, very short tail: a horn does not fade.
    env = np.ones(n)
    up = int(SR * 0.008)
    down = int(SR * 0.03)
    env[:up] = np.linspace(0, 1, up)
    env[-down:] = np.linspace(1, 0, down)
    return x * env

def horn():
    x = np.zeros(int(SR * 1.9))
    put(x, 0.00, horn_blast(0.34))
    put(x, 0.50, horn_blast(0.34))
    put(x, 1.00, horn_blast(0.80))
    return normalise(x)

# --- Rooster ---------------------------------------------------------------
# Recorded, not built: it is cut where the crowing ends and brought to
# the same volume as the others, because picking a sound from the list one
# does not expect it to arrive at half strength.
ROOSTER = os.path.join(HERE, 'rooster.flac')
ROOSTER_END = 3.3   # seconds: after that there is only the rustle of the field

def rooster():
    return normalise(fade(sample(ROOSTER, ROOSTER_END), 0.08))

# --- Knock -----------------------------------------------------------------
# It is not a sound for waking anybody: it is the answer heard by WHOEVER
# knocks, on their own phone, to know the alert has left. It used to be
# the drum roll, which is an announcement though, and for two raps on a
# door two raps on a door are enough.
#
# Home-made, like the horn, and for the same reason: a rap on a door is an
# impulse on a piece of wood, that is a dry noise plus a few modes falling
# away quickly. Synthesis cannot be heard here because there is no timbre
# to imitate - there is a thud.
def rap(f0, seed, dur=0.24):
    n = int(SR * dur)
    time = t(dur)
    x = np.zeros(n)
    # The wood: few modes, not harmonic with one another. Low and long: a
    # heavy door sounds underneath, and the high modes - which are there
    # in a rap on a small table - would turn it into a knuckle on thin
    # wood.
    for f, tau, weight in (
        (f0, 0.085, 1.0), (f0 * 2.31, 0.045, 0.48),
        (f0 * 4.10, 0.024, 0.22), (f0 * 7.60, 0.012, 0.10),
    ):
        x += np.sin(2 * np.pi * f * time) * decay(n, tau) * weight
    # The rap itself: noise lasting the blink of an eye. This is what
    # makes it go "tock" and not "boo", but it has to be kept dark - raw
    # white noise cracks like a whip - so it goes through a filter that
    # takes the top off it.
    chance = np.random.default_rng(seed)
    noise = chance.standard_normal(n) * decay(n, 0.005)
    tail = np.exp(-np.arange(48) / 12.0)
    noise = np.convolve(noise, tail / tail.sum())[:n]
    x += noise * 1.4
    up = max(1, int(SR * 0.0008))
    x[:up] *= np.linspace(0, 1, up)
    return x

def knock():
    # Little more than the two raps: after the second there is only its
    # tail, and half a second of silence at the end takes up room and is
    # not heard.
    x = np.zeros(int(SR * 0.56))
    # Two raps, not identical: a hand never repeats the same rap, and two
    # exact copies sound fake. The second a shade louder than the first,
    # as comes naturally when knocking.
    put(x, 0.00, rap(142.0, 1), 0.88)
    put(x, 0.26, rap(132.0, 2), 1.00)
    return normalise(fade(x, 0.05))

# --- writing ---------------------------------------------------------------
def save(name, data):
    os.makedirs(OUT, exist_ok=True)
    raw = (np.clip(data, -1, 1) * 32767).astype('<i2').tobytes()
    out = os.path.join(OUT, name + '.ogg')
    subprocess.run(
        ['ffmpeg', '-y', '-loglevel', 'error',
         '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', 'pipe:0',
         '-c:a', 'libvorbis', '-q:a', '3', out],
        input=raw, check=True,
    )
    print(f'{name}: {len(data)/SR:.1f}s, {os.path.getsize(out)//1024} kB')

if __name__ == '__main__':
    save('alarm_drumroll', drumroll())
    save('alarm_drumkit', drumkit())
    save('alarm_fanfare', fanfare())
    save('alarm_horn', horn())
    save('alarm_rooster', rooster())
    save('knock', knock())
