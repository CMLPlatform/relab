// Jest's CommonJS runtime cannot evaluate `import()`, so React.lazy splits would throw in
// tests. There, rewrite it to an already-resolved require; bundles keep the real import.
const dynamicImportToRequire = ({ types: t }) => ({
  visitor: {
    CallExpression(path) {
      if (path.node.callee.type !== 'Import') return;
      path.replaceWith(
        t.callExpression(t.memberExpression(t.identifier('Promise'), t.identifier('resolve')), [
          t.callExpression(t.identifier('require'), path.node.arguments),
        ]),
      );
    },
  },
});

module.exports = (api) => {
  // Respect explicit Babel/NODE envs, then ENVIRONMENT (used by Docker builds),
  // otherwise default to development.
  const env =
    process.env.BABEL_ENV ?? process.env.NODE_ENV ?? process.env.ENVIRONMENT ?? 'development';
  api.cache.using(() => env);

  // Treat staging as production-like for build optimizations.
  const isProduction = env === 'production' || env === 'prod' || env === 'staging';

  return {
    presets: ['babel-preset-expo'],
    // React Compiler is useful, but running it during every dev transform slows
    // Metro feedback noticeably on this app. Keep it for production bundles.
    plugins: isProduction
      ? [['babel-plugin-react-compiler', { target: '19' }]]
      : env === 'test'
        ? [dynamicImportToRequire]
        : [],
  };
};
