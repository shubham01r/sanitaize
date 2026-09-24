# Phase 0 findings — ChatGPT discovery

**Status:** Complete for the requested synthetic ChatGPT fixture scope (T0.3 and T0.4).
**Date:** 2026-09-24
**Source:** User-provided discovery observations plus the documented shapes in `02_TRD.md` §7 and `05_Backend_Schema.md` §7.

> These are synthetic reconstructions, not a live HAR or a recording from a real account. No cookies, authorization values, CSRF tokens, account identifiers, organization identifiers, user identifiers, or real credentials are present.

## T0.1 / T0.2 status

- The MV3 scaffold builds to `dist/`.
- `inject.js` is declared in the `MAIN` world and `content.js` in the `ISOLATED` world.
- Both scripts use `document_start`.
- The development build adds `http://localhost:4173/*` for local mock-server work.
- `npm run build`, `npm test`, `npm run lint`, and `npm run typecheck` pass.
- `npm run verify:no-network` also passes.
- A deliberate `innerHTML` probe was rejected by ESLint and removed after verification.

## T0.3 — Synthetic ChatGPT fixture set

Fixtures are stored in `test/fixtures/chatgpt/` and are generated from `test/helpers/fake-secrets.js` by `scripts/generate-chatgpt-fixtures.mjs`.

| Fixture                       | Purpose                                       |
| ----------------------------- | --------------------------------------------- |
| `request.json`                | Normal conversation request                   |
| `request-long-multiline.json` | Long multiline prompt                         |
| `request-code-block.json`     | Fenced code block prompt                      |
| `request-follow-up.json`      | Multi-turn messages array                     |
| `request-regenerate.json`     | Regeneration request with `parent_message_id` |
| `renamed-fields.json`         | Synthetic unknown-shape/deep-walk case        |
| `stream-delta.sse`            | JSON-patch-style message deltas               |
| `stream-cumulative.sse`       | Cumulative message snapshots                  |
| `expectations.json`           | Adapter expectations                          |
| `manifest.json`               | Fixture metadata and discovery observations   |

### Request shape

- Site: `chatgpt`
- Method: `POST`
- Path shape: `/backend-api/conversation`
- Content type: `application/json`
- Text-bearing path: `messages[*].content.parts[*]`
- Normal requests include a sanitized `conversation_id`, `parent_message_id`, message IDs, model metadata, and `stream: true`.
- Follow-up requests contain previous user and assistant turns in `messages`.
- Regeneration requests include `parent_message_id`.

### Stream shape

- Content type: `text/event-stream`
- Delta fixture: JSON-patch-style events using `p`, `o`, and `v` fields.
- Cumulative fixture: message snapshots containing cumulative `content.parts` text.
- Terminal event: `data: [DONE]`.
- The delta fixture intentionally splits a mock across events to support later hold-back/fuzz testing.

## T0.4 — Discovery answers

| Question                     | Finding                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Prompt submission channel    | Main-thread `fetch` observed.                                                                                   |
| Worker, iframe, or WebSocket | No such channel is present in the supplied ChatGPT discovery evidence; the supported path is main-thread fetch. |
| Prompt endpoint              | `POST /backend-api/conversation`.                                                                               |
| Request content type         | `application/json`.                                                                                             |
| Text slots                   | `messages[*].content.parts[*]` strings.                                                                         |
| Composer selectors           | `#prompt-textarea` and `[contenteditable="true"]`.                                                              |
| History resend               | Multi-turn requests resend previous turns in the `messages` array.                                              |
| Regenerate behavior          | Request includes `parent_message_id`.                                                                           |
| Fetch wrapper                | Standard page `fetch`; no separate provider-specific wrapper was observed.                                      |
| Stream response              | SSE with delta/snapshot-compatible synthetic events and `[DONE]` terminal event.                                |

## Redaction and fixture safety

- Synthetic credential-shaped values are produced by `test/helpers/fake-secrets.js`.
- Database and email values use reserved non-routable/documentation domains.
- Account, user, conversation, message, and parent identifiers are explicit redaction placeholders.
- Fixture request and response files contain no real secrets or account metadata.
- The fixtures are intended for local unit/adapter/E2E tests and must not be replaced with a raw HAR.

## Limitations and follow-up

This completes the requested **synthetic** ChatGPT T0.3/T0.4 fixture work. It does not claim that the current live provider shape was independently re-captured in this environment. Before a release, the implementation plan’s real-site regression checklist must still be run manually with fake-only prompts, and Claude discovery remains a separate site-specific fixture task.
