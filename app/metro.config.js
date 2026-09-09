const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

// Uniwind defaults `rem` to 16, which is what Tailwind's scale assumes, so no
// `polyfills.rem` override is needed here (NativeWind defaulted to 14 and had to be
// pinned back to 16).

// Keep zod's bundled locales out of the web bundle. zod's v4 entrypoints each do
// `export * as locales from "../locales/index.js"`, and Metro does not tree-shake
// namespace re-exports, so every locale shipped in the __common chunk. The app only
// uses the built-in English messages (nothing calls `z.config(z.locales.*)`).
// Delete this block if a locale is ever actually used.
const defaultResolveRequest = config.resolver.resolveRequest;
const zodV4Dir = /[/\\]node_modules[/\\]zod[/\\]v4[/\\]/;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web' &&
    moduleName === '../locales/index.js' &&
    zodV4Dir.test(context.originModulePath)
  ) {
    // Metro's built-in empty-module resolution, so this needs no stub file on disk.
    return { type: 'empty' };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
