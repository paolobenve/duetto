#!/usr/bin/env python3
"""
I suoni per richiamare l'altro.

Servono a svegliare qualcuno che si e' addormentato o che ha lasciato il
telefono acceso dall'altra parte della stanza: devono bucare, non essere
carini. Tre soli, ben diversi fra loro, cosi' si sceglie a colpo sicuro
senza doverli riascoltare.

Uno solo e' fatto in casa, la strombazzata: un clacson sono letteralmente
due note con le armoniche dispari, e sintetizzarlo viene meglio che
cercarne una registrazione pulita. Tutti gli altri sono registrazioni,
perche' altrove la sintesi si sente - un "chicchirichi" costruito resta
una macchietta, e una batteria costruita e' un tonfo senza pelle.

Le fonti stanno in assets/, e qui sotto c'e' da dove vengono:

  tamburi.wav   freesound.org #556255, "waveplaysfx"
  batteria.wav  freesound.org #695331, "hewnmarrow"
  fanfara.wav   freesound.org #534017, "robinhood76"  CC BY-NC 4.0
  gallo.flac    freesound.org #454174, "kyles"

La fanfara e' l'unica con una licenza che chiede qualcosa in cambio:
l'attribuzione, che sta nelle impostazioni dell'app sotto "Da dove
vengono i suoni", e il non commerciale - Duetto non si vende e non ha
pubblicita', quindi va bene, ma se un giorno cambiasse quella fanfara
dovrebbe uscire. Gli altri tre non chiedono niente; nominarli lo stesso
costa una riga.

Lo script non le tocca se non per tagliarle dove finiscono, ripeterle
quando sono giri di una battuta sola, e portarle tutte allo stesso
volume: scegliendo da un elenco non ci si aspetta che uno arrivi a meta'
forza.

    python3 assets/genera-suoni.py
    -> modules/duetto-platform/android/src/main/res/raw/*.ogg
"""
import os
import subprocess
import numpy as np

SR = 44100
QUI = os.path.dirname(os.path.abspath(__file__))
FUORI = os.path.join(
    QUI, '..', 'modules', 'duetto-platform', 'android', 'src', 'main', 'res', 'raw',
)

def t(dur):
    return np.linspace(0, dur, int(SR * dur), endpoint=False)

def decadi(n, tau):
    """Inviluppo che scende come una campana percossa."""
    return np.exp(-np.linspace(0, n / SR, n) / tau)

def metti(base, quando, suono, guadagno=1.0):
    i = int(quando * SR)
    fine = min(len(base), i + len(suono))
    base[i:fine] += suono[:fine - i] * guadagno

def normalizza(x, picco=0.89):
    m = np.max(np.abs(x))
    return x if m == 0 else x * (picco / m)

# --- Tamburi ---------------------------------------------------------------
# Un giro di batteria di una battuta esatta a 120 al minuto - due
# secondi - con l'ultimo mezzo secondo di pausa, che fa parte del giro.
# Due volte, perche' uno solo passa troppo in fretta per chi dorme; la
# pausa finale si taglia, che chiudere con mezzo secondo di niente fa
# sembrare il suono troncato.
TAMBURI = os.path.join(QUI, 'tamburi.wav')

def campione(percorso, fino=None):
    """Il file, in mono a 44.1 kHz, eventualmente accorciato."""
    comando = ['ffmpeg', '-v', 'error', '-i', percorso]
    if fino is not None:
        comando += ['-t', str(fino)]
    comando += ['-f', 's16le', '-ar', str(SR), '-ac', '1', 'pipe:1']
    grezzo = subprocess.run(comando, check=True, capture_output=True).stdout
    return np.frombuffer(grezzo, '<i2').astype(np.float64) / 32768

def sfuma(x, secondi=0.06):
    """Dissolvenza in coda: tagliare di netto fa un click."""
    coda = int(SR * secondi)
    y = x.copy()
    y[-coda:] *= np.linspace(1, 0, coda)
    return y

def tamburi():
    giro = campione(TAMBURI)
    # Dove il giro smette di suonare: da li' in poi e' la sua pausa.
    forte = np.where(np.abs(giro) > 0.02)[0]
    suono = giro[:forte[-1] + int(SR * 0.05)] if len(forte) else giro
    return normalizza(sfuma(np.concatenate([giro, suono])))

# --- Batteria --------------------------------------------------------------
# Un giro intero, non un colpo: dura una battuta - quattro quarti a 130
# al minuto, un secondo e ottantacinque - e finisce dove ricomincia,
# quindi ripetendolo non si sente la giunta. Due giri: uno solo passa
# troppo in fretta per chi sta dormendo.
BATTERIA = os.path.join(QUI, 'batteria.wav')

def batteria():
    giro = campione(BATTERIA)
    return normalizza(sfuma(np.concatenate([giro, giro])))

# --- Fanfara ---------------------------------------------------------------
# "Ta-daaa": due secondi di trombe, con la coda che si spegne da se' in
# un riverbero. Si taglia dove il riverbero e' finito - il resto e'
# silenzio registrato, che nel file occupa e all'orecchio non aggiunge.
FANFARA = os.path.join(QUI, 'fanfara.wav')
FINE_FANFARA = 2.3

def fanfara():
    return normalizza(sfuma(campione(FANFARA, FINE_FANFARA), 0.08))

# --- Strombazzata ----------------------------------------------------------
# Il clacson di un'automobile e' fatto di due note insieme, a distanza di
# terza: e' quella coppia a renderlo inconfondibile e insopportabile.
def clacson(dur):
    n = int(SR * dur)
    tempo = t(dur)
    x = np.zeros(n)
    for f in (440.0, 554.4):
        # Armoniche dispari calanti: un'onda quasi quadra, che e' quella
        # che buca.
        for k, peso in ((1, 1.0), (2, 0.5), (3, 0.42), (4, 0.22), (5, 0.18), (7, 0.1)):
            x += np.sin(2 * np.pi * f * k * tempo) * peso
    # Attacco immediato, coda cortissima: un clacson non sfuma.
    inv = np.ones(n)
    salita = int(SR * 0.008)
    discesa = int(SR * 0.03)
    inv[:salita] = np.linspace(0, 1, salita)
    inv[-discesa:] = np.linspace(1, 0, discesa)
    return x * inv

def strombazzata():
    x = np.zeros(int(SR * 1.9))
    metti(x, 0.00, clacson(0.34))
    metti(x, 0.50, clacson(0.34))
    metti(x, 1.00, clacson(0.80))
    return normalizza(x)

# --- Canto del gallo -------------------------------------------------------
# Registrato, non costruito: si taglia dove il canto finisce e si porta
# allo stesso volume degli altri due, perche' scegliendo un suono
# dall'elenco non ci si aspetta che uno arrivi a meta' forza.
GALLO = os.path.join(QUI, 'gallo.flac')
FINE_GALLO = 3.3   # secondi: dopo c'e' solo il fruscio del campo

def gallo():
    return normalizza(sfuma(campione(GALLO, FINE_GALLO), 0.08))

# --- scrittura -------------------------------------------------------------
def salva(nome, dati):
    os.makedirs(FUORI, exist_ok=True)
    grezzo = (np.clip(dati, -1, 1) * 32767).astype('<i2').tobytes()
    fuori = os.path.join(FUORI, nome + '.ogg')
    subprocess.run(
        ['ffmpeg', '-y', '-loglevel', 'error',
         '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', 'pipe:0',
         '-c:a', 'libvorbis', '-q:a', '3', fuori],
        input=grezzo, check=True,
    )
    print(f'{nome}: {len(dati)/SR:.1f}s, {os.path.getsize(fuori)//1024} kB')

if __name__ == '__main__':
    salva('sveglia_tamburi', tamburi())
    salva('sveglia_batteria', batteria())
    salva('sveglia_fanfara', fanfara())
    salva('sveglia_strombazzata', strombazzata())
    salva('sveglia_gallo', gallo())
