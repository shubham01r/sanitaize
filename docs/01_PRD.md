# 01 — Product Requirements Document (PRD)

**Product:** SanitAIze — Context-Preserving Privacy Layer for Enterprise AI
**Form factor:** Chrome extension (Manifest V3), 100% client-side
**Version of this doc:** 1.0 (MVP scope = "R0")
**Owner:** Shubham Kumar (team Fukras)

---

## 1. Summary

Developers paste proprietary code, API keys, database credentials and client names into public AI tools (ChatGPT, Claude) to debug faster. Existing controls fail in two ways: enterprise DLP **blocks** the tool ("Blocked by IT policy"), destroying productivity and pushing people to unmanaged workarounds; and anonymizers **redact** with generic `[REDACTED]` tags, which breaks code syntax and confuses the model.

SanitAIze sits inside the browser tab. While the developer types it detects sensitive values locally; when they hit send it swaps each value for a **format-valid mock** (e.g. `sk_test_mock8f9a…`, `Entity_A_x9k`) before the request leaves the browser; the model reasons over syntactically valid code; the streamed reply is intercepted and the mocks are swapped back to the real values before rendering. The mapping lives only in tab RAM and vanishes when the tab closes.

**Product promise (calibrated wording):** *Every value SanitAIze detects is replaced before it leaves your browser, and the AI still understands your code.*

---

## 2. Problem & evidence

| Problem | Impact |
|---------|--------|
| Developers paste secrets/client names into public LLMs for quick debugging | Data exposure to third-party servers and prompt logs |
| DLP block screens interrupt the workflow | Productivity loss; shadow-IT workarounds |
| `[REDACTED]` masking breaks syntax / loses entity relationships | Model gives wrong or useless answers, so devs skip the redaction |
| Cloud privacy proxies / gateways add a middleman that handles raw data | New breach surface, recurring infra cost |
| Average enterprise breach cost $4.88M (IBM Cost of a Data Breach 2024) | Board-level risk |

> To verify before publishing: the "72% of employees used Gen AI without an employer licence" figure from the deck needs a citation.

---

## 3. Goals and non-goals

### Goals (MVP)
- G1. Zero-friction protection on chatgpt.com and claude.ai: install, no configuration, works.
- G2. Replace detected secrets with mocks that keep the **format, length, charset and structure** so code still parses and the model reasons correctly.
- G3. Keep the mapping **consistent across turns** so multi-turn debugging works.
- G4. Restore real values in the reply with **no perceptible delay** and no change in workflow.
- G5. **Provable privacy:** user can verify in Chrome DevTools → Network that only mocks left the browser.
- G6. Zero data at rest for prompt content; zero telemetry; zero external dependencies.

### Non-goals (MVP)
- Full DLP replacement (endpoint, email, USB, etc.).
- Protecting AI **coding agents/IDEs** (Cursor, Copilot) or API clients — browser chat only.
- File/image/voice attachment sanitisation.
- Server-side proxy, admin console, accounts, sync.
- ML-based entity recognition (person/org names not in the dictionary).
- Mobile browsers; Firefox/Safari.
- Guaranteeing undetected secrets are safe (see §11).

---

## 4. Personas

| Persona | Needs | Success looks like |
|---------|-------|--------------------|
| **Priya — backend developer** (primary) | Debug a failing Stripe/AWS/DB integration in ChatGPT without leaking prod values or fighting IT | Pastes code as-is, gets a correct answer, real values shown in reply, never sees a block screen |
| **Arjun — security lead / CISO** (buyer) | Stop leaks without banning AI; evidence for audits; no new vendor holding raw data | Can verify no raw data leaves; can push a client-name dictionary to all developers; audit counts without content |
| **Meera — IT admin** (deployer) | Roll out silently, lock settings | Force-install via Chrome policy, config via `storage.managed` |

---

## 5. User stories

| ID | As a… | I want… | So that… |
|----|-------|---------|----------|
| US1 | developer | to see a small indicator when what I typed contains secrets | I know I'm protected without being interrupted |
| US2 | developer | my prompt to be sent with realistic fake values | the AI still understands and debugs my code |
| US3 | developer | the AI's reply to show my real values | I can copy the fix straight into my code |
| US4 | developer | the same secret to map to the same fake across a conversation | follow-up questions keep context |
| US5 | developer | to mark a false positive as "ignore this session" | my normal text isn't altered |
| US6 | developer | to add client/project codenames | company-specific terms are protected too |
| US7 | developer | to see exactly what was replaced | I trust the tool |
| US8 | security lead | to verify in DevTools that only mocks were sent | I can sign off on it |
| US9 | admin | to force-install and preload a dictionary via policy | every developer is covered |
| US10 | security lead | metadata-only audit counts | I get evidence without new data exposure |

---

## 6. Functional requirements

Priority: **P0** = MVP/demo must have · **P1** = v1.0 · **P2** = later.
Each requirement has a testable acceptance criterion (AC).

### 6.1 Detection

| ID | Pri | Requirement | AC |
|----|-----|-------------|----|
| FR-D1 | P0 | Scan composer text as the user types/pastes on supported sites (debounced 150 ms) | Badge updates ≤ 300 ms after typing stops; no dropped frames while typing |
| FR-D2 | P0 | Detect the MVP rule catalog (see `05_Backend_Schema.md` §6): Stripe, AWS key id + secret, GitHub, OpenAI, Anthropic, Google, Slack, JWT, PEM private keys, DB connection strings, generic `secret/token/password = value`, email, IPv4, internal hostnames | On the labelled fixture corpus: recall ≥ 95% for provider-key rules, ≥ 90% overall; false-positive rate ≤ 2% on the 500-snippet clean-code corpus |
| FR-D3 | P0 | Detect dictionary terms (client names, codenames, aliases); case-insensitive, whole-word, Unicode-aware | "acme capital", "ACME CAPITAL", "Acme Capital's" all detected; "acmeology" not detected |
| FR-D4 | P1 | Per-category toggles and sensitivity (`relaxed` / `balanced` / `strict`) | Toggling a category changes detections in the Test Lab immediately |
| FR-D5 | P1 | "Ignore this session" per detection (hash-based, in memory) | Ignored value not replaced until tab reload; ignore list never persisted |
| FR-D6 | P2 | Optional on-device NER for person/org names | — |

### 6.2 Transformation

| ID | Pri | Requirement | AC |
|----|-----|-------------|----|
| FR-T1 | P0 | Intercept outbound prompt requests (`window.fetch`) on supported sites and sanitise **all** text slots before sending | E2E: mock server never receives any detected real value (0 leaks in 100% of test runs) |
| FR-T2 | P0 | Generate format-valid mocks: same length, charset, prefix structure; never a valid live credential (e.g. Stripe `live` → `test`) | Generator unit tests: shape checks per type; mock ≠ real; mock passes the same regex as the real type |
| FR-T3 | P0 | Session-consistent mapping: same real value → same mock across turns, chats and regenerations within the tab | Property test: N sanitise calls with the same value → one mock |
| FR-T4 | P0 | Idempotence: never re-transform a mock | `sanitize(sanitize(x)) === sanitize(x)` |
| FR-T5 | P0 | **Fail-closed** on any outbound error, config timeout, unknown body shape that cannot be safely walked, or leak-assertion failure; show a blocking toast with next steps | Fault-injection tests: request never sent; user sees message |
| FR-T6 | P0 | Post-transform **leak assertion**: final serialised body must not contain any real value from this request (raw or JSON-escaped) | Test with escaped quotes/newlines/unicode |
| FR-T7 | P0 | Unknown-shape fallback: if the adapter's expected fields are missing, deep-walk every string in the JSON body (denylist of id-like keys) and show a compatibility warning | Adapter fixture with renamed fields still sanitised |
| FR-T8 | P1 | XHR outbound sanitisation for matched endpoints | — |
| FR-T9 | P1 | Warn when an attachment/file is added to the composer ("Files aren't scanned") | — |

### 6.3 Vault

| ID | Pri | Requirement | AC |
|----|-----|-------------|----|
| FR-V1 | P0 | In-memory two-way map (`real→mock`, `mock→real`) in the **page-world closure**; never written to disk, never posted across the world boundary | Static test: no `storage.*`/`postMessage` call receives vault values; code review checklist |
| FR-V2 | P0 | Auto-purge on tab close or reload (natural lifetime of the JS heap) | E2E: reload → vault size 0 |
| FR-V3 | P1 | "Clear vault now" (popup) and optional idle-timeout purge | — |
| FR-V4 | P2 | Opt-in survive-reload via `chrome.storage.session` | — |

### 6.4 Re-hydration

| ID | Pri | Requirement | AC |
|----|-----|-------------|----|
| FR-R1 | P0 | Intercept the SSE response, restore real values before the page reads the stream; **handle mocks split across chunks/events** | Fuzz test: split at every byte boundary → output identical to expected |
| FR-R2 | P0 | Non-streaming JSON responses handled the same way | Fixture test |
| FR-R3 | P0 | No added perceptible latency: ≤ 5 ms per event median; held-back tail ≤ longest mock length | Perf test |
| FR-R4 | P0 | Inbound errors fail open (user sees mocks, stream never breaks) | Fault-injection |
| FR-R5 | P1 | DOM fallback re-hydrator for rendered history (when vault exists) | — |

### 6.5 UI

| ID | Pri | Requirement | AC |
|----|-----|-------------|----|
| FR-U1 | P0 | **Ghost Badge** above the composer: states Ready / Detected(n) / Protecting / Protected / Blocked / Paused | State transitions match `03_App_Flow.md` §5 |
| FR-U2 | P0 | Toast after each sanitised send ("2 sensitive values replaced") | Appears ≤ 200 ms after send; auto-dismiss 4 s |
| FR-U3 | P0 | Popup: on/off per site, this-tab stats (counts by type), clear vault, "How to verify" | — |
| FR-U4 | P1 | Options page: settings, dictionary CRUD + import/export, rule toggles, audit log, **Test Lab** | — |
| FR-U5 | P1 | Onboarding page with a "try it" sample | — |
| FR-U6 | P1 | Pause protection for this tab with explicit confirmation | — |

### 6.6 Enterprise

| ID | Pri | Requirement | AC |
|----|-----|-------------|----|
| FR-E1 | P1 | `storage.managed` policy: force-enable, allowed sites, preload dictionary, lock settings, disable pause | Policy JSON validated against `managed_schema.json` |
| FR-E2 | P1 | Optional audit log: metadata only (timestamp, site, counts by type, latency), rolling 500 entries, export | Log contains no values or mocks |
| FR-E3 | P1 | Data-flow & privacy documents for security review | Shipped in `/docs` |

### 6.7 Privacy & security (all P0)

| ID | Requirement |
|----|-------------|
| FR-S1 | No telemetry; extension code makes **no network calls of its own** (CI grep gate) |
| FR-S2 | Real values never appear in logs, errors, messages or storage |
| FR-S3 | Dictionary stored in `chrome.storage.local` only (never `sync`) and documented as the one intentionally persisted sensitive item |
| FR-S4 | Minimal permissions: `storage` only; no host permissions; content scripts scoped to supported sites |
| FR-S5 | No remotely hosted code; strict extension-page CSP |

---

## 7. Non-functional requirements

| Area | Requirement |
|------|-------------|
| Performance | Scan p95 ≤ 20 ms for ≤ 10 KB input; outbound transform overhead p95 ≤ 50 ms for ≤ 100 KB body; no long tasks > 50 ms from the badge |
| Reliability | Any internal exception in UI code must never break the host page; outbound failures are fail-closed and explained |
| Compatibility | Chrome ≥ 111 stable; Edge stable; chatgpt.com and claude.ai as of build date |
| Accessibility | WCAG 2.1 AA: contrast, keyboard operable, `aria-live` status, reduced motion respected |
| Privacy | Zero telemetry; zero prompt content at rest; dictionary local only |
| Maintainability | Site-specific logic isolated in adapters with fixture tests; `src/core` pure and ≥ 90% covered |
| Footprint | Bundled size < 300 KB; no runtime deps |
| I18n | UI copy in English (MVP), strings centralised for later translation; detection is Unicode-aware |

---

## 8. Scope and release plan

| Release | Scope |
|---------|-------|
| **R0 — Hackathon MVP** | All P0: ChatGPT + Claude, fetch interception, rule catalog, dictionary (edited via simple options textarea acceptable), vault, streaming re-hydration, badge, toast, popup, fail-closed, leak assertion, unit + E2E tests, DevTools verification guide |
| **R1 — v1.0** | All P1: options/Test Lab, dictionary import/export, ignore list, sensitivity, XHR, pause, attachment warning, audit log, managed policy, onboarding, Chrome Web Store listing |
| **R2 — v1.1** | Gemini/Copilot/Perplexity adapters, DOM re-hydration for history, opt-in survive-reload, on-device NER |
| **R3 — v2** | Edge Add-ons/Firefox packaging, opt-in metadata dashboard for security teams |

---

## 9. Success metrics

| Metric | Target | How measured |
|--------|--------|--------------|
| Leak rate for detected values in E2E | 0 | Mock server request log assertions |
| Detection recall (provider-key rules) | ≥ 95% | Labelled corpus in `test/fixtures/corpus/` |
| Detection false positives on clean code | ≤ 2% | 500-snippet corpus |
| Re-hydration accuracy | 100% under arbitrary chunking | Fuzz suite |
| Time from install to first protected prompt | < 2 min, zero config | Onboarding walkthrough |
| Added latency (outbound, 100 KB) | p95 ≤ 50 ms | Perf benchmark |
| Model answer quality vs `[REDACTED]` baseline | Mock ≥ redaction on a 20-prompt debugging set (blind-rated) | Comparison script (optional, for the pitch) |

---

## 10. Assumptions (see README A1–A15 — canonical list)

Key ones affecting requirements: provider endpoint/stream shapes are verified in Phase 0 (A11); vault is wiped on reload (A7); fail-closed default (A8); no attachments (A10).

---

## 11. Risks and mitigations

| ID | Risk | Likelihood / Impact | Mitigation |
|----|------|--------------------|------------|
| R1 | Provider changes endpoint or stream format → silent leak or broken UI | High / High | Adapter isolation; deep-walk fallback; leak assertion; canary E2E against fixtures; compatibility warning; fast release cadence |
| R2 | Reload wipes vault → history shows mocks, user confused | Certain / Medium | Explain in onboarding and popup; P2 opt-in session persistence; DOM re-hydration fallback |
| R3 | Undetected secrets (recall < 100%) | Certain / High | Honest messaging; entropy-based generic rule; dictionary; strict mode; Test Lab; "detected values" wording |
| R4 | False positives alter benign text, confusing the model | Medium / Medium | Ignore-this-session; balanced default; placeholder/reference heuristics (`process.env.X`) |
| R5 | Site fetch happens in a Worker/iframe/WebSocket we don't patch | Medium / High | Phase 0 discovery; adapter reports `W_UNPATCHED_CHANNEL`; roadmap item |
| R6 | Page scripts detect/tamper with our patch | Low–Med / Medium | Capture built-ins at `document_start`; native-looking `toString`; re-assert patch on `visibilitychange` |
| R7 | Chrome Web Store review (host-injection extensions get scrutiny) | Medium / Medium | Single-purpose description, minimal permissions, clear privacy policy, no remote code |
| R8 | Third-party ToS concerns about modifying client behaviour | Low–Med / Medium | Only modifies the user's own outbound content locally; document; no scraping of others' data |
| R9 | Users trust it for attachments/images | Medium / High | Attachment warning; explicit "text prompts only" copy |
| R10 | Mock leaks structure (length/prefix) | Low / Low | Acceptable by design; documented |

---

## 12. Positioning vs. alternatives

| | Generic public AI | Enterprise DLP (block) | Cloud redaction proxy | **SanitAIze** |
|---|---|---|---|---|
| Raw data leaves device | Yes | No (blocked) | Yes (to proxy) | **No** (detected values) |
| Developer workflow | Native | Broken | Changed | **Native** |
| Model sees valid syntax | Yes | n/a | Often `[REDACTED]` | **Yes (format-valid mocks)** |
| Extra infrastructure | None | Agents/policy servers | Servers, vault APIs | **None** |

Messaging guardrails: say "detected values", "supports compliance", "verifiable in DevTools".

---

## 13. Open questions (non-blocking; defaults chosen)

1. Should the Ghost Badge show masked previews of real values in the detection popover? **Default: yes, masked (`sk_live_…d4f9`), only within the tab's own DOM.**
2. Should regenerate/edit reuse existing mocks? **Default: yes (vault lookup).**
3. Should mocks carry a recognisable marker (`mock`) where the format allows? **Default: yes; it guarantees the mock can't be a valid credential.**
