/**
 * Entry point dell'app. Il polyfill di crypto DEVE essere importato
 * per primo, prima di qualunque uso di tweetnacl.
 */
import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';
import { presenceTask } from './src/presence';

AppRegistry.registerComponent(appName, () => App);

// Compito senza interfaccia: lo avvia il servizio nativo dopo il riavvio
// del telefono, per rimettere in piedi la presenza senza aprire l'app.
AppRegistry.registerHeadlessTask('duotalk-presence', () => presenceTask);
