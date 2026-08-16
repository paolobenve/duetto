#!/usr/bin/env python3
"""Rigenera i due SVG dell'icona: due cornette verticali unite dal filo.

La sagoma della cornetta NON e' disegnata a mano: viene dal glifo
U+1F4DE (telephone receiver) del font Symbola di George Douros, che e' un
disegno vero, con le coppe svasate e le proporzioni giuste. Disegnarne
una a mano, alla misura di un'icona, finisce sempre per somigliare a una
parentesi.

Serve solo per rifare gli SVG, che sono gia' nel repo: quelli sono la
sorgente per il build (scripts/patch-android-icon.js). Qui serve
python3-fonttools e il font Symbola installato.

    python3 assets/genera-icona.py

Le trasformazioni (rotazione, scala, specchio) finiscono DENTRO le
coordinate del path invece di stare in un attributo `transform`: cosi'
gli SVG hanno solo numeri assoluti e si traducono in VectorDrawable
Android riga per riga, senza dover interpretare le trasformazioni.
"""
import math
import os

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.misc.transform import Transform

FONT = '/usr/share/fonts/truetype/ancient-scripts/Symbola_hint.ttf'
CORNETTA = 0x1F4DE
ANGOLO = -45          # il glifo e' inclinato: cosi' torna verticale

SFONDO = '#12161f'
CHIARO = '#e6ebf1'
FILO = '#7cc4ff'

QUI = os.path.dirname(os.path.abspath(__file__))

font = TTFont(FONT, fontNumber=0)
gs = font.getGlyphSet()
nome = font.getBestCmap()[CORNETTA]
bp = BoundsPen(gs)
gs[nome].draw(bp)
x0, y0, x1, y1 = bp.bounds
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
lato = max(x1 - x0, y1 - y0)


def trasformazione(altezza, distanza, specchio):
    t = Transform()
    t = t.translate(54 + (distanza if specchio else -distanza), 54)
    if specchio:
        t = t.scale(-1, 1)
    t = t.scale(altezza / lato, -altezza / lato)   # y in giu'
    t = t.rotate(math.radians(ANGOLO))
    return t.translate(-cx, -cy)


def cornetta(altezza, distanza, specchio):
    pen = SVGPathPen(gs, ntos=lambda v: f'{v:.2f}')
    gs[nome].draw(TransformPen(pen, trasformazione(altezza, distanza, specchio)))
    return pen.getCommands()


def limiti(altezza, distanza, specchio):
    bp2 = BoundsPen(gs)
    gs[nome].draw(TransformPen(bp2, trasformazione(altezza, distanza, specchio)))
    return bp2.bounds


def disegno(k):
    """Le tre linee del disegno, alla scala richiesta."""
    altezza, distanza = 46 * k, 21 * k
    sinistra = cornetta(altezza, distanza, False)
    destra = cornetta(altezza, distanza, True)
    ls = limiti(altezza, distanza, False)
    ld = limiti(altezza, distanza, True)

    # Il filo parte dal centro delle due coppe di sotto e viene disegnato
    # PRIMA delle cornette: cosi' sembra uscire da dietro, invece di
    # passare loro sopra.
    xa, xb = (ls[0] + ls[2]) / 2, (ld[0] + ld[2]) / 2
    y = max(ls[3], ld[3]) - 4 * k
    p = (xb - xa) / 4
    filo = (f'M{xa:.1f} {y:.1f} q {p/2:.1f} {9*k:.1f} {p:.1f} 0 '
            f't {p:.1f} 0 t {p:.1f} 0 t {p:.1f} 0')
    return sinistra, destra, filo, 4.4 * k


INTESTAZIONE = """<?xml version="1.0" encoding="UTF-8"?>
<!--
  {titolo}

  Generato da assets/genera-icona.py: non modificare a mano.
  La cornetta e' il glifo U+1F4DE del font Symbola (George Douros),
  raddrizzato in verticale e rispecchiato; il filo e' nostro.

  Griglia di 108: la misura con cui Android ragiona per le icone
  adattive.{nota}
-->
"""


def scrivi(percorso, titolo, nota, k, sfondo):
    sinistra, destra, filo, spessore = disegno(k)
    fondo = f'  <rect width="108" height="108" fill="{SFONDO}"/>\n' if sfondo else ''
    with open(percorso, 'w') as f:
        f.write(INTESTAZIONE.format(titolo=titolo, nota=nota))
        f.write('<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108" '
                'viewBox="0 0 108 108">\n')
        f.write(fondo)
        f.write(f'  <path d="{filo}" fill="none" stroke="{FILO}" '
                f'stroke-width="{spessore:.1f}" stroke-linecap="round"/>\n')
        f.write(f'  <path d="{sinistra}" fill="{CHIARO}"/>\n')
        f.write(f'  <path d="{destra}" fill="{CHIARO}"/>\n')
        f.write('</svg>\n')
    print(f'scritto {os.path.basename(percorso)}')


scrivi(
    os.path.join(QUI, 'icona.svg'),
    "L'icona di Duetto: due cornette una di fronte all'altra, unite dal filo.",
    ' Questa versione ha il fondo e riempie il quadrato:\n'
    '  serve per i telefoni prima di Android 8, che non hanno le icone adattive.',
    1.0, True)

# L'icona adattiva viene ritagliata da una maschera che ogni produttore
# fa di forma diversa: si puo' contare solo sul cerchio centrale, di 66
# su 108. Da qui il disegno piu' piccolo, e senza fondo (quello lo mette
# Android, come strato a parte).
scrivi(
    os.path.join(QUI, 'icona-primo-piano.svg'),
    "Il primo piano dell'icona adattiva: le due cornette e il filo.",
    ' Il disegno sta nel cerchio centrale di 66,\n'
    '  perche' " fuori di li' la maschera del telefono taglia.",
    0.76, False)
