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
 * No WebView in Duetto's process, so that its updates do not close it.
 *
 * React Native's WebSocket read WebView's cookies at every connection,
 * which loads WebView; Android then closes Duetto whenever the Play
 * Store updates WebView - about once a week, at night, in the channel.
 * Imported by index.js before anything else that could open a socket,
 * in the app and in the presence's task alike. See SocketsWithoutCookies.
 */
import { Journal, Network } from 'duetto-platform';

const how = Network.socketsWithoutCookies();
if (how !== 'ok') Journal.mark(`sockets:cookies-kept:${how}`).catch(() => { /* noop */ });
