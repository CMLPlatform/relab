export default {
  globs: ['README.md', 'src/content/**/*.{md,mdx}'],
  ignores: ['dist/**', 'node_modules/**', 'site/**'],
  config: {
    default: true,
    'line-length': false,
    'no-inline-html': false,
    'first-line-heading': false,
    'single-title': false,
    'fenced-code-language': false,
  },
};
