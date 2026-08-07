# E2E tests

This directory owns the Playwright configuration, browser tests, and test artifacts.
Playwright itself is installed once from the repository-level `package.json`. The test runner starts the frontend in `../src/client` automatically and runs Chromium plus Firefox.

## Setup

```bash
npm ci
npm run test:e2e:install
```

## Run tests

From the repository root:

```bash
npm run test:e2e
```

Useful commands: `npm run test:e2e:ui`, `npm run test:e2e:codegen`, and `npm run test:e2e:report`.
