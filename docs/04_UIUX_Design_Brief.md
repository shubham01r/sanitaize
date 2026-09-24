# 04 — UI/UX Design Brief

SanitAIze has almost no UI of its own. Its main job is to stay out of the way on someone else's website, and to earn trust with a few precise, honest signals. This brief covers the on-page overlay (Ghost Badge, popover, toast) and three extension pages (popup, options, onboarding).

---

## 1. Design intent

**Who and where:** developers, mid-task, inside ChatGPT or Claude, both light and dark themes. They are not looking for a security product; they want to paste code and get an answer.

**Design job:** show *"you're protected"* in one glance, explain *what changed* on demand, and say *what to do* when something goes wrong.

**Principles**
1. **Quiet by default.** No modal, no interruption, no layout shift. The badge is one small pill.
2. **Verifiable, not magical.** Every claim can be checked: masked previews, counts, a "How to verify" path into DevTools.
3. **Plain words.** Sentence case, active voice, no security jargon. Errors say what happened and what to do next.
4. **One memorable moment.** The badge's *swap*: when a message is sent, the count text is replaced by "n replaced" while a single cyan line sweeps across the pill once. Everything else is static.
5. **Never touch the host site.** All overlay UI lives in a closed Shadow DOM, positioned `fixed`, with no global CSS and no changes to the site's layout.

**Visual direction:** the deck's teal/cyan on deep navy, interpreted as restrained "circuit-trace" glass rather than a busy cyberpunk theme. The deck's notched frame (a chamfered corner with a small node) becomes the badge's signature shape.

---

## 2. Design tokens

### 2.1 Colour (dark glass for on-page UI; extension pages follow `prefers-color-scheme`)

| Token | Hex | Use |
|-------|-----|-----|
| `--sz-midnight` | `#0B1220` | Base surface (badge, popover, popup) |
| `--sz-ink` | `#111B2E` | Raised surface, inputs |
| `--sz-cyan` | `#22D3EE` | Primary accent, borders, protected glow |
| `--sz-mist` | `#E6EDF7` | Primary text |
| `--sz-slate` | `#94A3B8` | Secondary text |
| `--sz-indigo` | `#A5B4FC` | Focus ring (on dark), links |
| `--sz-ready` | `#2DD4BF` | Ready state dot |
| `--sz-detected` | `#F5B94B` | Detected state |
| `--sz-protected` | `#34D399` | Protected state |
| `--sz-blocked` | `#FB7185` | Blocked state |
| `--sz-line` | `rgba(34,211,238,.35)` | 1 px edge |

Contrast: all text/background pairs above ≥ 4.5:1 (verify with a checker during build). Never use colour alone: each state has an icon and text label.

Light theme (extension pages only): background `#F6F9FC`, surface `#FFFFFF`, text `#0B1220`, secondary `#475569`, accent `#0891B2`, focus `#4F46E5`; state colours darkened to AA on white (`#B45309`, `#047857`, `#BE123C`).

### 2.2 Type
| Role | On-page overlay | Extension pages |
|------|-----------------|-----------------|
| UI | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | IBM Plex Sans (400/600), bundled Latin-subset woff2 (OFL); fallback system stack |
| Values / tokens | `ui-monospace, "SF Mono", Menlo, Consolas, monospace` | IBM Plex Mono (400) bundled |

Scale (px): 12 caption · 13 body-small (overlay default) · 14 body · 16 title-small · 20 title · 24 page title. Line-height 1.4 (1.5 for paragraphs). Max line length 70 characters. Sentence case everywhere; no all-caps labels; no eyebrow labels.

### 2.3 Space, shape, depth
- Spacing scale: 4 · 8 · 12 · 16 · 24 · 32.
- Radius: 6 (controls), 10 (panels), 999 (pill body). Badge has one **chamfered top-left corner (8 px)**.
- Depth: overlay `box-shadow: 0 8px 24px rgba(0,0,0,.35)`; Detected/Protected add a 0 0 0 1px state colour edge at 40% opacity (no big glows).
- z-index: shadow host `2147483000`; host has `pointer-events:none`, interactive children `pointer-events:auto`.

### 2.4 Motion
| Motion | Spec |
|--------|------|
| **Swap (signature)** | On Protecting→Protected: text crossfade 160 ms + one 280 ms cyan sweep line (left→right, `ease-out`) |
| Popover open/close | 120 ms opacity + 4 px translateY (answers a click) |
| Toast enter/exit | 160 ms opacity + 8 px translateY |
| State dot colour | 120 ms |
| Everything else | None |
`@media (prefers-reduced-motion: reduce)` → all durations 0 and no sweep.

---

## 3. On-page components

### 3.1 Ghost Badge
Placement: `position: fixed`, anchored to the composer container's bounding box: **left = composer.left + 12, bottom = viewport height − (composer.top − 8)**. Follows the composer via `ResizeObserver` + `visualViewport` resize + `scroll` (rAF-throttled). If less than 40 px of space above the composer, place inside the composer's top-right corner instead. Never overlaps the send button. Height 28 px, min target 24 px.

Structure: `[state dot] [label] [type chips… max 2 + "+n"]`; entire pill is a `<button>` (`aria-haspopup="dialog"`, `aria-expanded`).

```
                    ┌─◤ ● 2 sensitive values will be replaced  [API key] [Client] ┐
 composer top edge ─┴──────────────────────────────────────────────────────────────
 │ Debug my Stripe integration for Acme Capital…                          (send) │
```

| State | Dot | Label | Extra |
|-------|-----|-------|-------|
| Hidden | – | – | Composer not found |
| Ready | teal | SanitAIze ready | Subtle: 70% opacity, no chips |
| Detected | amber | `n` sensitive value(s) will be replaced | Type chips; 1 px amber edge |
| Protecting | cyan (pulsing dot only if motion allowed) | Replacing values… | ≤ 200 ms typically |
| Protected | green | `n` values replaced | Swap animation; reverts to Ready after 4 s |
| Blocked | rose | Not sent | Persistent until edit/dismiss; `role="alert"` |
| Paused | amber outline | Protection paused | Click → Resume |
| Off | grey | SanitAIze off for this site | Click → open popup guidance |
| Not protecting | rose outline | Not protecting — reload this tab | Patch lost or extension updated |

Type chip labels (sentence case): API key, Secret, Private key, Token, Database URL, Email, IP address, Host name, Client name.

### 3.2 Detection popover (opens from the badge; `role="dialog"`, labelled by the badge)
Width 320 px, max-height 280 px (scroll). Header: "What SanitAIze will replace". Rows:
```
┌──────────────────────────────────────────────┐
│ What SanitAIze will replace                  │
│ ──────────────────────────────────────────── │
│ API key      sk_live_…ef01     [Ignore]      │
│ Client name  Acme Capital      [Ignore]      │
│ Database URL postgres://…/acme_prod [Ignore] │
│ ──────────────────────────────────────────── │
│ Your text stays as you typed it. Only the    │
│ copy sent to the AI is changed.              │
│ [How to verify]                              │
└──────────────────────────────────────────────┘
```
- Real values shown **masked** (first 8 + … + last 4 for keys; client names shown in full because the user typed them; passwords always masked `••••••`).
- "Ignore" → label becomes "Ignored in this tab" and row dims.
- Esc closes; focus returns to badge; arrow keys move between rows.
- After send, the same popover (opened via the toast's "See what changed") lists `type · masked real → stand-in`.

### 3.3 Toast
Bottom-right, 16 px from edges (mobile-width viewports: full width minus 16). Max width 360. `role="status"`, `aria-live="polite"`; blocking toasts use `role="alert"`.
- Success (auto-dismiss 4 s; pause on hover/focus): "2 values replaced with stand-ins. Your real data stayed in this tab." · action **See what changed**.
- One toast at a time; a new one replaces the old one.
- Blocking toasts (Blocked) persist until dismissed, include a close button and the code in small text ("Code E_LEAK_ASSERT") for support.

### 3.4 Attachment note (P1)
When the site's attachment UI adds a file, show a one-line note above the badge: "Files aren't scanned. Send text only for protection." Dismissible for the session.

---

## 4. Extension popup (360 × auto, max 520)

```
┌────────────────────────────────────────┐
│ [logo] SanitAIze                 ( on )│
│ chatgpt.com                    ● Active│
├────────────────────────────────────────┤
│ This tab                               │
│ 7 values replaced                      │
│ API key 3 · Client 2 · Database URL 1 …│   (type counts, no values)
│ Stand-in list: 7 entries · memory only │
│ [Clear stand-in list]                  │
├────────────────────────────────────────┤
│ Last message      ✓ 2 replaced · 6 ms  │
│ ▸ How to verify in Chrome DevTools     │
├────────────────────────────────────────┤
│ Settings     Dictionary     Pause tab  │
└────────────────────────────────────────┘
```
States: **Active**, **Off for this site**, **Paused**, **Managed** (lock icon + "Set by your organisation"), **Unsupported page** ("SanitAIze works on ChatGPT and Claude. Open one of them to get started."). The toggle is the site toggle. "Clear stand-in list" opens an inline confirm: "Older replies in this chat will keep showing stand-ins. Clear anyway?"

"How to verify" (inline accordion, 5 short steps, copy from `03_App_Flow.md` §7).

---

## 5. Options page (full tab, max-width 880, left tab list)

Tabs (sentence case): **General · Detection · Dictionary · Audit log · Test Lab · About**

**General:** Enable SanitAIze (switch) · Sites (ChatGPT, Claude switches) · If something goes wrong: radio "Don't send the message (recommended)" / "Send it without protection" · Notifications (toasts on/off) · Badge (on/off) · Idle clear (Never / 30 min / 60 min).
**Detection:** category switches (API keys & tokens, Private keys, Database URLs, Generic secrets, Emails, IP addresses, Host names, Client names) + sensitivity segmented control (Relaxed · Balanced · Strict) with one-line explanation each.
**Dictionary:**
```
┌ Dictionary ────────────────────────── [Import] [Export] [Add a name] ┐
│ ⚠ Add names and codenames only. Never store passwords or keys here.  │
│ Search…                                                              │
│ Name             Also matches        Kind      Case   On             │
│ Acme Capital     Acme, ACME Cap      Client    off    [x]  ⋯         │
│ Project Falcon   Falcon              Project   off    [x]  ⋯         │
└──────────────────────────────────────────────────────────────────────┘
```
Empty state: "No names yet. Add client names or project codenames so SanitAIze can protect them too." · **Add a name**.
**Audit log:** switch "Keep a count of what was replaced"; table (time, site, counts by type, ms); Export CSV; Clear. Copy: "Stores counts only. Never the values or their stand-ins."
**Test Lab:** two-pane layout (input | result) with highlighted replacements and a mapping table; "Simulate a reply" box below; footer: "Nothing here leaves this page."
**About:** version, "How it works" diagram, "How to verify", privacy statement, links to docs.
Managed settings show a lock icon, disabled control, and the note "Managed by your organisation".

---

## 6. Onboarding page (opens on install; single scrolling page)

This one *is* a sequence, so numbered steps are appropriate:
1. **What it does** — three-line explanation + tiny diagram (typed → replaced → restored).
2. **Try it** — button "Open ChatGPT", sample prompt in a copyable code block using fake values.
3. **Check it yourself** — DevTools steps with a screenshot placeholder.
4. **Good to know** — "Reloading a chat clears the stand-in list, so older messages show stand-ins." · "Text only: files and images aren't scanned." · "Add your client names in Settings → Dictionary."
Footer: "Pin SanitAIze to your toolbar" hint.

---

## 7. Iconography and assets

| Asset | Spec |
|-------|------|
| Logo (shield with S) | Use the deck's shield mark; export 16/32/48/128 PNG + SVG |
| Toolbar icon states | Normal (colour), Off/unsupported (grey), Blocked (rose dot) |
| Toolbar badge text | Count of values replaced in this tab, capped "99+", background `#22D3EE`, text `#0B1220`; empty when 0 |
| State icons | Inline SVG (shield-check, alert-triangle, pause, lock); 16 px; `aria-hidden` with adjacent text |
| Web Store | 1280×800 screenshots: badge detected, DevTools payload showing mocks, before/after reply |

---

## 8. Copy deck (sentence case; same verb for the same action everywhere)

**Vocabulary:** say **stand-ins** (not "mocks") and **replace/restore** in the UI. "Sensitive value" is the generic noun.

| Where | Copy |
|-------|------|
| Ready | SanitAIze ready |
| Detected | 1 sensitive value will be replaced / *n* sensitive values will be replaced |
| Protecting | Replacing values… |
| Protected | 1 value replaced / *n* values replaced |
| Success toast | *n* values replaced with stand-ins. Your real data stayed in this tab. |
| Toast action | See what changed |
| Popover footer | Your text stays as you typed it. Only the copy sent to the AI is changed. |
| Ignore | Ignore in this tab → "Ignored in this tab" |
| Pause confirm title | Pause protection for this tab? |
| Pause confirm body | Messages will be sent exactly as typed. Your real data will reach the AI provider. |
| Pause buttons | Pause for 15 minutes · Keep protection on |
| E_CONFIG_TIMEOUT | Message not sent. SanitAIze wasn't ready yet. Wait a moment, then send again. |
| E_PARSE_BODY / E_UNSUPPORTED_BODY | Message not sent. This site changed how it sends messages, so SanitAIze can't protect it. Update the extension, or turn it off for this site. |
| E_LEAK_ASSERT | Message not sent. SanitAIze couldn't confirm a sensitive value was removed. Edit the message and try again. |
| E_VAULT_FULL | Message not sent. This tab's stand-in list is full. Clear it from the SanitAIze popup, then send again. |
| E_INPUT_TOO_LARGE | Message not sent. It's too large to check. Split it into smaller messages. |
| E_TRANSFORM_FAIL / other | Message not sent. Something went wrong while protecting it. Try again. |
| Fail-open notice | Sent without protection. Change this in Settings → General. |
| Compatibility warning | This site changed. SanitAIze is checking every part of your message to stay safe. |
| Not protecting | Not protecting — reload this tab |
| Attachment note | Files aren't scanned. Send text only for protection. |
| Unsupported page | SanitAIze works on ChatGPT and Claude. Open one of them to get started. |
| Reload note | Reloading clears the stand-in list, so older messages show stand-ins. |
| Empty dictionary | No names yet. Add client names or project codenames so SanitAIze can protect them too. |
| Audit off | Audit log is off. Turn it on to keep counts of what was replaced. It never stores the values. |
| Managed lock | Managed by your organisation |

---

## 9. Accessibility

- WCAG 2.1 AA: contrast, focus visible (2 px `--sz-indigo` ring, 2 px offset), no colour-only meaning, target size ≥ 24 px.
- Screen readers: badge is a labelled button; state changes announced through one visually hidden `aria-live="polite"` region (Blocked uses `role="alert"`); don't announce every keystroke-driven change, only transitions to Detected/Protected/Blocked.
- Keyboard: Tab reaches the badge after the composer's controls; Enter/Space opens the popover; Esc closes; `Alt+Shift+S` focuses the badge (P1).
- Respect `prefers-reduced-motion` and `prefers-color-scheme` (extension pages) / always-dark glass (overlay).
- Text scales with browser zoom up to 200% without clipping in popup/options.

---

## 10. Responsive and host-site safety

- Overlay must work at composer widths from 320 px to full desktop; the badge truncates the label with ellipsis and keeps the dot and count.
- The overlay uses `position: fixed`, never alters host layout, never injects styles outside its closed shadow root, and removes itself completely if disabled.
- If the composer cannot be found, show nothing (never guess a position).
- Popup/options/onboarding are desktop-first; options reflow to one column below 720 px.

---

## 11. Design QA checklist

- [ ] All six badge states + Not protecting render correctly on ChatGPT light and dark, and Claude light and dark.
- [ ] No layout shift on the host page when the badge appears/disappears.
- [ ] Swap animation plays once; reduced-motion disables it.
- [ ] Popover is keyboard-operable and returns focus.
- [ ] Every error code has copy and a next step.
- [ ] No real value is displayed unmasked except user-typed client names; passwords always masked.
- [ ] Popup, options and onboarding pass axe/Lighthouse accessibility checks.
- [ ] Bundled fonts subset to Latin; total bundle ≤ 300 KB.
