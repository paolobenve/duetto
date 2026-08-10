/**
 * Entry point dell'app. Il polyfill di crypto DEVE essere importato
 * per primo, prima di qualunque uso di tweetnacl.
 */
import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
