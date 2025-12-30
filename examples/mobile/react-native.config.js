const path = require('path');

module.exports = {
  dependencies: {
    '@papyrus-sdk/engine-native': {
      root: path.resolve(__dirname, '../../packages/engine-native'),
    },
    'react-native-webview': {
      root: path.resolve(__dirname, '../../node_modules/react-native-webview'),
    },
  },
};
