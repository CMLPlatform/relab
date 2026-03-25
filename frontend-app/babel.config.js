module.exports = function (api) {
  const env = process.env.BABEL_ENV ?? process.env.NODE_ENV ?? 'development';
  api.cache.using(() => env);

  const isProduction = env === 'production';

  return {
    presets: ['babel-preset-expo'],
    // React Compiler is useful, but running it during every dev transform slows
    // Metro feedback noticeably on this app. Keep it for production bundles.
    plugins: isProduction ? [['babel-plugin-react-compiler', { target: '19' }]] : [],
  };
};
