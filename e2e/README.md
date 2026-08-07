# E2E tests

This directory owns the Playwright configuration, browser tests, and test artifacts.
Playwright itself is installed once from the repository-level `package.json`. The test runner starts the frontend in `../src/client` automatically and runs Chromium plus Firefox.

## Setup

```bash
npm ci
npm run test:e2e:install
```

On Arch Linux, Playwright prints a warning that it is downloading an Ubuntu fallback build. This is expected because Arch is not an officially supported operating system. Do not run `playwright install-deps`; after the browser download completes, run the tests normally.

## Run tests

From the repository root:

```bash
npm run test:e2e
```

Useful commands: `npm run test:e2e:ui`, `npm run test:e2e:codegen`, and `npm run test:e2e:report`.
