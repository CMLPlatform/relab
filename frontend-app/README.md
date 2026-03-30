# RELab App

The `frontend-app` subrepo contains the Expo / React Native app used for authenticated data collection.

## Quick Start

```bash
just install
just dev
```

The Expo dev server runs on <http://localhost:8081>.

You will usually want the backend running as well. If the API is not on localhost, set `EXPO_PUBLIC_API_URL` in `.env.local`.

To enable Google OAuth on web, set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to your web OAuth client ID from Google Cloud Console. See [CONTRIBUTING.md](../CONTRIBUTING.md#frontend-setup) for details.

## Common Commands

```bash
just check       # lint
just test        # Jest tests
just test-ci     # CI-style test run with coverage
just format      # format code
just build-web   # export web build for E2E
```

## More

For emulator and device setup, testing patterns, and app-specific development notes, see [CONTRIBUTING.md](../CONTRIBUTING.md#frontend-development).
