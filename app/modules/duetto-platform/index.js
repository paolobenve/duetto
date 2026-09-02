/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const isAndroid = Platform.OS === 'android';
const NativeForeground = NativeModules.DuettoForeground;
const NativePip = NativeModules.DuettoPip;
const NativeVisibility = NativeModules.DuettoVisibility;
const NativeNetwork = NativeModules.DuettoNetwork;
const NativeHeartbeat = NativeModules.DuettoHeartbeat;
const NativeProximity = NativeModules.DuettoProximity;
const NativeLocale = NativeModules.DuettoLocale;
const NativeCodecs = NativeModules.DuettoCodecs;
const NativeAudio = NativeModules.DuettoAudio;
const NativeAlerts = NativeModules.DuettoAlerts;
const NativeJournal = NativeModules.DuettoJournal;
const NativeVolume = NativeModules.DuettoVolume;
const NativeAlarm = NativeModules.DuettoAlarm;

/**
 * Calls a native method only if it really exists.
 *
 * The JS side and the native side can drift apart: an APK built with an
 * earlier version of the module is enough. Without this protection, a
 * call to a missing method brings the whole app down with "undefined is
 * not a function", and far from where the real trouble is, at that.
 * Better to do nothing and give back false.
 */
function call(mod, name, ...args) {
  const fn = mod && mod[name];
  if (typeof fn !== 'function') {
    if (__DEV__) console.warn(`[duetto-platform] native method missing: ${name}`);
    return Promise.resolve(false);
  }
  try {
    return Promise.resolve(fn.apply(mod, args));
  } catch (e) {
    return Promise.resolve(false);
  }
}

const unavailable = () => Promise.resolve(false);

/**
 * Android's foreground service.
 *
 * Without this, putting the app in the background or turning the screen
 * off makes Android suspend the process: the connection would drop and
 * you would fall out of the channel. The "microphone" type is also the
 * only way Android 14+ allows the microphone to be used outside the
 * foreground.
 *
 * The price is the standing notification in the status bar: compulsory,
 * it is Android that imposes it in return.
 */
export const Foreground = isAndroid && NativeForeground
  ? {
      /** Starts the service. `withCamera` adds the camera type. */
      start: (text = 'Listening', withCamera = false) =>
        call(NativeForeground, 'start', String(text), !!withCamera),

      /**
       * To be called when the video goes on or off: on Android 14+, using
       * the camera outside the foreground requires the service to declare
       * the "camera" type as well.
       */
      setCameraActive: (active) =>
        call(NativeForeground, 'setCameraActive', !!active),

      /**
       * In the channel or merely waiting: the service holds the CPU
       * awake only for a conversation. See the service's own note.
       */
      setInChannel: (active) =>
        call(NativeForeground, 'setInChannel', !!active),

      /**
       * "Leave and become unavailable", written where a reboot cannot
       * erase it.
       */
      setAvailable: (v) => call(NativeForeground, 'setAvailable', !!v),

      /**
       * Whether the watchdog alarm has anything to watch over: false
       * while no pair is set up.
       */
      watchdogWanted: (v) => call(NativeForeground, 'watchdogWanted', !!v),

      /**
       * Updates the standing notification: the text, and the name of the
       * connection.
       *
       * The name goes in front of the text, in italics, and Android puts
       * it together: in the title it cannot be seen when the notification
       * is folded, and that is exactly where one needs to know which of
       * the connections one is in.
       */
      setText: (text, name) =>
        call(NativeForeground, 'setText', String(text), String(name || '')),

      /** Stops the service and releases the wake lock. */
      stop: () => call(NativeForeground, 'stop'),

      /** An alert to show when the app is not in the foreground. */
      notify: (name, text) =>
        call(NativeForeground, 'notify', String(name || ''), String(text)),

      /** News to be read at leisure: it does not sound and does not buzz. */
      note: (name, text) =>
        call(NativeForeground, 'note', String(name || ''), String(text)),

      /** Takes the news away, when what it said does not hold any more. */
      clearNote: () => call(NativeForeground, 'clearNote'),

      /**
       * Hands over to listening without an interface: it is called when
       * the interface is about to disappear without anybody having asked.
       */
      resumePresence: () => call(NativeForeground, 'resumePresence'),

      /** Takes the alert away, when one comes back into the app. */
      clearNotification: () => call(NativeForeground, 'clearNotification'),

      /** True if the app may stay active with no battery limits. */
      isBatteryUnrestricted: () => call(NativeForeground, 'isBatteryUnrestricted'),

      /** The system dialog for granting it: one tick and that is all. */
      requestBatteryUnrestricted: () =>
        call(NativeForeground, 'requestBatteryUnrestricted'),

      /**
       * When the app last started up by itself after a reboot (ms), 0 if
       * never.
       *
       * The auto-start permission cannot be read by any app: one can know
       * whether it worked, though, which is the thing that really
       * matters.
       */
      lastAutoStart: () => call(NativeForeground, 'lastAutoStart'),

      /** How long the phone has been on, to date the last reboot. */
      uptimeMs: () => call(NativeForeground, 'uptimeMs'),

      /** True if this phone has an auto-start screen. */
      hasAutoStartScreen: () => call(NativeForeground, 'hasAutoStartScreen'),

      /** Opens that screen: it cannot be granted from code. */
      openAutoStartSettings: () => call(NativeForeground, 'openAutoStartSettings'),

      /** Fallback: the app's page in the system settings. */
      openAppSettings: () => call(NativeForeground, 'openAppSettings'),
    }
  : {
      start: unavailable,
      setCameraActive: unavailable,
      setInChannel: unavailable,
      setAvailable: unavailable,
      watchdogWanted: unavailable,
      setText: unavailable,
      stop: unavailable,
      notify: unavailable,
      note: unavailable,
      clearNote: unavailable,
      resumePresence: unavailable,
      clearNotification: unavailable,
      isBatteryUnrestricted: unavailable,
      requestBatteryUnrestricted: unavailable,
      lastAutoStart: unavailable,
      uptimeMs: unavailable,
      hasAutoStartScreen: unavailable,
      openAutoStartSettings: unavailable,
      openAppSettings: unavailable,
    };

/**
 * The system's Picture-in-Picture: the little window that stays on top of
 * the other apps. Used by the Back key, so as not to leave the channel by
 * mistake.
 */
export const Pip = isAndroid && NativePip
  ? {
      /** True if the phone supports it (Android 8+ and the feature there). */
      isSupported: () => call(NativePip, 'isSupported'),

      /** Enters PiP with the given aspect ratio (width/height). */
      enter: (aspect = 9 / 16) =>
        call(NativePip, 'enter', Number(aspect) || 9 / 16),

      /**
       * Calls `cb(inPip)` when the little window begins or ends. The
       * activity is the only one told the truth: the window's measures,
       * as React Native reports them, may go on describing the full
       * screen. Gives back the function to stop.
       */
      subscribe(cb) {
        const emitter = new NativeEventEmitter(NativePip);
        const sub = emitter.addListener('duetto-pip', (v) => cb(!!v));
        return () => sub.remove();
      },
    }
  : { isSupported: unavailable, enter: unavailable, subscribe: () => () => {} };

/**
 * The app's window.
 *
 * "minimize" sends the app to the background like the Home key, without
 * closing it: the process stays alive and with it the connection that
 * keeps us reachable. Really closing it would cut the notifications off.
 */
export const AppWindow = isAndroid && NativePip
  ? { minimize: () => call(NativePip, 'minimize') }
  : { minimize: unavailable };

/**
 * What the video side of this phone can do.
 *
 * VP9 compresses better than VP8, but only when hardware does the
 * encoding: in software it costs more battery than the bandwidth it
 * saves. So it has to be asked of the phone, not guessed from the model.
 */
export const Codecs = isAndroid && NativeCodecs
  ? { hasHardwareVp9Encoder: () => call(NativeCodecs, 'hasHardwareVp9Encoder') }
  : { hasHardwareVp9Encoder: unavailable };

/**
 * The consumption journal.
 *
 * The lines are written by the foreground service, which is alive even
 * when JavaScript is not. From here we only say which state we are in,
 * read what there is to send to the other phone, and put aside what the
 * other one sends us.
 *
 * Mind what it does NOT hold: how much the other apps use. No app can
 * know that - Android keeps that account and shows it only in its own
 * "Battery" screen or through `adb shell dumpsys batterystats`.
 */
export const Journal = isAndroid && NativeJournal
  ? {
      /** "waiting" | "channel" | "channel+video": it ends up on every line. */
      state: (s) => call(NativeJournal, 'state', String(s)),
      /** A line right now, to mark a moment that counts. */
      mark: (why) => call(NativeJournal, 'mark', String(why)),
      /** the level really heard, in percent: it goes on the periodic line */
      level: (percent) => call(NativeJournal, 'level', Math.round(Number(percent) || 0)),
      /**
       * Whether to write the periodic line as well: it follows the
       * diagnostics switch. The lines written by events go on either
       * way.
       */
      sampling: (on) => call(NativeJournal, 'sampling', !!on),
      lines: () => call(NativeJournal, 'lines'),
      read: (fromLine) => call(NativeJournal, 'read', Number(fromLine) || 0),
      appendOther: (text, who) =>
        call(NativeJournal, 'appendOther', String(text), String(who || '')),
      path: () => call(NativeJournal, 'path'),
      /** How the app died last time; null if the phone does not know. */
      lastDeath: () => call(NativeJournal, 'lastDeath'),
    }
  : {
      state: unavailable,
      mark: unavailable,
      sampling: unavailable,
      level: unavailable,
      lines: () => Promise.resolve(0),
      read: () => Promise.resolve(''),
      appendOther: unavailable,
      path: () => Promise.resolve(''),
      lastDeath: () => Promise.resolve(null),
    };

/**
 * How the other person's alert has to make itself heard.
 *
 * From Android 8 on, sound and vibration are fixed when the notification
 * channel is born and cannot be changed any more: `configure` creates a
 * new one and throws the old away. It has to be called at start-up, not
 * only when one changes one's mind, because the channel may not exist
 * yet.
 */
export const Alerts = isAndroid && NativeAlerts
  ? {
      /**
       * @param vibration 'default' | 'always' | 'never'
       * @param sound     'default' | 'none' | 'chosen'
       * @param uri       address of the sound, only with 'chosen'
       */
      configure: (vibration, sound, uri = '') =>
        call(NativeAlerts, 'configure', String(vibration), String(sound), String(uri)),

      /**
       * Opens the system's sound picker.
       * Gives back `{uri, name}`, or null if it is cancelled.
       */
      pickSound: (currentUri = '') =>
        call(NativeAlerts, 'pickSound', String(currentUri)),
    }
  : { configure: unavailable, pickSound: () => Promise.resolve(null) };

/**
 * The volume keys.
 *
 * The conversation's sound comes out of the "call" volume, but the side
 * keys adjust whatever the system believes the active stream is: for an
 * ordinary app, media. On some phones - the Motorola Edge 50 Fusion among
 * them - pressing them therefore has no effect at all on the other voice,
 * which stays at the volume it had.
 */
export const Audio = isAndroid && NativeAudio
  ? {
      /** `true` on entering the channel, `false` on leaving it. */
      useCallVolumeKeys: (active) =>
        call(NativeAudio, 'useCallVolumeKeys', !!active),
    }
  : { useCallVolumeKeys: unavailable };

/**
 * The language the phone is set to, as a two-letter code.
 *
 * It arrives ready at start-up, without waiting for an answer: the first
 * screen has to be writable straight away. See LocaleModule.
 */
export const Locale = isAndroid && NativeLocale
  ? {
      language: String(NativeLocale.language || 'en').toLowerCase(),
      current: () => call(NativeLocale, 'current'),
    }
  : { language: 'en', current: () => Promise.resolve('en') };

/**
 * When something covers the screen: a pocket, a closed case.
 *
 * It is there so that the touches reaching the glass of a phone in a
 * pocket are not taken for choices. See ProximityModule.
 */
export const Proximity = isAndroid && NativeProximity
  ? {
      /** How it is now. */
      get: () => call(NativeProximity, 'covered'),

      /**
       * Calls `cb(covered)` at every change, and starts listening.
       * Gives back the function to stop.
       */
      subscribe(cb) {
        call(NativeProximity, 'start');
        const emitter = new NativeEventEmitter(NativeProximity);
        const sub = emitter.addListener('duetto-proximity', (v) => cb(!!v));
        return () => {
          sub.remove();
          call(NativeProximity, 'stop');
        };
      },
    }
  : { get: () => Promise.resolve(false), subscribe: () => () => {} };

/**
 * The heartbeat that arrives with the screen off too.
 *
 * JavaScript's timers, in React Native, follow the rhythm of the screen's
 * frames: with the screen off they never fire. This one is born of a
 * native Handler and is an event, and events the JavaScript engine
 * receives anyway. See HeartbeatModule.
 */
export const Heartbeat = isAndroid && NativeHeartbeat
  ? {
      /**
       * Close together while we are without a server (a beat every
       * fifteen seconds), far apart when the connection is there.
       */
      fast: (quick) => call(NativeHeartbeat, 'fast', !!quick),

      /** Calls `cb()` at every beat. Gives back the function to stop. */
      subscribe(cb) {
        call(NativeHeartbeat, 'start');
        const emitter = new NativeEventEmitter(NativeHeartbeat);
        const sub = emitter.addListener('duetto-heartbeat', () => cb());
        return () => {
          sub.remove();
          call(NativeHeartbeat, 'stop');
        };
      },
    }
  : { subscribe: () => () => {}, fast: unavailable };

/**
 * The phone's changes of network: cell, wifi, new address.
 *
 * It is there to rebuild the connection as soon as there is a new
 * network, instead of waiting for somebody to trip over the dead socket.
 * See NetworkModule.
 */
export const Network = isAndroid && NativeNetwork
  ? {
      /**
       * Calls `cb(what)` at every change: "arrived", "lost", "address",
       * "valid". Gives back the function to stop.
       */
      subscribe(cb) {
        call(NativeNetwork, 'start');
        const emitter = new NativeEventEmitter(NativeNetwork);
        const sub = emitter.addListener('duetto-network', (v) => cb(String(v || '')));
        return () => sub.remove();
      },

      /**
       * Tells Android that on this network the traffic does not get
       * through, and to check it now. See NetworkModule.
       */
      reportNotCarrying: () => call(NativeNetwork, 'reportNotCarrying'),

      /**
       * The emergency lane: mobile data switched on and every socket
       * bound to it, deaf wifi or not. Costs radio - whoever opens it
       * closes it. See NetworkModule.
       */
      requestMobile: () => call(NativeNetwork, 'requestMobile'),
      releaseMobile: () => call(NativeNetwork, 'releaseMobile'),

      /**
       * One question through the mobile radio alone, with nothing
       * bound to it: is this host reachable over there? It tells a
       * deaf wifi from a server that is down for everybody - from the
       * wifi's side the two are the same silence. See NetworkModule.
       */
      probeViaMobile: (host, port, timeoutMs) =>
        call(NativeNetwork, 'probeViaMobile', String(host), Number(port), Number(timeoutMs)),
    }
  : {
      subscribe: () => () => {},
      reportNotCarrying: unavailable,
      requestMobile: unavailable,
      releaseMobile: unavailable,
      probeViaMobile: unavailable,
    };

/**
 * Whether the app is really showing anything on the screen.
 *
 * Different from React Native's AppState, which on Android reports the
 * activity's pause: in Picture-in-Picture the activity is paused but the
 * little window is perfectly visible. What counts here is onStart/onStop,
 * which in PiP do not fire.
 */
export const Visibility = isAndroid && NativeVisibility
  ? {
      /** True if the app is visible right now. */
      get: () => call(NativeVisibility, 'isVisible'),

      /**
       * Calls `cb(visible)` at every change. Gives back the function to
       * stop.
       */
      subscribe(cb) {
        call(NativeVisibility, 'start');
        const emitter = new NativeEventEmitter(NativeVisibility);
        const sub = emitter.addListener('duetto-visibility', (v) => cb(!!v));
        return () => sub.remove();
      },
    }
  : { get: unavailable, subscribe: () => () => {} };


/**
 * The volume keys, while one is in the channel.
 *
 * The app takes them in hand and passes them to the system; the event
 * arrives here only when the system did NOT move, because the call volume
 * is at its limit - which on a good many phones, on speaker, is the
 * normal state of things. In that case it is up to the app to raise the
 * other voice on its own account.
 */
export const Volume = isAndroid && NativeVolume
  ? {
      /** In the channel yes, outside no: outside the keys are the system's. */
      takeKeys: (active) => call(NativeVolume, 'takeKeys', !!active),

      /**
       * Calls `cb(+1 | -1)` when the system volume does not move.
       * Gives back the function to stop listening.
       */
      subscribe(cb) {
        const emitter = new NativeEventEmitter(NativeVolume);
        const sub = emitter.addListener('duetto-volume', (d) => cb(Number(d) || 0));
        return () => sub.remove();
      },

      /**
       * The phone's call volume: `{ volume, max }`.
       *
       * It is half of what one hears - the other half is Duetto's gain -
       * and it is the half Android remembers separately for every output
       * and which moves from outside as well.
       */
      read: () => call(NativeVolume, 'read'),

      /** Puts it at an exact value, with no sounds and no system bar. */
      set: (value) => call(NativeVolume, 'set', Math.round(Number(value) || 0)),

      /**
       * Calls `cb(value)` when the call volume changes, by another app's
       * hand as well.
       */
      listenToSystem(cb) {
        call(NativeVolume, 'listenToSystem');
        const emitter = new NativeEventEmitter(NativeVolume);
        const sub = emitter.addListener('duetto-volume-system', (v) => cb(Number(v)));
        return () => sub.remove();
      },
    }
  : {
      takeKeys: unavailable,
      subscribe: () => () => {},
      read: () => Promise.resolve({ volume: 0, max: 0 }),
      set: unavailable,
      listenToSystem: () => () => {},
    };


/**
 * The sounds for calling the other back when they are in the channel but
 * do not answer.
 *
 * They come out of the alarm volume, not the conversation one: see
 * Alarm.kt.
 */
export const Alarm = isAndroid && NativeAlarm
  ? {
      play: (name, echo, maxMs) =>
        call(NativeAlarm, 'play', String(name), !!echo, Number(maxMs) || 0),
      stop: () => call(NativeAlarm, 'stop'),
      list: () => call(NativeAlarm, 'list'),
    }
  : { play: unavailable, stop: unavailable, list: () => Promise.resolve([]) };
