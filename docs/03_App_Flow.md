# 03 — App Flow Document

Describes every user-visible flow and every system behaviour behind it. Terms: **composer** = the site's prompt input box; **vault** = in-RAM two-way map; **mock** = fake stand-in value; **slot** = a text field in the request body.

---

## 1. Actors and surfaces

| Actor | Role |
|-------|------|
| Developer | Types/pastes prompts, reads replies |
| Admin | Deploys the extension via Chrome policy |
| AI provider (ChatGPT / Claude) | Receives sanitised prompts, streams replies |

| Surface | Where | Owner file |
|---------|-------|-----------|
| Ghost Badge | Above the composer on supported sites | `content/ghost-badge.js` |
| Detection popover | Opens from the badge | `content/badge-popover.js` |
| Toast | Near composer / bottom-right | `content/toast.js` |
| Toolbar popup | Extension icon | `popup/*` |
| Options page (incl. Test Lab) | Full tab | `options/*` |
| Onboarding page | Opens on first install | `onboarding/*` |
| Toolbar icon badge text | Extension icon | `background/service-worker.js` |

Supported hosts (MVP): `chatgpt.com`, `chat.openai.com`, `claude.ai`. On any other page the extension is inert (popup shows "SanitAIze works on ChatGPT and Claude").

---

## 2. Flow index

| ID | Flow | Trigger |
|----|------|---------|
| F1 | Install and onboarding | Extension installed |
| F2 | Page load and initialisation | Navigate to a supported site |
| F3 | Typing and live detection (Ghost Badge) | Input/paste in composer |
| F4 | **Send: sanitise and transmit** (core) | User presses Send |
| F5 | **Reply: stream and re-hydrate** (core) | Provider starts streaming |
| F6 | Multi-turn consistency | Follow-up prompt |
| F7 | Regenerate / edit message | User regenerates or edits |
| F8 | Ignore a detection (session) | Click "Ignore" in popover |
| F9 | Dictionary management | Options → Dictionary |
| F10 | Popup usage (status, clear vault, verify) | Click toolbar icon |
| F11 | Pause protection | Popup → Pause |
| F12 | Reload / tab close | Reload or close tab |
| F13 | Fail-closed block | Any outbound error |
| F14 | Managed (enterprise) configuration | Policy present |
| F15 | Test Lab | Options → Test Lab |

---

## 3. Core flow (F2 + F3 + F4 + F5)

```mermaid
sequenceDiagram
  autonumber
  actor Dev as Developer
  participant Page as Site page JS
  participant CS as content.js (isolated)
  participant MW as inject.js (main world)
  participant V as Vault (tab RAM)
  participant LLM as AI provider
  Note over CS,MW: F2 both scripts start at document_start; MW patches fetch immediately
  CS->>MW: CONFIG_PUSH (settings + dictionary)
  Dev->>Page: types or pastes prompt
  CS->>CS: debounce 150 ms, detect(text)
  CS-->>Dev: Ghost Badge shows "2 sensitive values"
  Dev->>Page: presses Send
  Page->>MW: fetch(POST prompt endpoint, body)
  MW->>MW: adapter.match, await config
  MW->>V: getOrCreate(mock) per detection
  MW->>MW: leak assertion + convergence pass
  MW->>LLM: fetch(sanitised body)
  MW-->>CS: TRANSFORM_SUMMARY (counts only)
  CS-->>Dev: Toast "2 values replaced"
  LLM-->>MW: SSE stream (contains mocks)
  MW->>V: rehydrate with hold-back
  MW-->>Page: SSE stream (contains real values)
  Page-->>Dev: reply renders with real values
```

### F2 — Page load and initialisation
1. Browser starts loading a supported site. `inject.js` (MAIN) and `content.js` (ISOLATED) both run at `document_start`.
2. `inject.js` captures built-ins (`fetch`, `Response`, `TransformStream`, `JSON`, `Map`, `crypto`), creates the vault, installs the fetch patch in **not-ready** state.
3. `content.js` requests the effective config from the service worker (`GET_EFFECTIVE_CONFIG`), then posts `CONFIG_PUSH` to `inject.js`.
4. `inject.js` marks `configReady`, replies `READY {adapterId}`; `content.js` shows nothing yet.
5. When the composer appears (MutationObserver on `document`), `input-watcher` attaches and the Ghost Badge shows **Ready**.
6. Service worker sets the toolbar icon badge to the protected-value count for this tab (`0` → empty).

### F3 — Typing and live detection
1. `input`/`paste`/`keyup` on the composer (captured at `document` level, filtered by adapter selectors).
2. Debounce 150 ms → read composer text (`textContent`/`value`) → run `detect()` in an idle callback.
3. Result → badge state:
   - 0 detections → **Ready** ("SanitAIze ready").
   - ≥ 1 → **Detected(n)** ("n sensitive values will be replaced" + type chips).
4. Click badge → **popover** listing each detection: type chip, masked preview (`sk_live_…d4f9`), "Ignore this session" (F8).
5. The composer text is **never modified**. The user always sees their real text.
6. Text > 200 KB: badge shows "Too large to preview — still protected when sent".

### F4 — Send: sanitise and transmit
1. The user presses Send; the site's JS calls `fetch(promptEndpoint, {body})`.
2. Patched `fetch` → `adapters.match()` (URL + method). Non-matching requests pass straight through.
3. Await `configReady` (≤ 2 s). Timeout → **F13** (`E_CONFIG_TIMEOUT`).
4. Extract body text (string / Request / Blob / ArrayBuffer) → `JSON.parse` (`E_PARSE_BODY` → F13).
5. `adapter.getRequestSlots(json)`; missing expected slots → deep-walk fallback + `W_ADAPTER_UNKNOWN_SHAPE`.
6. For each slot: `detect` → overlap resolution → `vault.getOrCreate` → splice mock.
7. Serialise → **leak assertion** → **convergence pass**. Any failure → F13 (`E_LEAK_ASSERT`).
8. Rebuild request (drop stale `Content-Length`), call the **original** fetch with the sanitised body.
9. Post `TRANSFORM_SUMMARY {counts, latencyMs}` to `content.js` → badge **Protected(n)** + toast; service worker updates toolbar badge; audit entry appended if enabled.
10. Zero detections: body untouched, no toast, badge stays **Ready**.

### F5 — Reply: stream and re-hydrate
1. Response arrives; `adapter.matchResponse` true → wrap.
2. `text/event-stream`: bytes → `TextDecoder(stream)` → `SseParser` (event-buffered) → `adapter.createStreamHandler(vault).onEvent(evt)`.
3. Handler locates text slots in each event; **delta** slots pass through a per-slot `StreamRehydrator` (holds a possible partial mock at the tail); **cumulative** slots are replaced in full each time.
4. Modified events are re-serialised and enqueued; unmodified events pass byte-faithful.
5. On the terminal event (`[DONE]`/`message_stop`) and on stream close: `onEnd()` flushes every held tail as a synthetic delta **before** the terminal event.
6. The site renders the stream normally: the user sees real values, syntax-highlighted code, working copy button.
7. Any exception in this path → enqueue the original chunk (user sees mocks; nothing breaks).
8. Non-streaming JSON response → same replacement on all string leaves.

### F6 — Multi-turn consistency
- Turn 1 prompt contains `sk_live_AAA…` → mock `M1` stored (`fwd`: real→M1, `rev`: M1→real).
- Turn 2 the user pastes the same key again (or the reply contained the real key because it was re-hydrated and the user quoted it) → `getOrCreate` returns `M1`. The provider's server-side history already holds `M1`, so the model sees a consistent identifier.
- New chat in the same tab → same vault (same mapping), which keeps behaviour predictable.

### F7 — Regenerate / edit
- **Regenerate:** the site re-requests with existing message ids; if the body carries prior text it already contains mocks (idempotence: mocks are never re-transformed) or real text (re-mapped to the same mock).
- **Edit message:** edited text goes through F4 like any new prompt.

### F8 — Ignore a detection (session)
1. Popover → "Ignore this session" on a detection.
2. `content.js` computes `valueHash = sha256(type + ':' + value)` (first 16 hex chars) and sends `IGNORE_ADD {type, valueHash}` to `inject.js` (hash only; never the value).
3. `inject.js` adds the hash to an in-memory ignore set; `detect` drops matches with that hash.
4. Badge count decreases; entry shown as "Ignored (this tab)" until reload. Never persisted.

### F9 — Dictionary management (Options → Dictionary)
1. List of entries: term, aliases, category, case-sensitive toggle, enabled toggle.
2. Add / edit / delete; **Import** (CSV/JSON, schema-validated, size-capped) / **Export**.
3. Inline warning: "Add names and codenames only. Never store passwords or keys here."
4. Save → `chrome.storage.local` → `storage.onChanged` → service worker → content script → `CONFIG_PUSH` to open tabs (live update, no reload).
5. Validation: term length 2–120, ≤ 2,000 entries, regex-safe (escaped), duplicates merged.

### F10 — Popup
1. Open popup → `chrome.tabs.query` → `sendMessage(GET_TAB_STATE)`; no response → "SanitAIze works on ChatGPT and Claude" (unsupported page).
2. Supported: status row (On/Off for this site), this-tab stats (values protected by type; vault size — RAM only), **Clear vault now** (confirm), **How to verify** (steps, §7), links to Settings and Dictionary.
3. Site toggle writes `settings.sites[siteId]` → immediate effect.

### F11 — Pause protection (P1)
1. Popup → "Pause for this tab" → confirmation dialog: "Prompts will be sent as typed. Your real data will reach the AI provider."
2. Confirm → `runtime.paused = true` for that tab, badge shows **Paused** (amber), auto-resumes after 15 min or on reload. Disabled when managed policy sets `allowPause:false`.

### F12 — Reload / tab close
- Reload: JS heap discarded → vault empty; new page load repeats F2. Provider history shows mocks (documented limitation; onboarding explains). The badge popover on reload shows nothing.
- Tab close: same; nothing to clean.

### F13 — Fail-closed block
1. Trigger: `E_CONFIG_TIMEOUT`, `E_PARSE_BODY`, `E_UNSUPPORTED_BODY`, `E_LEAK_ASSERT`, `E_VAULT_FULL`, `E_MOCK_COLLISION`, `E_TRANSFORM_FAIL`, `E_INPUT_TOO_LARGE`.
2. `fetch` rejects with `TypeError("SanitAIze blocked this request (CODE)")` → the site shows its generic error; the request **was not sent**.
3. Badge → **Blocked** (red) + blocking toast with next step per code (copy in `04_UIUX_Design_Brief.md` §8).
4. User can edit and resend, open the popup, or (P1) pause with confirmation. If `failMode:'open'` (opt-in/managed) the original request is sent and the toast says "Sent without protection".

### F14 — Managed configuration (P1)
1. Service worker reads `chrome.storage.managed` (policy) and merges over local settings; policy wins on locked keys.
2. Options page shows locked settings as read-only with a "Managed by your organisation" note.
3. Preloaded dictionary entries are merged, marked "Managed" (not editable or exportable by the user).

### F15 — Test Lab (Options)
1. Text area (local only) + "Run" (also live on input).
2. Right pane: transformed output with highlighted replacements, table of `type · masked real · mock`, timing.
3. "Simulate reply" box: paste text containing mocks → shows re-hydrated result (uses a throw-away vault created in the page).
4. Nothing leaves the page; vault is discarded on close.

### F1 — Install and onboarding
1. `onInstalled(reason=install)` → open `onboarding/onboarding.html`.
2. Step 1 "What it does" (3 lines + diagram). Step 2 "Try it" (button opens chatgpt.com; sample prompt with fake secrets and copy button). Step 3 "Verify it" (DevTools steps). Step 4 "Good to know": reload wipes the map; text only; add client names.
3. "Pin SanitAIze to your toolbar" hint. Onboarding completion stored as `meta.onboarded=true`.

---

## 4. Unsupported / inert cases
- Other websites: no scripts run.
- Site supported but endpoint not matched (site changed): badge shows **Ready** but popup shows "Compatibility check failed" if the adapter reports `W_NO_MATCH_AFTER_SEND` (composer submitted but no matched request seen within 3 s). This is a canary for site changes.

---

## 5. State machines

### 5.1 Ghost Badge
```mermaid
stateDiagram-v2
  [*] --> Hidden
  Hidden --> Ready: composer found, config ready
  Ready --> Detected: scan finds 1+ values
  Detected --> Ready: edit removes all values or all ignored
  Ready --> Protecting: send intercepted with 1+ values
  Detected --> Protecting: send intercepted
  Protecting --> Protected: request sanitised and sent
  Protected --> Ready: 4 s timeout or new input
  Protecting --> Blocked: outbound error, fail-closed
  Blocked --> Ready: user edits text or dismisses
  Ready --> Paused: user pauses
  Detected --> Paused: user pauses
  Paused --> Ready: resume, 15 min timeout, or reload
  Ready --> Off: site toggled off or extension disabled
  Off --> Ready: site toggled on
  Ready --> Hidden: composer removed from DOM
```

### 5.2 Request handling (per prompt request)
`Matched → AwaitConfig → Parsing → Sanitising → Asserting → Sending → Streaming → Done` with any state → `Blocked` on error (fail-closed) and `Streaming → Done` on inbound errors (fail-open).

### 5.3 Stream handler (per slot)
`Idle → Holding(pending) → Emitting → … → Flushed`; `push()` moves between `Emitting` and `Holding`; terminal event or close forces `Flushed`.

### 5.4 Vault lifecycle
`Empty → Populated → (Cleared by user) → Populated … → Destroyed (reload/close)`. No transition writes to any store.

### 5.5 Enablement
`Enabled ⇄ Disabled(site)`, `Enabled ⇄ Paused(tab)`, `Enabled → LockedByPolicy`. Effective enable = `settings.enabled && settings.sites[site] && !paused`.

---

## 6. Edge-case and failure matrix

| # | Scenario | Expected behaviour |
|---|----------|--------------------|
| 1 | No sensitive data | No change, no toast, ≤ 0.05 ms overhead on non-target fetches |
| 2 | Same secret pasted 5 times in one prompt | One vault entry; same mock everywhere |
| 3 | Secret inside a code fence / JSON string / URL query | Detected; replaced in place; escaping preserved (leak assertion checks JSON-escaped form) |
| 4 | Mock split across SSE events | Re-hydrated correctly via hold-back |
| 5 | Mock split across TCP chunks mid-event | SseParser buffers until event complete |
| 6 | LLM changes mock casing | Case-insensitive reverse match; restores canonical real casing |
| 7 | LLM shortens/partially quotes a mock | Not restored (documented); shows partial mock |
| 8 | LLM writes the mock inside markdown/backticks | Restored (text-level replace happens before markdown render) |
| 9 | Code-highlighted output splits token into spans | Not an issue: replacement occurs on stream text before rendering |
| 10 | Stream aborted by user (Stop) | `AbortController` cancels; held tail discarded; no error |
| 11 | Network error mid-stream | Propagates unchanged |
| 12 | Response is not SSE | JSON leaf replacement |
| 13 | Body is FormData/stream we can't read | `E_UNSUPPORTED_BODY` → block |
| 14 | Site renames fields | Deep-walk fallback + compatibility warning; still sanitised |
| 15 | Config not ready within 2 s | Block (`E_CONFIG_TIMEOUT`) |
| 16 | Vault reaches 10,000 entries | Block (`E_VAULT_FULL`); suggest Clear vault |
| 17 | False positive (e.g., a hash that isn't a secret) | Ignore this session; or lower sensitivity |
| 18 | Placeholder like `process.env.STRIPE_KEY` | Not detected (placeholder heuristics) |
| 19 | Real value appears in an attachment | Not scanned; warning when attachment added (P1) |
| 20 | User reloads mid-conversation | Vault empty; provider history shows mocks; new prompts create new mocks |
| 21 | Two tabs of the same site | Separate vaults (isolated by design) |
| 22 | Extension updated/disabled while tab open | Old scripts keep running until reload; badge shows "Reload to update" after `runtime.onInstalled` message |
| 23 | Page replaces `window.fetch` after us | Re-assert on `visibilitychange`; if lost, badge "Not protecting" |
| 24 | Dictionary term inside a DB URL host | DB URL generator handles host; dictionary match dropped (overlap rule) |
| 25 | Mock coincidentally appears in source text | Generator retries; never emits a mock present in the source |
| 26 | User pastes a mock from an earlier reply | Recognised as mock → not re-transformed |
| 27 | Very large paste (> 2 MB) | Preview skipped; send blocked with `E_INPUT_TOO_LARGE` and guidance to split |
| 28 | Extension disabled for site | Passthrough; badge Off |

---

## 7. Worked example (matches the deck's USP slide; fictional names)

**User types in ChatGPT:**
```
Debug my Stripe integration for Acme Capital:
const STRIPE_KEY = "sk_live_9982348123456789abcdef01";
db: postgres://payments_svc:Pa55w0rd!x@10.20.30.40:5432/acme_prod
```
Badge: **3 sensitive values will be replaced** — API key, Client/dictionary term, Database URL (+ IP inside the URL is handled by the URL generator).

**Sent over the wire (visible in DevTools → Network → request payload):**
```
Debug my Stripe integration for Entity_A_x9k:
const STRIPE_KEY = "sk_test_mock8f9a2b1c3d4e5f67890";
db: postgres://user_q7m2ab:Xk3nd8Tp!v@10.77.2.19:5432/db_c4f1
```
(Structure, quotes, ports and lengths preserved.)

**Provider replies (raw stream):**
"Your Stripe integration for Entity_A_x9k looks correct. The key sk_test_mock8f9a2b1c3d4e5f67890 is properly formatted…"

**User sees in the UI:**
"Your Stripe integration for Acme Capital looks correct. The key sk_live_9982348123456789abcdef01 is properly formatted…"

**Verify (also shown in the popup):**
1. Open DevTools (F12) → Network tab. 2. Send the prompt. 3. Click the request named `conversation` (ChatGPT) or `completion` (Claude) → Payload/Request. 4. Confirm only mocks are present. 5. Compare with what the page shows.

---

## 8. E2E acceptance scenarios (Playwright, local mock servers)

| ID | Given / When / Then |
|----|---------------------|
| E1 | Given extension loaded and mock ChatGPT page; when I type text with a Stripe key and press Send; then the mock server's recorded body contains no real key and contains a `sk_test_mock…` of equal length |
| E2 | When the mock server streams a reply containing the mock split as `sk_te` / `st_mock…`; then the DOM shows the real key and no partial mock |
| E3 | Given a dictionary entry "Acme Capital"; when I send "ACME CAPITAL's API"; then the recorded body contains `ENTITY_…` uppercase mock and the DOM reply shows "Acme Capital" |
| E4 | When I send two prompts containing the same secret; then both recorded bodies contain the same mock |
| E5 | When I reload the page and send the same secret; then a **new** mock is used and vault size started at 0 |
| E6 | When the mock server changes JSON field names (fixture v2); then the secret is still absent from the recorded body and the compatibility warning is shown |
| E7 | When config push is delayed beyond 2 s (test hook); then the request is not received by the server and the Blocked state is shown |
| E8 | When the stream contains malformed events; then the chat still renders (mocks visible) and no exception escapes |
| E9 | When I click "Ignore this session" for a detection and send; then the value passes through unchanged; after reload it's protected again |
| E10 | When I type ≥ 1 detection; then the badge updates within 300 ms and the composer text is unchanged |
| E11 | Repeat E1–E4 on the mock Claude page (different endpoint/stream shape) |
| E12 | When a page script replaces `window.fetch` after load; then either protection continues or the badge shows "Not protecting" (never silent) |
| E13 | When the site toggle is off; then requests pass through unmodified and the badge is Off |
| E14 | Popup shows counts by type after E1; **Clear vault now** empties it (subsequent same secret → new mock) |

---

## 9. Screen inventory and navigation

```
Extension icon ──► Popup ──► Settings (Options: General)
                    │  └──► Dictionary (Options: Dictionary)
                    │  └──► How to verify (expands inline)
Options (tabs): General · Detection · Dictionary · Audit log · Test Lab · About
Onboarding (first install): Welcome → Try it → Verify → Good to know
On-page: Ghost Badge ──► Detection popover ──► (Ignore this session)
         Toast (transient) ──► "Details" opens the same popover
```
