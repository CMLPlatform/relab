module.exports = (api) => {
  // Respect explicit Babel/NODE envs, then BUILD_MODE (used by our Docker builds),
  // otherwise default to development.
  const env =
    process.env.BABEL_ENV ?? process.env.NODE_ENV ?? process.env.BUILD_MODE ?? 'development';
  api.cache.using(() => env);

  // Treat staging as production-like for build optimizations.
  const isProduction = env === 'production' || env === 'staging';

  return {
    presets: ['babel-preset-expo'],
    // React Compiler is useful, but running it during every dev transform slows
    // Metro feedback noticeably on this app. Keep it for production bundles.
    plugins: isProduction ? [['babel-plugin-react-compiler', { target: '19' }]] : [],
  };
};
