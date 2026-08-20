#!/usr/bin/env python3
"""
I suoni per richiamare l'altro.

Servono a svegliare qualcuno che si e' addormentato o che ha lasciato il
telefono acceso dall'altra parte della stanza: devono bucare, non essere
carini. Tre soli, ben diversi fra loro, cosi' si sceglie a colpo sicuro
senza doverli riascoltare.

La strombazzata e' fatta in casa: un clacson sono letteralmente due note
con le armoniche dispari, e sintetizzarlo viene meglio che cercarne una
registrazione pulita.

Gli altri due vengono da registrazioni vere, perche' li' la sintesi si
sente: un "chicchirichi" costruito resta una macchietta, e un tamburo
costruito e' un tonfo senza pelle. Le fonti stanno in assets/ e sono
pubblicate in CC0 - senza diritti riservati, senza obbligo di citare
nessuno; la citazione qui sotto sta per onesta', non perche' serva:

  gallo.flac    freesound.org #454174, "kyles"
  tamburo.wav   freesound.org #598889, "stoltingmediagroup"

Il tamburo e' un colpo solo, di due decimi di secondo: il ritmo lo
mettiamo noi, ed e' quello con cui si bussa a una porta quando si ha
fretta.

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
TAMBURO = os.path.join(QUI, 'tamburo.wav')

def colpo():
    """Il campione, in mono a 44.1 kHz."""
    grezzo = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', TAMBURO,
         '-f', 's16le', '-ar', str(SR), '-ac', '1', 'pipe:1'],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(grezzo, '<i2').astype(np.float64) / 32768

def tamburi():
    x = np.zeros(int(SR * 2.6))
    c = colpo()
    # Il ritmo con cui si bussa a una porta quando si ha fretta: tre
    # colpi staccati, una terzina fitta, e altri due per non lasciare
    # l'impressione che sia finito.
    ritmo = [(0.00, 1.0), (0.42, 0.72), (0.84, 1.0),
             (1.05, 0.62), (1.26, 0.62),
             (1.62, 1.0), (2.04, 0.8)]
    for quando, forza in ritmo:
        metti(x, quando, c, forza)
    return normalizza(x)

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
    grezzo = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', GALLO,
         '-t', str(FINE_GALLO),
         '-f', 's16le', '-ar', str(SR), '-ac', '1', 'pipe:1'],
        check=True, capture_output=True,
    ).stdout
    x = np.frombuffer(grezzo, '<i2').astype(np.float64) / 32768
    # Una dissolvenza corta in coda: tagliare di netto fa un click.
    coda = int(SR * 0.08)
    x = x.copy()
    x[-coda:] *= np.linspace(1, 0, coda)
    return normalizza(x)

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
    salva('sveglia_strombazzata', strombazzata())
    salva('sveglia_gallo', gallo())
