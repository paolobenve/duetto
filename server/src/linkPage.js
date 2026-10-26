/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */

/**
 * The page behind a link that is handed to people.
 *
 * A pairing code or an invitation goes out as https://host/duetto/p/...
 * or /duetto/i/..., because a messaging app makes an https address a
 * link and a custom scheme plain text - mail cut "duetto://" off and
 * offered the server's name instead. This page is what that link
 * opens: on a phone with Duetto it goes straight into the app, through
 * an intent:// that Chrome resolves and a duetto:// link for the rest;
 * with no app it says where to get one and what to type by hand. The
 * host is the one the request came to: nothing of the server's own
 * name lives here.
 *
 * Whoever opens a pairing code is usually the other person, the one
 * who asked for nothing, and often has no Duetto yet. A fresh phone
 * found the page in English, whatever its language; a big "Open in
 * Duetto" that did nothing at all without the app; and F-Droid, which
 * is another app to install before this one. So the page speaks the
 * browser's language, among the app's own; the button goes through
 * the same intent:// as the page, and without the app comes back here
 * saying so (stay=1); and that page puts first the APK of the latest
 * release, one download, with F-Droid beside it - the light one, which
 * Play Protect lets in from a browser (see releases.js). No button to
 * open Duetto there, where there is none: the download copies the link
 * instead, for the app to find at its first start - Android opens an
 * app just installed knowing nothing of the link that led to it.
 */

const WORDS = {
  en: {
    leadPair: 'This is a pairing code for Duetto, the voice and video channel for two.',
    leadInvite: 'This is an invitation for Duetto, the voice and video channel for two.',
    open: 'Open in Duetto',
    notOpened: 'If Duetto did not open by itself, touch the button.',
    missing: 'Duetto is not on this phone yet. Install it first:',
    download: 'Download Duetto {v}',
    orFdroid: 'or get it from {f}.',
    fdroidOnly: 'Get Duetto from F-Droid',
    allow: 'Android will ask you to let the browser install apps: say yes, it is only for this one.',
    byHandPair: 'Or open Duetto and, in the first screen, write this server and the code:',
    byHandInvite: 'Or open Duetto and, in the first screen, write this server and this invitation:',
    copiedPair: 'Downloading also copies the code: when you open Duetto once it is installed, it finds it by itself.',
    copiedInvite: 'Downloading also copies the invitation: when you open Duetto once it is installed, it finds it by itself.',
  },
  it: {
    leadPair: 'Questo è un codice per collegarsi con Duetto, il canale di voce e video per due.',
    leadInvite: 'Questo è un invito per Duetto, il canale di voce e video per due.',
    open: 'Apri in Duetto',
    notOpened: 'Se Duetto non si è aperto da solo, tocca il pulsante.',
    missing: 'Duetto non è ancora su questo telefono. Prima installalo:',
    download: 'Scarica Duetto {v}',
    orFdroid: 'oppure prendilo da {f}.',
    fdroidOnly: 'Prendi Duetto da F-Droid',
    allow: 'Android ti chiederà di permettere al browser di installare app: rispondi sì, serve solo per questa.',
    byHandPair: 'Oppure apri Duetto e, nella prima schermata, scrivi questo server e il codice:',
    byHandInvite: 'Oppure apri Duetto e, nella prima schermata, scrivi questo server e questo invito:',
    copiedPair: 'Scaricando, il codice viene copiato: quando apri Duetto dopo averlo installato, lo trova da solo.',
    copiedInvite: 'Scaricando, l’invito viene copiato: quando apri Duetto dopo averlo installato, lo trova da solo.',
  },
  es: {
    leadPair: 'Este es un código para conectarse con Duetto, el canal de voz y vídeo para dos.',
    leadInvite: 'Esta es una invitación para Duetto, el canal de voz y vídeo para dos.',
    open: 'Abrir en Duetto',
    notOpened: 'Si Duetto no se abrió solo, toca el botón.',
    missing: 'Duetto todavía no está en este teléfono. Primero instálalo:',
    download: 'Descargar Duetto {v}',
    orFdroid: 'o consíguelo en {f}.',
    fdroidOnly: 'Consigue Duetto en F-Droid',
    allow: 'Android te pedirá que permitas al navegador instalar apps: di que sí, es solo para esta.',
    byHandPair: 'O abre Duetto y, en la primera pantalla, escribe este servidor y el código:',
    byHandInvite: 'O abre Duetto y, en la primera pantalla, escribe este servidor y esta invitación:',
    copiedPair: 'Al descargar, se copia el código: cuando abras Duetto ya instalado, lo encontrará solo.',
    copiedInvite: 'Al descargar, se copia la invitación: cuando abras Duetto ya instalado, la encontrará solo.',
  },
  pt: {
    leadPair: 'Este é um código para se ligar com o Duetto, o canal de voz e vídeo para dois.',
    leadInvite: 'Este é um convite para o Duetto, o canal de voz e vídeo para dois.',
    open: 'Abrir no Duetto',
    notOpened: 'Se o Duetto não abriu sozinho, toque no botão.',
    missing: 'O Duetto ainda não está neste telefone. Primeiro instale:',
    download: 'Baixar o Duetto {v}',
    orFdroid: 'ou pegue no {f}.',
    fdroidOnly: 'Pegue o Duetto no F-Droid',
    allow: 'O Android vai pedir para você permitir que o navegador instale apps: diga sim, é só para este.',
    byHandPair: 'Ou abra o Duetto e, na primeira tela, escreva este servidor e o código:',
    byHandInvite: 'Ou abra o Duetto e, na primeira tela, escreva este servidor e este convite:',
    copiedPair: 'Ao baixar, o código é copiado: quando você abrir o Duetto já instalado, ele o encontra sozinho.',
    copiedInvite: 'Ao baixar, o convite é copiado: quando você abrir o Duetto já instalado, ele o encontra sozinho.',
  },
  fr: {
    leadPair: 'Ceci est un code pour se relier avec Duetto, le canal de voix et de vidéo pour deux.',
    leadInvite: 'Ceci est une invitation pour Duetto, le canal de voix et de vidéo pour deux.',
    open: 'Ouvrir dans Duetto',
    notOpened: 'Si Duetto ne s’est pas ouvert tout seul, touche le bouton.',
    missing: 'Duetto n’est pas encore sur ce téléphone. Installe-le d’abord :',
    download: 'Télécharger Duetto {v}',
    orFdroid: 'ou prends-le sur {f}.',
    fdroidOnly: 'Prends Duetto sur F-Droid',
    allow: 'Android te demandera d’autoriser le navigateur à installer des applis : réponds oui, c’est seulement pour celle-ci.',
    byHandPair: 'Ou ouvre Duetto et, sur le premier écran, écris ce serveur et le code :',
    byHandInvite: 'Ou ouvre Duetto et, sur le premier écran, écris ce serveur et cette invitation :',
    copiedPair: 'En téléchargeant, le code est copié : quand tu ouvriras Duetto une fois installé, il le trouvera tout seul.',
    copiedInvite: 'En téléchargeant, l’invitation est copiée : quand tu ouvriras Duetto une fois installé, il la trouvera tout seul.',
  },
  de: {
    leadPair: 'Das ist ein Code, um sich mit Duetto zu verbinden, dem Sprach- und Videokanal für zwei.',
    leadInvite: 'Das ist eine Einladung für Duetto, den Sprach- und Videokanal für zwei.',
    open: 'In Duetto öffnen',
    notOpened: 'Wenn sich Duetto nicht von selbst geöffnet hat, tippe auf den Knopf.',
    missing: 'Duetto ist noch nicht auf diesem Telefon. Installiere es zuerst:',
    download: 'Duetto {v} herunterladen',
    orFdroid: 'oder hol es dir bei {f}.',
    fdroidOnly: 'Hol dir Duetto bei F-Droid',
    allow: 'Android fragt dich, ob der Browser Apps installieren darf: sag ja, es ist nur für diese.',
    byHandPair: 'Oder öffne Duetto und schreib im ersten Bildschirm diesen Server und den Code:',
    byHandInvite: 'Oder öffne Duetto und schreib im ersten Bildschirm diesen Server und diese Einladung:',
    copiedPair: 'Beim Herunterladen wird der Code kopiert: Wenn du Duetto nach der Installation öffnest, findet es ihn von selbst.',
    copiedInvite: 'Beim Herunterladen wird die Einladung kopiert: Wenn du Duetto nach der Installation öffnest, findet es sie von selbst.',
  },
};

const FDROID = 'https://f-droid.org/packages/com.duetto/';

/** The first of the browser's languages the page speaks, else English. */
function languageOf(req) {
  const asked = String(req.headers['accept-language'] || '')
    .split(',')
    .map((part) => part.trim().split(';')[0].slice(0, 2).toLowerCase());
  return asked.find((l) => WORDS[l]) || 'en';
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/**
 * The page for this request, or null when the address is not a link of
 * ours. `latest` is the latest release (see releases.js), or null.
 */
export function bouncePage(req, latest) {
  const m = String(req.url || '').match(/\/duetto\/(p|i)\/([A-Za-z0-9-]{4,12})(?:\/([A-Za-z0-9_-]{43}))?\/?(?:[?#].*)?$/);
  if (!m) return null;
  const kind = m[1] === 'p' ? 'pair' : 'invite';
  const code = m[2];
  const key = m[3] || '';
  const host = String(req.headers.host || '').replace(/[^A-Za-z0-9.:\-\[\]]/g, '');
  if (!host) return null;
  const path = `${host}/${kind}/${code}${key ? `/${key}` : ''}`;
  const app = `duetto://${path}`;
  const bare = `https://${host}${String(req.url).replace(/[?#].*$/, '')}`;
  const intent = `intent://${path}#Intent;scheme=duetto;package=com.duetto;`
    + `S.browser_fallback_url=${encodeURIComponent(`${bare}?stay=1`)};end`;
  const shown = kind === 'pair' ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
  const stay = /[?&]stay=1/.test(String(req.url));
  const lang = languageOf(req);
  const w = WORDS[lang];
  // On Android the button is the intent too: without the app it comes
  // back here, to the page that says so, instead of doing nothing.
  const android = /Android/.test(String(req.headers['user-agent'] || ''));
  const opener = android ? intent : app;
  const byHand = `<p>${esc(kind === 'pair' ? w.byHandPair : w.byHandInvite)}</p>
<p><code>${esc(host)}</code><br><code>${esc(shown)}</code></p>`;
  const fdroid = `<a class="get" href="${FDROID}">F-Droid</a>`;
  const body = stay
    ? `<p><strong>${esc(w.missing)}</strong></p>
${latest?.apk
    ? `<a class="b get" href="${esc(latest.apk)}">${esc(w.download.replace('{v}', latest.version))}</a>
<p>${esc(w.orFdroid).replace('{f}', fdroid)}</p>
<p><small>${esc(w.allow)}</small></p>`
    : `<a class="b get" href="${FDROID}">${esc(w.fdroidOnly)}</a>`}
<p><small>${esc(kind === 'pair' ? w.copiedPair : w.copiedInvite)}</small></p>
${byHand}
<script>
// The link goes with the download, in the clipboard: Android opens
// the app just installed knowing nothing of the link that led to it,
// and Duetto, at its first start, looks there (see WelcomeScreen).
function keep() {
  var link = ${JSON.stringify(bare)};
  function old() {
    var t = document.createElement('textarea');
    t.value = link; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch (e) { /* typed by hand, then */ }
    document.body.removeChild(t);
  }
  try { navigator.clipboard.writeText(link).catch(old); } catch (e) { old(); }
}
document.querySelectorAll('a.get').forEach(function (a) { a.addEventListener('click', keep); });
</script>`
    : `<a class="b" href="${esc(opener)}">${esc(w.open)}</a>
<small>${esc(w.notOpened)}</small>
${byHand}`;
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Duetto</title>
<style>
body{margin:0;background:#0b0e14;color:#e6ebf1;font:17px/1.5 system-ui,sans-serif}
main{max-width:30rem;margin:0 auto;padding:2.5rem 1.5rem}
h1{font-size:2rem;margin:0 0 .5rem}p{color:#c9d1dc}a{color:#6ab0ff}
a.b{display:block;text-align:center;background:#2f7cf6;color:#fff;text-decoration:none;
padding:1rem;border-radius:1rem;font-weight:700;margin:1.5rem 0}
code{font-size:1.4rem;letter-spacing:.1em;color:#fff}small{color:#8892a0}
</style></head><body><main>
<h1>Duetto</h1>
<p>${esc(kind === 'pair' ? w.leadPair : w.leadInvite)}</p>
${body}
</main>
${stay ? '' : `<script>
// Handed to the app after the page is on the screen, and by assigning
// the location rather than replacing it, which keeps this tab as it is.
// An intent:// names the package and falls back to this page (stay=1)
// when the app is not there; Android's browsers take it, Firefox
// included. Off Android there is nothing to open: the page stays,
// with the code. And whoever's browser does not jump has the button.
if (/Android/.test(navigator.userAgent)) {
  setTimeout(function () { window.location.href = ${JSON.stringify(intent)}; }, 150);
}
</script>`}
</body></html>
`;
}
