// DuoTalk - invio notifiche push tramite ntfy (self-hosted).
//
// Il server "suona" il topic dell'altra persona quando qualcuno entra
// nel canale o preme "Bussa". La notifica arriva sul telefono anche ad
// app DuoTalk chiusa, perche' a riceverla e' l'app ntfy.
//
// ATTENZIONE alla privacy: il testo della notifica passa dal server ntfy
// (che e' il tuo). Per questo il messaggio e' volutamente generico e non
// contiene nulla della conversazione: solo "c'e' qualcuno nel canale".

const NTFY_URL = (process.env.NTFY_URL || '').replace(/\/+$/, '');
const NTFY_TOKEN = process.env.NTFY_TOKEN || '';
const DEEP_LINK = process.env.DEEP_LINK || 'duotalk://channel';

export const ntfyEnabled = () => NTFY_URL.length > 0;

/**
 * Pubblica una notifica su un topic ntfy.
 * Non lancia mai: un push fallito non deve buttare giu' il signaling.
 *
 * @param {string} topic  topic da suonare (quello dell'altra persona)
 * @param {{title: string, message: string, priority?: number, tags?: string[]}} opts
 */
export async function ntfyPublish(topic, opts) {
  if (!ntfyEnabled() || !topic) return false;

  const body = {
    topic,
    title: opts.title,
    message: opts.message,
    priority: opts.priority ?? 4,
    tags: opts.tags ?? ['bell'],
    // Toccando la notifica si apre DuoTalk (deep link, vedi AndroidManifest)
    click: DEEP_LINK,
    actions: [{ action: 'view', label: 'Apri DuoTalk', url: DEEP_LINK }],
  };

  const headers = { 'content-type': 'application/json' };
  if (NTFY_TOKEN) headers.authorization = `Bearer ${NTFY_TOKEN}`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(NTFY_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[ntfy] pubblicazione fallita: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[ntfy] pubblicazione fallita: ${err?.message ?? err}`);
    return false;
  }
}
