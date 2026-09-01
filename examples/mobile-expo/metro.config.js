const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
const { assetExts } = config.resolver;

config.resolver.assetExts = [...assetExts, 'pdf', 'epub', 'html'];

// This workspace also contains an RN 0.81 example. Keep this Expo 52/RN 0.76
// app pinned to its own dependency graph while still resolving workspace SDKs.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
