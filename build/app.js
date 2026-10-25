/* ============================================================
   ANVIL — Runbook & how-to knowledge base
   Multi-tier hierarchy: Workspace (Domain) -> Subsystem -> Runbook
   Zero backend. All state in localStorage / sessionStorage.
   ============================================================ */
(function () {
  "use strict";

  const STORE_KEY = "anvil_cloud_runbooks";
  const THEME_KEY = "anvil_cloud_theme";
  const ACTIVE_THEME_KEY = "anvil_cloud_active_theme"; // sessionStorage, resolved random pick
  const CHECKS_KEY = "anvil_cloud_checks"; // sessionStorage, per-runbook step checks
  const SEED_PURGED_KEY = "anvil_cloud_seed_purged"; // one-time removal of pre-2026.10.25 auto-seeded samples
  const REMEMBER_CLOUD_PHRASE_KEY = "anvil_cloud_phrase"; // localStorage, opt-in remembered phrase

  const APP_VERSION = "2026.10.25.2";
  const THEMES = ["day", "twilight", "night"];

  // ---------- Cloud sync / unified backup (shared Kashikoi suite worker) ----------
  const CLOUD_SYNC_ENDPOINT = "https://nimbus-sync.nimbus-sync.workers.dev";
  const CLOUD_SYNC_FORMAT = "kashikoi-encrypted-backup-v1";
  const LEGACY_CLOUD_SYNC_FORMAT = "nimbus-encrypted-backup-v1";
  const UNIFIED_BACKUP_SCHEMA = "kashikoi-app-backup-v1";
  // The shared sync Worker only accepts envelopes tagged "Nimbus"/"Cumulus"; since every app
  // reads/writes the same blob, Anvil tags it "Nimbus" so the PUT validates and the other apps
  // can still decrypt it. The honest author is recorded separately in `writtenBy`.
  const CLOUD_ENVELOPE_APP = "Nimbus";
  const ACCEPTED_ENVELOPE_APPS = new Set(["Nimbus", "Cumulus", "Cirrus", "Stratus", "Anvil"]);
  const RECOVERY_PHRASE_WORD_COUNT = 16;
  const CLOUD_KDF_ITERATIONS = 600000;
  const RECOVERY_WORDS = [
    "anchor", "apricot", "arbor", "aurora", "basalt", "beacon", "birch", "bison",
    "blossom", "boulder", "breeze", "canyon", "cedar", "cinder", "cirrus", "clay",
    "clover", "cobalt", "comet", "coral", "cove", "crater", "crystal", "cumulus",
    "current", "dawn", "delta", "dune", "ember", "evergreen", "fathom", "fern",
    "fjord", "flint", "forge", "fossil", "galaxy", "garnet", "geyser", "glacier",
    "granite", "grove", "harbor", "hazel", "heather", "horizon", "ivory", "jade",
    "juniper", "kelp", "lagoon", "lantern", "lichen", "lilac", "lumen", "magma",
    "maple", "marble", "meadow", "meridian", "mesa", "mica", "mist", "monsoon",
    "moss", "nebula", "nectar", "oasis", "obsidian", "ocean", "onyx", "opal",
    "orchard", "pebble", "petal", "pine", "pollen", "prairie", "quartz", "quill",
    "rapids", "ravine", "reef", "ridge", "ripple", "river", "sable", "saffron",
    "sage", "sandbar", "sapphire", "savanna", "sequoia", "shale", "shore", "sierra",
    "slate", "solstice", "spruce", "storm", "summit", "tempest", "thicket", "thunder",
    "tide", "timber", "topaz", "trellis", "tundra", "valley", "vapor", "verdant",
    "vertex", "vista", "willow", "wisp", "zenith", "zephyr",
  ];

  let cloudDataDirty = false;

  // ---------- In-memory state ----------
  let db = { workspaces: [], runbooks: [] };
  let activeWorkspaceId = null; // null => All Workspaces
  let activeSubsystem = null;   // null => all subsystems
  let activeTag = null;         // null => all tags
  let searchQuery = "";
  let searchGlobal = false;     // false => scope to active workspace
  let selectedId = null;
  let isKiosk = false;

  const $ = (id) => document.getElementById(id);
  const el = {};

  // ---------- Default workspace (neutral starter — no sample content) ----------
  const DEFAULT_WORKSPACES = [
    { id: "general", name: "General", icon: "📁" },
  ];

  // Rich sample content, only loaded via the "Randomize data" button.
  function demoData() {
    const now = new Date().toISOString();
    const workspaces = [
      { id: "home", name: "Home & Property", icon: "🏠" },
      { id: "e82-build", name: "BMW 128i Race Build", icon: "🏎️" },
      { id: "workshop", name: "Shop & Equipment", icon: "🛠️" },
      { id: "tech", name: "Software & Systems", icon: "💻" },
    ];
    const runbooks = [
      {
        id: uid(),
        workspaceId: "home",
        subsystem: "Garage",
        title: "Genie Garage Door Opener: Reprogram Code / Signal",
        tags: ["garage", "home", "automotive"],
        toolsNeeded: ["Stepladder", "Fresh remote battery", "Opener PIN: 1234"],
        steps: [
          "Locate the LEARN button on the back of the motor unit, behind the light lens.",
          "Press and release the LEARN button — the round LED turns on and stays lit for ~30 seconds.",
          "Within 30 seconds, press the button on the remote you want to pair twice.",
          "The opener light blinks (or you hear a click) to confirm the new code is stored.",
          "Test from inside the car, then re-test from the far end of the driveway.",
        ],
        gotchas:
          "The LEARN light only stays active for ~30 seconds — have the remote in hand before you press it.\nHolding LEARN for 6+ seconds ERASES every paired remote and keypad. Only tap it.",
        lastVerified: "2026-10-01",
        updatedAt: now,
      },
      {
        id: uid(),
        workspaceId: "e82-build",
        subsystem: "Brakes",
        title: "Bleed Brakes & Flush Fluid (Track Prep)",
        tags: ["brakes", "track", "fluids"],
        toolsNeeded: [
          "7mm & 11mm flare wrenches",
          "1L Motul RBF 660",
          "Pressure bleeder @ 15 psi",
          "Clear tubing + catch bottle",
        ],
        steps: [
          "Fill the reservoir with fresh RBF 660 and attach the pressure bleeder at 15 psi.",
          "Bleed in sequence: RR, LR, RF, LF — furthest from the master cylinder first.",
          "Open each bleeder until the fluid runs clear and bubble-free, then torque the nipple to spec.",
          "Top the reservoir between every corner — never let it run dry.",
          "Pump the pedal: it should be firm with no travel increase after ~10 presses.",
        ],
        gotchas:
          "Never let the reservoir drop below MIN — air in the ABS unit needs a scan-tool bleed to clear.\nRBF 660 strips paint. Rinse any spills with water immediately.",
        lastVerified: "2026-09-20",
        updatedAt: now,
      },
      {
        id: uid(),
        workspaceId: "workshop",
        subsystem: "Air Tools",
        title: "Drain & Service the Shop Air Compressor",
        tags: ["compressor", "maintenance", "shop"],
        toolsNeeded: ["Hearing protection", "Shop rag", "Compressor oil (if non-oilless)"],
        steps: [
          "Shut off the compressor and let tank pressure bleed to ~20 psi.",
          "Open the tank drain valve underneath and let condensate + remaining air blow out fully.",
          "Close the drain, then check the oil sight glass and top up to the dot if low.",
          "Wipe the intake filter and inspect the belt guard for cracks.",
          "Restart, let it build to cut-out pressure, and confirm it shuts off automatically.",
        ],
        gotchas:
          "Always drain the tank with SOME pressure left — it pushes the water out. A fully depressurized tank just dribbles.\nStanding water rusts the tank from the inside; drain after every heavy-use day.",
        lastVerified: "2026-08-14",
        updatedAt: now,
      },
      {
        id: uid(),
        workspaceId: "tech",
        subsystem: "Networking",
        title: "Reset the Home Router to a Known-Good Config",
        tags: ["network", "router", "home"],
        toolsNeeded: ["Paperclip", "Phone with saved admin password", "Backup config file"],
        steps: [
          "Download a fresh config backup from the admin page before touching anything.",
          "Hold the recessed reset button for 10 seconds until the lights cycle.",
          "Reconnect to the default SSID printed on the label.",
          "Restore your saved config file, or re-enter Wi-Fi name, password, and port forwards.",
          "Verify internet, then confirm port forwards with an external port checker.",
        ],
        gotchas:
          "A factory reset wipes port forwards and static DHCP leases — have the backup FIRST.\nThe default admin password is on the label; change it again immediately after restore.",
        lastVerified: "2026-07-30",
        updatedAt: now,
      },
    ];
    return { workspaces, runbooks };
  }


  function uid() {
    return "rb_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function slugify(s) {
    return (s || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "ws";
  }

  // ---------- Persistence ----------
  function load() {
    let parsed = null;
    try {
      parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    } catch (e) {
      parsed = null;
    }

    if (Array.isArray(parsed)) {
      // Migrate legacy array-of-runbooks format.
      db = { workspaces: DEFAULT_WORKSPACES.slice(), runbooks: parsed.map(normalizeRunbook) };
      save();
      return;
    }

    if (parsed && typeof parsed === "object" && Array.isArray(parsed.runbooks)) {
      db = {
        workspaces: Array.isArray(parsed.workspaces) && parsed.workspaces.length
          ? parsed.workspaces
          : DEFAULT_WORKSPACES.slice(),
        runbooks: parsed.runbooks.map(normalizeRunbook),
      };
      if (!localStorage.getItem(SEED_PURGED_KEY)) {
        if (purgeLegacySeed()) save();
        localStorage.setItem(SEED_PURGED_KEY, "1");
      }
      return;
    }

    // First run — start empty with a single neutral workspace (no sample content).
    db = { workspaces: DEFAULT_WORKSPACES.slice(), runbooks: [] };
    localStorage.setItem(SEED_PURGED_KEY, "1");
    save();
  }

  // Older builds auto-seeded sample workspaces + runbooks on first run. Strip any of
  // those that are still untouched so existing installs also start clean; anything the
  // user created or edited is kept.
  function purgeLegacySeed() {
    const demo = demoData();
    const legacyRunbooks = demo.runbooks.filter((r) =>
      r.title === "Genie Garage Door Opener: Reprogram Code / Signal" ||
      r.title === "Bleed Brakes & Flush Fluid (Track Prep)"
    );
    const sig = (r) => JSON.stringify([r.workspaceId, r.subsystem, r.title, r.steps, r.toolsNeeded, r.gotchas]);
    const legacySigs = new Set(legacyRunbooks.map(sig));
    const beforeRunbooks = db.runbooks.length;
    db.runbooks = db.runbooks.filter((r) => !legacySigs.has(sig(r)));

    const legacyWs = new Map(demo.workspaces.map((w) => [w.id, w.name]));
    const beforeWs = db.workspaces.length;
    db.workspaces = db.workspaces.filter((w) =>
      !(legacyWs.get(w.id) === w.name && !db.runbooks.some((r) => r.workspaceId === w.id))
    );
    if (!db.workspaces.length) db.workspaces = DEFAULT_WORKSPACES.slice();

    return db.runbooks.length !== beforeRunbooks || db.workspaces.length !== beforeWs;
  }

  function normalizeRunbook(r) {
    r = r || {};
    return {
      id: r.id || uid(),
      workspaceId: r.workspaceId || (db.workspaces[0] && db.workspaces[0].id) || "home",
      subsystem: r.subsystem || "General",
      title: r.title || "Untitled runbook",
      tags: Array.isArray(r.tags) ? r.tags : [],
      toolsNeeded: Array.isArray(r.toolsNeeded) ? r.toolsNeeded : (Array.isArray(r.tools) ? r.tools : []),
      steps: Array.isArray(r.steps) ? r.steps.map(stepToString) : [],
      gotchas: typeof r.gotchas === "string" ? r.gotchas : (Array.isArray(r.gotchas) ? r.gotchas.join("\n") : ""),
      lastVerified: r.lastVerified || "",
      updatedAt: r.updatedAt || new Date().toISOString(),
    };
  }

  function stepToString(s) {
    if (typeof s === "string") return s;
    if (s && typeof s === "object") {
      return s.image ? `${s.text || ""} | ${s.image}` : (s.text || "");
    }
    return String(s || "");
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(db));
    } catch (e) {
      toast("Could not save — storage may be full.");
    }
    cloudDataDirty = true;
    updateBackupStatus();
  }

  // ---------- Session step checks ----------
  function getChecks(id) {
    try {
      const all = JSON.parse(sessionStorage.getItem(CHECKS_KEY) || "{}");
      return all[id] || {};
    } catch (e) {
      return {};
    }
  }
  function setCheck(id, idx, val) {
    let all = {};
    try {
      all = JSON.parse(sessionStorage.getItem(CHECKS_KEY) || "{}");
    } catch (e) {}
    all[id] = all[id] || {};
    all[id][idx] = val;
    sessionStorage.setItem(CHECKS_KEY, JSON.stringify(all));
  }
  function clearChecks(id) {
    let all = {};
    try {
      all = JSON.parse(sessionStorage.getItem(CHECKS_KEY) || "{}");
    } catch (e) {}
    delete all[id];
    sessionStorage.setItem(CHECKS_KEY, JSON.stringify(all));
  }

  // ---------- Derived helpers ----------
  function workspaceById(id) {
    return db.workspaces.find((w) => w.id === id) || null;
  }

  function runbooksInWorkspace(wsId) {
    return wsId ? db.runbooks.filter((r) => r.workspaceId === wsId) : db.runbooks.slice();
  }

  // Runbooks visible given the current workspace scope (ignores subsystem/tag/search).
  function scopedRunbooks() {
    return runbooksInWorkspace(activeWorkspaceId);
  }

  function subsystemsFor(wsId) {
    const set = new Set();
    runbooksInWorkspace(wsId).forEach((r) => {
      if (r.subsystem) set.add(r.subsystem);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function tagsFor(wsId) {
    const counts = {};
    runbooksInWorkspace(wsId).forEach((r) => {
      (r.tags || []).forEach((t) => {
        counts[t] = (counts[t] || 0) + 1;
      });
    });
    return Object.keys(counts).sort((a, b) => a.localeCompare(b)).map((t) => ({ tag: t, count: counts[t] }));
  }

  function filteredRunbooks() {
    const q = searchQuery.trim().toLowerCase();
    const base = searchGlobal && q ? db.runbooks.slice() : scopedRunbooks();
    return base.filter((r) => {
      if (activeSubsystem && r.subsystem !== activeSubsystem) return false;
      if (activeTag && !(r.tags || []).includes(activeTag)) return false;
      if (q) {
        const hay = [
          r.title,
          r.subsystem,
          (r.tags || []).join(" "),
          (r.toolsNeeded || []).join(" "),
          (r.steps || []).join(" "),
          r.gotchas,
        ]
          .join(" ")
          .toLowerCase();
        if (!fuzzyMatch(hay, q)) return false;
      }
      return true;
    }).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  // Lightweight fuzzy: every whitespace token must appear as a substring.
  function fuzzyMatch(hay, q) {
    return q.split(/\s+/).every((tok) => hay.includes(tok));
  }

  // ---------- Rendering ----------
  function renderAll() {
    renderWorkspaces();
    renderBreadcrumb();
    renderFilters();
    renderDeck();
    updateBackupStatus();
    updateScopeToggle();
  }

  function renderWorkspaces() {
    el.allWsCount.textContent = db.runbooks.length;
    el.allWorkspacesBtn.classList.toggle("is-active", activeWorkspaceId === null);

    el.workspaceList.innerHTML = "";
    db.workspaces.forEach((w) => {
      const count = db.runbooks.filter((r) => r.workspaceId === w.id).length;
      const row = document.createElement("div");
      row.className = "ws-row";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ws-card" + (activeWorkspaceId === w.id ? " is-active" : "");
      btn.dataset.ws = w.id;
      btn.innerHTML =
        `<span class="ws-card__icon">${escapeHtml(w.icon || "📁")}</span>` +
        `<span class="ws-card__name">${escapeHtml(w.name)}</span>` +
        `<span class="ws-card__count">${count}</span>`;
      btn.addEventListener("click", () => selectWorkspace(w.id));

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "ws-row__act";
      edit.title = "Rename workspace";
      edit.setAttribute("aria-label", "Rename " + w.name);
      edit.textContent = "✏️";
      edit.addEventListener("click", (e) => {
        e.stopPropagation();
        renameWorkspace(w.id);
      });

      const del = document.createElement("button");
      del.type = "button";
      del.className = "ws-row__act ws-row__act--danger";
      del.title = "Delete workspace";
      del.setAttribute("aria-label", "Delete " + w.name);
      del.textContent = "🗑";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteWorkspace(w.id);
      });

      row.appendChild(btn);
      row.appendChild(edit);
      row.appendChild(del);
      el.workspaceList.appendChild(row);
    });
  }

  function renderBreadcrumb() {
    const ws = workspaceById(activeWorkspaceId);
    el.wsCrumbLabel.textContent = ws ? `${ws.icon} ${ws.name}` : "All Workspaces";
    el.subCrumbLabel.textContent = activeSubsystem || "All Subsystems";

    // Workspace menu
    el.wsCrumbMenu.innerHTML = "";
    el.wsCrumbMenu.appendChild(crumbItem("All Workspaces", "🗂️", activeWorkspaceId === null, () => {
      selectWorkspace(null);
      closeMenus();
    }));
    db.workspaces.forEach((w) => {
      el.wsCrumbMenu.appendChild(crumbItem(w.name, w.icon, activeWorkspaceId === w.id, () => {
        selectWorkspace(w.id);
        closeMenus();
      }));
    });

    // Subsystem menu (scoped to active workspace)
    el.subCrumbMenu.innerHTML = "";
    el.subCrumbMenu.appendChild(crumbItem("All Subsystems", "📂", activeSubsystem === null, () => {
      activeSubsystem = null;
      renderAll();
      closeMenus();
    }));
    subsystemsFor(activeWorkspaceId).forEach((s) => {
      el.subCrumbMenu.appendChild(crumbItem(s, "🔧", activeSubsystem === s, () => {
        activeSubsystem = s;
        renderAll();
        closeMenus();
      }));
    });
  }

  function crumbItem(label, emoji, active, onClick) {
    const li = document.createElement("li");
    if (active) li.className = "is-active";
    li.innerHTML = `<span class="crumb__emoji">${escapeHtml(emoji || "")}</span><span>${escapeHtml(label)}</span>`;
    li.addEventListener("click", onClick);
    return li;
  }

  function renderFilters() {
    const wrap = el.tagFilters;
    wrap.innerHTML = "";

    // "All" reset pill
    wrap.appendChild(makePill("All", scopedRunbooks().length, !activeSubsystem && !activeTag, () => {
      activeSubsystem = null;
      activeTag = null;
      renderAll();
    }));

    // Subsystem pills
    const subCounts = {};
    scopedRunbooks().forEach((r) => {
      if (r.subsystem) subCounts[r.subsystem] = (subCounts[r.subsystem] || 0) + 1;
    });
    Object.keys(subCounts).sort((a, b) => a.localeCompare(b)).forEach((s) => {
      const pill = makePill(s, subCounts[s], activeSubsystem === s, () => {
        activeSubsystem = activeSubsystem === s ? null : s;
        renderAll();
      }, "📂");
      pill.classList.add("tag-pill--sub");
      wrap.appendChild(pill);
    });

    // Tag pills
    tagsFor(activeWorkspaceId).forEach(({ tag, count }) => {
      wrap.appendChild(makePill("#" + tag, count, activeTag === tag, () => {
        activeTag = activeTag === tag ? null : tag;
        renderAll();
      }));
    });
  }

  function makePill(label, count, active, onClick, glyph) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tag-pill" + (active ? " is-active" : "");
    const glyphHtml = glyph ? `<span class="tag-pill__glyph">${escapeHtml(glyph)}</span>` : "";
    btn.innerHTML = `<span>${glyphHtml}${escapeHtml(label)}</span><span class="tag-pill__count">${count}</span>`;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function setSearch(value) {
    searchQuery = value || "";
    if (el.searchInput.value !== searchQuery) el.searchInput.value = searchQuery;
    const has = !!searchQuery.trim();
    el.searchClearBtn.hidden = !has;
    el.searchKbd.hidden = has;
    renderDeck();
  }

  function renderDeck() {
    const list = filteredRunbooks();
    el.deckCount.textContent = `${list.length} runbook${list.length === 1 ? "" : "s"}`;
    el.deckList.innerHTML = "";

    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "deck-empty";
      const q = searchQuery.trim();
      const msg = document.createElement("p");
      msg.className = "deck-empty__text";
      if (q) {
        msg.textContent = `No runbooks match “${q}”${!searchGlobal && activeWorkspaceId ? " in this workspace" : ""}.`;
      } else if (activeSubsystem || activeTag) {
        msg.textContent = "No runbooks match this filter.";
      } else {
        msg.textContent = "No runbooks here yet. Forge a new how-to.";
      }
      empty.appendChild(msg);
      if (q) {
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "btn btn--tiny";
        clear.textContent = "Clear search";
        clear.addEventListener("click", () => setSearch(""));
        empty.appendChild(clear);
      }
      el.deckList.appendChild(empty);
      return;
    }

    list.forEach((r) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "card" + (selectedId === r.id ? " is-active" : "");
      card.dataset.id = r.id;

      const preview = r.steps && r.steps.length ? stepText(r.steps[0]) : (r.subsystem || "");
      const tagHtml = (r.tags || []).slice(0, 4).map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join("");

      card.innerHTML =
        `<div class="card__top">` +
        `<h3 class="card__title">${escapeHtml(r.title)}</h3>` +
        (r.lastVerified ? `<span class="verified-badge">${escapeHtml(verifiedLabel(r.lastVerified))}</span>` : "") +
        `</div>` +
        `<p class="card__preview">${escapeHtml(preview)}</p>` +
        `<div class="card__tags">${tagHtml}</div>`;

      card.addEventListener("click", () => openRunbook(r.id));
      el.deckList.appendChild(card);
    });
  }

  // ---------- Reader ----------
  function openRunbook(id) {
    const r = db.runbooks.find((x) => x.id === id);
    if (!r) return;
    selectedId = id;
    el.editor.hidden = true;
    el.emptyState.hidden = true;
    el.reader.hidden = false;
    el.app.classList.add("is-viewing");
    renderReader(r);
    renderDeck();
  }

  function renderReader(r) {
    el.readerTitle.textContent = r.title;
    el.readerVerified.textContent = r.lastVerified ? verifiedLabel(r.lastVerified) : "Unverified";
    el.readerTimestamp.textContent = "Updated " + formatDate(r.updatedAt);

    const ws = workspaceById(r.workspaceId);
    el.readerTags.innerHTML =
      (ws ? `<span class="tag-chip">${escapeHtml(ws.icon || "")} ${escapeHtml(ws.name)}</span>` : "") +
      (r.subsystem ? `<span class="tag-chip">📂 ${escapeHtml(r.subsystem)}</span>` : "") +
      (r.tags || []).map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join("");

    // Tools
    const tools = r.toolsNeeded || [];
    el.toolsCallout.hidden = tools.length === 0;
    el.toolsList.innerHTML = tools.map((t) => `<li>${escapeHtml(t)}</li>`).join("");

    // Steps with session-state checkboxes + image thumbnails
    const checks = getChecks(r.id);
    el.stepsList.innerHTML = "";
    (r.steps || []).forEach((raw, idx) => {
      const { text, image } = parseStep(raw);
      const li = document.createElement("li");
      li.className = "step" + (checks[idx] ? " is-done" : "");

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "step__check";
      cb.checked = !!checks[idx];
      cb.setAttribute("aria-label", "Mark step " + (idx + 1) + " complete");
      cb.addEventListener("change", () => {
        setCheck(r.id, idx, cb.checked);
        li.classList.toggle("is-done", cb.checked);
      });

      const body = document.createElement("div");
      body.className = "step__body";
      body.innerHTML = `<span class="step__num">${String(idx + 1).padStart(2, "0")}</span><span class="step__text">${escapeHtml(text)}</span>`;
      if (image) {
        const img = document.createElement("img");
        img.className = "step__thumb";
        img.src = image;
        img.alt = "Step " + (idx + 1) + " detail";
        img.loading = "lazy";
        img.addEventListener("click", () => openLightbox(image));
        body.appendChild(img);
      }

      li.appendChild(cb);
      li.appendChild(body);
      el.stepsList.appendChild(li);
    });

    // Gotchas
    const gotchaLines = (r.gotchas || "").split("\n").map((s) => s.trim()).filter(Boolean);
    el.gotchasCallout.hidden = gotchaLines.length === 0;
    el.gotchasList.innerHTML = gotchaLines.map((g) => `<li>${escapeHtml(g)}</li>`).join("");
  }

  function parseStep(raw) {
    const s = stepToString(raw);
    const i = s.indexOf(" | ");
    if (i >= 0) {
      const text = s.slice(0, i).trim();
      const image = s.slice(i + 3).trim();
      if (/^(https?:|data:image)/i.test(image)) return { text, image };
    }
    return { text: s, image: null };
  }
  function stepText(raw) {
    return parseStep(raw).text;
  }

  // ---------- Editor ----------
  function openEditor(id) {
    const isNew = !id;
    const r = isNew ? null : db.runbooks.find((x) => x.id === id);

    el.editor.dataset.editing = isNew ? "" : id;
    el.editorHeading.textContent = isNew ? "New How-To" : "Edit How-To";
    el.deleteBtn.hidden = isNew;

    // Workspace dropdown
    el.fWorkspace.innerHTML = db.workspaces
      .map((w) => `<option value="${escapeAttr(w.id)}">${escapeHtml(w.icon || "")} ${escapeHtml(w.name)}</option>`)
      .join("");

    // Subsystem autocomplete across ALL runbooks
    const allSubs = Array.from(new Set(db.runbooks.map((x) => x.subsystem).filter(Boolean))).sort();
    el.subsystemOptions.innerHTML = allSubs.map((s) => `<option value="${escapeAttr(s)}"></option>`).join("");

    if (r) {
      el.fWorkspace.value = r.workspaceId;
      el.fSubsystem.value = r.subsystem || "";
      el.fTitle.value = r.title || "";
      el.fTags.value = (r.tags || []).join(", ");
      el.fVerified.value = r.lastVerified || "";
      el.fTools.value = (r.toolsNeeded || []).join("\n");
      el.fSteps.value = (r.steps || []).join("\n");
      el.fGotchas.value = r.gotchas || "";
    } else {
      el.fWorkspace.value = activeWorkspaceId || (db.workspaces[0] && db.workspaces[0].id) || "";
      el.fSubsystem.value = activeSubsystem || "";
      el.fTitle.value = "";
      el.fTags.value = "";
      el.fVerified.value = new Date().toISOString().slice(0, 10);
      el.fTools.value = "";
      el.fSteps.value = "";
      el.fGotchas.value = "";
    }

    el.reader.hidden = true;
    el.emptyState.hidden = true;
    el.editor.hidden = false;
    el.app.classList.add("is-viewing");
    el.fTitle.focus();
  }

  function saveEditor() {
    const title = el.fTitle.value.trim();
    if (!title) {
      el.fTitle.focus();
      toast("A title is required.");
      return;
    }
    const editingId = el.editor.dataset.editing || "";
    const data = {
      workspaceId: el.fWorkspace.value,
      subsystem: el.fSubsystem.value.trim() || "General",
      title,
      tags: el.fTags.value.split(",").map((s) => s.trim()).filter(Boolean),
      toolsNeeded: splitLines(el.fTools.value),
      steps: splitLines(el.fSteps.value),
      gotchas: el.fGotchas.value.trim(),
      lastVerified: el.fVerified.value || "",
      updatedAt: new Date().toISOString(),
    };

    if (editingId) {
      const idx = db.runbooks.findIndex((x) => x.id === editingId);
      if (idx >= 0) db.runbooks[idx] = Object.assign({}, db.runbooks[idx], data);
      selectedId = editingId;
    } else {
      const rec = Object.assign({ id: uid() }, data);
      db.runbooks.push(rec);
      selectedId = rec.id;
    }

    save();
    renderAll();
    openRunbook(selectedId);
    toast("Runbook saved.");
  }

  function deleteRunbook() {
    const id = el.editor.dataset.editing;
    if (!id) return;
    const r = db.runbooks.find((x) => x.id === id);
    if (!r) return;
    if (!confirm(`Delete "${r.title}"? This cannot be undone.`)) return;
    db.runbooks = db.runbooks.filter((x) => x.id !== id);
    clearChecks(id);
    if (selectedId === id) selectedId = null;
    save();
    renderAll();
    showEmpty();
    toast("Runbook deleted.");
  }

  function splitLines(s) {
    return (s || "").split("\n").map((x) => x.trim()).filter(Boolean);
  }

  // ---------- Navigation ----------
  function selectWorkspace(id) {
    activeWorkspaceId = id;
    // Reset sub-filters that may not exist in the new scope.
    activeSubsystem = null;
    activeTag = null;
    renderAll();
  }

  function showEmpty() {
    selectedId = null;
    el.reader.hidden = true;
    el.editor.hidden = true;
    el.emptyState.hidden = false;
    el.app.classList.remove("is-viewing");
    renderDeck();
  }

  // ---------- Kiosk / Workbench ----------
  function toggleKiosk(force) {
    isKiosk = typeof force === "boolean" ? force : !isKiosk;
    el.app.classList.toggle("is-kiosk", isKiosk);
    el.shell.classList.toggle("is-kiosk", isKiosk);
    el.kioskExit.hidden = !isKiosk;
    el.kioskBtn.textContent = isKiosk ? "Exit Workbench" : "Workbench Mode";
  }

  // ---------- Lightbox ----------
  function openLightbox(src) {
    el.lightboxImg.src = src;
    el.lightbox.hidden = false;
  }
  function closeLightbox() {
    el.lightbox.hidden = true;
    el.lightboxImg.src = "";
  }

  // ---------- Theme / atmosphere ----------
  function getThemePref() {
    let pref = localStorage.getItem(THEME_KEY);
    if (pref === "storm") pref = "night"; // migrate legacy value
    if (pref !== "day" && pref !== "twilight" && pref !== "night" && pref !== "random") {
      pref = "night";
    }
    return pref;
  }
  function resolveMode(pref) {
    if (pref !== "random") return pref;
    let active = sessionStorage.getItem(ACTIVE_THEME_KEY);
    if (!THEMES.includes(active)) {
      active = THEMES[Math.floor(Math.random() * THEMES.length)];
      sessionStorage.setItem(ACTIVE_THEME_KEY, active);
    }
    return active;
  }
  function applyThemeClass(mode) {
    const root = document.documentElement;
    root.classList.remove("day", "twilight");
    if (mode === "day") root.classList.add("day");
    else if (mode === "twilight") root.classList.add("twilight");
    // night = no class (default tokens)
  }
  function setTheme(pref) {
    localStorage.setItem(THEME_KEY, pref);
    if (pref === "random") {
      // re-roll each explicit selection
      const active = THEMES[Math.floor(Math.random() * THEMES.length)];
      sessionStorage.setItem(ACTIVE_THEME_KEY, active);
      applyThemeClass(active);
    } else {
      sessionStorage.removeItem(ACTIVE_THEME_KEY);
      applyThemeClass(pref);
    }
    updateThemePicker();
  }
  function updateThemePicker() {
    if (!el.themePicker) return;
    const pref = getThemePref();
    el.themePicker.querySelectorAll(".theme-chip").forEach(function (chip) {
      chip.classList.toggle("is-active", chip.dataset.themeVal === pref);
    });
  }

  // ---------- Settings / About modals ----------
  function openSettings() {
    updateThemePicker();
    el.settingsModal.hidden = false;
  }
  function closeSettings() {
    el.settingsModal.hidden = true;
  }
  function openAbout() {
    closeSettings();
    el.aboutModal.hidden = false;
  }
  function closeAbout() {
    el.aboutModal.hidden = true;
  }
  function initVersion() {
    if (el.appVersion) el.appVersion.textContent = "v" + APP_VERSION;
    if (el.aboutVersion) el.aboutVersion.textContent = "Version " + APP_VERSION;
  }

  // ---------- Scope toggle ----------
  function toggleScope() {
    searchGlobal = !searchGlobal;
    updateScopeToggle();
    renderDeck();
  }
  function updateScopeToggle() {
    el.scopeToggle.classList.toggle("is-global", searchGlobal);
    el.scopeToggle.textContent = searchGlobal ? "Scope: Global" : "Scope: Workspace";
  }

  // ---------- New workspace ----------
  function addWorkspace() {
    const name = (prompt("New workspace name (e.g. “Garden & Irrigation”):") || "").trim();
    if (!name) return;
    const icon = (prompt("Pick an emoji icon for it:", "📁") || "📁").trim() || "📁";
    let id = slugify(name);
    let n = 2;
    while (db.workspaces.some((w) => w.id === id)) id = slugify(name) + "-" + n++;
    db.workspaces.push({ id, name, icon });
    save();
    selectWorkspace(id);
    toast("Workspace added.");
  }

  function renameWorkspace(id) {
    const w = workspaceById(id);
    if (!w) return;
    const name = (prompt("Rename workspace:", w.name) || "").trim();
    if (!name) return;
    const icon = (prompt("Emoji icon:", w.icon || "📁") || "📁").trim() || "📁";
    w.name = name;
    w.icon = icon;
    save();
    renderAll();
    toast("Workspace updated.");
  }

  function deleteWorkspace(id) {
    const w = workspaceById(id);
    if (!w) return;
    if (db.workspaces.length <= 1) {
      toast("Keep at least one workspace.");
      return;
    }
    const count = db.runbooks.filter((r) => r.workspaceId === id).length;
    const msg = count
      ? `Delete "${w.name}" and its ${count} runbook${count === 1 ? "" : "s"}? This cannot be undone.`
      : `Delete empty workspace "${w.name}"?`;
    if (!confirm(msg)) return;
    db.runbooks.filter((r) => r.workspaceId === id).forEach((r) => clearChecks(r.id));
    db.runbooks = db.runbooks.filter((r) => r.workspaceId !== id);
    db.workspaces = db.workspaces.filter((x) => x.id !== id);
    if (activeWorkspaceId === id) activeWorkspaceId = null;
    save();
    activeSubsystem = null;
    activeTag = null;
    renderAll();
    showEmpty();
    toast("Workspace deleted.");
  }

  // ---------- Unified backup (Kashikoi suite schema) ----------
  function createAnvilBackupData() {
    return {
      version: 1,
      appName: "Anvil",
      exportedAt: new Date().toISOString(),
      theme: getThemePref(),
      workspaces: db.workspaces,
      runbooks: db.runbooks,
    };
  }

  // Preserves every other app's slice so saving from Anvil never clobbers Nimbus/Cumulus/Cirrus/Stratus.
  function getExistingBackupApps(existingBackup) {
    if (!existingBackup || typeof existingBackup !== "object") return {};
    if (existingBackup.schema === UNIFIED_BACKUP_SCHEMA && existingBackup.apps && typeof existingBackup.apps === "object") {
      return Object.assign({}, existingBackup.apps);
    }
    if (existingBackup.appName === "Nimbus" || Array.isArray(existingBackup.tabs)) return { nimbus: existingBackup };
    if (existingBackup.appName === "Cumulus" || Array.isArray(existingBackup.accounts)) return { cumulus: existingBackup };
    if (existingBackup.appName === "Cirrus" || Array.isArray(existingBackup.movies)) return { cirrus: existingBackup };
    if (existingBackup.appName === "Stratus" || Array.isArray(existingBackup.stamps)) return { stratus: existingBackup };
    if (existingBackup.appName === "Anvil" || Array.isArray(existingBackup.runbooks)) return { anvil: existingBackup };
    return {};
  }

  // Preserve sibling apps' data (last-write-wins only for Anvil's own slice).
  function createBackupData(existingBackup) {
    const apps = getExistingBackupApps(existingBackup);
    apps.anvil = createAnvilBackupData();
    return {
      schema: UNIFIED_BACKUP_SCHEMA,
      version: 1,
      appName: "Kashikoi Apps",
      exportedAt: new Date().toISOString(),
      apps,
    };
  }

  function normalizeBackupData(data) {
    if (!data || typeof data !== "object") throw new Error("Invalid format");
    const anvil = data.schema === UNIFIED_BACKUP_SCHEMA && data.apps && data.apps.anvil ? data.apps.anvil : data;
    if (!anvil || typeof anvil !== "object" || !Array.isArray(anvil.runbooks)) {
      throw new Error("No Anvil data");
    }
    const workspaces = Array.isArray(anvil.workspaces) && anvil.workspaces.length
      ? anvil.workspaces.filter((w) => w && typeof w.id === "string" && typeof w.name === "string")
      : DEFAULT_WORKSPACES.slice();
    return {
      workspaces: workspaces.length ? workspaces : DEFAULT_WORKSPACES.slice(),
      runbooks: anvil.runbooks.map(normalizeRunbook),
      theme: typeof anvil.theme === "string" ? anvil.theme : null,
    };
  }

  function applyRestoredData(imported, sourceLabel) {
    const summary = `${imported.runbooks.length} runbook${imported.runbooks.length === 1 ? "" : "s"} across ${imported.workspaces.length} workspace${imported.workspaces.length === 1 ? "" : "s"}`;
    if (!confirm(`Restore ${summary} from ${sourceLabel}? This replaces your current Anvil data.`)) return false;
    db = { workspaces: imported.workspaces, runbooks: imported.runbooks };
    if (imported.theme) setTheme(imported.theme);
    save();
    activeWorkspaceId = null;
    activeSubsystem = null;
    activeTag = null;
    renderAll();
    showEmpty();
    return true;
  }

  function downloadBackup(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- Export / Import (local JSON) ----------
  function exportJSON() {
    try {
      downloadBackup(createBackupData(), "anvil-backup-" + new Date().toISOString().slice(0, 10) + ".json");
      toast("Backup exported.");
    } catch (e) {
      toast("Export failed — stored data may be corrupted.");
    }
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = normalizeBackupData(JSON.parse(reader.result));
        if (applyRestoredData(imported, "this backup")) toast("Backup imported.");
      } catch (e) {
        toast("Import failed — not a valid Anvil backup.");
      }
    };
    reader.readAsText(file);
  }

  // ---------- Randomize / Clear ----------
  function randomizeData() {
    if (!confirm("Replace everything with a demo set of workspaces and runbooks? Export first if you want to keep your current data.")) return;
    const demo = demoData();
    db = { workspaces: demo.workspaces, runbooks: demo.runbooks.map(normalizeRunbook) };
    save();
    activeWorkspaceId = null;
    activeSubsystem = null;
    activeTag = null;
    renderAll();
    showEmpty();
    closeSettings();
    toast("Demo data loaded.");
  }

  function clearData() {
    if (!confirm("Clear ALL workspaces and runbooks? This cannot be undone.")) return;
    localStorage.removeItem(STORE_KEY);
    sessionStorage.removeItem(CHECKS_KEY);
    db = { workspaces: DEFAULT_WORKSPACES.slice(), runbooks: [] };
    save();
    activeWorkspaceId = null;
    activeSubsystem = null;
    activeTag = null;
    renderAll();
    showEmpty();
    closeSettings();
    toast("All data cleared.");
  }

  // ---------- Encrypted cloud sync (zero-knowledge, shared worker) ----------
  function getCloudPhrase() {
    return el.cloudPhrase ? el.cloudPhrase.value.trim().replace(/\s+/g, " ") : "";
  }
  function markCloudDataDirty() {
    cloudDataDirty = true;
  }
  function setCloudStatus(msg, kind) {
    if (!el.cloudStatus) return;
    el.cloudStatus.textContent = msg || "";
    el.cloudStatus.className = "cloud-data-status" + (kind ? " cloud-data-status--" + kind : "");
  }
  function createRecoveryPhrase() {
    const idx = new Uint32Array(RECOVERY_PHRASE_WORD_COUNT);
    crypto.getRandomValues(idx);
    return [...idx].map((n) => RECOVERY_WORDS[n % RECOVERY_WORDS.length]).join(" ");
  }
  function generateCloudPhrase() {
    const phrase = createRecoveryPhrase();
    el.cloudPhrase.value = phrase;
    el.cloudPhrase.type = "text";
    if (el.togglePhraseBtn) {
      el.togglePhraseBtn.textContent = "Hide";
      el.togglePhraseBtn.setAttribute("aria-pressed", "true");
    }
    if (el.cloudPhraseOut) {
      el.cloudPhraseOut.hidden = false;
      el.cloudPhraseOut.textContent = "Write these 16 words down. They are the ONLY key to your cloud backup — they can't be recovered.";
    }
    saveRememberedPhrase();
    setCloudStatus("New recovery phrase created. Save to cloud to use it.", "info");
  }
  function togglePhraseVisibility() {
    if (!el.cloudPhrase) return;
    const show = el.cloudPhrase.type === "password";
    el.cloudPhrase.type = show ? "text" : "password";
    el.togglePhraseBtn.textContent = show ? "Hide" : "Show";
    el.togglePhraseBtn.setAttribute("aria-pressed", String(show));
  }
  function saveRememberedPhrase() {
    if (!el.rememberPhrase) return;
    if (el.rememberPhrase.checked && getCloudPhrase()) {
      localStorage.setItem(REMEMBER_CLOUD_PHRASE_KEY, getCloudPhrase());
    } else if (!el.rememberPhrase.checked) {
      localStorage.removeItem(REMEMBER_CLOUD_PHRASE_KEY);
    }
  }
  function loadRememberedPhrase() {
    const saved = localStorage.getItem(REMEMBER_CLOUD_PHRASE_KEY) || "";
    if (!saved || !el.cloudPhrase) return;
    el.cloudPhrase.value = saved;
    if (el.rememberPhrase) el.rememberPhrase.checked = true;
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function base64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  async function sha256Hex(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function getCloudSyncKey(phrase) {
    return sha256Hex("kashikoi-cloud-sync-v1:" + phrase);
  }
  async function deriveCloudKey(phrase, salt) {
    const phraseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(phrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: CLOUD_KDF_ITERATIONS },
      phraseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }
  async function encryptCloudBackup(phrase, backupData) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveCloudKey(phrase, salt);
    const plaintext = new TextEncoder().encode(JSON.stringify(backupData || createBackupData()));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
    return {
      app: CLOUD_ENVELOPE_APP,
      writtenBy: "Anvil",
      format: CLOUD_SYNC_FORMAT,
      updatedAt: new Date().toISOString(),
      kdf: { name: "PBKDF2", hash: "SHA-256", iterations: CLOUD_KDF_ITERATIONS, salt: arrayBufferToBase64(salt) },
      cipher: { name: "AES-GCM", iv: arrayBufferToBase64(iv) },
      payload: arrayBufferToBase64(encrypted),
    };
  }
  async function decryptCloudBackup(phrase, envelope) {
    if (!envelope || typeof envelope !== "object" || !ACCEPTED_ENVELOPE_APPS.has(envelope.app) ||
        (envelope.format !== CLOUD_SYNC_FORMAT && envelope.format !== LEGACY_CLOUD_SYNC_FORMAT) ||
        !envelope.kdf || !envelope.cipher || typeof envelope.payload !== "string") {
      throw new Error("Invalid envelope");
    }
    const salt = new Uint8Array(base64ToArrayBuffer(envelope.kdf.salt));
    const iv = new Uint8Array(base64ToArrayBuffer(envelope.cipher.iv));
    const encrypted = base64ToArrayBuffer(envelope.payload);
    const key = await deriveCloudKey(phrase, salt);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    return JSON.parse(new TextDecoder().decode(decrypted));
  }
  async function fetchEncryptedBackupAtKey(syncKey) {
    const bust = Date.now() + "-" + Math.random().toString(36).slice(2);
    const response = await fetch(`${CLOUD_SYNC_ENDPOINT}/sync/${syncKey}?t=${bust}`, { cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  }
  async function createMergedCloudBackup(phrase) {
    const syncKey = await getCloudSyncKey(phrase);
    let existingBackup = null;
    const envelope = await fetchEncryptedBackupAtKey(syncKey);
    if (envelope) {
      try {
        existingBackup = await decryptCloudBackup(phrase, envelope);
      } catch (e) {
        throw new Error("decrypt-existing");
      }
    }
    return { syncKey, backup: createBackupData(existingBackup) };
  }

  async function saveCloudData() {
    const phrase = getCloudPhrase();
    if (!phrase) {
      setCloudStatus("Enter or create a recovery phrase first.", "error");
      return;
    }
    setCloudStatus("Encrypting and saving cloud backup…", "info");
    try {
      const merged = await createMergedCloudBackup(phrase);
      const envelope = await encryptCloudBackup(phrase, merged.backup);
      const response = await fetch(`${CLOUD_SYNC_ENDPOINT}/sync/${merged.syncKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      cloudDataDirty = false;
      saveRememberedPhrase();
      setCloudStatus("Saved to cloud. Use the same phrase to restore on another device.", "success");
    } catch (error) {
      if (error && error.message === "decrypt-existing") {
        setCloudStatus("A different cloud backup exists for this phrase and couldn't be decrypted. Check the phrase.", "error");
      } else {
        setCloudStatus("Could not save to cloud. Your local Anvil data is still safe here.", "error");
      }
    }
  }

  async function loadCloudData() {
    const phrase = getCloudPhrase();
    if (!phrase) {
      setCloudStatus("Enter your recovery phrase first.", "error");
      return;
    }
    setCloudStatus("Loading encrypted cloud backup…", "info");
    try {
      const syncKey = await getCloudSyncKey(phrase);
      const envelope = await fetchEncryptedBackupAtKey(syncKey);
      if (!envelope) {
        setCloudStatus("No cloud backup exists for this phrase yet. Save from your first device first.", "error");
        return;
      }
      const data = await decryptCloudBackup(phrase, envelope);
      const imported = normalizeBackupData(data);
      saveRememberedPhrase();
      if (applyRestoredData(imported, "encrypted cloud sync")) {
        setCloudStatus("Restored from cloud.", "success");
      } else {
        setCloudStatus("Cloud restore cancelled.", "info");
      }
    } catch (error) {
      setCloudStatus("Could not decrypt cloud backup. Check the phrase or try again later.", "error");
    }
  }


  // ---------- Copy plaintext ----------
  function copyPlaintext() {
    const r = db.runbooks.find((x) => x.id === selectedId);
    if (!r) return;
    const ws = workspaceById(r.workspaceId);
    const lines = [];
    lines.push(r.title.toUpperCase());
    lines.push((ws ? ws.name + " › " : "") + (r.subsystem || ""));
    if (r.lastVerified) lines.push("Verified: " + r.lastVerified);
    if (r.tags && r.tags.length) lines.push("Tags: " + r.tags.map((t) => "#" + t).join(" "));
    lines.push("");
    if (r.toolsNeeded && r.toolsNeeded.length) {
      lines.push("PREREQUISITES & TOOLS");
      r.toolsNeeded.forEach((t) => lines.push("  - " + t));
      lines.push("");
    }
    lines.push("STEPS");
    (r.steps || []).forEach((s, i) => lines.push("  " + (i + 1) + ". " + stepText(s)));
    const gotchas = (r.gotchas || "").split("\n").map((s) => s.trim()).filter(Boolean);
    if (gotchas.length) {
      lines.push("");
      lines.push("PITFALLS & GOTCHAS");
      gotchas.forEach((g) => lines.push("  ! " + g));
    }
    const text = lines.join("\n");
    navigator.clipboard
      .writeText(text)
      .then(() => toast("Copied to clipboard."))
      .catch(() => toast("Copy failed."));
  }

  // ---------- Misc UI ----------
  function updateBackupStatus() {
    const n = db.runbooks.length;
    el.backupStatusText.textContent = `${n} runbook${n === 1 ? "" : "s"} · ${db.workspaces.length} workspaces`;
  }

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.toast.hidden = true), 2200);
  }

  function closeMenus() {
    el.wsCrumbMenu.hidden = true;
    el.subCrumbMenu.hidden = true;
    el.wsCrumbBtn.setAttribute("aria-expanded", "false");
    el.subCrumbBtn.setAttribute("aria-expanded", "false");
  }

  function verifiedLabel(d) {
    const dt = new Date(d + (d.length === 10 ? "T00:00:00" : ""));
    if (isNaN(dt)) return "Verified";
    return "Verified " + dt.toLocaleString("en-US", { month: "short", year: "numeric" });
  }
  function formatDate(iso) {
    const dt = new Date(iso);
    if (isNaN(dt)) return "";
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  // ---------- Event wiring ----------
  function bind() {
    el.newBtn.addEventListener("click", () => openEditor(null));
    el.editBtn.addEventListener("click", () => openEditor(selectedId));
    el.cancelBtn.addEventListener("click", () => {
      if (selectedId) openRunbook(selectedId);
      else showEmpty();
    });
    el.editor.addEventListener("submit", (e) => {
      e.preventDefault();
      saveEditor();
    });
    el.deleteBtn.addEventListener("click", deleteRunbook);
    el.copyBtn.addEventListener("click", copyPlaintext);
    el.resetChecksBtn.addEventListener("click", () => {
      if (selectedId) {
        clearChecks(selectedId);
        const r = db.runbooks.find((x) => x.id === selectedId);
        if (r) renderReader(r);
      }
    });

    el.kioskBtn.addEventListener("click", () => toggleKiosk());
    el.kioskExit.addEventListener("click", () => toggleKiosk(false));

    el.allWorkspacesBtn.addEventListener("click", () => selectWorkspace(null));
    el.newWorkspaceBtn.addEventListener("click", addWorkspace);
    el.crumbHome.addEventListener("click", () => selectWorkspace(null));

    el.scopeToggle.addEventListener("click", toggleScope);

    // Settings / About
    el.settingsBtn.addEventListener("click", openSettings);
    el.aboutBtn.addEventListener("click", openAbout);
    el.themePicker.addEventListener("click", (e) => {
      const chip = e.target.closest(".theme-chip");
      if (chip) setTheme(chip.dataset.themeVal);
    });
    document.querySelectorAll("[data-close-settings]").forEach((n) =>
      n.addEventListener("click", closeSettings)
    );
    document.querySelectorAll("[data-close-about]").forEach((n) =>
      n.addEventListener("click", closeAbout)
    );

    el.exportBtn.addEventListener("click", exportJSON);
    el.importBtn.addEventListener("click", () => el.importFile.click());
    el.importFile.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) importJSON(e.target.files[0]);
      e.target.value = "";
    });

    // Cloud sync
    if (el.generatePhraseBtn) el.generatePhraseBtn.addEventListener("click", generateCloudPhrase);
    if (el.togglePhraseBtn) el.togglePhraseBtn.addEventListener("click", togglePhraseVisibility);
    if (el.cloudSaveBtn) el.cloudSaveBtn.addEventListener("click", saveCloudData);
    if (el.cloudLoadBtn) el.cloudLoadBtn.addEventListener("click", loadCloudData);
    if (el.rememberPhrase) el.rememberPhrase.addEventListener("change", saveRememberedPhrase);

    // Data management
    if (el.randomizeBtn) el.randomizeBtn.addEventListener("click", randomizeData);
    if (el.clearBtn) el.clearBtn.addEventListener("click", clearData);

    // Search
    el.searchInput.addEventListener("input", () => setSearch(el.searchInput.value));
    el.searchInput.addEventListener("keydown", (e) => {
      if (e.altKey && e.key === "Enter") {
        e.preventDefault();
        toggleScope();
      } else if (e.key === "Escape") {
        setSearch("");
      }
    });
    el.searchClearBtn.addEventListener("click", () => {
      setSearch("");
      el.searchInput.focus();
    });
    if (el.cloudPhraseForm) el.cloudPhraseForm.addEventListener("submit", (e) => e.preventDefault());

    // Breadcrumb dropdowns
    el.wsCrumbBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const show = el.wsCrumbMenu.hidden;
      closeMenus();
      el.wsCrumbMenu.hidden = !show;
      el.wsCrumbBtn.setAttribute("aria-expanded", String(show));
    });
    el.subCrumbBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const show = el.subCrumbMenu.hidden;
      closeMenus();
      el.subCrumbMenu.hidden = !show;
      el.subCrumbBtn.setAttribute("aria-expanded", String(show));
    });
    document.addEventListener("click", closeMenus);

    // Lightbox
    el.lightboxClose.addEventListener("click", closeLightbox);
    el.lightbox.addEventListener("click", (e) => {
      if (e.target === el.lightbox) closeLightbox();
    });

    // Global keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        el.searchInput.focus();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        if (!el.editor.hidden) {
          e.preventDefault();
          saveEditor();
        }
      } else if (e.key === "Escape") {
        if (!el.aboutModal.hidden) closeAbout();
        else if (!el.settingsModal.hidden) closeSettings();
        else if (!el.lightbox.hidden) closeLightbox();
        else if (isKiosk) toggleKiosk(false);
      }
    });
  }

  function cacheEls() {
    [
      "shell", "app", "topbar",
      "crumbHome", "wsCrumbBtn", "wsCrumbLabel", "wsCrumbMenu", "subCrumbBtn", "subCrumbLabel", "subCrumbMenu",
      "workspaceList", "allWorkspacesBtn", "allWsCount", "newWorkspaceBtn", "tagFilters",
      "backupStatusText", "exportBtn", "importBtn", "importFile",
      "settingsBtn", "settingsModal", "aboutModal", "themePicker", "appVersion", "aboutVersion", "aboutBtn",
      "cloudPhrase", "togglePhraseBtn", "cloudPhraseOut", "rememberPhrase", "generatePhraseBtn",
      "cloudSaveBtn", "cloudLoadBtn", "cloudStatus", "randomizeBtn", "clearBtn",
      "searchInput", "searchKbd", "searchClearBtn", "cloudPhraseForm", "scopeToggle", "newBtn", "deckCount", "deckList",
      "reader", "readerTitle", "readerVerified", "readerTimestamp", "readerTags",
      "toolsCallout", "toolsList", "stepsList", "resetChecksBtn", "gotchasCallout", "gotchasList",
      "editBtn", "copyBtn", "kioskBtn", "kioskExit",
      "editor", "editorHeading", "cancelBtn", "saveBtn", "deleteBtn",
      "fWorkspace", "fSubsystem", "subsystemOptions", "fTitle", "fTags", "fVerified", "fTools", "fSteps", "fGotchas",
      "emptyState", "lightbox", "lightboxImg", "lightboxClose", "toast",
    ].forEach((id) => (el[id] = $(id)));
  }

  // ---------- Init ----------
  document.addEventListener("DOMContentLoaded", () => {
    cacheEls();
    // Browsers can restore/autofill a stale value into the search box; always start unfiltered.
    el.searchInput.value = "";
    load();
    bind();
    initVersion();
    updateThemePicker();
    loadRememberedPhrase();
    renderAll();
    showEmpty();
  });
})();
