# 05 — Backend Schema Document (local data contracts)

## 0. There is no backend — by design

SanitAIze has **no server, no database, no API, no accounts, no telemetry**. That is the product's core promise (deck: "zero middleman infrastructure"). So this document defines the *backend equivalent*: every place data lives, every schema, every message that crosses a boundary, the detection-rule catalog, and the adapter contract.

If a future version adds a server (e.g., an opt-in metadata dashboard), it is a separate document; nothing in the MVP may call out to it.

---

## 1. Data stores and classification

| Store | Location | Lifetime | Contains | Sensitivity | Who can read |
|-------|----------|----------|----------|-------------|--------------|
| **Vault** | JS closure in `inject.js` (page main world heap) | Until reload/tab close | real ↔ mock maps | **Highest** (real secrets) | Only `inject.js` code |
| Ignore set | Same closure | Same | value hashes | Low | `inject.js` |
| Composer text | Site DOM | Site-controlled | what the user typed | High | Page + `content.js` (already the case without us) |
| Runtime state (paused, last request summary, per-tab counts) | `content.js` memory | Until reload | counts, types, timings | Low | `content.js`, popup via messaging |
| `settings` | `chrome.storage.local` | Persistent | preferences | Low | Extension only |
| `dictionary` | `chrome.storage.local` | Persistent | client/codenames | **Medium** (intentionally persisted) | Extension only. **Never `storage.sync`** |
| `audit` | `chrome.storage.local` | Rolling 500 | metadata only | Low | Extension only |
| `meta` | `chrome.storage.local` | Persistent | versions, flags | Low | Extension only |
| Managed policy | `chrome.storage.managed` | Set by admin | forced settings, dictionary | Medium | Extension (read-only) |

**Hard rules:** vault contents never written to any storage or sent through any message; masked previews are computed by `content.js` from the composer text, not sent from `inject.js`.

---

## 2. In-memory schemas (JSDoc; place in `src/core/types.js`)

```js
/** @typedef {'STRIPE_KEY'|'STRIPE_WEBHOOK'|'AWS_ACCESS_KEY_ID'|'AWS_SECRET_KEY'|'GITHUB_TOKEN'|'OPENAI_KEY'|'ANTHROPIC_KEY'
 *  |'GOOGLE_API_KEY'|'SLACK_TOKEN'|'JWT'|'PEM_PRIVATE_KEY'|'DB_URL'|'GENERIC_SECRET'|'EMAIL'|'IPV4'|'INTERNAL_HOST'|'DICTIONARY'} DetectionType */

/** @typedef {Object} Detection
 *  @property {string} id            // `${ruleId}:${start}`
 *  @property {DetectionType} type
 *  @property {string} ruleId
 *  @property {number} start         // UTF-16 index in the scanned string (inclusive)
 *  @property {number} end           // exclusive
 *  @property {string} value         // REAL value. Must never leave the current world.
 *  @property {Object<string,[number,number]>=} groups // named component spans (e.g. DB_URL user/pass/host)
 *  @property {number} confidence    // 0..1
 *  @property {string=} category     // dictionary category
 */

/** @typedef {Object} VaultEntry     // one per (type, normalized real)
 *  @property {DetectionType} type
 *  @property {string} real
 *  @property {string} mock
 *  @property {number} createdAt     // ms since epoch (in memory only)
 *  @property {number} uses
 */

/** @typedef {Object} Replacement    // safe to emit (no real value)
 *  @property {DetectionType} type
 *  @property {string} ruleId
 *  @property {string} mock
 *  @property {string} valueHash     // first 16 hex of SHA-256(type + "\u0000" + real)
 */

/** @typedef {Object} SanitizeResult
 *  @property {string} text
 *  @property {Replacement[]} replacements
 *  @property {Object<string,number>} counts     // by DetectionType
 *  @property {number} latencyMs
 */
```

Vault key normalisation: `type + '\u0000' + normalize(real)`, where `normalize` = trim; lowercase for `EMAIL`, `INTERNAL_HOST`, `DICTIONARY`; exact for keys/secrets/URLs.
Reverse key: `mock.toLowerCase()`. Invariants: no mock is a prefix or suffix of another; `#prefixes` contains every proper prefix (lowercased, length ≥ 1) of every mock; `#version` increments on every insert/clear (invalidates the compiled reverse regex).

---

## 3. `chrome.storage.local` schemas

### 3.1 `settings`
```json
{
  "schemaVersion": 1,
  "enabled": true,
  "sites": { "chatgpt": true, "claude": true },
  "failMode": "closed",
  "sensitivity": "balanced",
  "detectors": {
    "apiKeys": true, "privateKeys": true, "dbUrls": true, "genericSecrets": true,
    "emails": true, "ipAddresses": true, "hostNames": true, "dictionary": true
  },
  "ui": { "badge": true, "toasts": true },
  "idleClearMinutes": 0,
  "audit": { "enabled": false },
  "debug": false
}
```
Constraints: `failMode` ∈ `closed|open`; `sensitivity` ∈ `relaxed|balanced|strict`; `idleClearMinutes` ∈ {0,30,60}. Unknown keys dropped on read; missing keys filled from defaults.

### 3.2 `dictionary`
```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "id": "d_01H…",               // crypto.randomUUID()
      "term": "Acme Capital",       // 2..120 chars
      "aliases": ["Acme", "ACME Cap"], // ≤ 10, each 2..120
      "category": "client",         // client | project | person | product | host | other
      "caseSensitive": false,
      "enabled": true,
      "createdAt": 1758700000000
    }
  ]
}
```
Import formats: JSON (same shape) or CSV with header `term,aliases,category,caseSensitive` (aliases separated by `;`). Validation: max 2,000 entries, max 500 KB file, strip control chars, dedupe by lowercase term, reject terms that look like credentials (matches any provider-key rule) with a message.

### 3.3 `audit` (only when `settings.audit.enabled`)
```json
[{ "ts": 1758700000000, "site": "chatgpt", "action": "transform", "counts": { "STRIPE_KEY": 1, "DICTIONARY": 2 }, "latencyMs": 6, "v": "0.1.0" }]
```
`action` ∈ `transform | block | error | warning`; `code` (optional, e.g., `E_LEAK_ASSERT`). **No values, no mocks, no URLs, no prompt text.** Ring buffer of 500.

### 3.4 `meta`
```json
{ "schemaVersion": 1, "onboarded": false, "installedAt": 1758700000000, "lastVersion": "0.1.0" }
```

### 3.5 Effective config (computed, in memory; pushed to `inject.js`)
```js
/** @typedef {Object} EffectiveConfig
 *  @property {boolean} enabled
 *  @property {{chatgpt:boolean, claude:boolean}} sites
 *  @property {'closed'|'open'} failMode
 *  @property {'relaxed'|'balanced'|'strict'} sensitivity
 *  @property {Object<string,boolean>} detectors
 *  @property {DictionaryEntry[]} dictionary       // enabled entries (managed + local)
 *  @property {{badge:boolean,toasts:boolean}} ui
 *  @property {number} idleClearMinutes
 *  @property {boolean} allowPause
 *  @property {string[]} lockedKeys                // settings the user cannot change
 *  @property {boolean} debug
 */
```
Merge order: defaults → local → managed (managed wins on any key it defines; those keys are added to `lockedKeys` when `lockSettings:true`).

---

## 4. Managed policy schema (`src/managed_schema.json`)

```json
{
  "type": "object",
  "properties": {
    "enabled":       { "type": "boolean", "title": "Force SanitAIze on" },
    "failMode":      { "type": "string", "enum": ["closed", "open"] },
    "sensitivity":   { "type": "string", "enum": ["relaxed", "balanced", "strict"] },
    "sites":         { "type": "object", "properties": { "chatgpt": { "type": "boolean" }, "claude": { "type": "boolean" } } },
    "allowPause":    { "type": "boolean", "title": "Let users pause protection" },
    "lockSettings":  { "type": "boolean", "title": "Prevent users from changing managed settings" },
    "audit":         { "type": "object", "properties": { "enabled": { "type": "boolean" } } },
    "dictionary": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "term": { "type": "string" },
          "aliases": { "type": "array", "items": { "type": "string" } },
          "category": { "type": "string" },
          "caseSensitive": { "type": "boolean" }
        }
      }
    }
  }
}
```

---

## 5. Message protocols

### 5.1 Page-world bridge (`window.postMessage`, MAIN ⇄ ISOLATED)
Envelope:
```js
{ source: 'sanitaize', v: 1, channel: '<uuid generated by inject.js per page load>', dir: 'to-main' | 'to-content', type: '<TYPE>', id: '<uuid>', payload: { … } }
```
Receiver checks: `event.source === window`, `data.source === 'sanitaize'`, `data.v === 1`, `data.channel === knownChannel` (except HELLO), `dir` matches. **Spoof-resistance is not a goal** (the page can read these messages); **confidentiality is achieved by never sending real values.**

Handshake (order-independent): `inject.js` posts `HELLO {channel, version, adapterId}` on load; `content.js` posts `HELLO_REQUEST` on load; whichever arrives, `inject.js` replies/re-posts `HELLO`; `content.js` then sends `CONFIG_PUSH`.

| Type | Direction | Payload | Notes |
|------|-----------|---------|-------|
| `HELLO_REQUEST` | content→main | `{}` | |
| `HELLO` | main→content | `{channel, version, adapterId}` | |
| `CONFIG_PUSH` | content→main | `{config: EffectiveConfig}` | Contains dictionary terms (see TRD §3.3 residual risk) |
| `READY` | main→content | `{adapterId}` | After config applied |
| `TRANSFORM_SUMMARY` | main→content | `{requestId, counts, latencyMs, items:[{type, valueHash, mock}]}` | No real values, no masked reals |
| `BLOCKED` | main→content | `{requestId, code}` | fail-closed event |
| `WARNING` | main→content | `{code}` | e.g., `W_ADAPTER_UNKNOWN_SHAPE`, `W_PATCH_REPLACED`, `W_UNPATCHED_CHANNEL` |
| `STREAM_STATUS` | main→content | `{requestId, state:'started'\|'done'\|'error'}` | |
| `PATCH_STATUS` | main→content | `{state:'ok'\|'lost'}` | |
| `VAULT_STATS` | main→content | `{size, byType}` | On change |
| `VAULT_CLEAR` | content→main | `{}` | From popup |
| `IGNORE_ADD` | content→main | `{type, valueHash}` | Hash only |
| `PAUSE_SET` | content→main | `{paused, untilMs?}` | |
| `PING`/`PONG` | both | `{}` | Health |

`content.js` builds the popover's "masked real → stand-in" list by matching `items[].valueHash` with hashes it computed from its own detections (same hash function, `core/mask.js` + `core/hash.js`).

### 5.2 Extension messaging (`chrome.runtime`/`chrome.tabs`)
| Type | From → To | Request | Response |
|------|-----------|---------|----------|
| `GET_EFFECTIVE_CONFIG` | content → SW | `{}` | `{ok, config}` |
| `CONFIG_CHANGED` | SW → content | `{}` (content re-fetches) | – |
| `SET_ACTION_BADGE` | content → SW | `{count}` | – (SW uses `sender.tab.id`) |
| `AUDIT_APPEND` | content → SW | `{entry}` (schema §3.3) | `{ok}` |
| `GET_TAB_STATE` | popup → content | `{}` | `{site, active, paused, locked, stats:{replaced, byType}, vaultSize, last:{count, latencyMs, ts}, patch:'ok'\|'lost'}` |
| `TOGGLE_SITE` | popup → SW | `{site, enabled}` | `{ok}` (writes `settings`) |
| `CLEAR_VAULT` | popup → content | `{}` | `{ok}` (forwards `VAULT_CLEAR`) |
| `PAUSE_TAB` | popup → content | `{ms}` | `{ok}` |
| `OPEN_OPTIONS` | popup → SW | `{tab}` | – |

Unsupported page: `sendMessage` fails with "Receiving end does not exist" → popup renders the unsupported state.

---

## 6. Detection rule catalog (`src/core/rules/catalog.js`)

All patterns are **linear-time** (bounded quantifiers, no nested repetition on overlapping classes). Use flag `d` where a value group is needed (`match.indices[valueGroup]`). `priority`: higher wins on overlap.

```js
export const RULES = [
  // ── Private keys ────────────────────────────────────────────────
  { id: 'pem-private-key', type: 'PEM_PRIVATE_KEY', priority: 100, generator: 'pem', enabledKey: 'privateKeys',
    regex: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----[\s\S]{16,8192}?-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g },
  { id: 'pem-private-key-partial', type: 'PEM_PRIVATE_KEY', priority: 98, generator: 'pem', enabledKey: 'privateKeys',
    regex: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[A-Za-z0-9+/=\s]{16,8192}/g },

  // ── Database URLs (validator parses components) ────────────────
  { id: 'db-url', type: 'DB_URL', priority: 95, generator: 'dburl', enabledKey: 'dbUrls', validate: 'dbUrl',
    regex: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqps?|mssql|sqlserver|clickhouse|cassandra):\/\/[^\s'"`<>)\]}]{3,2048}/g },

  // ── Provider keys ───────────────────────────────────────────────
  { id: 'anthropic-key', type: 'ANTHROPIC_KEY', priority: 92, generator: 'anthropic', enabledKey: 'apiKeys',
    regex: /\bsk-ant-[A-Za-z0-9_-]{20,200}(?![A-Za-z0-9_-])/g },
  { id: 'openai-key', type: 'OPENAI_KEY', priority: 90, generator: 'openai', enabledKey: 'apiKeys', validate: 'openaiShape',
    regex: /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,200}(?![A-Za-z0-9_-])/g },
  { id: 'stripe-secret', type: 'STRIPE_KEY', priority: 90, generator: 'stripe', enabledKey: 'apiKeys',
    regex: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,128}\b/g },
  { id: 'stripe-publishable', type: 'STRIPE_KEY', priority: 60, generator: 'stripe', enabledKey: 'apiKeys', minSensitivity: 'strict',
    regex: /\bpk_(?:live|test)_[A-Za-z0-9]{16,128}\b/g },
  { id: 'stripe-webhook', type: 'STRIPE_WEBHOOK', priority: 90, generator: 'stripe', enabledKey: 'apiKeys',
    regex: /\bwhsec_[A-Za-z0-9]{16,128}\b/g },
  { id: 'aws-access-key-id', type: 'AWS_ACCESS_KEY_ID', priority: 90, generator: 'aws-akid', enabledKey: 'apiKeys',
    regex: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[A-Z0-9]{16}\b/g },
  { id: 'aws-secret-key', type: 'AWS_SECRET_KEY', priority: 91, generator: 'aws-secret', enabledKey: 'apiKeys', valueGroup: 1,
    regex: /(?<![A-Za-z0-9])(?:aws[_-]?)?secret[_-]?(?:access[_-]?)?key["']?\s{0,3}[:=]\s{0,3}["']?([A-Za-z0-9\/+=]{40})(?![A-Za-z0-9\/+=])/gid },
  { id: 'github-token', type: 'GITHUB_TOKEN', priority: 90, generator: 'github', enabledKey: 'apiKeys',
    regex: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g },
  { id: 'github-fine-grained', type: 'GITHUB_TOKEN', priority: 90, generator: 'github', enabledKey: 'apiKeys',
    regex: /\bgithub_pat_[A-Za-z0-9_]{22,255}\b/g },
  { id: 'google-api-key', type: 'GOOGLE_API_KEY', priority: 90, generator: 'google', enabledKey: 'apiKeys',
    regex: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g },
  { id: 'slack-token', type: 'SLACK_TOKEN', priority: 90, generator: 'slack', enabledKey: 'apiKeys',
    regex: /\bxox[abprs]-[A-Za-z0-9-]{10,72}(?![A-Za-z0-9-])/g },
  { id: 'jwt', type: 'JWT', priority: 85, generator: 'jwt', enabledKey: 'apiKeys',
    regex: /\beyJ[A-Za-z0-9_-]{8,2048}\.eyJ[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,2048}(?![A-Za-z0-9_-])/g },

  // ── Generic assignments: name = "value" ─────────────────────────
  { id: 'generic-secret-assignment', type: 'GENERIC_SECRET', priority: 50, generator: 'shape', enabledKey: 'genericSecrets',
    validate: 'genericSecret', valueGroup: 3,
    regex: /(?<![A-Za-z0-9])([A-Za-z0-9_.-]{0,40}(?:secret|passw(?:or)?d|pwd|token|api[_-]?key|apikey|auth[_-]?key|access[_-]?key|private[_-]?key|credential)s?[A-Za-z0-9_.-]{0,20})["']?\s{0,3}(?::=|=>|[:=])\s{0,3}(["'`]?)([^\s"'`,;)}\]]{8,200})\2/gid },

  // ── PII / infrastructure ────────────────────────────────────────
  { id: 'email', type: 'EMAIL', priority: 40, generator: 'email', enabledKey: 'emails', validate: 'email',
    regex: /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}(?![A-Za-z0-9-])/g },
  { id: 'internal-host', type: 'INTERNAL_HOST', priority: 35, generator: 'host', enabledKey: 'hostNames',
    regex: /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?){0,6}\.(?:internal|corp|intranet|lan|local|private)\b/gi },
  { id: 'ipv4', type: 'IPV4', priority: 20, generator: 'ipv4', enabledKey: 'ipAddresses', validate: 'ipv4',
    regex: /(?<![\w.-])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?!\d|\.\d)/g },
  // Dictionary rule is compiled at runtime from settings (see TRD §6.2): type 'DICTIONARY', priority 30, generator 'entity'
];
```

### 6.1 Validators (`src/core/rules/validators.js`)
| Name | Accept when |
|------|-------------|
| `dbUrl` | Parses into scheme/user/password/host/port/db; accept if a password is present **or** host is not `localhost`/`127.0.0.1`/`::1`/`db`/`postgres`/`redis`/`mysql` (strict: accept all) |
| `openaiShape` | For plain `sk-` keys (no `proj-`/`svcacct-`/`admin-`): contains a digit **and** entropy ≥ 3.5 bits/char (avoids kebab-case identifiers) |
| `genericSecret` | Value length ≥ 8; not a placeholder/code reference (below); entropy ≥ 3.5/3.0/2.5 (relaxed/balanced/strict) **or** (mixed letters+digits and length ≥ 12); not all one repeated char |
| `email` | Domain not in `example.com/org/net`, `test`, `invalid`, `localhost`; not already a mock (vault) |
| `ipv4` | Not `0.0.0.0`, `127.*`, `255.255.255.255`, `169.254.*`; balanced mode: private ranges + public non-documentation IPs; not preceded by "v"/"version" within 8 chars |

Placeholder/code-reference reject list for generic secrets: contains `(`, `)`, `${`, `{{`, `<`, `>`, `process.env`, `os.environ`, `getenv`, `config.`, `settings.`, `secrets.`; starts with `$`, `%`; matches `/^(x{4,}|\*{4,}|\.{3,}|your[_-]?.*|changeme|change[_-]?me|example|placeholder|password|secret|token|null|undefined|none|true|false)$/i`.

### 6.2 Generator contract
```js
/** @typedef {Object} Generator
 *  @property {string} id
 *  @property {(d: Detection, ctx: {rand: RandomSource, vault: Vault, sourceText: string}) => {mock: string, components?: Array<{real:string, mock:string, type:DetectionType}>}} generate
 */
```
Composite generators (`dburl`, `email`) return `components` so each piece gets its own reverse entry. Shape rules: see `02_TRD.md` §6.3. Required tests per generator: same length as real (except min-length policy), same charset class per position, mock ≠ real, matches the same rule's regex, ≥ 40 bits of randomness where length allows, never equals or is a prefix/suffix of an existing mock.

### 6.3 Sensitivity matrix
| Setting | Effect |
|---------|--------|
| relaxed | Provider keys, PEM, JWT, DB URLs with passwords, dictionary; generic secrets need entropy ≥ 3.5; no `pk_` keys; emails and IPs off unless toggled |
| balanced (default) | Everything in the catalog with the validators above |
| strict | Also `pk_` keys, generic entropy ≥ 2.5, DB URLs without credentials, all IPv4 except loopback |

P2 candidates (do not build now): credit-card numbers (Luhn), phone numbers, AWS account IDs, IPv6, high-entropy tokens with no key name, person-name NER.

---

## 7. Adapter contract (`src/main-world/adapters/*`)

```js
/** @typedef {{path: string, get: () => string, set: (v: string) => void}} Slot */
/** @typedef {{event?: string, data: string, id?: string, retry?: number, raw: string}} SseEvent */
/** @typedef {{onEvent: (evt: SseEvent) => SseEvent[], onEnd: () => SseEvent[]}} StreamHandler */

/** @typedef {Object} SiteAdapter
 *  @property {string} id                              // 'chatgpt' | 'claude' | 'local-dev-chatgpt' | 'local-dev-claude'
 *  @property {(hostname: string) => boolean} matchesHost
 *  @property {(input: RequestInfo|URL, init?: RequestInit) => boolean} matchRequest   // URL+method only; cheap
 *  @property {string[]} expectedSlotPaths             // e.g. ['messages[*].content.parts[*]']; if getRequestSlots returns 0 slots -> deep-walk fallback + W_ADAPTER_UNKNOWN_SHAPE
 *  @property {(json: any) => Slot[]} getRequestSlots
 *  @property {(resp: Response) => boolean} matchResponse
 *  @property {(vault: Vault) => StreamHandler} createStreamHandler   // usually createJsonDeltaHandler({locate})
 *  @property {(key: string, text: string) => SseEvent} makeFlushEvent // synthetic delta event that appends `text` to slot `key`
 *  @property {(evt: SseEvent) => boolean} isTerminalEvent            // '[DONE]' / 'message_stop'
 *  @property {string[]} composerSelectors             // ordered fallbacks; last resort: focused [contenteditable=true]/textarea
 *  @property {(el: Element) => Element} composerContainer
 *  @property {(el: Element) => string} readComposerText
 */
```
Adapter rules:
- `matchRequest` never reads the body.
- Each adapter ships fixtures in `test/fixtures/<id>/`: `request.json` (recorded body with fake secrets), `stream-delta.sse` (recorded/synthesised), `stream-cumulative.sse` (if the site has both shapes), `renamed-fields.json` (fallback test), `expectations.json` (slots found, expected sanitised output).
- A shared **conformance test** (`test/unit/adapter-conformance.test.js`) runs every adapter through: slots found → sanitised → no real values in serialised body → stream re-hydrated at every split offset → flush event correct → terminal event order.
- `local-dev` adapters emulate both sites for E2E (dev build only).
- Expected shapes are documented in `02_TRD.md` §7 but **Phase 0 recordings override them**.

---

## 8. Constants, limits, error and warning codes

```js
export const LIMITS = {
  CONFIG_TIMEOUT_MS: 2000, DEBOUNCE_MS: 150, TOAST_MS: 4000, PAUSE_MS: 900_000,
  MAX_SCAN_CHARS: 2_000_000, PREVIEW_MAX_CHARS: 200_000,
  VAULT_MAX_ENTRIES: 10_000, DICT_MAX_ENTRIES: 2_000, AUDIT_MAX_ENTRIES: 500,
  MOCK_MIN_LEN: 8, MOCK_RETRIES: 8, DICT_TERM_MIN: 2, DICT_TERM_MAX: 120,
};
```

| Code | Meaning | Layer | Behaviour |
|------|---------|-------|-----------|
| `E_CONFIG_TIMEOUT` | Config not received in 2 s | main | Block (fail-closed) |
| `E_PARSE_BODY` | Body not valid JSON | main | Block |
| `E_UNSUPPORTED_BODY` | FormData/stream/unknown | main | Block |
| `E_INPUT_TOO_LARGE` | > `MAX_SCAN_CHARS` | core | Block |
| `E_LEAK_ASSERT` | Real value present after sanitising | core | Block |
| `E_VAULT_FULL` | > `VAULT_MAX_ENTRIES` | core | Block |
| `E_MOCK_COLLISION` | Could not generate a unique mock | core | Block |
| `E_TRANSFORM_FAIL` | Any other outbound exception | main | Block |
| `W_ADAPTER_UNKNOWN_SHAPE` | Expected slots missing; deep-walk used | main | Continue + warn |
| `W_NO_MATCH_AFTER_SEND` | Composer submitted, no matched request | content | Warn (canary) |
| `W_PATCH_REPLACED` | `window.fetch` replaced by page | main | Re-wrap + warn |
| `W_PATCH_LOST` | Could not re-wrap | main | Badge "Not protecting" |
| `W_UNPATCHED_CHANNEL` | Send observed via Worker/WebSocket | main | Warn |
| `W_STREAM_PARSE` | Inbound event unparsable | main | Pass through (fail-open) |

Errors are objects `{name:'SanitaizeError', code, message}` where `message` never contains input text.

---

## 9. Versioning and migrations

- Every persisted object has `schemaVersion`. `shared/storage.js` exposes `load()` which validates, fills defaults, drops unknown keys, and runs `migrate(fromVersion)` steps sequentially.
- Bump `schemaVersion` only with a migration and a test.
- Export files (dictionary) include `schemaVersion`; import rejects newer versions with a clear message.

---

## 10. Future (out of scope): optional server

If ever built (opt-in metadata dashboard): accept only the audit entry shape in §3.3 (counts, types, timestamps), authenticated per organisation, never any values or mocks. Not part of the MVP and must not change client behaviour when absent.
