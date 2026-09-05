const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

// Uniwind defaults `rem` to 16, which is what Tailwind's scale assumes, so no
// `polyfills.rem` override is needed here (NativeWind defaulted to 14 and had to be
// pinned back to 16).
module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
