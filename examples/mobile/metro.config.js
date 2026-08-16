const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const defaultConfig = getDefaultConfig(__dirname);
const {assetExts} = defaultConfig.resolver;

const escapePath = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blockList = [
  /.*\/android\/\.cxx\/.*/,
  /.*\/android\/build\/.*/,
  /.*\/android\/app\/build\/.*/,
  new RegExp(
    `${escapePath(
      path.resolve(workspaceRoot, 'packages/engine-native/android/.cxx'),
    )}/.*`,
  ),
  new RegExp(
    `${escapePath(
      path.resolve(workspaceRoot, 'packages/engine-native/android/build'),
    )}/.*`,
  ),
];

const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    blockList,
    assetExts: [...assetExts, 'pdf', 'epub', 'html', 'wasm', 'txt'],
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    disableHierarchicalLookup: true,
  },
};

module.exports = mergeConfig(defaultConfig, config);
