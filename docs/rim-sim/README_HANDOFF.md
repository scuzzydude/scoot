# RIM⁵ SIM — handoff bundle v0.2, for BigMo

**Supersedes v0.1** (`rim-sim-framework_v0.1.tar.gz`). If you extracted that one, replace it
— level 1 has since gained the recursion diagram and the original Recursive Integration
figures, and the stylesheet has gained responsive fixes.

**Serve it at** `/var/www/html/rim-sim/` behind the existing Apache vhost. Pure static: no
build step, no `node_modules`, no CDN, no webfont, no data files, no server. Extract and
it works.

---

## 1. The hierarchy, which is the point

```
level 1   RIM⁵            the pattern          IDENTICAL on every host
level 2   BigMo           the machine          this host
level 3   Scoot(34)       a design             projects / implementation
              └── implementations: cards, staking, ledger, routing, the bot
```

**Level 1 is identical to the other host's, deliberately.** RIM and REDS are open
methodology, so the pattern page is the same page — same chain, same recursion diagram,
same criteria, same figures. Only two things in it were changed, and both are instance
rows rather than pattern content: the "three levels" table and "where the pieces sit" now
name BigMo and Scoot(34) instead of the other host's instances.

**Scoot(xx) sits at the projects/implementation level.** One page per Scoot, implementations
beneath it. A later Scoot gets a sibling of `design/index.html`, not a rewrite — add it to
the selector's `SCOPES` array.

---

## 2. What is in here

```
rim-sim/
├── README_HANDOFF.md
├── rim5/index.html          level 1 — ships as-is. 361 lines.
│   └── media/               5 original RI figures (324 KB)
├── machine/index.html       level 2 — PRE-FILLED for BigMo, verify and extend
├── design/index.html        level 3 — PRE-FILLED for Scoot(34)
└── _shared/
    ├── sim_common.css       the design system, rules verbatim, comments rewritten
    ├── rim_selector.css
    └── rim_selector.js      labels already say RIM⁵ / BigMo / Scoot(34)
```

**Pre-filled, not tokenised.** v0.1 handed you `MACHINE_NAME` placeholders. This one is
written from your own questionnaire answers: real service names and ports, the real Scoot
identity, the real implementation list, and your honest 4-of-8 criteria score. It is a
starting position rather than a form to fill in — but it is a week old, so verify before
trusting.

---

## 3. The figures on level 1, and why they travel

Five originals, all Brandon's own methodology material:

| File | What it shows |
|---|---|
| `ri_spirals.jpg` | **positive and negative recursive integration** — hand-drawn. Positive unwinds outward from the centre (expanding scope); negative winds inward (making the solution smaller, faster). Mathematical signs, not value judgements. |
| `ri_linear_integration.png` | the conventional flow — eight problem/solution blocks, each growing in one direction, alternating |
| `ri_recursive_integration.png` | both directions at once, compounding. Five iterations reach further than the eight beside them |
| `ri_design_cycle.png` | Code → Test → Debug. The unit of iteration the spirals are made of |
| `reds_two_axes.png` | REDS: a vertical education axis crossed with cointegration across disciplines |

These are the vocabulary the five positions are built on, which is why they belong on the
pattern page rather than a host page. Reproduced as drawn.

---

## 4. Checking it works

1. `/rim-sim/rim5/index.html` — the header shows a **Scope** dropdown with three options,
   `RIM⁵` selected. All five figures render.
2. Choose `BigMo` → navigates to `machine/index.html`, and its dropdown shows `BigMo`
   selected on arrival.
3. Choose `Scoot(34)` → level 3. Then back to `RIM⁵`.
4. Narrow the window to phone width. **Nothing should scroll sideways** — verified 0px
   horizontal overflow from 1440px down to 360px on the originating host.

If the dropdown renders empty, `rim_selector.js` did not load — check the relative path
from the page's own directory, which is the only thing that can break here.

---

## 5. Two traps that cost the sending host real time

**A stylesheet can 404 and still return HTTP 200.** A dev server with an SPA fallback
returns `Content-Type: text/html` for a missing asset, so the page loads unstyled with no
error anywhere and every check passes. This exact failure happened on the sending host
while packaging this bundle — a shared-CSS symlink went missing and four pages rendered in
serif with no panels. Check the **content type**, not the status code:

```
curl -sD- -o /dev/null http://localhost/rim-sim/_shared/sim_common.css | grep -i content-type
```

**Do not make `_shared/` a symlink to somewhere else.** That is what broke on the sending
host. If two trees need the same stylesheet, copy it and diff it in CI, or serve one from a
path both can reach — but a symlink into another repository dangles silently and takes every
page with it.

---

## 6. What to do next, in order

1. **Extract and serve.** Confirm §4. Costs nothing and gives you the level-1 page, which is
   the part that is finished.
2. **Verify level 2's service table** against the host as it is now.
3. **Pick one implementation to deep-dive.** The player-card pipeline is the closest
   analogue to a chip SIM: real inputs, visible stages, a rendered output, a state machine
   worth drawing. The commissioner is a running service and the routing is closer to a Map.
4. **Update the 4-of-8 score as Phase 2 lands.** Positional authority and the append-only log
   are the two that move; the score is supposed to change, and a page that overstates the
   machine is worse than one admitting four of eight.

Nothing here is committed to any repository but BigMo's own.
