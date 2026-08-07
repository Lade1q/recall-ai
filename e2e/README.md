# E2E tests

This directory owns the Playwright configuration, browser tests, and test artifacts.
Playwright itself is installed once from the repository-level `package.json`. The test runner starts the frontend in `../src/client` automatically.

## Setup

```bash
npm ci
npx playwright install
```

## Run tests

From the repository root:

```bash
npm run test:e2e
```

Useful commands: `npm run test:e2e:ui`, `npm run test:e2e:codegen`, and `npm run test:e2e:report`.

WebKit is disabled locally on Arch Linux because its browser binary needs unavailable system libraries. It remains enabled in CI. In a supported local environment, opt in with:

```bash
PLAYWRIGHT_INCLUDE_WEBKIT=true npm run test:e2e
```
