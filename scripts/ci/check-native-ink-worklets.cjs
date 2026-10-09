const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const assert = require('node:assert/strict');
const uiRequire = createRequire(path.resolve(__dirname, '../../packages/ui-react-native/package.json'));
const babelRequire = createRequire(uiRequire.resolve('react-native-reanimated/package.json'));
const babel = babelRequire('@babel/core');
const plugin = uiRequire.resolve('react-native-reanimated/plugin');
const packageDir = process.argv[2] || path.resolve(__dirname, '../../packages/ui-react-native');

// Test the actual bundled names, including esbuild aliases such as
// useAnimatedStyle2. Source tests and mocks cannot prove worklet serialization.
for (const format of ['js', 'mjs']) {
  const filename = path.join(packageDir, `dist/index.${format}`);
  const result = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, plugins: [plugin], babelrc: false, configFile: false, ast: true,
  });
  const found = new Set();
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && ['settingsMotion', 'doneMotion', 'dockMotion'].includes(node.id?.name)) {
      assert(JSON.stringify(node.init).includes('__workletHash'), `${format}: ${node.id.name} was not transformed into a worklet`);
      found.add(node.id.name);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(result.ast);
  assert.equal(found.size, 3, `${format}: missing native ink style callbacks`);
  console.log(`${format}: 3 native ink styles serialized as worklets`);
}
