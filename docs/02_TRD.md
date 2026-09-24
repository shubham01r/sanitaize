# 02 — Technical Requirements Document (TRD)

Stack: Chrome Extension MV3 · vanilla JS (ES2022) + JSDoc · esbuild (dev) · Vitest · Playwright.
**Runtime dependencies: none.** Network calls made by extension code: **none**.

---

## 1. Design principles

1. **Privacy by construction:** real values exist only in (a) the DOM/JS heap of the page the user is typing in and (b) the vault closure in the page's main world. They never cross a messaging boundary, hit storage, or appear in logs.
2. **Fail closed outbound, fail open inbound.** A failed sanitisation must not send data. A failed re-hydration must not break the chat (mocks are harmless).
3. **Pure core, thin shells.** All logic (detect, generate, vault, sanitise, SSE, re-hydrate) lives in `src/core` with no browser APIs, so it is shared by both content-script worlds and unit-tested in Node.
4. **Adapters absorb volatility.** Everything site-specific (URLs, JSON shapes, stream events, selectors) lives in adapters with recorded fixtures.
5. **Native feel.** No visible delay, no layout shift, no site restyling.

---

## 2. Tooling

| Concern | Choice | Notes |
|---------|--------|-------|
| Language | JS ES2022 + JSDoc, `// @ts-check` | `tsc --noEmit --checkJs` in CI |
| Bundler | esbuild (dev-only) | Content scripts can't use static ES imports → bundle each entry as IIFE; service worker as ESM |
| Unit tests | Vitest | `src/core` ≥ 90% line coverage |
| E2E | Playwright (Chromium, persistent context, `--load-extension`) against **local mock chat servers** (never real sites in CI) | `--headless=new` |
| Lint/format | ESLint (custom rules below) + Prettier | |
| Node | ≥ 20 | |
| Package scripts | `dev`, `build`, `test`, `test:e2e`, `lint`, `typecheck`, `verify:no-network`, `zip` | |

Custom lint/CI gates (fail the build):
- `no-restricted-globals`/`no-restricted-properties`: `eval`, `Function` constructor, `WebSocket`, `EventSource`, `navigator.sendBeacon`, `XMLHttpRequest` creation, `chrome.storage.sync`, `innerHTML`/`outerHTML`/`insertAdjacentHTML`, `document.write`.
- `fetch(` allowed **only** in `src/main-world/fetch-patch.js` where it is the *original* page fetch called with page-supplied arguments.
- `verify:no-network` script greps `dist/` for `http://`/`https://` string literals other than allowlisted match patterns and doc links.
- No `console.*` in `src/` except through `src/shared/log.js` (which never accepts raw values and is a no-op unless `settings.debug`).

---

## 3. Architecture

### 3.1 Execution contexts

| Context | File | World | Responsibilities | Can see real values? |
|---------|------|-------|------------------|---------------------|
| Main-world script | `inject.js` | `MAIN` (page JS world) | Patch `fetch`/XHR at `document_start`; run detect→sanitise on outbound; hold **vault**; wrap responses and re-hydrate | **Yes (only place with the vault)** |
| Content script | `content.js` | `ISOLATED` | Watch the composer, run preview detection, render Ghost Badge/toast in a closed Shadow DOM, bridge config, relay summaries | Sees composer text (it is in the DOM anyway); never sees the vault |
| Service worker | `background.js` | extension | Install/onboarding, merge managed+local config, toolbar badge text, audit append | No |
| Popup / Options / Onboarding | `popup/*`, `options/*`, `onboarding/*` | extension pages | UI | Options "Test Lab" sees text the user types there, local only |

```
 ┌─────────────────────── Tab (chatgpt.com / claude.ai) ───────────────────────┐
 │  Page JS ──fetch──►  inject.js (MAIN)                                       │
 │                       ├─ adapters (site shapes)                             │
 │                       ├─ core: detect → generate → SANITISE                 │
 │                       ├─ VAULT (closure, RAM)                               │
 │                       └─ core: SSE parser → REHYDRATE ◄── provider stream   │
 │        ▲  window.postMessage (metadata only: counts, types, mocks)          │
 │        ▼                                                                    │
 │  content.js (ISOLATED): input-watcher · Ghost Badge · toast · bridge        │
 └────────────────────────────┬────────────────────────────────────────────────┘
                              │ chrome.runtime messages (config, counts)
                      background.js ── chrome.storage.local / .managed
                      popup · options · onboarding
```

### 3.2 Why two content scripts
The page's `fetch` can only be wrapped from the page's own JS world. Declaring `"world": "MAIN"` in the manifest (Chrome ≥ 111) avoids injecting a `<script>` tag (which fights the sites' CSP) and needs no `web_accessible_resources` (so the extension isn't fingerprintable via resource probing). UI stays in the isolated world so page CSS/JS can't interfere with it.

### 3.3 Config delivery (MAIN can't call `chrome.*`)
1. `content.js` asks the service worker for the **effective config** (managed policy merged over local settings, plus dictionary).
2. `content.js` posts `CONFIG_PUSH` to `inject.js` via `window.postMessage`.
3. `inject.js` installs patches **immediately at `document_start`** in *not-ready* state. Any intercepted prompt request awaits `configReady` up to 2000 ms; on timeout → block (`E_CONFIG_TIMEOUT`).
4. Config updates (`storage.onChanged`) are re-pushed.

**Residual risk (documented, accepted for MVP):** the dictionary (client names/codenames) transits `window.postMessage` once per page load and is technically observable by page scripts. Mitigations: dictionary is for *names/terms only, never credentials* (UI warns); the page can already read the composer text; post-MVP option: hashed-ngram matching.

---

## 4. Manifest (authoritative template → `src/manifest.template.json`)

```json
{
  "manifest_version": 3,
  "name": "SanitAIze – Private AI Prompts",
  "version": "0.1.0",
  "description": "Replaces API keys, credentials and client names with realistic mock values before they reach public AI tools, and restores them in the reply. Runs 100% in your browser.",
  "minimum_chrome_version": "111",
  "icons": { "16": "icons/16.png", "32": "icons/32.png", "48": "icons/48.png", "128": "icons/128.png" },
  "action": { "default_title": "SanitAIze", "default_popup": "popup/popup.html" },
  "options_ui": { "page": "options/options.html", "open_in_tab": true },
  "background": { "service_worker": "background.js", "type": "module" },
  "permissions": ["storage"],
  "content_scripts": [
    {
      "matches": ["https://chatgpt.com/*", "https://chat.openai.com/*", "https://claude.ai/*"],
      "js": ["inject.js"],
      "run_at": "document_start",
      "world": "MAIN",
      "all_frames": false
    },
    {
      "matches": ["https://chatgpt.com/*", "https://chat.openai.com/*", "https://claude.ai/*"],
      "js": ["content.js"],
      "run_at": "document_start",
      "world": "ISOLATED",
      "all_frames": false
    }
  ],
  "storage": { "managed_schema": "managed_schema.json" },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```
Build rules:
- `version` is injected from `package.json`.
- **Dev build only:** append `http://localhost:4173/*` to both `matches` (mock servers).
- No `host_permissions`, no `tabs`, no `activeTab`, no `web_accessible_resources`.
- P6 hardening: try adding `; connect-src 'none'` to the CSP and keep it if nothing breaks.

---

## 5. Repository layout

```
sanitaize/
├─ package.json  esbuild.config.mjs  vitest.config.mjs  playwright.config.mjs  tsconfig.json
├─ AGENTS.md  docs/ (the six documents)
├─ src/
│  ├─ manifest.template.json   managed_schema.json
│  ├─ core/                    # PURE (no chrome.*, DOM, window)
│  │  ├─ rules/  catalog.js  validators.js  entropy.js  placeholders.js
│  │  ├─ detect.js             # detect(text, cfg) -> Detection[]
│  │  ├─ dictionary.js         # compile dictionary -> RegExp
│  │  ├─ generators/  index.js  shape.js  stripe.js  aws.js  github.js  openai.js  anthropic.js
│  │  │              google.js  slack.js  jwt.js  pem.js  dburl.js  email.js  ipv4.js  host.js  entity.js
│  │  ├─ vault.js              # two-way map + prefix index + version counter
│  │  ├─ sanitize.js           # sanitizeText, sanitizeJsonSlots, leak assertion
│  │  ├─ sse.js                # SseParser, serializeSse
│  │  ├─ rehydrate.js          # replaceMocks, StreamRehydrator
│  │  ├─ json-delta.js         # createJsonDeltaHandler({locate})
│  │  └─ errors.js  types.js  random.js  mask.js  hash.js   # hash.js: SHA-256 → first 16 hex (value hashes)
│  ├─ main-world/  inject.js  runtime.js  fetch-patch.js  xhr-patch.js  bridge.js
│  │              adapters/  index.js  chatgpt.js  claude.js  generic.js  local-dev.js
│  ├─ content/     content.js  input-watcher.js  ghost-badge.js  badge-popover.js  toast.js  bridge.js  styles.css.js
│  ├─ background/  service-worker.js  config.js  audit.js
│  ├─ popup/  options/  onboarding/     # html + js + css each
│  ├─ shared/  constants.js  messages.js  storage.js  settings-schema.js  log.js  i18n-en.js
│  └─ assets/icons/
└─ test/
   ├─ unit/**  helpers/fake-secrets.js  fixtures/{chatgpt,claude,corpus}/
   ├─ e2e/**   mock-server/{server.mjs,chatgpt.html,claude.html}
   └─ bench/
```

---

## 6. Core module specifications

### 6.1 `detect(text, cfg) → Detection[]`
- Input: string, config `{detectors:{…}, sensitivity, dictionary, ignoreHashes}`.
- Output: sorted, **non-overlapping** `Detection { id, type, ruleId, start, end, value, groups?, confidence }`.
- Algorithm:
  1. Skip text > `MAX_SCAN_CHARS` (2,000,000) → throw `E_INPUT_TOO_LARGE` (outbound) / return `[]` with flag (preview).
  2. Run each **enabled** rule from the catalog (`05_Backend_Schema.md` §6). Each rule: `{id,type,priority,regex,valueGroup,validate?,generatorId}`. Use the `d` flag (indices) or compute offsets from the value group.
  3. Run the compiled dictionary regex.
  4. Apply `validate` (checksum/entropy/placeholder heuristics).
  5. **Overlap resolution:** sort by `priority` desc, then length desc, then start asc; greedily accept spans that don't overlap accepted ones. Priority order: `PEM_PRIVATE_KEY` > `DB_URL` > provider keys > `JWT` > `GENERIC_SECRET` > `EMAIL` > `INTERNAL_HOST` > `DICTIONARY` > `IPV4`. (A dictionary term inside a DB URL host is handled by the DB URL generator.)
  6. Drop detections whose `value` is a known mock in the vault (idempotence, FR-T4) or whose hash is in `ignoreHashes`.
- Complexity: every regex **linear-time** (no nested/overlapping quantifiers); ReDoS test feeds 200 KB adversarial strings and asserts < 50 ms per rule.
- Generic secret rule guards (avoid false positives): value length ≥ 8; Shannon entropy ≥ threshold (`relaxed 3.5`, `balanced 3.0`, `strict 2.5` bits/char) **or** value matches a known-shape; reject values that look like code references or placeholders (`process.env.*`, `os.environ[...]`, `getenv(`, `${…}`, `{{…}}`, `<…>`, `$VAR`, `YOUR_…`, `xxxx…`, `changeme`, `example`, `null`, `true/false`, function-call `foo(`).

### 6.2 Dictionary compilation
- Entry: `{term, aliases[], category, caseSensitive}`. Build one regex: alternation of escaped terms sorted by length desc, wrapped as
  `(?<![\p{L}\p{N}_])(?:t1|t2|…)(?![\p{L}\p{N}_])` with flags `giu` (or `gu` if any entry is case-sensitive → compile two regexes).
- Collapse internal whitespace in terms to `\s+`.
- Possessives (`Acme's`) work because `'` is not in the boundary class.
- Max 2,000 entries; > that → show options warning.

### 6.3 Mock generation (`core/generators`)
**Why random+vault instead of format-preserving encryption (FF1/FF3, NIST SP 800-38G):** FPE needs a key and produces mocks *derived from* the real value (potentially attackable, and FF3 has published cryptanalysis — prefer FF1 if FPE is ever adopted). Our vault already gives determinism and reversibility, so **random mocks that are unrelated to the real value** leak strictly less. FPE remains a possible v2 option for stateless mode.

Rules (all generators): use `crypto.getRandomValues` via `core/random.js` (never `Math.random`); output length = real length (min mock length 8 for secrets); no mock may equal a real value, an existing mock, a prefix/suffix of an existing mock, or appear in the source text (retry ≤ 8 times, else `E_MOCK_COLLISION`).

| Type | Mock rule |
|------|-----------|
| Stripe (`sk_`, `rk_`, `pk_` + `live_` or `test_`) | `sk_test_` (or `rk_`/`pk_` kept) + `mock` + random `[A-Za-z0-9]` to total same length |
| `whsec_…` | `whsec_mock` + random alnum same length |
| AWS access key id | `AKIA`/`ASIA` prefix kept + `MOCK` + random `[A-Z2-7]` to 20 chars |
| AWS secret key (40) | random `[A-Za-z0-9/+]` × 40 |
| GitHub `ghp_…`, `github_pat_…` | same prefix + random alnum (`_` allowed for fine-grained) same length |
| OpenAI `sk-…`, `sk-proj-…` | same prefix + random `[A-Za-z0-9_-]` same length |
| Anthropic `sk-ant-api03-…` | same prefix + random `[A-Za-z0-9_-]` same length |
| Google `AIza…` | `AIza` + random `[A-Za-z0-9_-]` × 35 |
| Slack `xox?-…` | same prefix; each dash-separated segment replaced with random of same class/length |
| JWT | fixed mock header (`{"alg":"HS256","typ":"JWT"}`), payload `{"sub":"mock-user","mock":true}` base64url, random signature same length |
| PEM private key | identical BEGIN/END labels; body = random base64, same line count and 64-char line width, last line same length |
| DB URL | parse `scheme://user:pass@host:port/db?query`; keep scheme, port, query keys; replace user → `user_<rand6>`, password → random shape-preserving (min 10), host → `host-<rand6>.mock.internal` (if the host is an IPv4 literal, use the IPv4 generator instead), db name → `db_<rand4>`; register **each component** as its own reverse entry |
| Generic secret value | `shapeMock(value)`: digits→digits, upper→upper, lower→lower, other chars preserved |
| Email | local → `user_<rand6>`; domain → consistent per real domain: `corp-<rand4>.example.com` (public webmail domains kept) |
| IPv4 | private range stays private (random inside same RFC1918 block); public → TEST-NET-1/2/3 (`192.0.2.x`, `198.51.100.x`, `203.0.113.x`), on exhaustion `240.x.x.x` |
| Internal host | random label + preserved suffix (`.internal`, `.corp`, `.local`) |
| Dictionary term | `Entity_<A…Z, AA…>_<rand3 lowercase alnum>` e.g. `Entity_A_x9k` (category prefixes optional: `Client_`, `Project_`, `Person_`); ALL-CAPS matches produce uppercase mocks |

**Shape rule:** a mock must match the same detector rule as the real type (so downstream code/regex/type checks behave) except for deliberately safe substitutions (`live`→`test`).

### 6.4 `Vault`
```js
class Vault {
  #fwd = new Map();      // `${type}\u0000${normalizedReal}` -> mock
  #rev = new Map();      // mock.toLowerCase() -> { real, type }
  #prefixes = new Set(); // every proper prefix (len>=1) of every mock, lowercased
  #version = 0;
  getOrCreate(detection, generator)  // returns mock; registers both maps + prefixes
  hasMock(str)                        // exact, case-insensitive
  rehydrateText(str)                  // replace all complete mocks (compiled regex cached by #version)
  longestMockPrefixSuffix(str, minStart=0) // hold-back length (see §8)
  stats() -> {size, byType}           // no values
  clear()
}
```
Limits: `VAULT_MAX_ENTRIES = 10_000`; exceeding → block with `E_VAULT_FULL`. Invariants: no mock is a prefix or suffix of another; reverse keys unique.
Lifetime: created when `inject.js` loads; dies with the JS heap (reload/close). SPA navigation between chats **keeps** it.

### 6.5 `sanitizeText(text, ctx) → {text, replacements}`
1. `detections = detect(text)`.
2. Iterate right-to-left; for each: `mock = vault.getOrCreate(d)`; splice into text.
3. `replacements[]` = `{type, ruleId, count, latencyMs}` aggregated — **no values**.
`sanitizeJsonBody(json, adapter, ctx)`:
- `slots = adapter.getRequestSlots(json)`; if none found where the adapter expects them → **deep-walk fallback** (all string leaves except keys matching `/^(id|.*_id|model|role|type|timezone|locale|version|action|status)$/i`) + emit `W_ADAPTER_UNKNOWN_SHAPE`.
- Sanitise each slot string; write back.
- **Leak assertion** (`assertNoLeak(serializedBody, realValues)`): for each real value from this request, fail with `E_LEAK_ASSERT` if the serialised body contains it raw **or** JSON-escaped (`JSON.stringify(v).slice(1,-1)`).
- **Convergence pass:** run `detect()` over all slot strings of the *final* body; any remaining non-mock detection → sanitise once more; if still present → `E_LEAK_ASSERT`.

### 6.6 SSE (`core/sse.js`)
`SseParser.push(str) → SseEvent[]` handles `\n`, `\r\n`, `\r` line endings; events end at a blank line; multi-line `data:` joined with `\n`; `event:`, `id:`, `retry:` fields; comment lines (`:`) passed through; incomplete trailing event retained. `serializeSse(evt)` reproduces the event. Events the handler doesn't modify are re-serialised from their **original raw text** to stay byte-faithful.

### 6.7 Re-hydration (`core/rehydrate.js`)
See §8 for the split-token algorithm. `createJsonDeltaHandler({locate})` gives adapters a ready-made stream handler:
```js
// locate(jsonEvent) -> Array<{ key, mode: 'delta'|'cumulative', get(), set(v) }>
// 'delta'      : each event carries only new text  -> StreamRehydrator per key (hold-back)
// 'cumulative' : each event carries full text so far -> vault.rehydrateText(get()) (no hold-back needed)
// Returns { onEvent(evt) -> SseEvent[], onEnd() -> SseEvent[] }
// onEnd flushes each held tail using adapter.makeFlushEvent(key, text) inserted BEFORE the terminal event.
```

---

## 7. Interception details (`main-world/fetch-patch.js`)

```js
const _fetch = window.fetch;                       // captured at document_start
const _Response = Response, _Headers = Headers, _TransformStream = TransformStream;
const _JSON = { parse: JSON.parse, stringify: JSON.stringify };

window.fetch = function fetch(input, init) {
  const adapter = adapters.match(input, init);     // URL+method test only — cheap
  if (!adapter) return _fetch.call(window, input, init);   // FAST PATH, zero overhead for all other requests
  return handlePromptRequest(adapter, input, init);
};
// make it look native
Object.defineProperty(window.fetch, 'toString', { value: () => 'function fetch() { [native code] }' });

async function handlePromptRequest(adapter, input, init) {
  const cfg = await runtime.getConfig(2000);                 // E_CONFIG_TIMEOUT
  if (!cfg.enabled || !cfg.sites[adapter.id] || runtime.paused) return _fetch.call(window, input, init);
  let next;
  try {
    const { bodyText, rebuild } = await extractBody(input, init);   // string | Request | Blob | ArrayBuffer; others -> E_UNSUPPORTED_BODY
    const json = _JSON.parse(bodyText);                              // E_PARSE_BODY
    const out = sanitizeJsonBody(json, adapter, { vault, cfg });     // leak assertion inside
    next = rebuild(_JSON.stringify(out.json));                       // drops stale Content-Length
    runtime.report({ type: 'TRANSFORM_SUMMARY', counts: out.counts, latencyMs: out.latencyMs });
  } catch (err) {
    runtime.reportError(err);                                        // metadata only
    if (cfg.failMode === 'open') return _fetch.call(window, input, init);
    throw new TypeError(`SanitAIze blocked this request (${err.code ?? 'E_TRANSFORM_FAIL'})`);
  }
  const resp = await _fetch.call(window, next.input, next.init);
  return adapter.matchResponse(resp) ? wrapResponse(resp, adapter) : resp;
}
```
`wrapResponse`:
```js
function wrapResponse(resp, adapter) {
  if (!resp.body) return resp;
  const ct = resp.headers.get('content-type') || '';
  if (!ct.includes('text/event-stream')) return rehydrateJsonResponse(resp);   // FR-R2
  const handler = adapter.createStreamHandler(vault);
  const dec = new TextDecoder(), enc = new TextEncoder(), parser = new SseParser();
  const ts = new TransformStream({
    transform(chunk, ctrl) {
      try {
        for (const evt of parser.push(dec.decode(chunk, { stream: true })))
          for (const out of handler.onEvent(evt)) ctrl.enqueue(enc.encode(serializeSse(out)));
      } catch { ctrl.enqueue(chunk); }              // inbound: fail open
    },
    flush(ctrl) {
      try { for (const e of parser.end()) for (const o of handler.onEvent(e)) ctrl.enqueue(enc.encode(serializeSse(o)));
            for (const o of handler.onEnd()) ctrl.enqueue(enc.encode(serializeSse(o))); } catch {}
    }
  });
  const out = new Response(resp.body.pipeThrough(ts), { status: resp.status, statusText: resp.statusText, headers: resp.headers });
  for (const k of ['url', 'redirected', 'type']) Object.defineProperty(out, k, { value: resp[k] });
  return out;
}
```
Notes: `AbortController` cancellation propagates through `pipeThrough`. If `input` is a `Request`, clone before reading the body and rebuild with `new Request(input, { body })`. `XMLHttpRequest`: P1; patch `open`/`send` for matched URLs, sanitise string bodies in `send`; best-effort `responseText` getter for progressive text.

**Re-assert patch:** on `visibilitychange`, if `window.fetch` was replaced by something that doesn't wrap ours, re-wrap once and emit `W_PATCH_REPLACED`.

**Adapters (interface in `05_Backend_Schema.md` §7).** Expected shapes — **verify in Phase 0 with HAR captures; fixtures beat this table**:

| Site | Prompt request | Text slots | Stream |
|------|----------------|-----------|--------|
| ChatGPT | `POST /backend-api/conversation` and/or `/backend-api/f/conversation` (path has changed before) | `messages[*].content.parts[*]` (strings only) | SSE; either cumulative message snapshots or JSON-patch style deltas (`{"p": "...", "o": "append", "v": "text"}`, shorthand `{"v": "text"}`, batched `{"v":[…]}`); ends with `data: [DONE]` |
| Claude | `POST /api/organizations/{org}/chat_conversations/{id}/completion` (or `/retry_completion`) | `prompt`; also `attachments[*].extracted_content` for large pasted text; verify `files`/`parent_message_uuid` metadata untouched | SSE with `completion` deltas (`data.completion`) or Messages-style `content_block_delta` (`delta.text`); terminal `message_stop` |

---

## 8. Split-token re-hydration algorithm (critical)

LLM tokenisation can split a mock across events (`"sk_te"` + `"st_mock8f9a…"`). Naive per-event replacement fails. Line-buffering SSE (§6.6) fixes *transport* splits only; **content** splits need hold-back:

```js
class StreamRehydrator {
  pending = '';                                    // raw (un-replaced) text not yet emitted
  push(delta) {
    const buf = this.pending + delta;
    const matches = vault.findMockMatches(buf);    // complete mocks, case-insensitive: [{start,end}]
    const floor = matches.length ? matches.at(-1).end : 0;
    // longest suffix of buf that is a *proper prefix* of some mock, starting at or after `floor`
    const hold = vault.longestMockPrefixSuffix(buf, floor);
    const head = buf.slice(0, buf.length - hold);
    this.pending = buf.slice(buf.length - hold);
    return vault.rehydrateText(head);              // all matches lie inside head
  }
  flush() { const out = vault.rehydrateText(this.pending); this.pending = ''; return out; }
}
```
Invariants: never split a *completed* mock (hence `floor`); hold-back ≤ (longest mock length − 1); `flush()` **must** run on the terminal event and on stream close, or trailing characters vanish. When an event's delta becomes empty because everything is held back, still emit the event with an empty string (dropping events can break sequence counters). Tests: split a response containing every mock type at **every** byte offset and across 2-, 3-way splits; assert output equals the fully-rehydrated string and that no chars are lost at end.

---

## 9. Security & threat model

| Threat | Mitigation |
|--------|-----------|
| Real values leaked to provider | Interception at fetch; leak assertion; convergence pass; fail-closed; deep-walk fallback |
| Real values leaked to the page's own scripts via our messaging | Only counts/types/masked previews/mock values/hashes cross `postMessage`; lint + review checklist; dictionary exception documented (§3.3) |
| Real values persisted | No storage of vault; dictionary in `storage.local` only; audit log has no values; debug logger refuses values |
| Page tampers with built-ins (`Map`, `JSON`, `fetch`) | Capture built-ins at `document_start` before page scripts run; use captured references only |
| Page detects/removes patch | Native-looking `toString`; re-assert on `visibilitychange`; if patch lost → badge shows "Not protecting" |
| Fetch from Worker/iframe/WebSocket bypasses patch | Phase 0 discovery; `W_UNPATCHED_CHANNEL`; roadmap |
| Extension supply-chain | Zero runtime deps; lockfile; `npm audit` for dev deps; reproducible build |
| XSS via our UI | Shadow DOM; `textContent` only; no `innerHTML`; CSP on extension pages |
| Malicious dictionary/import file | Schema-validate, length-cap, escape before regex compile |
| ReDoS | Linear regex rule; fuzz gate |
| Mock reveals structure (length/prefix) | Accepted; documented |
| Privilege | `storage` only; no host permissions |

Compliance notes: no personal data processed off-device; no third-party processors; no cookies; describe as *supporting* GDPR/DPDP/SOC2 data-minimisation controls, not "certified".

---

## 10. Performance budgets (measured by `test/bench`)

| Path | Budget |
|------|--------|
| Preview scan (content script) | p95 ≤ 20 ms for ≤ 10 KB; > 200 KB text: skip preview, show "Too large to preview — still protected on send" |
| Debounce | 150 ms; scan inside `requestIdleCallback` (fallback `setTimeout 0`) |
| Outbound transform | p95 ≤ 50 ms for ≤ 100 KB body |
| Non-target `fetch` overhead | < 0.05 ms (URL match only) |
| Stream event handling | median ≤ 5 ms/event |
| Memory | Vault ≤ 5 MB typical; hard cap 10,000 entries |
| Bundle | ≤ 300 KB total |

---

## 11. Test strategy

| Layer | What | Tooling |
|-------|------|---------|
| Unit (`src/core`) | Each rule with positive/negative fixtures; generators (shape, uniqueness, min entropy); vault invariants; sanitise idempotence; round-trip property test `rehydrate(sanitise(x)) === x` on random inputs; SSE parser edge cases; split-token fuzz | Vitest |
| ReDoS | Adversarial inputs per rule | Vitest + timing |
| Adapter | Recorded ChatGPT/Claude request & stream fixtures → assert slots found, stream rehydrated | Vitest |
| E2E | Load unpacked extension in Chromium; local mock servers emulate both sites (request recorder + SSE that splits mocks); scenarios in `03_App_Flow.md` §8 | Playwright |
| Fault injection | Config timeout, malformed body, vault full, stream parse error, unknown shape | Playwright/Vitest |
| Static gates | lint rules, `verify:no-network`, bundle size, `tsc` | CI |
| Manual | DevTools Network verification script; run against real sites before each release (not in CI) | Checklist in Implementation Plan |

Fixtures rule: never commit literal secret-shaped strings; use `test/helpers/fake-secrets.js` (`fakeStripeKey()`, `fakeAwsKeyId()`, … concatenated at runtime).

---

## 12. Build, packaging, compliance

- `npm run build` → `dist/` (load unpacked). `npm run zip` → `sanitaize-vX.Y.Z.zip` for the Web Store.
- Chrome Web Store: single-purpose statement ("sanitise sensitive data in prompts to AI chat sites"); permission justification (`storage` for settings/dictionary; content scripts for the two sites); privacy policy stating no data collection; no remote code; screenshots from the demo.
- Enterprise: `ExtensionInstallForcelist` + managed storage JSON validated against `managed_schema.json`.
- Versioning: semver; `schemaVersion` fields with migrations in `shared/storage.js`.

---

## 13. Engineering guardrails (for the AI agent)

**Always:** capture built-ins early · keep `src/core` pure · isolate site knowledge in adapters · write tests before core code · mask values in every UI/log path (`mask.js`) · treat inbound errors as non-fatal · keep UI failures from touching the host page.
**Never:** send real values across `postMessage`/runtime messaging · use `storage.sync` · add runtime dependencies · add our own network calls · use `Math.random` for mocks · use `innerHTML` · hard-code endpoint paths outside adapters · commit realistic secrets.

---

## 14. Technical unknowns to resolve in Phase 0 (spike)

1. Exact current request URL/body and SSE shapes for ChatGPT and Claude (capture HAR → fixtures).
2. Whether prompt submission ever happens in a Worker, iframe, or over WebSocket.
3. Composer DOM: current selectors and how text is exposed (ProseMirror contenteditable) for both sites.
4. Whether either site re-sends full history with mocks/reals on regenerate/edit.
5. Whether `world: "MAIN"` scripts at `document_start` reliably run before the site's first `fetch` (expected yes).
6. Whether the sites' own scripts wrap `fetch` later (Sentry/Datadog) and how that interacts with our wrapper.
Record findings in `docs/phase0-findings.md`; update adapters and this TRD if they differ.
