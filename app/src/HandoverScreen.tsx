/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, BackHandler,
  useWindowDimensions,
} from 'react-native';
import { Journal, Visibility } from 'duetto-platform';
import QrCode from './QrCode';
import { t } from './i18n';
import { displayServer, type DuoConfig } from './config';
import { openDoorLine } from './door';
import { deviceKey, deviceName } from './device';
import {
  Giving, Taking, finishMoving, formatFigures, keepIncoming, dropIncoming, incomingReady,
  type GiveView, type TakeView, type HandoverQr, type Moving,
} from './handover';

/**
 * Changing phone, as the person sees it.
 *
 * On the old phone: what moves and what does not, the code, the six
 * figures to compare, the place moving server by server, and at the
 * end a phone with nothing left on it. On the new one: the same
 * figures, and the wait. What the two phones say to each other is in
 * handover.ts; here are the words on the screen, and the few things
 * the app does around them - going quiet, waking up, emptying itself -
 * asked of it through the props.
 *
 * The old phone's screen stays out of screenshots and of the picture
 * in the recent apps while it is open: the code is a key for five
 * minutes, and a picture of it would be the key handed on.
 */

type GiveProps = {
  mode: 'give';
  /** the configuration as it is now */
  cfg: () => DuoConfig;
  /** what is left to move, after a stop half way or a restart: the screen starts from there */
  left?: Moving | null;
  /** the phone's connections closed, before what there is goes across */
  quiet: () => Promise<void>;
  /** and open again: stopped before anything moved */
  wake: () => void;
  /** where the place has got to, written down */
  moving: (m: Moving) => Promise<void>;
  /** all moved: the phone empties itself */
  emptied: () => Promise<void>;
  /** `done`: the phone is empty now, and the first screen is next */
  onClose: (done: boolean) => void;
};

type TakeProps = {
  mode: 'take';
  qr: HandoverQr;
  /** what came, in use from now: the place is here */
  onTaken: (cfg: DuoConfig) => void;
  onClose: () => void;
};

export type HandoverProps = GiveProps | TakeProps;

export default function HandoverScreen(props: HandoverProps) {
  return props.mode === 'give' ? <Give {...props} /> : <Take {...props} />;
}

// --- words ---------------------------------------------------------------------

const WHY: Record<string, string> = {
  unreachable: 'whyUnreachable',
  'server-old': 'whyServerOld',
  'in-settings': 'whyInSettings',
  'no-place': 'whyNoPlace',
  'has-place': 'whyHasPlace',
  taken: 'whyTaken',
  expired: 'whyExpired',
  // a meeting the server does not know: closed, run out, or a restart
  unknown: 'whyExpired',
  cancelled: 'whyCancelled',
  closed: 'whyClosed',
  mismatch: 'whyMismatch',
  timeout: 'whyTimeout',
  stopped: 'whyStopped',
};

/** The reason in the person's words, as a piece of a sentence. */
const whyWords = (why: string) => (WHY[why]
  ? t(`handover.${WHY[why]}`)
  : t('handover.whyOther', { code: why }));

/** And as a sentence of its own. */
function whySentence(why: string): string {
  const w = whyWords(why);
  return `${w.charAt(0).toUpperCase()}${w.slice(1)}.`;
}

/** What is left of the code: "4:07". */
function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const marker = (side: 'give' | 'take') => (word: string) => {
  Journal.mark(`handover:${side}:${word}`).catch(() => { /* noop */ });
};

// --- the old phone -------------------------------------------------------------

type GiveShown = { step: 'intro' } | GiveView;

function Give({ cfg, left, quiet, wake, moving, emptied, onClose }: GiveProps) {
  const [view, setView] = useState<GiveShown>(left
    ? { step: 'moving', server: left.servers[0] ?? cfg().serverUrl }
    : { step: 'intro' });
  const giving = useRef<Giving | null>(null);
  /** the connections were closed for the hand-over, and not opened again */
  const asleep = useRef(false);
  const [now, setNow] = useState(Date.now());
  const { width } = useWindowDimensions();
  const mark = useRef(marker('give')).current;

  useEffect(() => {
    Visibility.secure(true).catch(() => { /* noop */ });
    return () => { Visibility.secure(false).catch(() => { /* noop */ }); };
  }, []);

  const open = useCallback(
    (url: string) => openDoorLine(url, { name: cfg().displayName || undefined }),
    [cfg],
  );

  /**
   * What the conversation says, on the screen. Stopped before anything
   * moved, the phone is itself again at once; all moved, it empties
   * itself before saying so - "Duetto is empty on this one" has to be
   * true when it is read.
   */
  const shown = useCallback((v: GiveView) => {
    if (v.step === 'failed' && !v.late && asleep.current) {
      asleep.current = false;
      wake();
    }
    if (v.step === 'done') {
      emptied().catch(() => { /* the next start finds nothing left to move, and tries again */ })
        .finally(() => setView(v));
      return;
    }
    // The time left counted from now, not from when the screen opened.
    if (v.step === 'code') setNow(Date.now());
    setView(v);
  }, [wake, emptied]);

  const start = useCallback(async () => {
    giving.current?.cancel();
    setView({ step: 'checking' });
    const me = await deviceKey();
    const g = new Giving({
      cfg,
      myPub: me.pub,
      open,
      view: (v) => { if (giving.current === g) shown(v); },
      quiet: async () => {
        asleep.current = true;
        await quiet();
      },
      moving,
      mark,
    });
    giving.current = g;
    await g.start();
  }, [cfg, open, shown, quiet, moving, mark]);

  /** The place moved where it is still left: after a stop half way, or a restart. */
  const resume = useCallback(async () => {
    const m = cfg().handingOver ?? left;
    if (!m) return;
    giving.current = null;
    mark('resume');
    const ok = await finishMoving(m, { open, moving, view: shown, mark });
    if (ok) shown({ step: 'done' });
  }, [cfg, left, open, moving, shown, mark]);

  const resumed = useRef(false);
  useEffect(() => {
    if (!left || resumed.current) return;
    resumed.current = true;
    resume();
  }, [left, resume]);

  /** Stopped by the person: only as long as nothing has moved. */
  const cancel = useCallback(() => {
    const g = giving.current;
    if (g?.moved) return;
    g?.cancel();
    giving.current = null;
    mark('cancelled');
    if (asleep.current) {
      asleep.current = false;
      wake();
    }
    onClose(false);
  }, [wake, onClose, mark]);

  // Leaving the screen is stopping, as long as stopping is possible.
  useEffect(() => () => {
    const g = giving.current;
    if (g && !g.moved) g.cancel();
  }, []);

  useEffect(() => {
    if (view.step !== 'code') return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [view.step]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // While the place moves, and while moving it is what is left,
      // there is nowhere to go back to.
      if (view.step === 'moving' || (view.step === 'failed' && view.late)) return true;
      if (view.step === 'done') onClose(true);
      else cancel();
      return true;
    });
    return () => sub.remove();
  }, [view, cancel, onClose]);

  let body: React.ReactNode = null;
  switch (view.step) {
    case 'intro':
      body = (
        <>
          <Text style={styles.title}>{t('handover.button')}</Text>
          <Text style={styles.body}>{t('handover.giveBody', { scan: t('qr.scan') })}</Text>
          <View style={styles.box}>
            <Text style={styles.boxText}>{t('handover.moves', { n: cfg().pairs.length })}</Text>
            <Text style={[styles.boxText, styles.boxGap]}>{t('handover.stays')}</Text>
          </View>
          <Primary label={t('handover.showCode')} onPress={start} />
          <Secondary label={t('handover.cancel')} onPress={cancel} />
        </>
      );
      break;
    case 'checking':
      body = <Waiting title={t('handover.button')} text={t('handover.checking')} onCancel={cancel} />;
      break;
    case 'code':
      body = (
        <>
          <Text style={styles.title}>{t('handover.button')}</Text>
          <View style={styles.qr}>
            <QrCode text={view.qr} size={Math.min(width - 52, 320)} />
          </View>
          <Text style={styles.body}>{t('handover.codeHint', { left: clock(view.until - now) })}</Text>
          <Secondary label={t('handover.cancel')} onPress={cancel} />
        </>
      );
      break;
    case 'compare':
      body = (
        <>
          <Text style={styles.title}>{t('handover.compareTitle')}</Text>
          <Text style={styles.figures}>{formatFigures(view.figures)}</Text>
          {view.model ? <Text style={styles.model}>{t('handover.newPhone', { model: view.model })}</Text> : null}
          <Text style={styles.body}>{t('handover.compareGive')}</Text>
          <Primary label={t('handover.same')} onPress={() => { giving.current?.confirm(); }} />
          <Primary label={t('handover.different')} outline onPress={cancel} />
        </>
      );
      break;
    case 'sending':
      body = <Waiting title={t('handover.button')} text={t('handover.sending')} onCancel={cancel} />;
      break;
    case 'moving':
      body = (
        <Waiting
          title={t('handover.button')}
          text={t('handover.moving', { server: displayServer(view.server) })}
        />
      );
      break;
    case 'done':
      body = (
        <>
          <Text style={styles.big}>✓</Text>
          <Text style={styles.title}>{t('handover.givenTitle')}</Text>
          <Text style={styles.body}>{t('handover.givenBody')}</Text>
          <Primary label={t('handover.close')} onPress={() => onClose(true)} />
        </>
      );
      break;
    case 'failed':
      body = view.late ? (
        <>
          <Text style={styles.title}>{t('handover.failedTitle')}</Text>
          <Text style={styles.body}>
            {t('handover.lateBody', {
              server: displayServer(view.server || cfg().serverUrl),
              why: whyWords(view.why),
            })}
          </Text>
          <Primary label={t('handover.retry')} onPress={resume} />
        </>
      ) : (
        <>
          <Text style={styles.title}>
            {view.why === 'expired' ? t('handover.expired') : t('handover.failedTitle')}
          </Text>
          {view.why !== 'expired' ? <Text style={styles.body}>{whySentence(view.why)}</Text> : null}
          <Text style={styles.body}>{t('handover.nothingChanged')}</Text>
          <Primary label={view.why === 'expired' ? t('handover.again') : t('handover.retry')} onPress={start} />
          <Secondary label={t('handover.close')} onPress={cancel} />
        </>
      );
      break;
    default:
  }

  return <Screen>{body}</Screen>;
}

// --- the new phone -------------------------------------------------------------

function Take({ qr, onTaken, onClose }: TakeProps) {
  const [view, setView] = useState<TakeView>({ step: 'connecting' });
  const taking = useRef<Taking | null>(null);
  const open = useCallback((url: string) => openDoorLine(url, {}), []);

  useEffect(() => {
    let gone = false;
    (async () => {
      const me = await deviceKey();
      const model = await deviceName().catch(() => '');
      if (gone) return;
      const tk = new Taking({
        qr,
        myPub: me.pub,
        model,
        open,
        view: (v) => { if (!gone) setView(v); },
        keep: (cfg) => keepIncoming(cfg, qr.serverUrl),
        drop: dropIncoming,
        mark: marker('take'),
      });
      taking.current = tk;
      await tk.start();
    })();
    return () => {
      gone = true;
      taking.current?.cancel();
    };
  }, [qr, open]);

  /** Stopped by the person: only until what came is kept (see Taking.cancel). */
  const cancel = useCallback(() => {
    if (taking.current && !taking.current.cancel()) return;
    onClose();
  }, [onClose]);

  /** The old phone stopped half way, and may have finished since. */
  const lookAgain = useCallback(async () => {
    setView({ step: 'waiting' });
    const got = await incomingReady(open);
    setView(got ? { step: 'done', cfg: got.cfg } : { step: 'failed', why: 'stopped' });
  }, [open]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (view.step === 'connecting' || view.step === 'compare' || view.step === 'failed') cancel();
      return true;
    });
    return () => sub.remove();
  }, [view, cancel]);

  let body: React.ReactNode = null;
  switch (view.step) {
    case 'connecting':
      body = <Waiting title={t('handover.takeTitle')} text={t('handover.connecting')} onCancel={cancel} />;
      break;
    case 'compare':
      body = (
        <>
          <Text style={styles.title}>{t('handover.compareTitle')}</Text>
          <Text style={styles.figures}>{formatFigures(view.figures)}</Text>
          <Text style={styles.body}>{t('handover.compareTake')}</Text>
          <Secondary label={t('handover.cancel')} onPress={cancel} />
        </>
      );
      break;
    case 'receiving':
      body = <Waiting title={t('handover.takeTitle')} text={t('handover.receiving')} />;
      break;
    case 'waiting':
      body = <Waiting title={t('handover.takeTitle')} text={t('handover.waiting')} />;
      break;
    case 'done':
      body = (
        <>
          <Text style={styles.big}>✓</Text>
          <Text style={styles.title}>{t('handover.takenTitle')}</Text>
          <Text style={styles.body}>
            {t('handover.takenBody', {
              server: displayServer(view.cfg.serverUrl),
              n: view.cfg.pairs.length,
            })}
          </Text>
          <Primary label={t('welcome.next')} onPress={() => onTaken(view.cfg)} />
        </>
      );
      break;
    case 'failed':
      body = (
        <>
          <Text style={styles.title}>{t('handover.failedTitle')}</Text>
          <Text style={styles.body}>{whySentence(view.why)}</Text>
          {view.why === 'stopped'
            ? <Primary label={t('handover.checkAgain')} onPress={lookAgain} />
            : null}
          <Secondary label={t('handover.close')} onPress={onClose} />
        </>
      );
      break;
    default:
  }

  return <Screen>{body}</Screen>;
}

// --- pieces of interface ------------------------------------------------------

function Screen({ children }: { children?: React.ReactNode }) {
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.brand}>Duetto</Text>
      {children}
    </ScrollView>
  );
}

function Waiting({ title, text, onCancel }: { title: string; text: string; onCancel?: () => void }) {
  return (
    <>
      <Text style={styles.title}>{title}</Text>
      <ActivityIndicator style={styles.spinner} size="large" color="#2f7cf6" />
      <Text style={styles.body}>{text}</Text>
      {onCancel ? <Secondary label={t('handover.cancel')} onPress={onCancel} /> : null}
    </>
  );
}

function Primary(props: { label: string; onPress: () => void; outline?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.button, props.outline && styles.buttonOutline]}
      onPress={props.onPress}>
      <Text style={[styles.buttonText, props.outline && styles.buttonOutlineText]}>
        {props.label}
      </Text>
    </TouchableOpacity>
  );
}

function Secondary(props: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.link} onPress={props.onPress}>
      <Text style={styles.linkText}>{props.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0b0e14' },
  container: { padding: 26, paddingTop: 60, paddingBottom: 40, alignItems: 'center' },
  brand: { color: '#fff', fontSize: 34, fontWeight: '800', marginBottom: 22 },
  big: { color: '#5fd38d', fontSize: 56, marginBottom: 12 },
  title: { color: '#fff', fontSize: 25, fontWeight: '800', textAlign: 'center' },
  body: {
    color: '#8892a0', fontSize: 15, textAlign: 'center',
    marginTop: 12, marginBottom: 10, lineHeight: 22,
  },
  box: {
    width: '100%', marginTop: 14, padding: 14, borderRadius: 12,
    backgroundColor: '#121a27', borderColor: '#27405f', borderWidth: 1,
  },
  boxText: { color: '#aab4c2', fontSize: 14, lineHeight: 20 },
  boxGap: { marginTop: 10 },
  qr: { marginTop: 20, marginBottom: 6 },
  figures: {
    color: '#fff', fontSize: 46, fontWeight: '800', letterSpacing: 4, marginTop: 22,
    fontVariant: ['tabular-nums'],
  },
  model: { color: '#c9d2de', fontSize: 15, marginTop: 8 },
  spinner: { marginTop: 30, marginBottom: 6 },
  button: {
    backgroundColor: '#2f7cf6', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', width: '100%', marginTop: 16,
  },
  buttonOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#2f7cf6' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  buttonOutlineText: { color: '#7cc4ff' },
  link: { marginTop: 22, padding: 10 },
  linkText: { color: '#6b7686', fontSize: 15 },
});
