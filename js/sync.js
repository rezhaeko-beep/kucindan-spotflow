/* SpotFlow Kucindan — Sheet sync helpers (source of truth for setoran/events) */
(function (global) {
  "use strict";

  const CFG_KEY = "spotflow_kucindan_cfg";
  const Q_KEY = "spotflow_kucindan_q";
  const FILE_DEFAULTS = { url: "", token: "spotflow-mop-2026", sheetId: "1M3bBUqGgzP5VqTBz6Ujoy6n948RJIPAHKv874IWdj50" };

  function loadLocalCfg() {
    try {
      return JSON.parse(localStorage.getItem(CFG_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function saveLocalCfg(cfg) {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }

  /** Prefill from data/sheet-sync.json; localStorage overrides if user saved. */
  async function loadSheetSyncDefaults() {
    let file = Object.assign({}, FILE_DEFAULTS);
    try {
      const res = await fetch("data/sheet-sync.json", { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        file = {
          url: j.url != null ? String(j.url) : "",
          token: j.token != null ? String(j.token) : FILE_DEFAULTS.token,
          sheetId: j.sheetId != null ? String(j.sheetId) : FILE_DEFAULTS.sheetId
        };
      }
    } catch (e) {}
    const saved = loadLocalCfg();
    const userSaved = !!(saved && (saved._userSaved || saved.url));
    const cfg = {
      url: userSaved && saved.url != null ? String(saved.url) : (file.url || ""),
      token: userSaved && saved.token ? String(saved.token) : (file.token || FILE_DEFAULTS.token),
      sheetId: userSaved && saved.sheetId ? String(saved.sheetId) : (file.sheetId || FILE_DEFAULTS.sheetId),
      _userSaved: !!(saved && saved._userSaved)
    };
    // If nothing in localStorage yet, seed from file (not marked user-saved)
    if (!localStorage.getItem(CFG_KEY)) {
      saveLocalCfg({ url: cfg.url, token: cfg.token, sheetId: cfg.sheetId });
    } else if (!saved.token && !saved.sheetId && !saved.url) {
      saveLocalCfg({ url: cfg.url, token: cfg.token, sheetId: cfg.sheetId });
    }
    return cfg;
  }

  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(Q_KEY) || "[]"); } catch (e) { return []; }
  }
  function saveQueue(q) {
    localStorage.setItem(Q_KEY, JSON.stringify(q));
  }

  function hasUrl(cfg) {
    return !!(cfg && cfg.url && String(cfg.url).trim());
  }

  function buildUrl(cfg, params) {
    if (!hasUrl(cfg)) return "";
    const u = new URL(cfg.url, location.href);
    Object.keys(params || {}).forEach((k) => {
      if (params[k] != null && params[k] !== "") u.searchParams.set(k, params[k]);
    });
    if (cfg.token) u.searchParams.set("token", cfg.token);
    return u.toString();
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function isNetworkError(err) {
    const s = String(err && err.message ? err.message : err || "");
    return /failed to fetch|networkerror|network request failed|load failed|typeerror|aborterror/i.test(s);
  }

  async function postSheets(cfg, payload, opts) {
    opts = opts || {};
    if (!hasUrl(cfg) || !cfg.token) return { ok: false, skipped: true };
    const url = buildUrl(cfg, {});
    try {
      await fetch(url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      return { ok: true, opaque: true };
    } catch (err) {
      if (!opts.noQueue) {
        const q = loadQueue();
        q.push({ at: new Date().toISOString(), payload, tries: 0 });
        saveQueue(q);
      }
      return { ok: false, error: String(err) };
    }
  }

  /** Flush offline queue with retry (max 5 attempts per item). Soft-skip if no url. */
  async function flushQueue(cfg, onUpdate) {
    if (!hasUrl(cfg) || !cfg.token) {
      if (onUpdate) onUpdate(loadQueue());
      return { ok: false, skipped: true, sent: 0, left: loadQueue().length };
    }
    let q = loadQueue();
    if (!q.length) {
      if (onUpdate) onUpdate([]);
      return { ok: true, sent: 0, left: 0 };
    }
    const left = [];
    let sent = 0;
    for (const item of q) {
      const tries = (item.tries || 0) + 1;
      const r = await postSheets(cfg, item.payload, { noQueue: true });
      if (r.ok) {
        sent++;
      } else if (tries < 5) {
        left.push(Object.assign({}, item, { tries }));
      } else {
        left.push(Object.assign({}, item, { tries, dead: true }));
      }
      // brief backoff between posts
      await sleep(80);
    }
    // drop dead after reporting once
    const keep = left.filter((x) => !x.dead);
    saveQueue(keep);
    if (onUpdate) onUpdate(keep);
    return { ok: true, sent, left: keep.length };
  }

  /**
   * GET list from Apps Script: ?action=list&tab=Transaksi&lokasi=&limit=50&token=
   * Retries 1–2 times with backoff on network errors only. Fail-soft when url empty.
   */
  async function listFromSheet(cfg, opts) {
    opts = opts || {};
    if (!hasUrl(cfg) || !cfg.token) return { ok: false, skipped: true, rows: [] };
    const url = buildUrl(cfg, {
      action: "list",
      tab: opts.tab || "Transaksi",
      lokasi: opts.lokasi || "",
      limit: String(opts.limit || 50)
    });
    const maxRetries = opts.retries != null ? Math.max(0, Math.min(2, Number(opts.retries) || 0)) : 2;
    let lastErr = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, { method: "GET", mode: "cors", credentials: "omit" });
        if (!res.ok) return { ok: false, error: "HTTP " + res.status, rows: [] };
        const data = await res.json();
        if (!data || data.ok === false) return { ok: false, error: (data && data.error) || "list failed", rows: [] };
        return { ok: true, rows: Array.isArray(data.rows) ? data.rows : [] };
      } catch (err) {
        lastErr = err;
        if (!isNetworkError(err) || attempt >= maxRetries) {
          return { ok: false, error: String(err), rows: [], network: isNetworkError(err) };
        }
        // backoff: 400ms, then 900ms
        await sleep(400 + attempt * 500);
      }
    }
    return { ok: false, error: String(lastErr || "list failed"), rows: [], network: true };
  }

  /**
   * Soft ping: GET ?action=ping (or ?ping=1) with token.
   * Soft-fail when url empty; opaque no-cors fallback if CORS blocks.
   */
  async function ping(cfg, opts) {
    opts = opts || {};
    if (!hasUrl(cfg)) return { ok: false, skipped: true };
    const usePingParam = !!opts.pingParam;
    const url = usePingParam
      ? buildUrl(cfg, { ping: "1" })
      : buildUrl(cfg, { action: "ping" });
    try {
      const res = await fetch(url, { method: "GET", mode: "cors", credentials: "omit" });
      if (!res.ok) {
        // try alternate query style once
        if (!usePingParam) return ping(cfg, { pingParam: true });
        return { ok: false, soft: true, error: "HTTP " + res.status };
      }
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      return { ok: true, data: data };
    } catch (err) {
      // Soft: fire-and-forget no-cors so field can still "tes koneksi"
      try {
        const softUrl = buildUrl(cfg, { ping: "1" });
        await fetch(softUrl, { method: "GET", mode: "no-cors", credentials: "omit" });
        return { ok: true, opaque: true, soft: true };
      } catch (e2) {
        return { ok: false, soft: true, error: String(err) };
      }
    }
  }

  /** Map Sheet Transaksi row object → local ticket (active statuses only). */
  function rowToTicket(row) {
    if (!row) return null;
    const statusMap = {
      lobby: "lobby",
      parkir: "parkir",
      dipanggil: "dipanggil",
      siap: "siap",
      selesai: "selesai"
    };
    const st = statusMap[String(row.status || "").toLowerCase()] || null;
    if (!st || st === "selesai") return null; // hydrate active only
    const id = row.id || ("SHEET-" + (row.plat || "") + "-" + (row.timestamp || Date.now()));
    const ts = row.timestamp || new Date().toISOString();
    return {
      id: String(id),
      kode: String(row.id || id).indexOf("KC-") === 0 ? String(row.id) : ("KC-" + String(id).slice(-6).toUpperCase()),
      plate: String(row.plat || "").toUpperCase(),
      guestName: row.tamu || "Tamu",
      guestPhone: row.wa || "",
      vehicleType: row.jenis || "mobil",
      fee: Number(row.jasa_kas || row.fee || 35000),
      tip: Number(row.tip || 0),
      note: row.catatan || "",
      lokasi: row.lokasi || "MOP",
      valetStatus: st,
      spotId: row.slot || null,
      staff: row.petugas || "",
      slaOverrideAlasan: row.sla_override_alasan || "",
      checkIn: ts,
      parkedAt: st === "parkir" || st === "dipanggil" || st === "siap" ? ts : null,
      calledAt: st === "dipanggil" || st === "siap" ? ts : null,
      readyAt: st === "siap" ? ts : null,
      checkOut: null,
      payment: row.metode_bayar || null,
      shift: row.shift || "",
      events: [{ at: ts, label: "Dihidrasi dari Sheet · " + (row.event || st) }],
      _fromSheet: true
    };
  }

  /**
   * Merge Sheet rows into tickets: add missing by id/plat for active lokasi; do not wipe local.
   */
  function mergeHydrate(tickets, rows, lokasi) {
    const out = Array.isArray(tickets) ? tickets.slice() : [];
    const byId = new Set(out.map((t) => t.id));
    const byPlatActive = new Set(
      out.filter((t) => t.valetStatus !== "selesai").map((t) => (t.plate || "").toUpperCase())
    );
    let added = 0;
    for (const row of rows || []) {
      if (lokasi && row.lokasi && row.lokasi !== lokasi) continue;
      const t = rowToTicket(row);
      if (!t || !t.plate) continue;
      if (byId.has(t.id) || byPlatActive.has(t.plate)) continue;
      out.unshift(t);
      byId.add(t.id);
      byPlatActive.add(t.plate);
      added++;
    }
    return { tickets: out, added };
  }

  global.SpotFlowSync = {
    CFG_KEY,
    Q_KEY,
    FILE_DEFAULTS,
    loadSheetSyncDefaults,
    loadLocalCfg,
    saveLocalCfg,
    loadQueue,
    saveQueue,
    hasUrl,
    buildUrl,
    postSheets,
    flushQueue,
    listFromSheet,
    ping,
    rowToTicket,
    mergeHydrate
  };
})(typeof window !== "undefined" ? window : globalThis);
