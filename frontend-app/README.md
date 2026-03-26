# RELab App

The field research app for documenting product disassembly — capture components, materials, and photos on the go. Built with [Expo](https://expo.dev/) and [React Native](https://reactnative.dev/), runs on Android, iOS, and web.

## 🚀 Quick Start

```bash
npm ci
just dev    # Expo dev server at http://localhost:8081
```

You'll need the backend running too. Set `EXPO_PUBLIC_API_URL` in `.env.local` if it's not on localhost.

## Common Commands

```bash
just check      # TypeScript + Expo lint
just test       # Jest unit + component tests
just test-ci    # tests with coverage (must stay ≥ 80%)
just format     # auto-fix lint issues
```

Want to run on a physical device or emulator? See [CONTRIBUTING.md: Frontend Setup](../CONTRIBUTING.md#frontend-setup).

## Want to Know More?

Full setup, test patterns, and MSW network mocking are in [CONTRIBUTING.md](../CONTRIBUTING.md#frontend-development).
