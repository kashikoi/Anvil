# Anvil — agent context / project memory

Checked-in snapshot of working context for the Anvil app. If you're an agent picking
this up in a new session, read this first.

## What this is
- A personal, local-first **runbook / procedural how-to vault**, part of the kashikoi
  cloud-themed app suite (Cumulus, Nimbus, Cirrus, Stratus). Repo:
  github.com/kashikoi/Anvil.
- Named after the Cumulonimbus Incus (anvil cloud). Storm/Dusk theme is the default.
- Plain vanilla HTML/CSS/JS, no build step, no backend. Open `index.html` directly or
  host on GitHub Pages.

## Architecture & conventions
- Files: `index.html`, `styles.css`, `app.js`, `icon.svg`, `manifest.webmanifest`,
  `README.md`.
- `app.js` is wrapped in an IIFE; element refs cached in `el` via `cacheEls()`.
- **Hierarchy:** Workspace (Domain) → Subsystem (Category) → Runbook (Card).

## Data model (localStorage)
- `anvil_cloud_runbooks` — `{ workspaces: [...], runbooks: [...] }`.
  - workspace: `{ id, name, icon }`. Default: a single empty `general` workspace.
  - runbook: `{ id, workspaceId, subsystem, title, tags[], toolsNeeded[], steps[],
    gotchas (string), lastVerified, updatedAt }`.
  - `steps` are strings; inline image via ` | <url|data-uri>` suffix (parsed by
    `parseStep`).
  - `load()` migrates a legacy top-level array into `{workspaces:defaults, runbooks}`.
  - First run starts empty (no sample content). Settings → **Randomize data (demo)**
    loads `demoData()` (4 workspaces, 4 runbooks); **Clear all data** wipes back to the
    empty default. Both confirm first.
  - Older builds auto-seeded the Genie/brake-bleed samples. `purgeLegacySeed()` runs once
    (guarded by `anvil_cloud_seed_purged`) to drop those if still untouched, plus empty
    legacy default workspaces; edited/user content is kept.
- `anvil_cloud_theme` — `"storm"` (default) | `"day"`. Head script in index.html adds
  `html.day` before first paint to prevent FOUC.
- `anvil_cloud_checks` — **sessionStorage** only; per-runbook step checkbox state.

## UI notes / gotchas
- `[hidden] { display:none !important }` is set globally in styles.css because
  `.lightbox { display:flex }` (and similar) would otherwise override the `hidden`
  attribute and leave overlays visible. Keep that rule.
- Breadcrumb dropdowns + workspace cards + crumb all call `selectWorkspace()`, which
  resets `activeSubsystem`/`activeTag` to avoid dangling filters out of scope.
- Search is scoped to the active workspace unless `searchGlobal` is on (Scope button or
  **Alt+Enter**). `/` focuses search; `Cmd/Ctrl+S` saves in the editor; `Esc` closes
  lightbox / exits Workbench mode.
- Workbench (kiosk) mode toggles `.app.is-kiosk` + `.shell.is-kiosk` (hides topbar),
  full width, ~+20% font.
- Responsive: ≤820px becomes a vertical glass stack; viewing a runbook hides rail+deck.

## Release flow
Same pattern as the other cloud apps (develop → version-bump `?v=` asset strings →
`build/` mirror if/when one is added → commit "Release Anvil <version>" → merge to main).
No `build/` mirror exists yet — add one only when a formal release is cut.
