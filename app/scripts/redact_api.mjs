#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/*
  redact_api.mjs

  Purpose: remove any example JWTs embedded by the OpenAPI -> TypeScript
  generator from the generated frontend file `src/types/api.generated.ts`.

  Why: some OpenAPI examples may contain real-looking tokens that trigger
  gitleaks or other secret-scanning tools. This script performs a simple
  regex replace to substitute such `access_token` example values with
  the safe placeholder `<REDACTED_JWT>` so generated files are safe to
  commit and publish.

  Behavior:
  - Locates `api.generated.ts` relative to the app subrepo.
  - Replaces any value matching the pattern used for JWT-like strings
    in `"access_token": "..."` with `"access_token": "<REDACTED_JWT>"`.
  - Only writes the file if a change was made.

  Usage:
    # from app
    pnpm run codegen:api:redact
    # or directly
    node scripts/redact_api.mjs
*/
const main = () => {
  const file = resolve('src', 'types', 'api.generated.ts');
  if (!existsSync(file)) {
    console.error('api.generated.ts not found. Run this from app.');
    process.exit(2);
  }

  const src = readFileSync(file, 'utf8');
  const out = src.replace(/("access_token":\s*")[A-Za-z0-9._-]+(")/g, '$1<REDACTED_JWT>$2');
  if (out === src) {
    console.log('No JWT examples found to redact.');
    process.exit(0);
  }
  writeFileSync(file, out, 'utf8');
  console.log('Redacted JWT examples in', file);
};

main();
