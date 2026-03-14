import React from "react";
import { registerRootComponent } from "expo";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import App from "./App";

registerRootComponent(() => (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <App />
  </GestureHandlerRootView>
));
