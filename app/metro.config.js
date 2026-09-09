const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

// Uniwind defaults `rem` to 16, which is what Tailwind's scale assumes, so no
// `polyfills.rem` override is needed here (NativeWind defaulted to 14 and had to be
// pinned back to 16).
// NOTE: see zod-locales-stub.js — keeps zod's bundled locales out of the web bundle.
const zodLocalesStub = require.resolve('./zod-locales-stub.js');
const defaultResolveRequest = config.resolver.resolveRequest;
const zodV4Dir = /[/\\]node_modules[/\\]zod[/\\]v4[/\\]/;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web' &&
    moduleName === '../locales/index.js' &&
    zodV4Dir.test(context.originModulePath)
  ) {
    return { type: 'sourceFile', filePath: zodLocalesStub };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
