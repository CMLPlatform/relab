#!/usr/bin/env node
/*
  redact_api.js

  Purpose: remove any example JWTs embedded by the OpenAPI -> TypeScript
  generator from the generated frontend file `src/types/api.generated.ts`.

  Why: some OpenAPI examples may contain real-looking tokens that trigger
  gitleaks or other secret-scanning tools. This script performs a simple
  regex replace to substitute such `access_token` example values with
  the safe placeholder `<REDACTED_JWT>` so generated files are safe to
  commit and publish.

  Behavior:
  - Locates `api.generated.ts` in common paths relative to CWD.
  - Replaces any value matching the pattern used for JWT-like strings
    in `"access_token": "..."` with `"access_token": "<REDACTED_JWT>"`.
  - Only writes the file if a change was made.

  Usage:
    # from frontend-app
    pnpm run codegen:api:redact
    # or directly
    node scripts/redact_api.js
*/
// Support both CommonJS and ESM execution environments.
(async () => {
  const modFs = typeof require === 'function' ? require('node:fs') : await import('node:fs');
  const modPath = typeof require === 'function' ? require('node:path') : await import('node:path');
  const fs = modFs.default ?? modFs;
  const path = modPath.default ?? modPath;

  // Try common locations relative to the current working directory.
  const candidates = [
    path.resolve('src', 'types', 'api.generated.ts'),
    path.resolve('frontend-app', 'src', 'types', 'api.generated.ts'),
  ];

  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) {
    console.error('api.generated.ts not found. Run this from frontend-app or repo root.');
    process.exit(2);
  }

  const src = fs.readFileSync(file, 'utf8');
  const out = src.replace(/("access_token":\s*")[A-Za-z0-9._-]+(")/g, '$1<REDACTED_JWT>$2');
  if (out === src) {
    console.log('No JWT examples found to redact.');
    process.exit(0);
  }
  fs.writeFileSync(file, out, 'utf8');
  console.log('Redacted JWT examples in', file);
})();
