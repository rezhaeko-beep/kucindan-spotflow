/* SpotFlow Kucindan — HO KPI module (Kantor pusat)
 * Mount contract (Tim IT):
 *   SpotFlowHoKpi.mount(document.getElementById("ho-kpi-root"))
 *   SpotFlowHoKpi.refresh()
 * Hydrates Transaksi / Absensi / Laporan via SpotFlowSync.listFromSheet — NO demo data.
 */
(function (global) {
  "use strict";

  const TZ = "Asia/Jakarta";
  const LOCS_DEFAULT = [
    "MOP", "Sate Maranggi", "Lyma Brisket", "Taman Teras Tebet",
    "Bakmi Berdikari", "Pasar Minggu", "Kalimalang"
  ];
  const ACTIVE_STATUS = { lobby: 1, parkir: 1, dipanggil: 1, siap: 1 };
  const PAY_EVENTS = { serahkan_bayar: 1, bayar: 1, selesai: 1, setoran: 1, omzet: 1, gate_bayar: 1, parkir_keluar: 1 };

  let rootEl = null;
  let filters = {
    lokasi: "",          // "" = semua
    periode: "minggu",   // minggu | bulan
    layanan: "semua"     // semua | valet | parkir_gate
  };
  let cache = { transaksi: [], absensi: [], laporan: [], loadedAt: null, error: null, skipped: false };
  let loading = false;

  function Sync() {
    return global.SpotFlowSync || null;
  }

  function loadCfg() {
    const S = Sync();
    if (S && S.loadLocalCfg) {
      const c = S.loadLocalCfg() || {};
      if (c.url || c.token) return c;
    }
    try {
      return JSON.parse(localStorage.getItem("spotflow_kucindan_cfg") || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function rp(n) {
    return "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
  }

  function rpShort(n) {
    n = Math.round(Number(n) || 0);
    if (n >= 1e6) return "Rp " + (n / 1e6).toFixed(1).replace(/\.0$/, "") + " jt";
    if (n >= 1e3) return "Rp " + Math.round(n / 1e3) + " rb";
    return rp(n);
  }

  function todayKey(d) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(d || new Date());
  }

  function parseTs(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  function dayKeyFromTs(v) {
    const d = parseTs(v);
    return d ? todayKey(d) : "";
  }

  /** Monday (WIB calendar) of the week containing d → { fromKey, toKey } inclusive */
  function weekRange(d) {
    const key = todayKey(d || new Date());
    const parts = key.split("-").map(Number);
    // Build noon UTC proxy then find weekday in WIB via formatter
    const probe = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 5, 0, 0));
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(probe);
    const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    const offset = map[wd] != null ? map[wd] : 0;
    const from = new Date(probe.getTime() - offset * 86400000);
    const to = new Date(from.getTime() + 6 * 86400000);
    return { fromKey: todayKey(from), toKey: todayKey(to), label: "Minggu ini" };
  }

  function monthRange(d) {
    const key = todayKey(d || new Date());
    const ym = key.slice(0, 7);
    const y = Number(ym.slice(0, 4));
    const m = Number(ym.slice(5, 7));
    const lastDay = new Date(Date.UTC(y, m, 0, 5, 0, 0)); // day 0 of next month
    return {
      fromKey: ym + "-01",
      toKey: todayKey(lastDay),
      label: "Bulan " + ym
    };
  }

  function activeRange() {
    return filters.periode === "bulan" ? monthRange() : weekRange();
  }

  function inDateRange(ts, range) {
    const k = dayKeyFromTs(ts);
    if (!k) return false;
    return k >= range.fromKey && k <= range.toKey;
  }

  /** Omzet kas = jasa_kas (alias Omzet/omzet). Tip never included. */
  function numKas(row) {
    if (!row) return 0;
    if (row.jasa_kas != null && row.jasa_kas !== "") return Number(row.jasa_kas) || 0;
    if (row.Omzet != null && row.Omzet !== "") return Number(row.Omzet) || 0;
    if (row.omzet != null && row.omzet !== "") return Number(row.omzet) || 0;
    return 0;
  }

  function numTip(row) {
    if (!row) return 0;
    if (row.tip != null && row.tip !== "") return Number(row.tip) || 0;
    if (row.Tip != null && row.Tip !== "") return Number(row.Tip) || 0;
    return 0;
  }

  /**
   * Detect layanan: Valet vs Parkir gate.
   * Explicit fields first; then event heuristics; default valet (field ops legacy).
   */
  function detectLayanan(row) {
    if (!row) return "valet";
    const explicit = String(row.layanan || row.jenis_layanan || row.service || "").toLowerCase().trim();
    if (/parkir\s*_?gate|gate|sistem\s*parkir|parkir_sistem/.test(explicit)) return "parkir_gate";
    if (/valet/.test(explicit)) return "valet";
    const ev = String(row.event || "").toLowerCase();
    if (/gate|parkir_masuk|parkir_keluar|ticket_gate|sistem_parkir|masuk_gate|keluar_gate/.test(ev)) {
      return "parkir_gate";
    }
    const jenis = String(row.jenis || "").toLowerCase();
    if ((/gate|parkir_gate/.test(jenis) || jenis === "parkir") && !/mobil|motor|box|pickup/.test(jenis)) {
      return "parkir_gate";
    }
    const catatan = String(row.catatan || "").toLowerCase();
    if (/\[parkir_gate\]|layanan:parkir|jenis:parkir_gate/.test(catatan)) return "parkir_gate";
    return "valet";
  }

  function layananLabel(k) {
    return ({ valet: "Valet", parkir_gate: "Parkir gate", semua: "Semua" })[k] || k;
  }

  function isRevenueRow(row) {
    const ev = String(row.event || "").toLowerCase();
    const st = String(row.status || "").toLowerCase();
    if (PAY_EVENTS[ev]) return true;
    if (st === "selesai") return true;
    // Laporan-style or HO setoran rows often carry jasa_kas without valet status
    if (numKas(row) || numTip(row)) {
      if (!st || st === "selesai" || /setor|omzet|bayar|gate/.test(ev)) return true;
    }
    return false;
  }

  function isActiveTicket(row) {
    const st = String(row.status || "").toLowerCase();
    return !!ACTIVE_STATUS[st];
  }

  function filterRows(rows, range) {
    return (rows || []).filter((row) => {
      if (filters.lokasi && String(row.lokasi || "") !== filters.lokasi) return false;
      if (filters.layanan !== "semua" && detectLayanan(row) !== filters.layanan) return false;
      if (!inDateRange(row.timestamp, range)) return false;
      return true;
    });
  }

  function emptyBucket() {
    return { omzet: 0, tip: 0, tiket: 0, aktif: 0, valet: { omzet: 0, tip: 0, tiket: 0 }, parkir_gate: { omzet: 0, tip: 0, tiket: 0 } };
  }

  function aggregate(range) {
    const txAll = filterRows(cache.transaksi, range);
    const absAll = filterRows(cache.absensi, range);
    const lapAll = filterRows(cache.laporan, range);

    const totals = emptyBucket();
    const byLokasi = {};
    const ensure = (loc) => {
      if (!byLokasi[loc]) byLokasi[loc] = emptyBucket();
      return byLokasi[loc];
    };

    // Active tickets: ignore date range upper bound strictness for "aktif sekarang"
    // but still respect lokasi + layanan; use latest Transaksi snapshot in cache
    const aktifRows = (cache.transaksi || []).filter((row) => {
      if (!isActiveTicket(row)) return false;
      if (filters.lokasi && String(row.lokasi || "") !== filters.lokasi) return false;
      if (filters.layanan !== "semua" && detectLayanan(row) !== filters.layanan) return false;
      return true;
    });
    // de-dupe by id/plat
    const seenAktif = new Set();
    let aktifCount = 0;
    for (const row of aktifRows) {
      const key = String(row.id || row.plat || "").toUpperCase();
      if (!key || seenAktif.has(key)) continue;
      seenAktif.add(key);
      aktifCount++;
      const loc = String(row.lokasi || "—") || "—";
      ensure(loc).aktif++;
      totals.aktif++;
    }

    // Revenue from Transaksi pay/selesai rows (tip separate)
    const seenPay = new Set();
    for (const row of txAll) {
      if (!isRevenueRow(row)) continue;
      const key = String(row.id || "") + "|" + dayKeyFromTs(row.timestamp) + "|" + String(row.event || "") + "|" + String(row.plat || "");
      if (seenPay.has(key)) continue;
      seenPay.add(key);
      const kas = numKas(row);
      const tip = numTip(row);
      const lay = detectLayanan(row);
      const loc = String(row.lokasi || "—") || "—";
      const b = ensure(loc);
      totals.omzet += kas; totals.tip += tip; totals.tiket += 1;
      totals[lay].omzet += kas; totals[lay].tip += tip; totals[lay].tiket += 1;
      b.omzet += kas; b.tip += tip; b.tiket += 1;
      b[lay].omzet += kas; b[lay].tip += tip; b[lay].tiket += 1;
    }

    // Laporan tab is shift-close summary — do NOT add into Transaksi KPIs (avoids double-count).
    // If no Transaksi revenue in range, fall back to Laporan aggregates.
    const lapSummary = [];
    let lapOmzet = 0, lapTip = 0, lapKend = 0;
    for (const row of lapAll) {
      const kas = numKas(row);
      const tip = numTip(row);
      const nKend = Number(row.kendaraan || 0) || 0;
      if (!kas && !tip && !nKend) continue;
      lapOmzet += kas; lapTip += tip; lapKend += nKend;
      lapSummary.push({
        lokasi: String(row.lokasi || "—"),
        periode: String(row.periode || ""),
        omzet: kas, tip: tip, kendaraan: nKend,
        layanan: detectLayanan(row),
        timestamp: row.timestamp
      });
    }
    if (!totals.tiket && !totals.omzet && !totals.tip && lapSummary.length) {
      for (const row of lapSummary) {
        const lay = row.layanan;
        const loc = row.lokasi || "—";
        const b = ensure(loc);
        totals.omzet += row.omzet; totals.tip += row.tip; totals.tiket += row.kendaraan;
        totals[lay].omzet += row.omzet; totals[lay].tip += row.tip; totals[lay].tiket += row.kendaraan;
        b.omzet += row.omzet; b.tip += row.tip; b.tiket += row.kendaraan;
        b[lay].omzet += row.omzet; b[lay].tip += row.tip; b[lay].tiket += row.kendaraan;
      }
    }

    // Shift from Absensi
    let shiftOpen = 0;
    let shiftClose = 0;
    const petugas = new Set();
    for (const row of absAll) {
      const ev = String(row.event || "").toLowerCase();
      const st = String(row.status_dinas || row.status || "").toLowerCase();
      if (ev === "shift_open" || st === "dinas" || st === "masuk") shiftOpen++;
      if (ev === "shift_close" || st === "pulang" || st === "selesai") shiftClose++;
      if (row.petugas) petugas.add(String(row.petugas));
    }

    return {
      range,
      totals,
      byLokasi,
      laporanSummary: lapSummary,
      laporanTotals: { omzet: lapOmzet, tip: lapTip, kendaraan: lapKend },
      shift: { open: shiftOpen, close: shiftClose, petugas: petugas.size },
      counts: { transaksi: txAll.length, absensi: absAll.length, laporan: lapAll.length, aktif: aktifCount }
    };
  }

  function locsList() {
    const set = new Set(LOCS_DEFAULT);
    for (const row of [].concat(cache.transaksi, cache.absensi, cache.laporan)) {
      if (row && row.lokasi) set.add(String(row.lokasi));
    }
    return Array.from(set);
  }

  function renderEmpty(msg) {
    return `<div class="ho-empty">${esc(msg)}</div>`;
  }

  function renderBreakdownTable(agg) {
    const keys = Object.keys(agg.byLokasi).sort();
    if (!keys.length) {
      return renderEmpty("Belum ada data setoran di filter ini. Hubungkan Sheet atau ubah filter.");
    }
    const rows = keys.map((loc) => {
      const b = agg.byLokasi[loc];
      return `<tr>
        <td>${esc(loc)}</td>
        <td>${rp(b.omzet)}</td>
        <td>${rp(b.tip)}</td>
        <td>${b.tiket}</td>
        <td>${b.aktif}</td>
        <td><span class="pill ho-pill-valet">V ${rpShort(b.valet.omzet)}</span>
            <span class="pill ho-pill-gate">G ${rpShort(b.parkir_gate.omzet)}</span></td>
      </tr>`;
    }).join("");
    return `<div class="ho-table-wrap"><table class="table ho-kpi-table">
      <thead><tr>
        <th>Lokasi</th><th>Omzet (jasa_kas)</th><th>Tip</th><th>Tiket</th><th>Aktif</th><th>Per layanan</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  function renderKpiCards(agg) {
    const t = agg.totals;
    return `<div class="ho-kpis" role="group" aria-label="KPI Kantor">
      <div class="kpi">
        <div class="label kas">Omzet gabungan</div>
        <div class="n">${rpShort(t.omzet)}</div>
        <div class="sub">${rp(t.omzet)} · jasa_kas / Omzet (bukan tip)</div>
      </div>
      <div class="kpi">
        <div class="label tip">Tip petugas</div>
        <div class="n">${rpShort(t.tip)}</div>
        <div class="sub">${rp(t.tip)} · tidak masuk kas</div>
      </div>
      <div class="kpi">
        <div class="label">Tiket aktif</div>
        <div class="n">${t.aktif}</div>
        <div class="sub">Lobby / parkir / dipanggil / siap</div>
      </div>
      <div class="kpi">
        <div class="label">Shift</div>
        <div class="n">${agg.shift.open}</div>
        <div class="sub">Buka ${agg.shift.open} · tutup ${agg.shift.close} · ${agg.shift.petugas} petugas</div>
      </div>
    </div>
    <div class="ho-break ho-layanan-break">
      <div class="ho-card ho-kpi-mini">
        <h3>Valet</h3>
        <div class="list-row"><span>Omzet</span><b>${rp(t.valet.omzet)}</b></div>
        <div class="list-row"><span>Tip</span><b>${rp(t.valet.tip)}</b></div>
        <div class="list-row"><span>Tiket</span><b>${t.valet.tiket}</b></div>
      </div>
      <div class="ho-card ho-kpi-mini">
        <h3>Parkir gate</h3>
        <div class="list-row"><span>Omzet</span><b>${rp(t.parkir_gate.omzet)}</b></div>
        <div class="list-row"><span>Tip</span><b>${rp(t.parkir_gate.tip)}</b></div>
        <div class="list-row"><span>Tiket</span><b>${t.parkir_gate.tiket}</b></div>
      </div>
    </div>`;
  }

  function renderFilters() {
    const locs = locsList();
    const locOpts = [`<option value="">Semua lokasi</option>`]
      .concat(locs.map((l) => `<option value="${esc(l)}" ${filters.lokasi === l ? "selected" : ""}>${esc(l)}</option>`))
      .join("");
    return `<div class="ho-filter ho-kpi-filters" id="hoKpiFilters">
      <label class="ho-filter-label" for="hoKpiLokasi">Lokasi</label>
      <select id="hoKpiLokasi" aria-label="Filter lokasi">${locOpts}</select>
      <div class="seg" role="group" aria-label="Periode">
        <button type="button" data-periode="minggu" class="${filters.periode === "minggu" ? "active" : ""}">Minggu</button>
        <button type="button" data-periode="bulan" class="${filters.periode === "bulan" ? "active" : ""}">Bulan</button>
      </div>
      <div class="seg" role="group" aria-label="Jenis layanan">
        <button type="button" data-layanan="semua" class="${filters.layanan === "semua" ? "active" : ""}">Semua</button>
        <button type="button" data-layanan="valet" class="${filters.layanan === "valet" ? "active" : ""}">Valet</button>
        <button type="button" data-layanan="parkir_gate" class="${filters.layanan === "parkir_gate" ? "active" : ""}">Parkir gate</button>
      </div>
      <button type="button" class="btn btn-sm" id="hoKpiRefresh">${loading ? "Memuat…" : "↻ Muat Sheet"}</button>
    </div>`;
  }

  function renderPeriodSection(title, agg, kind) {
    const r = agg.range;
    return `<section class="ho-card ho-period-card" data-period="${esc(kind)}">
      <h2>${esc(title)}</h2>
      <p class="hint">${esc(r.fromKey)} → ${esc(r.toKey)} · filter: ${esc(filters.lokasi || "semua lokasi")} · ${esc(layananLabel(filters.layanan))}</p>
      <div class="ho-period-kpis">
        <div class="list-row"><span>Omzet (jasa_kas)</span><b class="kas">${rp(agg.totals.omzet)}</b></div>
        <div class="list-row"><span>Tip</span><b class="tip">${rp(agg.totals.tip)}</b></div>
        <div class="list-row"><span>Tiket / kendaraan</span><b>${agg.totals.tiket}</b></div>
        <div class="list-row"><span>Tiket aktif sekarang</span><b>${agg.totals.aktif}</b></div>
        <div class="list-row"><span>Valet · Parkir gate</span><b>${rpShort(agg.totals.valet.omzet)} · ${rpShort(agg.totals.parkir_gate.omzet)}</b></div>
      </div>
      <h3>Per lokasi (dari Transaksi)</h3>
      ${renderBreakdownTable(agg)}
      ${agg.laporanSummary && agg.laporanSummary.length ? `
        <h3>Laporan Sheet (shift close) — referensi</h3>
        <div class="ho-table-wrap"><table class="table ho-kpi-table">
          <thead><tr><th>Waktu</th><th>Lokasi</th><th>Periode</th><th>Omzet</th><th>Tip</th><th>Kendaraan</th></tr></thead>
          <tbody>
            ${agg.laporanSummary.map(r => `<tr>
              <td>${esc(dayKeyFromTs(r.timestamp) || "—")}</td>
              <td>${esc(r.lokasi)}</td>
              <td>${esc(r.periode || "—")}</td>
              <td>${rp(r.omzet)}</td>
              <td>${rp(r.tip)}</td>
              <td>${r.kendaraan}</td>
            </tr>`).join("")}
          </tbody>
        </table></div>
        <p class="hint">Laporan tidak dijumlah ke KPI utama jika Transaksi sudah punya setoran (hindari double-count).</p>
      ` : ""}
    </section>`;
  }

  function paint() {
    if (!rootEl) return;
    const cfg = loadCfg();
    const hasUrl = !!(cfg && cfg.url && String(cfg.url).trim());

    const weekAgg = aggregate(weekRange());
    const monthAgg = aggregate(monthRange());
    const primary = filters.periode === "bulan" ? monthAgg : weekAgg;

    let statusBits = "";
    if (!hasUrl) {
      statusBits = `<div class="alert-bar">Sheets: lokal saja — tempel Web App URL di ⚙️ Sheets sync agar KPI terisi dari Transaksi / Absensi / Laporan.</div>`;
    } else if (cache.skipped) {
      statusBits = `<div class="alert-bar">Sync dilewati (URL/token kosong).</div>`;
    } else if (cache.error) {
      statusBits = `<div class="alert-bar">Gagal ambil Sheet: ${esc(cache.error)} — coba ↻ Muat Sheet.</div>`;
    } else if (cache.loadedAt) {
      statusBits = `<p class="ho-kpi-meta">Data Sheet · T ${cache.transaksi.length} · A ${cache.absensi.length} · L ${cache.laporan.length} · diperbarui ${esc(cache.loadedAt)}</p>`;
    }

    const noData = !cache.transaksi.length && !cache.absensi.length && !cache.laporan.length;

    rootEl.innerHTML = `
      <div class="ho-kpi-module">
        ${renderFilters()}
        ${statusBits}
        ${loading ? `<div class="ho-empty">Mengambil Transaksi / Absensi / Laporan…</div>` : ""}
        ${!loading && noData && hasUrl
          ? renderEmpty("Sheet terhubung tetapi belum ada baris untuk filter ini.")
          : ""}
        ${!loading ? renderKpiCards(primary) : ""}
        <div class="ho-period-grid">
          ${renderPeriodSection("Ringkasan mingguan", weekAgg, "minggu")}
          ${renderPeriodSection("Ringkasan bulanan", monthAgg, "bulan")}
        </div>
      </div>`;

    bind();
  }

  function bind() {
    if (!rootEl) return;
    const loc = rootEl.querySelector("#hoKpiLokasi");
    if (loc) {
      loc.onchange = () => {
        filters.lokasi = loc.value || "";
        paint();
      };
    }
    rootEl.querySelectorAll("[data-periode]").forEach((btn) => {
      btn.onclick = () => {
        filters.periode = btn.getAttribute("data-periode") || "minggu";
        paint();
      };
    });
    rootEl.querySelectorAll("[data-layanan]").forEach((btn) => {
      btn.onclick = () => {
        filters.layanan = btn.getAttribute("data-layanan") || "semua";
        paint();
      };
    });
    const ref = rootEl.querySelector("#hoKpiRefresh");
    if (ref) ref.onclick = () => refresh();
  }

  async function fetchTab(cfg, tab) {
    const S = Sync();
    if (!S || !S.listFromSheet) {
      return { ok: false, error: "SpotFlowSync.listFromSheet tidak tersedia", rows: [] };
    }
    // HO multi-lokasi: empty lokasi, max limit 200 (Apps Script cap)
    return S.listFromSheet(cfg, { tab: tab, lokasi: "", limit: 200, retries: 2 });
  }

  async function refresh() {
    if (!rootEl) return;
    const cfg = loadCfg();
    loading = true;
    paint();
    if (!cfg.url || !String(cfg.url).trim() || !cfg.token) {
      cache = { transaksi: [], absensi: [], laporan: [], loadedAt: null, error: null, skipped: true };
      loading = false;
      paint();
      return;
    }
    try {
      const [tx, abs, lap] = await Promise.all([
        fetchTab(cfg, "Transaksi"),
        fetchTab(cfg, "Absensi"),
        fetchTab(cfg, "Laporan")
      ]);
      const err = [tx, abs, lap].filter((r) => r && !r.ok && !r.skipped).map((r) => r.error).filter(Boolean);
      cache = {
        transaksi: (tx && tx.rows) || [],
        absensi: (abs && abs.rows) || [],
        laporan: (lap && lap.rows) || [],
        loadedAt: new Date().toLocaleString("id-ID", { timeZone: TZ }),
        error: err.length ? err.join("; ") : null,
        skipped: !!(tx && tx.skipped)
      };
    } catch (e) {
      cache.error = String(e && e.message ? e.message : e);
    }
    loading = false;
    paint();
  }

  /**
   * Mount into #ho-kpi-root (or provided element).
   * @param {HTMLElement|string} [el]
   */
  function mount(el) {
    if (typeof el === "string") el = document.querySelector(el);
    rootEl = el || document.getElementById("ho-kpi-root");
    if (!rootEl) {
      console.warn("[SpotFlowHoKpi] #ho-kpi-root tidak ditemukan");
      return { ok: false, error: "missing root" };
    }
    paint();
    // Auto-fetch once on mount when Sheet URL configured
    const cfg = loadCfg();
    if (cfg.url && cfg.token) {
      refresh();
    }
    return { ok: true };
  }

  function render(el) {
    return mount(el);
  }

  function unmount() {
    if (rootEl) rootEl.innerHTML = "";
    rootEl = null;
  }

  /** Expose pure helpers for Tim IT / tests */
  function computeSample(rows) {
    const prev = cache.transaksi;
    cache.transaksi = rows || [];
    const agg = aggregate(weekRange());
    cache.transaksi = prev;
    return agg;
  }

  global.SpotFlowHoKpi = {
    mount,
    render,
    refresh,
    unmount,
    getFilters: () => Object.assign({}, filters),
    setFilters: (f) => {
      if (!f) return;
      if (f.lokasi != null) filters.lokasi = f.lokasi;
      if (f.periode) filters.periode = f.periode;
      if (f.layanan) filters.layanan = f.layanan;
      paint();
    },
    detectLayanan,
    numKas,
    numTip,
    aggregate,
    computeSample,
    _cache: () => cache
  };
})(typeof window !== "undefined" ? window : globalThis);
