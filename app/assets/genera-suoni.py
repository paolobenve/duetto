#!/usr/bin/env python3
"""
I suoni per richiamare l'altro, fatti in casa.

Servono a svegliare qualcuno che si e' addormentato o che ha lasciato il
telefono acceso dall'altra parte della stanza: devono bucare, non essere
carini. Tre soli, ben diversi fra loro, cosi' si sceglie a colpo sicuro
senza doverli riascoltare.

Sono generati e non scaricati per una ragione pratica: cosi' non c'e'
nessuna licenza da rispettare, nessun file di provenienza incerta dentro
l'app, e chiunque puo' rifarli cambiando due numeri qui dentro.

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
# Una pelle percossa: l'altezza cala di colpo mentre il colpo si spegne.
# Il ritmo e' quello con cui si bussa a una porta quando si ha fretta.
def tamburo(dur=0.45, f0=180, f1=62, tau=0.13):
    n = int(SR * dur)
    tempo = np.linspace(0, dur, n, endpoint=False)
    freq = f1 + (f0 - f1) * np.exp(-tempo / 0.045)
    fase = 2 * np.pi * np.cumsum(freq) / SR
    corpo = np.sin(fase) * decadi(n, tau)
    # Il colpo secco della bacchetta: senza, il tamburo sembra un fischio.
    schiocco = np.random.default_rng(7).normal(0, 1, n) * decadi(n, 0.006)
    return corpo * 0.9 + schiocco * 0.25

def tamburi():
    x = np.zeros(int(SR * 2.6))
    ritmo = [(0.00, 1.0), (0.42, 0.75), (0.84, 1.0),
             (1.05, 0.7), (1.26, 0.7),
             (1.62, 1.0), (2.04, 0.85)]
    for quando, forza in ritmo:
        metti(x, quando, tamburo(), forza)
        # Un secondo tamburo piu' grosso sotto ai colpi forti: da' il peso.
        if forza >= 0.9:
            metti(x, quando, tamburo(dur=0.6, f0=120, f1=44, tau=0.2), forza * 0.7)
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
# Quattro sillabe, "chic-chi-ri-chi", ognuna con la sua altezza; l'ultima
# lunga e tremolante. La voce e' un dente di sega rauco passato per due
# risonanze, che e' il minimo per non sembrare un fischio.
def risonanza(x, f, q):
    """Un passa-banda povero ma sufficiente, a due poli."""
    w = 2 * np.pi * f / SR
    r = np.exp(-w / (2 * q))
    a1, a2 = 2 * r * np.cos(w), -(r ** 2)
    y = np.zeros_like(x)
    for i in range(2, len(x)):
        y[i] = x[i] - x[i - 2] + a1 * y[i - 1] + a2 * y[i - 2]
    return y

def sillaba(dur, f_ini, f_fin, tremolo=0.0, rauco=0.35, seme=11):
    n = int(SR * dur)
    tempo = np.linspace(0, dur, n, endpoint=False)
    freq = np.linspace(f_ini, f_fin, n)
    if tremolo:
        freq = freq * (1 + tremolo * np.sin(2 * np.pi * 11 * tempo))
    fase = 2 * np.pi * np.cumsum(freq) / SR
    # Dente di sega: ricco di armoniche, come una voce animale.
    voce = 2 * (fase / (2 * np.pi) % 1.0) - 1
    rumore = np.random.default_rng(seme).normal(0, 1, n)
    grezzo = voce * (1 - rauco) + rumore * rauco * 0.5
    corpo = risonanza(grezzo, 1250, 6) + 0.6 * risonanza(grezzo, 2600, 8)
    inv = np.ones(n)
    salita = int(SR * 0.012)
    discesa = int(SR * min(0.06, dur / 3))
    inv[:salita] = np.linspace(0, 1, salita)
    inv[-discesa:] = np.linspace(1, 0, discesa)
    return corpo * inv

def gallo():
    x = np.zeros(int(SR * 2.4))
    metti(x, 0.00, sillaba(0.16, 520, 700, seme=1), 0.85)
    metti(x, 0.22, sillaba(0.14, 700, 640, seme=2), 0.8)
    metti(x, 0.40, sillaba(0.20, 900, 830, seme=3), 1.0)
    metti(x, 0.66, sillaba(0.95, 800, 560, tremolo=0.035, seme=4), 1.0)
    # Un secondo canto piu' lontano: un gallo solo sembra un incidente.
    metti(x, 1.75, sillaba(0.14, 520, 700, seme=5), 0.35)
    metti(x, 1.95, sillaba(0.40, 880, 640, tremolo=0.03, seme=6), 0.4)
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
