/**
 * @format
 */

import 'react-native-gesture-handler';
import React from 'react';
import {AppRegistry} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import App from './App';
import {name as appName} from './app.json';

globalThis.__PAPYRUS_MOBILE_PERF__ = {
  enabled: true,
  sampleMemory: true,
};

AppRegistry.registerComponent(appName, () => () => (
  <GestureHandlerRootView style={{flex: 1}}>
    <App />
  </GestureHandlerRootView>
));
