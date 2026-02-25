/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

globalThis.__PAPYRUS_MOBILE_PERF__ = {
  enabled: true,
  sampleMemory: true,
};

AppRegistry.registerComponent(appName, () => App);
