# SanitAIze Agent Notes

## Required workflow

- Read `docs/01_PRD.md` through `docs/06_Implementation_Plan.md` before implementation; the documents win over stale code.
- Work one task ID at a time from the implementation plan.
- Write tests first for anything in `src/core`.
- Use documented defaults for non-blocking ambiguity and record material deviations in the relevant documentation.

## Security and privacy guardrails

- Keep `src/core` pure JavaScript: no `chrome.*`, DOM, or `window` dependencies.
- Do not add runtime dependencies, extension-owned network calls, `chrome.storage.sync`, `eval`, `new Function`, dynamic `innerHTML`, WebSocket, EventSource, sendBeacon, or XMLHttpRequest creation.
- Never put real values in logs, errors, messages, storage, audit records, or fixtures.
- Dictionary entries are the documented MVP exception for plain local persistence and `postMessage` transit; dictionary entries must contain names/terms only, never credentials.
- Capture built-ins at `document_start` before page code can replace them.
- Outbound failures fail closed; inbound response failures fail open.
- Regexes must be linear-time and have ReDoS coverage.

## Verification

Run the relevant checks before reporting a task complete:

```text
npm run build
npm test
npm run lint
npm run typecheck
npm run verify:no-network
```
