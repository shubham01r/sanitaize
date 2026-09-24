# Phase 2 findings — ChatGPT vertical slice

**Status:** T2.1–T2.4 and T2.6 complete. T2.5 was explicitly skipped by user instruction.
**Date:** 2026-09-24
**Scope:** Local synthetic ChatGPT fixtures and local-only E2E validation.

> T2.5 real-site proof was not performed. No screenshots, live HAR, cookies, authorization values, CSRF tokens, account identifiers, or real credentials are present. The manual real-site proof remains an outstanding release gate.

## Implemented tasks

| Task | Result                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| T2.1 | Main-world bootstrap, built-in capture, vault, runtime config timeout, page-world handshake, and active fetch patch                 |
| T2.2 | Fast path, body extraction/rebuild, abort propagation, fail-closed errors, SSE/JSON response wrapping, metadata-only blocked events |
| T2.3 | ChatGPT request/slot/stream adapter with delta, cumulative, split-token, relative-URL, and JSON-response coverage                   |
| T2.4 | Effective default config delivery, service-worker messaging, `READY` handshake, and metadata-only summary relay                     |
| T2.6 | Local Node mock server, synthetic ChatGPT page, and Playwright E1/E2/E4 tests                                                       |

## T2.5 decision

The user explicitly selected:

> Explicitly skip T2.5 and proceed with T2.6

This is a deliberate deviation from the implementation plan. It must not be interpreted as proof that production ChatGPT behavior was verified. Before packaging or release, run the documented real-site checklist in `docs/06_Implementation_Plan.md` §5 with fake-only prompts and save sanitized proof artifacts under `docs/proof/`.

## T2.6 local boundary

- The mock server is implemented with Node built-ins only: `test/e2e/mock-server/server.mjs`.
- It binds to `127.0.0.1:4173` and is used only by Playwright.
- The page uses synthetic request/response data and does not contact ChatGPT, Claude, or any external service.
- Recorded request bodies are held only in the mock server’s in-memory test state.
- The E2E page uses `#prompt-textarea`, a send button, and a response DOM target.
- E1 verifies the recorded request excludes the synthetic real key and contains an equal-length `sk_test_...` mock.
- E2 verifies a mock split across SSE events is rehydrated in the DOM.
- E4 verifies the same tab reuses one mock for two requests.

## Browser launch note

The installed Playwright-managed Chromium binary is not present in this environment. Chrome 153 was installed but did not load the unpacked extension through the command-line flags in the probe. Installed Edge 153 loaded the extension correctly, so the E2E launcher prefers:

```text
C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
```

The test remains compatible with `CHROME_PATH` or another installed Chromium-compatible browser through the candidate list. This is an environment launcher limitation, not a product security finding.

## Verification commands

The final T2.6 verification covers:

```text
npm run test:e2e
npm test
npm run build
npm run lint
npm run typecheck
npm run verify:no-network
npx prettier --check ...
```

The local E2E result is 3 passing tests: E1, E2, and E4.

## Safety notes

- No real values were used in source, tests, fixtures, server state, or messages.
- No runtime dependency was added; Playwright remains a dev dependency.
- No extension-owned network call, storage permission, `storage.sync`, WebSocket, EventSource, sendBeacon, or XHR creation was added.
- `src/core` remains free of browser and network APIs.
