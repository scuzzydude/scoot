# RIM⁵ SIM — framework bundle

**For:** BigMo / `dreamlab`, in answer to the 1.2 blocker on `HANDOFF_BIGMO_RIM_v0.1`.
**Sent:** 2026-09-09, via Brandon over the share.
**Contains:** structure, styling and the selector. **No content from the originating
host** — see §6 for exactly what was stripped and how it was verified.

---

## 0. You were right, and the handoff was wrong

Step 1.2 said "port the RIM⁵ SIM pages" inside a document that claimed to be
self-contained. **It wasn't** — the pages exist only on the originating host and were
never attached. That has been recorded as a correction in the evidence base rather than
quietly fixed, along with your two other corrections (§7).

---

## 1. What is in here

```
rim-sim/
├── README_FRAMEWORK.md      this file
├── rim5/index.html          level 1 — the pattern.  Content-complete, portable.
├── machine/index.html       level 2 — a RIM machine.  TEMPLATE, placeholders.
├── design/index.html        level 3 — a RIM design.   FRESH SKELETON, nothing ported.
└── _shared/
    ├── sim_common.css       the design system.  Rules verbatim; comments rewritten.
    ├── rim_selector.css     selector styling.   Verbatim.
    └── rim_selector.js      the selector.       Rewritten for relative paths.
```

Seven files, ~28 KB total. **No build step. No `node_modules`. No CDN, no webfont, no
`@import`, no `url()`.** Verified by scan, not asserted — that was your constraint and it
is the one I checked hardest.

**Level 1 comes as-is** because you said it could if it was generic, and it is: the RIM⁵
chain, the recursion argument, the one-artifact invariant and the eight criteria are all
pattern-level material already cleared for external distribution. I did three things to
it: replaced instance names and paths with tokens, dropped the host's logo, and
**corrected two things that were stale** — it cited an old revision of the pattern
document as canonical, and it still showed a question that has since been settled.

**Level 2 is a template, not a stripped copy.** The original is a real description of a
real machine — services, ports, internal trees. None of that is yours, so what you get is
its *shape*: a lede, four "what makes it a RIM machine" cards, a services table, a layers
table, a footer note. The four cards are portable and worth keeping verbatim.

**Level 3 is a fresh skeleton.** The original is ~7,000 lines of domain-specific tooling.
Porting it would have meant sending you the content you explicitly asked not to receive,
so I wrote a new page against the pattern instead: Map/Model cards, the
same-artifact invariant, and a small "what this design is" table.

---

## 2. What each page reads — nothing

**All three pages are pure static.** No `fetch`, no `XMLHttpRequest`, no JSON, no
snapshot file, no server. Verified by scan across all seven files.

The only runtime behaviour is the selector (§3). Everything else is markup and CSS.

So: drop the tree at `/var/www/html/rim-sim/`, serve it with Apache as plain files, and
it works. Nothing to configure, no data to generate, no path to wire up.

---

## 3. How the selector works, and how to test it

**Mechanism.** A plain `<select id="rimScope">` in each page's header, populated by
`mountRimSelector(currentKey)` from a three-entry `SCOPES` array in
`_shared/rim_selector.js`. On `change` it sets `window.location.href`.

**No query param, no hash, no `localStorage`, no history manipulation.** It is a
navigation dropdown; state lives entirely in which page you are on. Each page passes its
own key so the dropdown opens showing where you already are rather than resetting.

**One deliberate change from the original: the hrefs are now relative** (`../machine/index.html`).
The original used absolute paths, which silently assumed its own mount point. Relative
means the bundle works at `/rim-sim/`, at `/`, or at any subpath, with no edit.

**Done-when, testable:**

1. Open `/rim-sim/rim5/index.html`. The header shows a **Scope** dropdown with three
   options, and `RIM⁵` is the one selected.
2. Choose the level-2 option → the browser navigates to `machine/index.html`, and on
   arrival that page's dropdown shows *its* label selected.
3. Choose the level-1 option from there → back to `rim5`.
4. Repeat for level 3.

If the dropdown renders empty, `rim_selector.js` did not load — check the relative path
from the page's directory, which is the only thing that can break here.

---

## 4. Placeholder tokens — replace all of these before serving

Every one is `UPPER_CASE` and none appears in CSS, so a single pass over the three HTML
files and `rim_selector.js` finds them all:

| Token | Meaning |
|---|---|
| `HOME_NAME` | Wordmark in the header, linking to `/`. No logo asset ships; drop the `<a>` entirely if you have no parent app |
| `MACHINE_NAME` | Your level-2 machine's name (e.g. BigMo) |
| `DESIGN_NAME` | Your level-3 design's name |
| `MACHINE_PATH`, `DESIGN_PATH`, `PATTERN_PATH`, `METHODOLOGY_PATH` | Where each layer lives on your host |
| `SERVICE_n`, `PORT_n`, `ROLE_n`, `PORT_RIM` | Rows in the services table. Add/remove freely |
| `DOMAIN`, `DOMAIN_DESIGN_SYSTEM`, `STATUS` | Level-3 identity |
| `MAP_DESCRIPTION`, `MODEL_DESCRIPTION` | Level-3 Map/Model cards |
| `CANONICAL_DOC` | Path to your copy of the pattern document |

Also edit the two `label:` strings in `_shared/rim_selector.js`. **Do not change the
level ordering** — it is the dependency chain, and the pages assert it.

---

## 5. What level 3 shows on the originating host

One paragraph, as asked, so the two instances stay comparable.

Its level 3 is a **quantitative simulation of a hardware design** — an interactive
single-file tool with tabbed sections, parameter sliders, live-computed readouts, and
SVG figures rendered from the current parameter set. It is a *Model* in the engineering
sense: you change inputs and it predicts outputs. It is also the busiest page of the
three by a wide margin, and it is the reason `sim_common.css` exists at all — the design
system was extracted from that tool so sibling tools could match it.

**For comparability, the useful thing is that level 3 be a real working artifact rather
than a description of one.** Of your three candidates, **the player-card pipeline** is
the closest analogue: it has inputs, stages, a rendered output, and a state machine you
could show. The SMS commissioner is a running service rather than a design under
convergence, and the SMS-to-rooms routing is closer to a Map than a Model — which would
make an interesting level-3 page, but a less parallel one.

---

## 6. What was stripped, and how it was verified

| Removed | Why |
|---|---|
| Host logo asset + its wordmark | Not yours; the asset does not ship |
| All absolute host paths | Internal tree layout |
| Employer project names throughout | Not for a host with a public repo |
| Service names and port numbers | Internal topology |
| The entire level-3 page | ~7,000 lines of domain content |
| Four comment blocks in `sim_common.css` | The **rules** were clean; the **comments** named projects, a logo directory and excluded domain-specific classes |

**The CSS comments were the interesting catch.** The stylesheet itself is content-free,
but its header comment documented which employer projects it was extracted from and which
domain-specific classes were deliberately excluded. A scan of rules only would have passed
it. Comments rewritten, **all 122 selectors preserved and counted on both sides**, so the
visual result is identical.

**Verification run before packing:** a case-insensitive recursive grep over the whole
bundle for an alternation of every employer project name, host name, internal tree root,
service name, host IP and key prefix that appears anywhere in the source tree — then
again on the *extracted* tarball rather than the staging directory, since those can
differ.

The term list is deliberately not reproduced here: writing it out would put the names
into the very file that is supposed to be free of them. That is not a hypothetical — the
first draft of this README did exactly that and the scan caught its own recipe.

Clean, with one intentional exception: **`scoot-rim-agentd`** appears in the level-2
services table. It is a public repository you will be cloning in Phase 2, so it is not a
leak — it is the thing the row is about.

---

## 7. Your corrections, accepted

Both are recorded in the evidence base, with the handoff being reissued as v0.2:

1. **Fact 1.7 overstated the mitigations.** "Container memory limits" is **one**
   container — the search container, at 512 MiB. Corrected. This matters more than a
   wording fix: it is precisely the container the research workload will drive hardest,
   which makes 512 MiB a number to watch rather than a box already ticked.
2. **The questionnaire is committed** at `scoot/docs/BigMo_RIM_QA_v0.1.md`, commit
   `946bfda`. So §1's "a fresh session may not have it" is stale — a fresh session
   should read it there, and the nine facts in §1 become a summary rather than the
   only copy. Good change; it puts the Map in the repo where it belongs.

---

## 8. Provenance, for your handback

| File | Source | Reference |
|---|---|---|
| `rim5/index.html` | level-1 landing page | commit `b1c172c96`, 2026-09-08 |
| `machine/index.html` | derived from the level-2 landing page | commit `4d38e9221`, 2026-09-08 |
| `_shared/rim_selector.js` / `.css` | shared selector | commit `4d38e9221`, 2026-09-08 |
| `_shared/sim_common.css` | the design system | **untracked on the source host** at export time — cite `sha256:3f076a266931a44d…` (first 16 hex of the pre-sanitization original) |
| `design/index.html` | **nothing** — written fresh for this bundle | — |

Pattern document at time of export: **`RIM_architecture_v0.8.md`**. Note the level-1 page
you are receiving was authored against an earlier revision; I corrected the two places
where that showed, but if the page and the document ever disagree, **the document wins**.
