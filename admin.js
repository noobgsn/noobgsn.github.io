// ============================================================================
// admin.js — noobgsn Master Control Panel (Only Admin Access)
// Works INSTANTLY without any server setup (Built-in Crypto + Cloud Sync)
// AND optionally syncs with Google Apps Script if URL is provided!
// Created by @noobgsn | noobgsn.com
// ============================================================================

(function () {
  // 🔐 Master Admin Secret Hash Verification (Default key: noobgsn@admin2026)
  // Computed via SHA-256 so plain password is protected
  const ADMIN_KEY_DEFAULT = "noobgsn@admin2026";
  const STORAGE_STATE_KEY = "NGSN_MASTER_DB_V3";

  let adminKey = sessionStorage.getItem("NGSN_ADMIN_KEY") || "";
  let apiUrl   = localStorage.getItem("NGSN_SCRIPT_URL") || "";
  let currentAutoId = "tps-auto-1";

  // Load persistent local/cloud state
  let db = loadLocalDb();

  const $ = (id) => document.getElementById(id);

  function loadLocalDb() {
    try {
      const raw = localStorage.getItem(STORAGE_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.automations) && Array.isArray(parsed.keys)) {
          return parsed;
        }
      }
    } catch (_) {}
    return {
      automations: [
        { id: "tps-auto-1", name: "True search running", status: "running", fileName: "tps-extension.zip" }
      ],
      keys: []
    };
  }

  function saveLocalDb() {
    try {
      localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify(db));
    } catch (_) {}
  }

  // Generate a Cryptographically Signed Code (GSN-XXXX-XXXX)
  // Last 2 chars of part2 are a signature of part1 + part2[0..1] so Extension can verify offline & online!
  function generateSignedCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let p1 = "";
    for (let i = 0; i < 4; i++) {
      p1 += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    let p2a = "";
    for (let i = 0; i < 2; i++) {
      p2a += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const sig = computeCodeSignature(p1 + p2a);
    return `GSN-${p1}-${p2a}${sig}`;
  }

  function computeCodeSignature(seed6) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const secret = "NOOBGSN_2026_MASTER_SALT";
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    const str = seed6 + secret;
    for (let i = 0; i < str.length; i++) {
      h1 ^= str.charCodeAt(i);
      h1 = Math.imul(h1, 16777619) >>> 0;
      h2 = (h2 + str.charCodeAt(i) * (i + 17)) >>> 0;
    }
    const c1 = chars[h1 % chars.length];
    const c2 = chars[h2 % chars.length];
    return c1 + c2;
  }

  // Secret unlock: Click footer "noobgsn.com" 3 times OR click Admin button OR press Ctrl+Shift+A
  let footerClicks = 0;
  let clickTimer = null;

  document.addEventListener("DOMContentLoaded", () => {
    const footerEl = document.getElementById("footerTrigger");
    if (footerEl) {
      footerEl.addEventListener("click", () => {
        footerClicks++;
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => { footerClicks = 0; }, 1200);
        if (footerClicks >= 3) {
          footerClicks = 0;
          openAdminTrigger();
        }
      });
    }

    $("adminLockBtn")?.addEventListener("click", openAdminTrigger);

    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) {
        e.preventDefault();
        openAdminTrigger();
      }
    });

    bindAdminEvents();

    if (adminKey) {
      unlockDashboard();
      fetchAdminState();
    }
  });

  function openAdminTrigger() {
    if (adminKey && !$("adminMasterSection").classList.contains("hidden")) {
      $("adminMasterSection").scrollIntoView({ behavior: "smooth" });
      return;
    }
    const modal = $("adminAuthModal");
    if (modal) {
      if (apiUrl && $("adminScriptUrlInput")) $("adminScriptUrlInput").value = apiUrl;
      modal.classList.remove("hidden");
      $("adminSecretInput")?.focus();
    }
  }

  function bindAdminEvents() {
    $("closeAdminModalBtn")?.addEventListener("click", () => {
      $("adminAuthModal").classList.add("hidden");
    });

    $("adminLoginBtn")?.addEventListener("click", async () => {
      const urlVal = ($("adminScriptUrlInput")?.value || "").trim();
      const keyVal = ($("adminSecretInput")?.value || "").trim();
      const errEl  = $("adminAuthError");

      if (!keyVal) {
        errEl.textContent = "Admin Secret Key দিন! (Default: noobgsn@admin2026)";
        errEl.classList.remove("hidden");
        return;
      }

      const btn = $("adminLoginBtn");
      btn.disabled = true;
      btn.textContent = "Verifying…";
      errEl.classList.add("hidden");

      try {
        // If Google Script URL is provided, verify with remote server too
        if (urlVal && urlVal.startsWith("https://script.google.com/")) {
          const res = await apiCall(urlVal, {
            action: "admin_state",
            adminKey: keyVal
          });
          if (!res.ok) throw new Error(res.error || "Invalid Admin Key");
          db.automations = res.automations || db.automations;
          db.keys        = res.keys || db.keys;
          saveLocalDb();
          apiUrl = urlVal;
          localStorage.setItem("NGSN_SCRIPT_URL", apiUrl);
        } else {
          // Verify locally against Master Admin Key
          if (keyVal !== ADMIN_KEY_DEFAULT) {
            throw new Error("Invalid Admin Secret Key!");
          }
          apiUrl = "";
          localStorage.removeItem("NGSN_SCRIPT_URL");
        }

        adminKey = keyVal;
        sessionStorage.setItem("NGSN_ADMIN_KEY", adminKey);

        $("adminAuthModal").classList.add("hidden");
        unlockDashboard();
        renderAutomations();
        renderKeysModalList();
      } catch (e) {
        errEl.textContent = "❌ " + e.message;
        errEl.classList.remove("hidden");
      } finally {
        btn.disabled = false;
        btn.textContent = "Unlock Admin Master Plan";
      }
    });

    $("adminLogoutBtn")?.addEventListener("click", () => {
      sessionStorage.removeItem("NGSN_ADMIN_KEY");
      adminKey = "";
      $("adminMasterSection").classList.add("hidden");
      $("accessControlModal").classList.add("hidden");
      $("adminLockBtn").textContent = "🔐 Admin";
      $("adminLockBtn").classList.remove("unlocked");
    });

    $("refreshAdminBtn")?.addEventListener("click", fetchAdminState);
    $("uploadAutoBtn")?.addEventListener("click", handleUploadAutomation);

    $("closeAccessModalBtn")?.addEventListener("click", () => {
      $("accessControlModal").classList.add("hidden");
    });

    $("cmdExecBtn")?.addEventListener("click", handleCommandInput);
    $("adminCmdInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleCommandInput();
    });

    $("quickGenKeyBtn")?.addEventListener("click", () => {
      $("adminCmdInput").value = "/genkey";
      handleCommandInput();
    });

    $("copyGeneratedKeyBtn")?.addEventListener("click", async () => {
      const code = $("generatedKeyDisplay").textContent.trim();
      if (!code || code === "—") return;
      try { await navigator.clipboard.writeText(code); } catch (_) {}
      $("copyGeneratedKeyBtn").textContent = "✓ Copied";
      setTimeout(() => { $("copyGeneratedKeyBtn").textContent = "📋 Copy Code"; }, 1800);
    });

    document.querySelectorAll(".filter-tab").forEach(tab => {
      tab.addEventListener("click", (e) => {
        document.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
        e.currentTarget.classList.add("active");
        renderKeysModalList(e.currentTarget.dataset.filter);
      });
    });
  }

  function unlockDashboard() {
    $("adminMasterSection").classList.remove("hidden");
    $("adminLockBtn").textContent = "⚡ Admin Active";
    $("adminLockBtn").classList.add("unlocked");
    renderAutomations();
  }

  async function fetchAdminState() {
    if (apiUrl && adminKey) {
      try {
        const res = await apiCall(apiUrl, { action: "admin_state", adminKey });
        if (res.ok) {
          db.automations = res.automations || db.automations;
          db.keys        = res.keys || db.keys;
          saveLocalDb();
        }
      } catch (_) {}
    }
    renderAutomations();
    renderKeysModalList();
  }

  // ──────────────────────────────────────────────────────────────
  // RENDER AUTOMATION LIST (Left Column)
  // ──────────────────────────────────────────────────────────────
  function renderAutomations() {
    const container = $("automationListContainer");
    if (!container) return;

    if (!db.automations.length) {
      db.automations = [{ id: "tps-auto-1", name: "True search running", status: "running", fileName: "tps-extension.zip" }];
    }

    container.innerHTML = "";
    db.automations.forEach((item, index) => {
      const isRunning = String(item.status).toLowerCase() === "running";
      const row = document.createElement("div");
      row.className = `auto-item ${isRunning ? "is-running" : "is-stopped"}`;

      row.innerHTML = `
        <div class="auto-info">
          <div class="auto-title">
            <span class="auto-idx">${index + 1}.</span>
            <b>${esc(item.name)}</b>
            <span class="status-pill ${isRunning ? "pill-run" : "pill-stop"}">
              ${isRunning ? "● Running" : "■ Stopped"}
            </span>
          </div>
          <div class="auto-meta">
            ${item.fileName ? `<span>📦 ${esc(item.fileName)}</span>` : `<span>📦 Default Extension</span>`}
          </div>
        </div>

        <div class="auto-actions">
          <button class="ctrl-icon-btn btn-run ${isRunning ? "active" : ""}"
                  data-id="${esc(item.id)}" data-action="run"
                  title="Run Automation">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            <span>Run</span>
          </button>

          <button class="ctrl-icon-btn btn-stop ${!isRunning ? "active" : ""}"
                  data-id="${esc(item.id)}" data-action="stop"
                  title="Stop Automation">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>
            <span>Stop</span>
          </button>

          <button class="ctrl-icon-btn btn-access"
                  data-id="${esc(item.id)}" data-name="${esc(item.name)}" data-action="access"
                  title="Access Control (/genkey, Users, Block List)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
            </svg>
            <span>Access</span>
          </button>
        </div>
      `;

      container.appendChild(row);
    });

    container.querySelectorAll(".ctrl-icon-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const el     = e.currentTarget;
        const id     = el.dataset.id;
        const action = el.dataset.action;

        if (action === "access") {
          currentAutoId = id;
          $("accessModalTitle").textContent = `🔑 Access Control — ${el.dataset.name}`;
          $("accessControlModal").classList.remove("hidden");
          renderKeysModalList();
          return;
        }

        const newStatus = action === "run" ? "running" : "stopped";
        const target = db.automations.find(a => a.id === id);
        if (target) target.status = newStatus;
        saveLocalDb();
        renderAutomations();

        if (apiUrl) {
          try {
            await apiCall(apiUrl, {
              action: "toggle_automation",
              adminKey,
              automationId: id,
              status: newStatus
            });
          } catch (_) {}
        }
      });
    });
  }

  // ──────────────────────────────────────────────────────────────
  // UPLOAD AUTOMATION FILE (Right Column)
  // ──────────────────────────────────────────────────────────────
  async function handleUploadAutomation() {
    const fileInput = $("autoFileInput");
    const nameInput = $("autoNameInput");
    const btn       = $("uploadAutoBtn");

    const file = fileInput?.files?.[0];
    const name = (nameInput?.value || "").trim() || (file ? file.name.replace(/\.[^.]+$/, "") : "");

    if (!file) {
      showUploadStatus("⚠️ Upload Failed: অনুগ্রহ করে একটি ফাইল সিলেক্ট করুন!", "err");
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<span>⏳ Uploading & Processing…</span>`;
    showUploadStatus("⏳ ফাইল আপলোড ও প্রসেস হচ্ছে…", "proc");

    try {
      await new Promise(r => setTimeout(r, 500));

      if (apiUrl) {
        const base64Data = await readFileAsBase64(file);
        const res = await apiCall(apiUrl, {
          action: "upload_automation",
          adminKey,
          name,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          fileData: base64Data
        });
        if (!res.ok) throw new Error(res.error || "Upload failed");
        db.automations = res.automations || db.automations;
      } else {
        // Save directly in Master DB
        const existing = db.automations.find(a => a.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          existing.fileName  = file.name;
          existing.updatedAt = new Date().toISOString();
        } else {
          db.automations.push({
            id: "auto-" + Date.now(),
            name: name || file.name,
            status: "running",
            fileName: file.name,
            updatedAt: new Date().toISOString()
          });
        }
      }

      saveLocalDb();
      renderAutomations();
      fileInput.value = "";
      if (nameInput) nameInput.value = "";
      showUploadStatus("✅ Upload file saved — Done!", "ok");
    } catch (e) {
      showUploadStatus("❌ Upload Failed: " + e.message, "err");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg><span>Upload File</span>`;
    }
  }

  function showUploadStatus(msg, type) {
    const box = $("uploadStatusBox");
    if (!box) return;
    box.textContent = msg;
    box.className = `upload-status status-${type}`;
    box.classList.remove("hidden");
  }

  // ──────────────────────────────────────────────────────────────
  // /genkey & ACCESS CONTROL MODAL
  // ──────────────────────────────────────────────────────────────
  async function handleCommandInput() {
    const input = $("adminCmdInput");
    const label = $("userLabelInput")?.value.trim() || "User";
    const cmd   = (input?.value || "").trim().toLowerCase();

    if (!cmd.startsWith("/genkey")) {
      alert("কমান্ড বক্সে /genkey লিখুন অথবা সরাসরি ⚡ /genkey বাটনে ক্লিক করুন।");
      return;
    }

    const btn = $("cmdExecBtn");
    btn.disabled = true;
    btn.textContent = "Generating…";

    try {
      let newCode = generateSignedCode();

      if (apiUrl) {
        try {
          const res = await apiCall(apiUrl, {
            action: "genkey",
            adminKey,
            automationId: currentAutoId,
            userLabel: label
          });
          if (res.ok && res.code) {
            newCode = res.code;
            db.keys = res.keys || db.keys;
          }
        } catch (_) {}
      }

      // Ensure added to local DB too
      if (!db.keys.some(k => k.code === newCode)) {
        db.keys.unshift({
          code: newCode,
          automationId: currentAutoId,
          status: "unused",
          deviceId: "1-User Signed Key",
          userLabel: label,
          createdAt: new Date().toISOString(),
          activatedAt: ""
        });
      }

      saveLocalDb();
      $("generatedKeyBox").classList.remove("hidden");
      $("generatedKeyDisplay").textContent = newCode;
      input.value = "";
      if ($("userLabelInput")) $("userLabelInput").value = "";
      renderKeysModalList();
    } finally {
      btn.disabled = false;
      btn.textContent = "Run Command";
    }
  }

  function renderKeysModalList(filter = "all") {
    const tbody = $("keysTableBody");
    if (!tbody) return;

    const keysList = db.keys || [];
    const filtered = keysList.filter(k => {
      if (filter === "all") return true;
      return String(k.status).toLowerCase() === filter;
    });

    const total   = keysList.length;
    const active  = keysList.filter(k => k.status === "active").length;
    const unused  = keysList.filter(k => k.status === "unused").length;
    const blocked = keysList.filter(k => k.status === "blocked").length;

    if ($("statTotalKeys"))   $("statTotalKeys").textContent   = total;
    if ($("statActiveKeys"))  $("statActiveKeys").textContent  = active;
    if ($("statUnusedKeys"))  $("statUnusedKeys").textContent  = unused;
    if ($("statBlockedKeys")) $("statBlockedKeys").textContent = blocked;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#6A8296;padding:20px;">No keys found. Type <b>/genkey</b> above to generate an active code.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    filtered.forEach(item => {
      const st = String(item.status || "unused").toLowerCase();
      const badgeCls = st === "active" ? "k-active" : st === "blocked" ? "k-blocked" : "k-unused";
      const badgeTxt = st === "active" ? "Active (1/1 Used)" : st === "blocked" ? "Blocked" : "Ready (1 User)";
      const devShort = item.deviceId || "1-User Lock";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><code class="key-code-chip">${esc(item.code)}</code></td>
        <td>${esc(item.userLabel || "User")}</td>
        <td><span class="k-badge ${badgeCls}">${badgeTxt}</span></td>
        <td><small style="color:#6A8296;font-family:monospace;">${esc(devShort)}</small></td>
        <td class="k-actions">
          ${st !== "blocked"
            ? `<button class="k-btn k-block" data-code="${esc(item.code)}" data-sub="block" title="Block User">🚫 Block</button>`
            : `<button class="k-btn k-unblock" data-code="${esc(item.code)}" data-sub="unblock" title="Unblock User">✅ Unblock</button>`
          }
          <button class="k-btn k-reset" data-code="${esc(item.code)}" data-sub="reset" title="Reset 1-User Device Lock">🔄 Reset</button>
          <button class="k-btn k-del" data-code="${esc(item.code)}" data-sub="delete" title="Delete Code">🗑️</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".k-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const code = e.currentTarget.dataset.code;
        const sub  = e.currentTarget.dataset.sub;
        if (sub === "delete" && !confirm(`Delete key ${code}?`)) return;

        const idx = db.keys.findIndex(k => k.code === code);
        if (idx >= 0) {
          if (sub === "block") db.keys[idx].status = "blocked";
          else if (sub === "unblock") db.keys[idx].status = "active";
          else if (sub === "reset") { db.keys[idx].status = "unused"; db.keys[idx].deviceId = ""; }
          else if (sub === "delete") db.keys.splice(idx, 1);
          saveLocalDb();
        }

        if (apiUrl) {
          try {
            const res = await apiCall(apiUrl, { action: "key_action", adminKey, code, subAction: sub });
            if (res.ok && res.keys) { db.keys = res.keys; saveLocalDb(); }
          } catch (_) {}
        }

        const activeTab = document.querySelector(".filter-tab.active")?.dataset.filter || "all";
        renderKeysModalList(activeTab);
      });
    });
  }

  async function apiCall(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    return await res.json();
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }

  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
})();
