# Anvil — Personal Runbook & How-To Vault

## Overview
- **Name:** Anvil (after the Cumulonimbus Incus / anvil cloud).
- **Purpose:** A local-first, zero-backend knowledge base for personal runbooks and procedural how-tos — garage fixes, race-car build steps, shop equipment, software systems, etc.
- **Design Inspiration & Sister Apps:** Shares the sky/cloud design language of Cumulus, Nimbus, Cirrus, and Stratus (frosted glass, dual atmospheric theme, no-build vanilla HTML/CSS/JS).

## Technology & Design Philosophy
- **Stack:** Plain vanilla HTML5, CSS3, ES2015+ JavaScript. No framework, no bundler, no build step.
- **Local-first:** All data persists in `localStorage`; 100% private to the browser. JSON import/export for backup.
- **Deploy:** Static site — open `index.html` directly (`file://`) or host on GitHub Pages.

## Data Model (localStorage)
- `anvil_cloud_runbooks` — `{ workspaces: [...], runbooks: [...] }`
  - **workspace:** `{ id, name, icon }`
  - **runbook:** `{ id, workspaceId, subsystem, title, tags[], toolsNeeded[], steps[], gotchas, lastVerified, updatedAt }`
  - `steps` are strings; append an inline image to any step with ` | https://…` or ` | data:image…`.
- `anvil_cloud_theme` — `"storm"` (default) or `"day"`.
- `anvil_cloud_checks` — **sessionStorage** only; per-runbook step checkboxes (reset when the tab closes).

## Hierarchy
Workspace (Domain) → Subsystem (Category) → Runbook (Card).

## Key Features
- **Breadcrumb switcher:** `ANVIL / Workspace ▾ / Subsystem ▾` in the top bar.
- **Workspace sidebar:** workspace cards with counts, "All Workspaces" master toggle, and "+ New Workspace".
- **Scoped search:** fuzzy search scoped to the active workspace by default; toggle to global via the Scope button or **Alt+Enter**. `/` focuses the search box.
- **Execution canvas:** prerequisites/tools callout, interactive numbered steps with session checkboxes and expandable image thumbnails, and an amber Pitfalls & Gotchas banner.
- **Workbench (Kiosk) mode:** collapses the rail + deck, goes full width, and enlarges type ~20% for hands-busy reading.
- **Glass editor:** Workspace dropdown + Subsystem autocomplete, tags, tools, steps, gotchas. `Cmd/Ctrl+S` saves.
- **Dual theme:** Storm/Dusk (default) and Daylight Sky, resolved before first paint to avoid FOUC.
- **Starts empty:** no sample content on first run. Settings → **Randomize data (demo)** loads a sample set to explore; **Clear all data** wipes everything back to a blank vault.

## Files
`index.html`, `styles.css`, `app.js`, `icon.svg`, `manifest.webmanifest`.
