# 06 — Implementation Plan

How to build SanitAIze with an AI coding agent without guessing. Phases are ordered to **kill the biggest risks first** (does the interception work on the real sites? do split tokens re-hydrate?) and to have a demo-able vertical slice as early as possible.

Effort = focused hours with an AI agent doing most of the typing (solo developer, assumption A1).

---

## 1. Overview

### 1.1 Phase map

| Phase | Goal | Est. | Ships |
|-------|------|------|-------|
| **0** | Scaffold + discovery spike (real request/stream shapes) | 3–4 h | Loadable empty extension, fixtures, `phase0-findings.md` |
| **1** | Pure core engine with tests | 10–12 h | detect, generators, vault, sanitise, SSE, re-hydrate |
| **2** | Vertical slice on ChatGPT | 6–8 h | Working end-to-end proof in DevTools |
| **3** | Robustness + Claude + fail modes | 6–8 h | Second site, fallbacks, fault injection |
| **4** | UI: badge, popover, toast, popup | 8–10 h | Complete P0 UX |
| **5** | Settings, dictionary, audit, policy, onboarding | 8–10 h | P1 feature set |
| **6** | Hardening: fuzz, perf, security, a11y | 6–8 h | Gates green, real-site regression |
| **7** | Packaging, docs, demo | 4–6 h | Web Store zip, privacy doc, rehearsed demo |

Total ≈ 51–66 h. **Hackathon MVP = Phases 0–4 + T5.1/T5.3-lite (dictionary textarea) + T6.1/T6.3 + T7.3 ≈ 38–45 h.**

### 1.2 Suggested schedule (10 working days, adjust to your deadline)

| Day | Work |
|-----|------|
| 1 | Phase 0; start Phase 1 (T1.1–T1.3) |
| 2 | T1.4–T1.9 |
| 3 | Phase 2 (real-site proof by end of day) |
| 4 | Phase 3 |
| 5–6 | Phase 4 |
| 7 | Phase 5 (MVP subset first) |
| 8 | Phase 6 |
| 9 | Phase 7, demo rehearsal |
| 10 | Buffer / bug fixes |

### 1.3 Cut list if time runs short (cut in this order)
1. Audit log, managed policy, onboarding polish, pause.
2. XHR patch, attachment warning, ignore-list persistence UI polish.
3. Test Lab, dictionary import/export.
4. Claude adapter (keep ChatGPT only, say so honestly).

**Never cut:** leak assertion, fail-closed default, split-token hold-back + fuzz test, DevTools verification guide, "no values in logs/messages" rule.

---

## 2. Phases and tasks

Each task lists **files**, **acceptance criteria (AC)** and **tests**. Do them in order; one task per PR/commit.

### Phase 0 — Scaffold and discovery

| ID | Task | Files | AC |
|----|------|-------|----|
| T0.1 | Scaffold repo: `package.json` (scripts per TRD §2), `esbuild.config.mjs` (entries: `inject`, `content`, `background`, `popup`, `options`, `onboarding`; manifest generation from template; `--dev` adds `localhost:4173`), ESLint with restricted-API rules, Prettier, `tsconfig` (`checkJs`), Vitest, folder skeleton, `AGENTS.md` (from README §5), copy docs to `/docs`, `.gitignore` | root, `src/**` stubs | `npm run build` yields `dist/`; extension loads in `chrome://extensions` with no errors; `npm test`, `npm run lint`, `npm run typecheck` pass; a deliberate `innerHTML` use makes lint fail |
| T0.2 | Hello-world injection: `inject.js` (MAIN) and `content.js` (ISOLATED) log once and set `document.documentElement.dataset.szMain/szIso`; `inject.js` logs the URL of the first three `fetch` calls (dev only) | `src/main-world/inject.js`, `src/content/content.js` | On chatgpt.com and claude.ai both scripts run at `document_start`; first site fetch is seen by our wrapper |
| T0.3 | Capture real shapes **with fake secrets only**: in DevTools → Network send prompts containing fake keys; save request bodies and SSE responses (Copy → Copy response / "Save all as HAR"). **Strip Cookie/Authorization/CSRF headers and any account/org identifiers before saving.** Save as fixtures | `test/fixtures/chatgpt/*`, `test/fixtures/claude/*` | Fixtures include: normal prompt, long/multiline prompt, code block, follow-up turn, regenerate, and full SSE stream(s) |
| T0.4 | Answer TRD §14 unknowns (Workers/iframes/WebSocket? endpoints? composer selectors? history resend? third-party fetch wrappers?) | `docs/phase0-findings.md` | Every question has a written answer + evidence; TRD §7 tables corrected if different |

### Phase 1 — Core engine (pure JS, test-first)

| ID | Task | Files | AC / tests |
|----|------|-------|-----------|
| T1.1 | Utilities | `core/random.js` (crypto), `mask.js`, `hash.js` (SHA-256→16 hex), `errors.js`, `types.js`; `test/helpers/fake-secrets.js` (runtime-built fake keys) | Unit tests; no `Math.random` anywhere in `src/core` (lint) |
| T1.2 | Rule catalog + validators + `detect()` | `core/rules/*`, `core/detect.js` | ≥ 5 positive and ≥ 5 negative cases per rule; overlap resolution tests (DB URL vs IP vs email vs dictionary); placeholder tests (`process.env.X` not detected); ReDoS test per rule (200 KB adversarial input < 50 ms) |
| T1.3 | Dictionary compiler | `core/dictionary.js` | "acme capital", "ACME CAPITAL's", aliases, Unicode boundaries, `acmeology` not matched, 2,000 entries compile < 100 ms |
| T1.4 | Generators (all in TRD §6.3) | `core/generators/*` | Per generator: length/charset/prefix shape, ≠ real, matches same rule regex (except safe substitutions), uniqueness over 10,000 generations, JWT mock is valid base64url JSON, PEM line structure preserved, DB URL still parses |
| T1.5 | Vault | `core/vault.js` | Two-way lookup, prefix set, `findMockMatches`, `longestMockPrefixSuffix(str, floor)`, `rehydrateText`, invariants (no prefix/suffix mocks), cap → `E_VAULT_FULL`, `clear()` |
| T1.6 | Sanitiser | `core/sanitize.js` | `sanitizeText`, `sanitizeJsonBody` (slots, deep-walk fallback), leak assertion (raw + JSON-escaped), convergence pass; property tests: idempotence and `rehydrate(sanitise(x)) === x` on random text with random secrets |
| T1.7 | SSE | `core/sse.js` | Parser handles `\n`/`\r\n`/`\r`, multi-line data, comments, partial events; unmodified events reserialise byte-faithfully |
| T1.8 | Stream re-hydration | `core/rehydrate.js`, `core/json-delta.js` | Fuzz: for every mock type, split a sample reply at **every** offset and into 3-way splits → output equals expected, nothing lost at end; flush inserted before terminal event; empty-delta events still emitted |
| T1.9 | Corpus + metrics | `test/fixtures/corpus/{positive,clean}`, `scripts/detect-report.mjs` | `npm run bench:detect` prints recall by rule and false-positive rate; meets PRD targets (≥ 95% provider rules, ≤ 2% FP on 500 clean snippets) |

### Phase 2 — Vertical slice on ChatGPT

| ID | Task | Files | AC |
|----|------|-------|----|
| T2.1 | `inject.js` bootstrap: capture built-ins, create vault, runtime (config promise, 2 s timeout), bridge handshake (`HELLO`/`HELLO_REQUEST`), `CONFIG_PUSH` handling | `main-world/inject.js`, `runtime.js`, `bridge.js` | Unit tests with fake `window`; handshake works in either load order |
| T2.2 | Fetch patch: fast path, `extractBody` (string, Request, Blob, ArrayBuffer), rebuild, fail-closed, leak assertion, `wrapResponse` (SSE + JSON) exactly as TRD §7 | `main-world/fetch-patch.js` | Non-matching fetches untouched; matching requests sanitised; errors → `TypeError` and nothing sent; abort works |
| T2.3 | ChatGPT adapter from **Phase 0 fixtures** | `adapters/chatgpt.js`, `adapters/index.js` | Adapter conformance test passes (slots, sanitise, split fuzz, flush, terminal) |
| T2.4 | Minimal `content.js` + service worker config: request `GET_EFFECTIVE_CONFIG` (defaults only for now), push config, relay summaries | `content/content.js`, `background/service-worker.js`, `shared/*` | Config arrives before first user prompt |
| T2.5 | **Real-site proof** on chatgpt.com: DevTools Network payload shows mocks; UI shows real values; second turn reuses same mocks; capture screenshots | `docs/proof/` | Written checklist ticked; screenshots saved (for the pitch) |
| T2.6 | Local mock ChatGPT server + first Playwright tests | `test/e2e/mock-server/*`, `test/e2e/e1-e2-e4.spec.js` | E1, E2 (split mock in SSE), E4 pass in CI |

### Phase 3 — Robustness and second site

| ID | Task | AC |
|----|------|----|
| T3.1 | Claude adapter (`adapters/claude.js`) from fixtures; mock Claude server | Conformance suite passes; E11 passes |
| T3.2 | Deep-walk fallback + `W_ADAPTER_UNKNOWN_SHAPE`; renamed-fields fixtures | E6 passes |
| T3.3 | Fault injection and fail modes (config timeout, bad JSON, unsupported body, vault full, mock collision, inbound parse errors) | E7, E8 pass; outbound never sent on error |
| T3.4 | Abort/cancel handling; `Request` object inputs; non-SSE JSON responses | Tests pass |
| T3.5 | Patch re-assertion on `visibilitychange`; `PATCH_STATUS`; `W_UNPATCHED_CHANNEL` heuristics from Phase 0 findings | E12 passes |
| T3.6 (P1) | XHR outbound patch for matched endpoints | Unit tests with fake XHR |

### Phase 4 — UI (P0 experience)

| ID | Task | Files | AC |
|----|------|-------|----|
| T4.1 | Overlay host: closed Shadow DOM, token CSS from `04_UIUX_Design_Brief.md` §2, content-side bridge, i18n strings from §8 | `content/styles.css.js`, `bridge.js`, `shared/i18n-en.js` | No global CSS leaks; host page layout unchanged |
| T4.2 | Input watcher: composer discovery (adapter selectors → fallback), debounce 150 ms, idle scan, size cutoff, never mutates composer | `content/input-watcher.js` | E10; scan p95 ≤ 20 ms for 10 KB |
| T4.3 | Ghost Badge: states, positioning, ResizeObserver, swap animation (reduced-motion aware), a11y | `content/ghost-badge.js` | State machine matches `03_App_Flow.md` §5.1; all states visible on light/dark |
| T4.4 | Detection popover + ignore flow (`IGNORE_ADD` with hash) | `content/badge-popover.js` | E9; masked previews; keyboard operable |
| T4.5 | Toasts incl. blocking toasts per error code | `content/toast.js` | Every error code has copy; auto-dismiss 4 s; pause on hover |
| T4.6 | Popup + toolbar badge count | `popup/*`, service worker | States: Active/Off/Paused/Managed/Unsupported; Clear vault works (E14) |
| T4.7 | E2E + visual QA on ChatGPT/Claude light+dark | `test/e2e/*` | E10, E13, E14, E9 pass; QA checklist in brief §11 |

### Phase 5 — Settings, dictionary, audit, enterprise, onboarding

| ID | Task | AC |
|----|------|----|
| T5.1 | `shared/storage.js`: defaults, validation, migrations, `getEffectiveConfig` (managed > local > defaults), live `storage.onChanged` push | Unit tests incl. migration and unknown-key stripping |
| T5.2 | Options: General + Detection tabs | Changes apply live to open tabs |
| T5.3 | Dictionary tab: CRUD, import/export (CSV/JSON), validation, credential-lookalike rejection. *MVP shortcut: a simple textarea, one term per line, `Term = Alias1; Alias2`* | Live update without reload; validation tests |
| T5.4 | Audit log: append/rotate/export/clear; metadata only | Test asserts entries never contain values or mocks |
| T5.5 | Test Lab (uses `src/core` directly, throw-away vault) | Round-trips sample text; no network |
| T5.6 | Managed policy: schema, merge, lock UI | Policy test with sample JSON |
| T5.7 | Onboarding page + `onInstalled` hook | Opens once on install |
| T5.8 | Pause (15 min) with confirmation; idle clear | Honours `allowPause:false` |
| T5.9 | Attachment warning | Shown when attachment UI adds a file on both sites |

### Phase 6 — Hardening and verification

| ID | Task | AC |
|----|------|----|
| T6.1 | Fuzz/property suite in CI (split-token across all mock types; random secrets in random text) | 10,000 iterations green |
| T6.2 | ReDoS suite + perf benchmarks (`test/bench`) | Budgets in TRD §10 met |
| T6.3 | Static gates: restricted-API lint, `verify:no-network`, bundle size ≤ 300 KB, `tsc` | CI fails on violation |
| T6.4 | Security review against TRD §9; try `connect-src 'none'` CSP | Checklist signed in `docs/security-review.md` |
| T6.5 | Accessibility: axe on popup/options/onboarding; manual keyboard + screen-reader pass on badge | No critical issues |
| T6.6 | Full E2E on Chrome and Edge; manual real-site regression (§5) | Checklist ticked |
| T6.7 | False-positive review on your own code (local only; never upload) | Tuned validators/sensitivity; new negative fixtures added |

### Phase 7 — Packaging, docs, demo

| ID | Task | AC |
|----|------|----|
| T7.1 | Icons, README, privacy policy, data-flow diagram, "How to verify" doc | Reviewed |
| T7.2 | Web Store package + listing copy + permission justification | `npm run zip` valid; permissions = `storage` only |
| T7.3 | Demo rehearsal (script §6) + backup screen recording; **mock vs `[REDACTED]` comparison** on 20 debugging prompts (blind-rated) for the pitch | Recording saved; table of results |
| T7.4 | Tag `v0.1.0` | Release notes list known limitations (reload wipes vault; text only) |

---

## 3. Copy-paste prompts for the AI agent

Prefix each with: *"Read /docs/01–06 and AGENTS.md. Follow the guardrails. Work only on the listed tasks. Write tests first. Do not add runtime dependencies. If something is ambiguous, pick the documented default and note it; ask only if blocked."*

**Phase 0**
> Do T0.1 and T0.2. Then stop and give me step-by-step instructions for T0.3 (capturing fixtures safely with fake secrets only) and T0.4. After I paste the captured request/stream samples, create the fixture files and write `docs/phase0-findings.md`.

**Phase 1**
> Do T1.1–T1.9 in order, one commit per task, tests first. `src/core` must be pure (no chrome.*, DOM, window). Use the rule catalog in 05 §6 verbatim as the starting point and fix any regex that fails tests. Show me `npm run bench:detect` output at the end.

**Phase 2**
> Do T2.1–T2.4 using the fixtures in `test/fixtures/chatgpt`. Implement the fetch patch exactly as in TRD §7 and the hold-back algorithm in TRD §8. Then give me the manual proof checklist for T2.5. After I confirm, do T2.6.

**Phase 3**
> Do T3.1–T3.6. Every adapter must pass the shared conformance test. Add fault-injection tests for every error code in 05 §8. Outbound errors must fail closed; inbound errors must fail open.

**Phase 4**
> Do T4.1–T4.7 following `04_UIUX_Design_Brief.md` and `03_App_Flow.md` §5. All overlay UI lives in a closed Shadow DOM, uses `textContent` only (no innerHTML), and never modifies the composer or host layout. Never send real values through postMessage — masked previews are computed in `content.js` from its own detections.

**Phase 5**
> Do T5.1–T5.9 (MVP subset first: T5.1 and the textarea version of T5.3). Dictionary stays in `chrome.storage.local` only. Audit log stores counts only.

**Phase 6**
> Do T6.1–T6.5 and produce `docs/security-review.md` by checking every row of TRD §9 with evidence (file + test). List any row you cannot verify.

**Phase 7**
> Do T7.1, T7.2, T7.4. Generate the privacy policy and data-flow doc from `05_Backend_Schema.md` §1 (no claims beyond what the code does).

**Adapter drift (use whenever a site changes)**
> ChatGPT/Claude stopped being protected or replies show mocks. Here are new fixtures: [paste]. Update only `adapters/<site>.js` and its fixtures so the conformance suite passes with old and new shapes. Do not touch `src/core`. Add a regression fixture.

**Bug-fix template**
> Bug: [what happened]. Expected: [..]. Add a failing test that reproduces it in the lowest layer possible (core → adapter → e2e), then fix it. List every file changed and confirm no new dependency, storage, network or logging of values was introduced.

---

## 4. Definition of done (every task)

- [ ] Tests written first and passing; coverage for `src/core` ≥ 90%.
- [ ] `npm run lint`, `typecheck`, `verify:no-network` pass.
- [ ] No new runtime dependency; no new permission; no `storage.sync`; no own network calls.
- [ ] No real values in logs, messages, storage, error text (test or review evidence).
- [ ] Relevant doc updated in the same commit.
- [ ] Manual check on the affected flow when it touches the real sites.

**MVP done when:** E1–E14 (P0 ones) pass; T2.5 proof screenshots exist; fuzz suite green; detection targets met; the demo runs cleanly three times in a row on a fresh Chrome profile.

---

## 5. Real-site regression checklist (manual; before every release)

1. Fresh Chrome profile → load `dist/` unpacked → no errors on `chrome://extensions`.
2. ChatGPT, new chat: send a prompt with a fake Stripe key, an AWS key pair, a DB URL, an email, an IP and a dictionary name. Open DevTools → Network → prompt request → confirm **only mocks** in the payload.
3. Reply shows real values; code blocks render normally; copy button copies real values.
4. Second and third turn reuse the same mocks (compare payloads). Regenerate and edit-message both work.
5. Paste a 50 KB file of code with two secrets buried in it: protected; typing stays smooth.
6. Reload the page: no errors; old messages show mocks (expected); a new prompt works.
7. Repeat 2–6 on Claude.
8. Toggle the site off → payload contains the real values (proving the toggle works) → toggle on.
9. Force an error (dev switch): request is not sent, blocking toast shown.
10. Light and dark themes on both sites; narrow window.
11. `chrome://extensions` → SanitAIze → service worker → Network tab: **no requests from the extension**.
12. Confirm permissions listed in the install prompt: only what the manifest declares.

---

## 6. Demo script (5 minutes)

1. **Problem (30 s):** show the two failure modes — "Blocked by IT policy" screenshot and a `[REDACTED]` reply that misses the bug.
2. **Type the prompt (45 s):** Stripe key + client name + DB URL in ChatGPT. Ghost Badge appears: "3 sensitive values will be replaced". Open the popover; point out that the text is unchanged.
3. **Send (60 s):** toast "3 values replaced". Open DevTools → Network → request payload: only stand-ins. *This is the moment that sells it.*
4. **Reply (45 s):** the answer streams with real values and syntax-highlighted code; copy the fix.
5. **Multi-turn (30 s):** follow-up question; show the same stand-ins in the payload.
6. **Trust (45 s):** popup stats (counts, RAM only), "Clear stand-in list", extension permissions (`storage` only), no network requests from the extension.
7. **Honest limits (30 s):** text only; reload clears the list; detection is rule-based, so add your client names to the dictionary.
8. **Close (15 s):** "Security and productivity, without a middleman."

Backup: pre-recorded video of steps 2–5; keep fake secrets in a text file to paste.

---

## 7. Contingencies

| If… | Then… |
|-----|-------|
| Site changes during the hackathon | Use the "Adapter drift" prompt; fixtures + conformance suite make it a 30-minute fix |
| `world: "MAIN"` script runs after the site's first fetch | Use the fallback: inject via a tiny content script that adds a `<script src>` from an extension resource and add `web_accessible_resources` for that file only (documented as a deviation in `phase0-findings.md`) |
| Prompt submission uses a Worker/WebSocket | Document as unsupported for that site; badge shows "Not protecting" with explanation; do not demo that path |
| Stream shape has batched JSON-patch deltas | Extend `locate()` in the adapter; core hold-back algorithm is unchanged |
| Detection false positives annoy | Default to `relaxed`, expand `placeholders.js`, add negative fixtures |
