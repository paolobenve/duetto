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
 * The app's entry point. The crypto polyfill MUST be imported first,
 * before any use of tweetnacl.
 */
import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';
import { presenceTask } from './src/presence';

AppRegistry.registerComponent(appName, () => App);

// The task with no interface: the native service starts it after the
// phone reboots, to put presence back on its feet without opening the app.
AppRegistry.registerHeadlessTask('duetto-presence', () => presenceTask);
