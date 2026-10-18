/* ============================================================
   ANVIL — Runbook & how-to knowledge base
   Multi-tier hierarchy: Workspace (Domain) -> Subsystem -> Runbook
   Zero backend. All state in localStorage / sessionStorage.
   ============================================================ */
(function () {
  "use strict";

  const STORE_KEY = "anvil_cloud_runbooks";
  const THEME_KEY = "anvil_cloud_theme";
  const CHECKS_KEY = "anvil_cloud_checks"; // sessionStorage, per-runbook step checks

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

  // ---------- Default workspaces + sample content ----------
  const DEFAULT_WORKSPACES = [
    { id: "home", name: "Home & Property", icon: "🏠" },
    { id: "e82-build", name: "BMW 128i Race Build", icon: "🏎️" },
    { id: "workshop", name: "Shop & Equipment", icon: "🛠️" },
    { id: "tech", name: "Software & Systems", icon: "💻" },
  ];

  function seedRunbooks() {
    const now = new Date().toISOString();
    return [
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
    ];
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
      return;
    }

    // First run — seed.
    db = { workspaces: DEFAULT_WORKSPACES.slice(), runbooks: seedRunbooks() };
    save();
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
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ws-card" + (activeWorkspaceId === w.id ? " is-active" : "");
      btn.dataset.ws = w.id;
      btn.innerHTML =
        `<span class="ws-card__icon">${escapeHtml(w.icon || "📁")}</span>` +
        `<span class="ws-card__name">${escapeHtml(w.name)}</span>` +
        `<span class="ws-card__count">${count}</span>`;
      btn.addEventListener("click", () => selectWorkspace(w.id));
      el.workspaceList.appendChild(btn);
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

  function renderDeck() {
    const list = filteredRunbooks();
    el.deckCount.textContent = `${list.length} runbook${list.length === 1 ? "" : "s"}`;
    el.deckList.innerHTML = "";

    if (!list.length) {
      const empty = document.createElement("p");
      empty.className = "card__preview";
      empty.style.padding = "12px";
      empty.textContent = "No runbooks match. Try a different filter or forge a new how-to.";
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

  // ---------- Theme ----------
  function toggleTheme() {
    const day = document.documentElement.classList.toggle("day");
    localStorage.setItem(THEME_KEY, day ? "day" : "storm");
    el.themeToggleLabel.textContent = day ? "Daylight" : "Storm";
    el.themeToggle.querySelector(".theme-toggle__icon").textContent = day ? "☀️" : "⚡";
  }
  function initThemeLabel() {
    const day = document.documentElement.classList.contains("day");
    el.themeToggleLabel.textContent = day ? "Daylight" : "Storm";
    el.themeToggle.querySelector(".theme-toggle__icon").textContent = day ? "☀️" : "⚡";
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

  // ---------- Export / Import ----------
  function exportJSON() {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "anvil-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
    toast("Backup exported.");
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        let next;
        if (Array.isArray(parsed)) {
          next = { workspaces: DEFAULT_WORKSPACES.slice(), runbooks: parsed };
        } else if (parsed && Array.isArray(parsed.runbooks)) {
          next = {
            workspaces: Array.isArray(parsed.workspaces) && parsed.workspaces.length ? parsed.workspaces : DEFAULT_WORKSPACES.slice(),
            runbooks: parsed.runbooks,
          };
        } else {
          throw new Error("Unrecognized file shape");
        }
        if (!confirm(`Import ${next.runbooks.length} runbook(s)? This replaces your current data.`)) return;
        db = { workspaces: next.workspaces, runbooks: next.runbooks.map(normalizeRunbook) };
        save();
        activeWorkspaceId = null;
        activeSubsystem = null;
        activeTag = null;
        renderAll();
        showEmpty();
        toast("Backup imported.");
      } catch (e) {
        toast("Import failed — invalid JSON.");
      }
    };
    reader.readAsText(file);
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

    el.themeToggle.addEventListener("click", toggleTheme);
    el.scopeToggle.addEventListener("click", toggleScope);

    el.exportBtn.addEventListener("click", exportJSON);
    el.importBtn.addEventListener("click", () => el.importFile.click());
    el.importFile.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) importJSON(e.target.files[0]);
      e.target.value = "";
    });

    // Search
    el.searchInput.addEventListener("input", () => {
      searchQuery = el.searchInput.value;
      renderDeck();
    });
    el.searchInput.addEventListener("keydown", (e) => {
      if (e.altKey && e.key === "Enter") {
        e.preventDefault();
        toggleScope();
      } else if (e.key === "Escape") {
        el.searchInput.value = "";
        searchQuery = "";
        renderDeck();
      }
    });

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
        if (!el.lightbox.hidden) closeLightbox();
        else if (isKiosk) toggleKiosk(false);
      }
    });
  }

  function cacheEls() {
    [
      "shell", "app", "topbar",
      "crumbHome", "wsCrumbBtn", "wsCrumbLabel", "wsCrumbMenu", "subCrumbBtn", "subCrumbLabel", "subCrumbMenu",
      "workspaceList", "allWorkspacesBtn", "allWsCount", "newWorkspaceBtn", "tagFilters",
      "backupStatusText", "exportBtn", "importBtn", "importFile", "themeToggle", "themeToggleLabel",
      "searchInput", "scopeToggle", "newBtn", "deckCount", "deckList",
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
    load();
    bind();
    initThemeLabel();
    renderAll();
    showEmpty();
  });
})();
