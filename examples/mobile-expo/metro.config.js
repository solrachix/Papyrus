const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
const { assetExts } = config.resolver;

config.resolver.assetExts = [...assetExts, 'pdf', 'epub', 'html'];

// Expo 52 requires a small public surface for its config/preset packages. The
// remaining dependencies stay isolated and are resolved through pnpm's virtual
// store, which keeps the RN 0.76 example independent from the RN 0.81 example.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules/.pnpm/node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
