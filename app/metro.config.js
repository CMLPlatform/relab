const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
// react-native-css inlines `rem` at 14 on native by default; Tailwind's scale assumes 16.
// Pin it to 16 so native spacing/radius matches web and the original px values.
module.exports = withNativewind(config, { inlineRem: 16 });
