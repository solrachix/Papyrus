const path = require('path');

module.exports = {
  dependencies: {
    '@papyrus/engine-native': {
      root: path.resolve(__dirname, '../../packages/engine-native'),
    },
  },
};
