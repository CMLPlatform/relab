// Jest has no CSS loader; NativeWind/react-native-css apply global.css via the
// Metro/Babel transform at build time, not in the Jest environment, so a plain
// import can be mapped to nothing here.
module.exports = {};
