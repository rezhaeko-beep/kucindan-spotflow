/* SpotFlow — Sentinel overlay (product-tech). Does not accuse staff. */
(function (global) {
  "use strict";
  const TZ = "Asia/Jakarta";
  const ACK_KEY = "spotflow_kucindan_anomaly_ack_v1";
  const EXPLAIN = {
    double_bayar: "Bisa retry sync atau klik ganda. Bukan vonis fraud.",
    gap_omzet_tiket: "Bisa tiket belum sampai Sheet atau kolom jasa_kas kosong.",
    tip_tercampur: "Bisa salah kolom setoran. Pisahkan jasa_kas vs tip.",
    mismatch_metode: "Bisa QRIS dicatat tunai atau split setor belum diisi.",
    shift_close_tanpa_laporan: "Shift ditutup di HP, Laporan belum dikirim.",
    gate_tanpa_tiket: "Event gate tanpa id/plat — tes tool atau kontrol bocor.",
    off_system: "Tiket/kunci di pihak lain. Pola Redwood.",
    setoran_luar_roster: "Penyetor tidak ada di Absensi hari itu. Pola RSKM 3.",
    tiket_rusak_tanpa_foto: "Exception rusak/hilang tanpa photo_key.",
    laporan_tanpa_kendaraan: "Narasi ada, jumlah kendaraan kosong. Jangan tulis lancar."
  };

  function loadAcks() {
    try { return JSON.parse(localStorage.getItem(ACK_KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function saveAcks(m) {
    try { localStorage.setItem(ACK_KEY, JSON.stringify(m)); } catch (e) {}
  }
  function dayKey(v) {
    const d = v ? new Date(v) : null;
    if (!d || isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
  function extraFromCache(cache) {
    const out = [];
    const tx = (cache && cache.transaksi) || [];
    const abs = (cache && cache.absensi) || [];
    const lap = (cache && cache.laporan) || [];
    for (const row of tx) {
      const blob = [row.event, row.status, row.catatan, row.note].map((x) => String(x || "").toLowerCase()).join(" ");
      if (/off[_\s-]?system|tiket.*(security|satpam|klien)|kunci.*(security|satpam)|dipegang security/.test(blob)) {
        out.push({ severity: "P0", code: "off_system", title: "Jalur off-system", detail: (row.plat || row.id || "—") + " · tiket/kunci tidak di tangan Spot", lokasi: row.lokasi, plat: row.plat, id: row.id, timestamp: row.timestamp });
      }
      if (/tiket\s*rusak|damaged_ticket|lost_ticket|tiket\s*hilang/.test(blob) && !String(row.photo_key || row.foto || "").trim()) {
        out.push({ severity: "P1", code: "tiket_rusak_tanpa_foto", title: "Tiket rusak/hilang tanpa foto", detail: (row.plat || row.id || "—") + " · tidak ada photo_key", lokasi: row.lokasi, plat: row.plat, id: row.id, timestamp: row.timestamp });
      }
    }
    const roster = {};
    for (const row of abs) {
      const day = dayKey(row.timestamp);
      const loc = String(row.lokasi || "");
      const name = String(row.petugas || row.nama || "").trim().toLowerCase();
      if (!day || !name) continue;
      const k = loc + "|" + day;
      if (!roster[k]) roster[k] = new Set();
      roster[k].add(name);
    }
    for (const row of [].concat(tx, lap)) {
      const ev = String(row.event || "").toLowerCase();
      if (!/setor|cash_close|tutup kas/.test(ev)) continue;
      const who = String(row.penyetor || row.disetor_oleh || row.petugas || "").trim();
      const day = dayKey(row.timestamp);
      const loc = String(row.lokasi || "");
      const names = roster[loc + "|" + day];
      if (!who || !names || names.has(who.toLowerCase())) continue;
      out.push({ severity: "P0", code: "setoran_luar_roster", title: "Setoran di luar roster", detail: who + " · " + loc + " · " + day, lokasi: loc, id: who, timestamp: row.timestamp });
    }
    for (const row of lap) {
      const nar = String(row.catatan || row.narasi || "").toLowerCase();
      if (!/lancar|tidak ada kendala/.test(nar)) continue;
      const vin = row.vehicles_in != null ? Number(row.vehicles_in) : null;
      const vout = row.vehicles_out != null ? Number(row.vehicles_out) : null;
      if (vin || vout) continue;
      out.push({ severity: "P1", code: "laporan_tanpa_kendaraan", title: "Laporan tanpa jumlah kendaraan", detail: (row.lokasi || "—") + " · narasi lancar, tiket kosong", lokasi: row.lokasi, timestamp: row.timestamp });
    }
    return out;
  }

  function decorate(root) {
    if (!root) return;
    const acks = loadAcks();
    root.querySelectorAll(".ho-anomaly-card").forEach((card) => {
      const code = card.getAttribute("data-code") || "";
      if (!card.querySelector(".ho-anomaly-explain")) {
        const p = document.createElement("p");
        p.className = "ho-anomaly-explain";
        p.textContent = "Penjelasan lain: " + (EXPLAIN[code] || "Skor bukan tuduhan. Pull bukti dulu.");
        card.appendChild(p);
      }
      const key = code + "|" + (card.textContent || "").slice(0, 80);
      if (acks[key]) {
        card.classList.add("is-acked");
        if (!card.querySelector(".ho-anomaly-acked")) {
          const d = document.createElement("p");
          d.className = "ho-anomaly-acked";
          d.textContent = "Sudah di-pull " + acks[key].at;
          card.appendChild(d);
        }
        return;
      }
      if (card.querySelector(".ho-anomaly-ack")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-sm ho-anomaly-ack";
      btn.textContent = "Tandai sudah di-pull";
      btn.onclick = function () {
        const m = loadAcks();
        m[key] = { at: new Date().toLocaleString("id-ID", { timeZone: TZ }), actor: "ho" };
        saveAcks(m);
        decorate(root);
      };
      card.appendChild(btn);
    });
    const hint = root.querySelector(".ho-anomaly-module > .hint");
    if (hint && hint.dataset.sentinel !== "1") {
      hint.dataset.sentinel = "1";
      hint.textContent = "Cek Sheet + Sentinel · bukti + penjelasan lain · bukan tuduhan HR · ack pull CCTV";
    }
  }

  function hook() {
    const A = global.SpotFlowHoAnomaly;
    const root = document.getElementById("ho-anomaly-root");
    if (!A) return false;
    if (!A._sentinel && typeof A.runChecks === "function") {
      const orig = A.runChecks.bind(A);
      A.runChecks = function (range) {
        const base = orig(range) || [];
        const extra = extraFromCache(A._cache && A._cache());
        return base.concat(extra);
      };
      A._sentinel = true;
    }
    if (root) decorate(root);
    return true;
  }

  function boot() {
    hook();
    const root = document.getElementById("ho-anomaly-root");
    if (root && !root._sentinelObs) {
      const obs = new MutationObserver(function () { decorate(root); });
      obs.observe(root, { childList: true, subtree: true });
      root._sentinelObs = obs;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 0); });
  } else {
    setTimeout(boot, 0);
  }
  global.addEventListener("hashchange", function () { setTimeout(boot, 50); });
})(window);
