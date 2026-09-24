# SanitAIze
> Context-Preserving, Zero-Trust In-Browser Privacy Layer for Generative AI

SanitAIze is a Manifest V3 Chrome Extension engineered to tackle the Enterprise Shadow AI Crisis. When developers paste sensitive code, API keys, database credentials, or client names into public LLMs (e.g., ChatGPT, Claude), SanitAIze intercepts the outbound payload in local client RAM, replaces raw secrets with format-valid synthetic mocks, and seamlessly re-hydrates the original values in real time as the response streams back.

---

## Key Highlights
- Pure In-Memory Interception: Outbound fetch requests are intercepted before leaving the browser endpoint; raw credentials never touch disk, logs, or external proxies.
- Format-Preserving Synthetic Mocks: Keys and tokens are replaced with realistic synthetics matching prefix, length, and checksum rules so the LLM provides syntactically accurate suggestions.
- Zero-Latency Stream Re-hydration: Local parsing of Server-Sent Events (SSE) deltas restores original secrets on the fly without proxy round-trip delays.
- Zero Data at Rest: All credential-to-mock mappings reside strictly in ephemeral tab memory and are permanently wiped when the browser tab closes.
- Isolated Ghost UI: On-page detection badges and popovers are injected into an isolated, closed Shadow DOM to avoid interfering with target web apps.

---

## Tech Stack
- Platform: Chrome Extension Manifest V3
- Core Engine: Pure JavaScript (ES2022) with zero external runtime dependencies
- Bundler & Tooling: esbuild
- UI Architecture: Closed Shadow DOM, CSS Design Tokens
- Testing Suite: Vitest (Unit Engine) & Playwright (E2E Adapter Mocking)

---

## How It Works
1. Detect & Scan: A debounced input watcher monitors composer fields for sensitive patterns (Stripe keys, AWS tokens, DB URIs, etc.).
2. On-Page Preview: The Ghost Badge updates status and provides a masked preview of detected items.
3. Outbound Interception: The patched browser fetch catches outgoing conversation payloads and swaps real values with generated mocks.
4. Local Stream Restoration: As SSE chunks stream back from the model, SanitAIze swaps mock keys back to real credentials in real-time.

---

## Quick Start (Run Locally)

### 1. Build the Extension
Run the following in terminal:
npm install
npm run build

The compiled MV3 bundle will be generated inside the dist directory.

### 2. Load into Chrome
1. Open Google Chrome and navigate to chrome://extensions/
2. Enable the Developer mode toggle in the top-right corner.
3. Click Load unpacked in the top-left corner.
4. Select the dist folder from this repository.

### 3. Verify on ChatGPT
1. Open ChatGPT (https://chatgpt.com)
2. Paste a sample secret into the chat box:
Debug my Stripe key: const KEY = "sk_live_PLACEHOLDER_KEY";
3. Observe the Ghost Badge indicator appear above the composer.
4. Hit Send - the network request receives a synthetic mock, while the rendered response restores your real key automatically.
