/* SpotFlow Kucindan — HO Anomaly module (Kantor pusat)
 * Mount contract (Tim IT — already wired in renderHo):
 *   SpotFlowHoAnomaly.mount(document.getElementById("ho-anomaly-root"))
 *   SpotFlowHoAnomaly.refresh()
 *   SpotFlowHoAnomaly.setFilters({ lokasi, periode, layanan })
 * Hydrates Transaksi / Absensi / Laporan via SpotFlowSync.listFromSheet — NO demo data.
 *
 * Checks:
 *  1. Double entry / double bayar
 *  2. Gap omzet vs tiket selesai
 *  3. Tip tercampur jasa_kas
 *  4. Mismatch tunai vs nontunai
 *  5. Shift close tanpa laporan
 *  6. Gate open tanpa tiket
 */
(function (global) {
  "use strict";

  const TZ = "Asia/Jakarta";
  const LOCS_DEFAULT = [
    "MOP", "Sate Maranggi", "Lyma Brisket", "Taman Teras Tebet",
    "Bakmi Berdikari", "Pasar Minggu", "Kalimalang"
  ];
  const PAY_EVENTS = {
    serahkan_bayar: 1, bayar: 1, selesai: 1, setoran: 1, omzet: 1,
    gate_bayar: 1, parkir_keluar: 1, gate_keluar: 1
  };
  const GATE_OPEN_EVENTS = {
    gate_masuk: 1, parkir_masuk: 1, masuk_gate: 1, ticket_gate: 1, gate_open: 1
  };
  const SEV_ORDER = { P0: 0, P1: 1, P2: 2 };

  let rootEl = null;
  let filters = {
    lokasi: "",
    periode: "minggu",
    layanan: "semua"
  };
  let cache = { transaksi: [], absensi: [], laporan: [], loadedAt: null, error: null, skipped: false };
  let loading = false;
  let lastFindings = [];

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

  function weekRange(d) {
    const key = todayKey(d || new Date());
    const parts = key.split("-").map(Number);
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
    const lastDay = new Date(Date.UTC(y, m, 0, 5, 0, 0));
    return { fromKey: ym + "-01", toKey: todayKey(lastDay), label: "Bulan " + ym };
  }

  function activeRange() {
    return filters.periode === "bulan" ? monthRange() : weekRange();
  }

  function inDateRange(ts, range) {
    const k = dayKeyFromTs(ts);
    if (!k) return false;
    return k >= range.fromKey && k <= range.toKey;
  }

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

  function numTotal(row) {
    if (!row) return 0;
    if (row.total != null && row.total !== "") return Number(row.total) || 0;
    return numKas(row) + numTip(row);
  }

  function numTunai(row) {
    if (!row) return 0;
    if (row.Setor_Tunai != null && row.Setor_Tunai !== "") return Number(row.Setor_Tunai) || 0;
    if (row.setor_tunai != null && row.setor_tunai !== "") return Number(row.setor_tunai) || 0;
    return 0;
  }

  function numNontunai(row) {
    if (!row) return 0;
    if (row.Setor_Nontunai != null && row.Setor_Nontunai !== "") return Number(row.Setor_Nontunai) || 0;
    if (row.setor_nontunai != null && row.setor_nontunai !== "") return Number(row.setor_nontunai) || 0;
    return 0;
  }

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

  function isPayEvent(row) {
    const ev = String(row.event || "").toLowerCase();
    const st = String(row.status || "").toLowerCase();
    if (PAY_EVENTS[ev]) return true;
    if (st === "selesai" && (numKas(row) || numTip(row) || row.metode_bayar)) return true;
    return false;
  }

  function isGateOpenEvent(row) {
    const ev = String(row.event || "").toLowerCase();
    if (GATE_OPEN_EVENTS[ev]) return true;
    if (/gate_masuk|parkir_masuk|masuk_gate/.test(ev)) return true;
    return false;
  }

  function filterRows(rows, range, opts) {
    opts = opts || {};
    return (rows || []).filter((row) => {
      if (filters.lokasi && String(row.lokasi || "") !== filters.lokasi) return false;
      if (!opts.skipLayanan && filters.layanan !== "semua" && detectLayanan(row) !== filters.layanan) {
        return false;
      }
      if (range && !inDateRange(row.timestamp, range)) return false;
      return true;
    });
  }

  function metodeNorm(row) {
    return String(row.metode_bayar || row.metode || "").toLowerCase().trim();
  }

  function isTunaiMetode(m) {
    return /tunai|cash|kontan/.test(m) && !/non/.test(m);
  }

  function isNontunaiMetode(m) {
    return /nontunai|non.?tunai|qr|qris|transfer|edc|debit|kredit|card|va|ewallet|ovo|gopay|dana|linkaja/.test(m);
  }

  function finding(sev, code, title, detail, meta) {
    return {
      severity: sev,
      code: code,
      title: title,
      detail: detail || "",
      lokasi: (meta && meta.lokasi) || "",
      plat: (meta && meta.plat) || "",
      id: (meta && meta.id) || "",
      timestamp: (meta && meta.timestamp) || "",
      layanan: (meta && meta.layanan) || ""
    };
  }

  /* ---------- 6 checks ---------- */

  /** 1. Double entry / double bayar — duplicate id/plat pay events same day */
  function checkDoubleBayar(txRows) {
    const out = [];
    const byKey = {};
    for (const row of txRows) {
      if (!isPayEvent(row)) continue;
      const day = dayKeyFromTs(row.timestamp) || "?";
      const id = String(row.id || "").trim();
      const plat = String(row.plat || "").toUpperCase().trim();
      const keys = [];
      if (id) keys.push("id:" + id + "|" + day);
      if (plat) keys.push("plat:" + plat + "|" + day + "|" + String(row.lokasi || ""));
      for (const k of keys) {
        if (!byKey[k]) byKey[k] = [];
        byKey[k].push(row);
      }
    }
    const seen = new Set();
    Object.keys(byKey).forEach((k) => {
      const rows = byKey[k];
      if (rows.length < 2) return;
      // same physical event logged twice (id|plat|ts|event) — still count as double if >1 pay
      const uniqTs = new Set(rows.map((r) => String(r.timestamp || "") + "|" + String(r.event || "")));
      if (uniqTs.size < 2 && rows.length < 2) return;
      const sig = rows.map((r) => String(r.id || "") + "|" + String(r.plat || "") + "|" + dayKeyFromTs(r.timestamp)).sort().join(";");
      if (seen.has(sig)) return;
      seen.add(sig);
      const sample = rows[0];
      const plats = Array.from(new Set(rows.map((r) => String(r.plat || "").toUpperCase()).filter(Boolean)));
      const kasSum = rows.reduce((s, r) => s + numKas(r), 0);
      out.push(finding(
        "P0",
        "double_bayar",
        "Double bayar / double entry",
        rows.length + " event bayar untuk " + (plats[0] || sample.id || "tiket") +
          " pada " + (dayKeyFromTs(sample.timestamp) || "—") +
          " · total jasa_kas " + rp(kasSum) + " · cek id/plat duplikat",
        {
          lokasi: sample.lokasi,
          plat: plats[0] || "",
          id: sample.id,
          timestamp: sample.timestamp,
          layanan: detectLayanan(sample)
        }
      ));
    });
    return out;
  }

  /** 2. Gap omzet vs tiket selesai — selesai without pay / kas mismatch */
  function checkGapOmzet(txRows, lapRows) {
    const out = [];
    // selesai status without pay amount
    for (const row of txRows) {
      const st = String(row.status || "").toLowerCase();
      const ev = String(row.event || "").toLowerCase();
      const isSelesai = st === "selesai" || PAY_EVENTS[ev];
      if (!isSelesai) continue;
      const kas = numKas(row);
      const tip = numTip(row);
      const metode = metodeNorm(row);
      if (kas <= 0 && tip <= 0 && (st === "selesai" || /serahkan_bayar|bayar|gate_keluar|parkir_keluar/.test(ev))) {
        // gate masuk may have 0 — skip pure open
        if (isGateOpenEvent(row) && !PAY_EVENTS[ev]) continue;
        out.push(finding(
          "P1",
          "gap_omzet_tiket",
          "Tiket selesai tanpa jasa_kas",
          (row.plat || row.id || "—") + " berstatus selesai/bayar tetapi jasa_kas=0" +
            (metode ? " · metode " + metode : "") + " — kemungkinan bayar hilang",
          {
            lokasi: row.lokasi,
            plat: row.plat,
            id: row.id,
            timestamp: row.timestamp,
            layanan: detectLayanan(row)
          }
        ));
      }
    }

    // Compare Transaksi pay totals vs Laporan omzet per lokasi+day
    const payByLocDay = {};
    const seenPay = new Set();
    for (const row of txRows) {
      if (!isPayEvent(row)) continue;
      const day = dayKeyFromTs(row.timestamp);
      if (!day) continue;
      const dedupe = String(row.id || "") + "|" + day + "|" + String(row.event || "") + "|" + String(row.plat || "");
      if (seenPay.has(dedupe)) continue;
      seenPay.add(dedupe);
      const loc = String(row.lokasi || "—");
      const key = loc + "|" + day;
      if (!payByLocDay[key]) payByLocDay[key] = { kas: 0, n: 0, loc: loc, day: day };
      payByLocDay[key].kas += numKas(row);
      payByLocDay[key].n += 1;
    }
    for (const row of lapRows) {
      const day = dayKeyFromTs(row.timestamp);
      if (!day) continue;
      const loc = String(row.lokasi || "—");
      const key = loc + "|" + day;
      const lapKas = numKas(row);
      const tx = payByLocDay[key];
      if (!tx && lapKas > 0) {
        out.push(finding(
          "P1",
          "gap_omzet_tiket",
          "Laporan omzet tanpa tiket bayar",
          loc + " · " + day + " · Laporan " + rp(lapKas) +
            " tetapi tidak ada event bayar Transaksi di hari yang sama",
          { lokasi: loc, timestamp: row.timestamp, layanan: detectLayanan(row) }
        ));
        continue;
      }
      if (tx && lapKas > 0) {
        const diff = Math.abs(tx.kas - lapKas);
        const tol = Math.max(1000, Math.round(lapKas * 0.02));
        if (diff > tol) {
          out.push(finding(
            "P1",
            "gap_omzet_tiket",
            "Selisih omzet Transaksi vs Laporan",
            loc + " · " + day + " · Transaksi " + rp(tx.kas) + " (" + tx.n +
              " tiket) vs Laporan " + rp(lapKas) + " · selisih " + rp(diff),
            { lokasi: loc, timestamp: row.timestamp }
          ));
        }
      }
    }
    return out;
  }

  /** 3. Tip tercampur jasa_kas */
  function checkTipTercampur(txRows) {
    const out = [];
    for (const row of txRows) {
      if (!isPayEvent(row) && numKas(row) <= 0 && numTip(row) <= 0) continue;
      const kas = numKas(row);
      const tip = numTip(row);
      const total = numTotal(row);
      const catatan = String(row.catatan || "").toLowerCase();
      let hit = false;
      let why = "";

      if (tip > 0 && kas > 0 && tip === kas && tip === total) {
        hit = true;
        why = "tip == jasa_kas == total (" + rp(tip) + ") — tip kemungkinan tercampur ke kas";
      } else if (tip > 0 && total > 0 && tip === total && kas === 0) {
        hit = true;
        why = "tip == total (" + rp(tip) + ") dan jasa_kas=0 — seluruh tagihan masuk tip";
      } else if (kas > 0 && tip === 0 && total > kas * 1.05) {
        // total carries tip but tip column empty → tip folded into something
        const implied = total - kas;
        if (implied >= 1000) {
          hit = true;
          why = "total (" + rp(total) + ") > jasa_kas (" + rp(kas) + ") tetapi tip=0 — selisih " +
            rp(implied) + " mungkin tip tercampur";
        }
      } else if (/tip.*(kas|jasa|omzet)|(kas|jasa|omzet).*tip|tip\s*masuk\s*kas|campur/.test(catatan) && tip > 0) {
        hit = true;
        why = "catatan mengisyaratkan tip tercampur · tip " + rp(tip) + " · jasa_kas " + rp(kas);
      } else if (tip > 0 && kas > 0 && Math.abs((kas + tip) - total) > 1 && total > 0) {
        // inconsistent arithmetic often means columns mixed
        if (Math.abs(kas - total) < 1 && tip > 0) {
          hit = true;
          why = "jasa_kas == total padahal tip=" + rp(tip) + " — tip tidak dipecah dari kas";
        }
      }

      // Parkir gate should not have tip
      if (detectLayanan(row) === "parkir_gate" && tip > 0) {
        hit = true;
        why = "Parkir gate punya tip " + rp(tip) + " (harusnya 0) · jasa_kas " + rp(kas);
      }

      if (hit) {
        out.push(finding(
          "P0",
          "tip_tercampur",
          "Tip tercampur jasa_kas",
          (row.plat || row.id || "—") + " · " + why,
          {
            lokasi: row.lokasi,
            plat: row.plat,
            id: row.id,
            timestamp: row.timestamp,
            layanan: detectLayanan(row)
          }
        ));
      }
    }
    return out;
  }

  /** 4. Mismatch tunai vs nontunai */
  function checkMetodeMismatch(txRows) {
    const out = [];
    for (const row of txRows) {
      if (!isPayEvent(row) && numKas(row) <= 0) continue;
      const metode = metodeNorm(row);
      const kas = numKas(row);
      const tunai = numTunai(row);
      const nontunai = numNontunai(row);
      const hasSplit = tunai > 0 || nontunai > 0;

      if (!metode && kas > 0) {
        out.push(finding(
          "P2",
          "mismatch_metode",
          "Metode bayar kosong",
          (row.plat || row.id || "—") + " · jasa_kas " + rp(kas) + " tanpa metode_bayar",
          {
            lokasi: row.lokasi,
            plat: row.plat,
            id: row.id,
            timestamp: row.timestamp,
            layanan: detectLayanan(row)
          }
        ));
        continue;
      }

      if (hasSplit) {
        const sumSplit = tunai + nontunai;
        if (kas > 0 && Math.abs(sumSplit - kas) > 1000) {
          out.push(finding(
            "P1",
            "mismatch_metode",
            "Setor tunai/nontunai ≠ jasa_kas",
            (row.plat || row.id || "—") + " · Setor_Tunai " + rp(tunai) +
              " + Setor_Nontunai " + rp(nontunai) + " = " + rp(sumSplit) +
              " vs jasa_kas " + rp(kas),
            {
              lokasi: row.lokasi,
              plat: row.plat,
              id: row.id,
              timestamp: row.timestamp,
              layanan: detectLayanan(row)
            }
          ));
        }
        if (isTunaiMetode(metode) && nontunai > 0 && tunai === 0) {
          out.push(finding(
            "P1",
            "mismatch_metode",
            "Metode tunai vs setor nontunai",
            (row.plat || row.id || "—") + " · metode_bayar=" + metode +
              " tetapi Setor_Nontunai " + rp(nontunai),
            {
              lokasi: row.lokasi,
              plat: row.plat,
              id: row.id,
              timestamp: row.timestamp,
              layanan: detectLayanan(row)
            }
          ));
        }
        if (isNontunaiMetode(metode) && tunai > 0 && nontunai === 0) {
          out.push(finding(
            "P1",
            "mismatch_metode",
            "Metode nontunai vs setor tunai",
            (row.plat || row.id || "—") + " · metode_bayar=" + metode +
              " tetapi Setor_Tunai " + rp(tunai),
            {
              lokasi: row.lokasi,
              plat: row.plat,
              id: row.id,
              timestamp: row.timestamp,
              layanan: detectLayanan(row)
            }
          ));
        }
      } else if (metode) {
        // No split columns — still flag conflicting labels in catatan / mixed strings
        if (isTunaiMetode(metode) && isNontunaiMetode(metode)) {
          out.push(finding(
            "P2",
            "mismatch_metode",
            "Metode bayar ambigu",
            (row.plat || row.id || "—") + " · metode_bayar \"" + metode +
              "\" memuat tunai dan nontunai",
            {
              lokasi: row.lokasi,
              plat: row.plat,
              id: row.id,
              timestamp: row.timestamp,
              layanan: detectLayanan(row)
            }
          ));
        }
      }
    }
    return out;
  }

  /** 5. Shift close tanpa laporan */
  function checkShiftCloseTanpaLaporan(absRows, lapRows, txRows) {
    const out = [];
    const lapKeys = new Set();
    for (const row of lapRows) {
      const day = dayKeyFromTs(row.timestamp);
      const loc = String(row.lokasi || "");
      if (day) lapKeys.add(loc + "|" + day);
      const periode = String(row.periode || "");
      if (periode) {
        const m = periode.match(/(\d{4}-\d{2}-\d{2})/);
        if (m) lapKeys.add(loc + "|" + m[1]);
      }
      // Laporan rows may themselves be shift_close from field ops
      const catatan = String(row.catatan || "").toLowerCase();
      if (/tutup shift|shift_close/.test(catatan) && day) lapKeys.add(loc + "|" + day);
    }

    // Absensi shift_close without matching Laporan for same loc+day
    for (const row of absRows) {
      const ev = String(row.event || "").toLowerCase();
      const catatan = String(row.catatan || "").toLowerCase();
      const isClose = ev === "shift_close" || /tutup\s*shift/.test(catatan);
      if (!isClose) continue;
      const day = dayKeyFromTs(row.timestamp);
      const loc = String(row.lokasi || "");
      if (!day) continue;
      if (!lapKeys.has(loc + "|" + day)) {
        out.push(finding(
          "P0",
          "shift_close_tanpa_laporan",
          "Shift close tanpa Laporan",
          (row.petugas || "—") + " · " + loc + " · " + day +
            " · ada shift_close di Absensi tetapi tidak ada baris Laporan",
          {
            lokasi: loc,
            timestamp: row.timestamp,
            id: row.petugas || ""
          }
        ));
      }
    }

    // If shift_close appears as event on Laporan tab wrongly empty vs transaksi activity
    // Heuristic: day with many pay events + Absensi open but no Laporan at all
    const openByLocDay = {};
    for (const row of absRows) {
      const ev = String(row.event || "").toLowerCase();
      if (ev !== "shift_open" && String(row.status_dinas || "").toLowerCase() !== "dinas") continue;
      const day = dayKeyFromTs(row.timestamp);
      const loc = String(row.lokasi || "");
      if (!day) continue;
      openByLocDay[loc + "|" + day] = row;
    }
    const payCountByLocDay = {};
    for (const row of txRows) {
      if (!isPayEvent(row)) continue;
      const day = dayKeyFromTs(row.timestamp);
      const loc = String(row.lokasi || "");
      if (!day) continue;
      const k = loc + "|" + day;
      payCountByLocDay[k] = (payCountByLocDay[k] || 0) + 1;
    }
    // Days with shift_open + pays but no laporan and we're past that day → P1 soft
    const today = todayKey();
    Object.keys(openByLocDay).forEach((k) => {
      const parts = k.split("|");
      const loc = parts[0];
      const day = parts[1];
      if (!day || day >= today) return; // still running today
      if (lapKeys.has(k)) return;
      const pays = payCountByLocDay[k] || 0;
      if (pays < 1) return;
      // Avoid duplicate if we already flagged Absensi shift_close
      const already = out.some((f) => f.code === "shift_close_tanpa_laporan" && f.lokasi === loc && dayKeyFromTs(f.timestamp) === day);
      if (already) return;
      out.push(finding(
        "P1",
        "shift_close_tanpa_laporan",
        "Aktivitas tanpa Laporan shift",
        loc + " · " + day + " · ada buka shift + " + pays +
          " bayar, tetapi tidak ada baris Laporan (shift mungkin belum ditutup)",
        { lokasi: loc, timestamp: openByLocDay[k].timestamp }
      ));
    });

    return out;
  }

  /** 6. Gate open tanpa tiket — gate masuk without linked ticket id/plat continuity */
  function checkGateTanpaTiket(txRows) {
    const out = [];
    const byPlatLoc = {};
    for (const row of txRows) {
      const plat = String(row.plat || "").toUpperCase().trim();
      const loc = String(row.lokasi || "");
      const key = plat + "|" + loc;
      if (!byPlatLoc[key]) byPlatLoc[key] = [];
      byPlatLoc[key].push(row);
    }

    for (const row of txRows) {
      if (!isGateOpenEvent(row) && detectLayanan(row) !== "parkir_gate") continue;
      const ev = String(row.event || "").toLowerCase();
      const isOpen = isGateOpenEvent(row) || ev === "gate_masuk";
      if (!isOpen) continue;

      const plat = String(row.plat || "").toUpperCase().trim();
      const id = String(row.id || "").trim();
      const loc = String(row.lokasi || "");

      if (!plat && !id) {
        out.push(finding(
          "P1",
          "gate_tanpa_tiket",
          "Gate open tanpa tiket",
          loc + " · event " + (row.event || "gate") +
            " tanpa plat/id — tidak bisa ditautkan ke tiket",
          {
            lokasi: loc,
            timestamp: row.timestamp,
            layanan: "parkir_gate"
          }
        ));
        continue;
      }

      // Linked if same id/plat has any other transaksi row (enter continuum) OR status parkir/aktif
      const siblings = byPlatLoc[plat + "|" + loc] || [];
      const hasLink = siblings.some((r) => {
        if (r === row) return false;
        if (id && String(r.id || "") === id) return true;
        const st = String(r.status || "").toLowerCase();
        const oev = String(r.event || "").toLowerCase();
        return st === "parkir" || st === "lobby" || PAY_EVENTS[oev] || oev === "gate_keluar" || oev === "parkir_keluar";
      });

      // Also accept self-contained ticket: gate_masuk with id + status parkir counts as ticket
      const selfTicket = !!(id && (String(row.status || "").toLowerCase() === "parkir" || plat));

      if (!hasLink && !selfTicket) {
        out.push(finding(
          "P1",
          "gate_tanpa_tiket",
          "Gate open tanpa tiket",
          (plat || "—") + " · " + loc + " · " + (row.event || "gate_masuk") +
            " tanpa baris tiket terkait",
          {
            lokasi: loc,
            plat: plat,
            id: id,
            timestamp: row.timestamp,
            layanan: "parkir_gate"
          }
        ));
      } else if (!id && plat) {
        // plat-only gate open with no sibling — softer
        if (!hasLink) {
          out.push(finding(
            "P2",
            "gate_tanpa_tiket",
            "Gate open plat tanpa id tiket",
            plat + " · " + loc + " · event gate tanpa id — tautan tiket lemah",
            {
              lokasi: loc,
              plat: plat,
              timestamp: row.timestamp,
              layanan: "parkir_gate"
            }
          ));
        }
      }
    }
    return out;
  }

  function runChecks(range) {
    const tx = filterRows(cache.transaksi, range);
    const abs = filterRows(cache.absensi, range, { skipLayanan: true });
    const lap = filterRows(cache.laporan, range, { skipLayanan: filters.layanan === "semua" });

    let findings = []
      .concat(checkDoubleBayar(tx))
      .concat(checkGapOmzet(tx, lap))
      .concat(checkTipTercampur(tx))
      .concat(checkMetodeMismatch(tx))
      .concat(checkShiftCloseTanpaLaporan(abs, lap, tx))
      .concat(checkGateTanpaTiket(tx));

    // Deduplicate similar titles for same plat+day+code
    const seen = new Set();
    findings = findings.filter((f) => {
      const k = f.code + "|" + f.severity + "|" + (f.plat || "") + "|" + (f.id || "") + "|" + dayKeyFromTs(f.timestamp) + "|" + (f.lokasi || "");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    findings.sort((a, b) => {
      const ds = (SEV_ORDER[a.severity] != null ? SEV_ORDER[a.severity] : 9) -
        (SEV_ORDER[b.severity] != null ? SEV_ORDER[b.severity] : 9);
      if (ds !== 0) return ds;
      return String(b.timestamp || "").localeCompare(String(a.timestamp || ""));
    });

    return findings;
  }

  function locsList() {
    const set = new Set(LOCS_DEFAULT);
    for (const row of [].concat(cache.transaksi, cache.absensi, cache.laporan)) {
      if (row && row.lokasi) set.add(String(row.lokasi));
    }
    return Array.from(set);
  }

  function sevCounts(findings) {
    const c = { P0: 0, P1: 0, P2: 0 };
    for (const f of findings) {
      if (c[f.severity] != null) c[f.severity]++;
    }
    return c;
  }

  function renderFilters() {
    const locs = locsList();
    const locOpts = [`<option value="">Semua lokasi</option>`]
      .concat(locs.map((l) => `<option value="${esc(l)}" ${filters.lokasi === l ? "selected" : ""}>${esc(l)}</option>`))
      .join("");
    return `<div class="ho-filter ho-anomaly-filters" id="hoAnomalyFilters">
      <label class="ho-filter-label" for="hoAnomLokasi">Lokasi</label>
      <select id="hoAnomLokasi" aria-label="Filter lokasi anomali">${locOpts}</select>
      <div class="seg" role="group" aria-label="Periode">
        <button type="button" data-anom-periode="minggu" class="${filters.periode === "minggu" ? "active" : ""}">Minggu</button>
        <button type="button" data-anom-periode="bulan" class="${filters.periode === "bulan" ? "active" : ""}">Bulan</button>
      </div>
      <div class="seg" role="group" aria-label="Jenis layanan">
        <button type="button" data-anom-layanan="semua" class="${filters.layanan === "semua" ? "active" : ""}">Semua</button>
        <button type="button" data-anom-layanan="valet" class="${filters.layanan === "valet" ? "active" : ""}">Valet</button>
        <button type="button" data-anom-layanan="parkir_gate" class="${filters.layanan === "parkir_gate" ? "active" : ""}">Parkir gate</button>
      </div>
      <button type="button" class="btn btn-sm" id="hoAnomRefresh">${loading ? "Memuat…" : "↻ Muat Sheet"}</button>
    </div>`;
  }

  function renderSummary(findings, range) {
    const c = sevCounts(findings);
    return `<div class="ho-anomaly-summary" role="group" aria-label="Ringkasan anomali">
      <div class="ho-anomaly-chip p0"><span class="lbl">P0 kritis</span><b>${c.P0}</b></div>
      <div class="ho-anomaly-chip p1"><span class="lbl">P1 waspada</span><b>${c.P1}</b></div>
      <div class="ho-anomaly-chip p2"><span class="lbl">P2 info</span><b>${c.P2}</b></div>
      <div class="ho-anomaly-chip all"><span class="lbl">Total</span><b>${findings.length}</b></div>
      <p class="ho-anomaly-range">${esc(range.fromKey)} → ${esc(range.toKey)} · ${esc(filters.lokasi || "semua lokasi")} · ${esc(layananLabel(filters.layanan))}</p>
    </div>`;
  }

  function renderCard(f) {
    const sev = f.severity || "P2";
    const when = dayKeyFromTs(f.timestamp) || "—";
    const meta = [
      f.lokasi ? esc(f.lokasi) : "",
      f.plat ? "plat " + esc(f.plat) : "",
      f.id ? "id " + esc(f.id) : "",
      when,
      f.layanan ? esc(layananLabel(f.layanan) || f.layanan) : ""
    ].filter(Boolean).join(" · ");
    return `<article class="ho-anomaly-card sev-${esc(sev.toLowerCase())}" data-code="${esc(f.code)}">
      <div class="ho-anomaly-card-head">
        <span class="ho-sev-badge sev-${esc(sev.toLowerCase())}">${esc(sev)}</span>
        <h3>${esc(f.title)}</h3>
      </div>
      <p class="ho-anomaly-detail">${esc(f.detail)}</p>
      <p class="ho-anomaly-meta">${meta}</p>
      <p class="ho-anomaly-code">${esc(f.code)}</p>
    </article>`;
  }

  function paint() {
    if (!rootEl) return;
    const cfg = loadCfg();
    const hasUrl = !!(cfg && cfg.url && String(cfg.url).trim());
    const range = activeRange();
    const findings = (!loading && hasUrl && !cache.skipped) ? runChecks(range) : [];
    lastFindings = findings;

    let statusBits = "";
    if (!hasUrl) {
      statusBits = `<div class="alert-bar">Sheets: lokal saja — tempel Web App URL di ⚙️ Sheets sync agar anomali dibaca dari Transaksi / Absensi / Laporan.</div>`;
    } else if (cache.skipped) {
      statusBits = `<div class="alert-bar">Sync dilewati (URL/token kosong).</div>`;
    } else if (cache.error) {
      statusBits = `<div class="alert-bar">Gagal ambil Sheet: ${esc(cache.error)} — coba ↻ Muat Sheet.</div>`;
    } else if (cache.loadedAt) {
      statusBits = `<p class="ho-anomaly-meta-top">Data Sheet · T ${cache.transaksi.length} · A ${cache.absensi.length} · L ${cache.laporan.length} · diperbarui ${esc(cache.loadedAt)}</p>`;
    }

    let body = "";
    if (loading) {
      body = `<div class="ho-empty">Mengambil Transaksi / Absensi / Laporan untuk cek anomali…</div>`;
    } else if (!hasUrl || cache.skipped) {
      body = `<div class="ho-empty">Tidak ada data Sheet. Hubungkan Web App URL — modul ini tidak memakai data demo.</div>`;
    } else if (!findings.length) {
      body = `<div class="ho-empty ho-anomaly-clean">✓ Tidak ada anomali pada filter ini. Omzet, tip, metode, shift, dan gate terlihat konsisten.</div>`;
    } else {
      body = `<div class="ho-anomaly-list">${findings.map(renderCard).join("")}</div>`;
    }

    rootEl.innerHTML = `
      <section class="ho-card ho-anomaly-module" aria-label="Anomali HO">
        <h2>Anomali operasional</h2>
        <p class="hint">6 cek dari Sheet live · double bayar · gap omzet · tip tercampur · metode · shift close · gate tanpa tiket</p>
        ${renderFilters()}
        ${statusBits}
        ${!loading && hasUrl && !cache.skipped ? renderSummary(findings, range) : ""}
        ${body}
      </section>`;

    bind();
  }

  function bind() {
    if (!rootEl) return;
    const loc = rootEl.querySelector("#hoAnomLokasi");
    if (loc) {
      loc.onchange = () => {
        filters.lokasi = loc.value || "";
        paint();
      };
    }
    rootEl.querySelectorAll("[data-anom-periode]").forEach((btn) => {
      btn.onclick = () => {
        filters.periode = btn.getAttribute("data-anom-periode") || "minggu";
        paint();
      };
    });
    rootEl.querySelectorAll("[data-anom-layanan]").forEach((btn) => {
      btn.onclick = () => {
        filters.layanan = btn.getAttribute("data-anom-layanan") || "semua";
        paint();
      };
    });
    const ref = rootEl.querySelector("#hoAnomRefresh");
    if (ref) ref.onclick = () => refresh();
  }

  async function fetchTab(cfg, tab) {
    const S = Sync();
    if (!S || !S.listFromSheet) {
      return { ok: false, error: "SpotFlowSync.listFromSheet tidak tersedia", rows: [] };
    }
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
   * Mount into #ho-anomaly-root (or provided element).
   * @param {HTMLElement|string} [el]
   */
  function mount(el) {
    if (typeof el === "string") el = document.querySelector(el);
    rootEl = el || document.getElementById("ho-anomaly-root");
    if (!rootEl) {
      console.warn("[SpotFlowHoAnomaly] #ho-anomaly-root tidak ditemukan");
      return { ok: false, error: "missing root" };
    }
    paint();
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

  /** Test helper — run checks against provided row sets without Sheet */
  function computeSample(tx, abs, lap) {
    const prev = { transaksi: cache.transaksi, absensi: cache.absensi, laporan: cache.laporan };
    cache.transaksi = tx || [];
    cache.absensi = abs || [];
    cache.laporan = lap || [];
    const findings = runChecks(activeRange());
    cache.transaksi = prev.transaksi;
    cache.absensi = prev.absensi;
    cache.laporan = prev.laporan;
    return findings;
  }

  global.SpotFlowHoAnomaly = {
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
    runChecks,
    computeSample,
    getFindings: () => lastFindings.slice(),
    _cache: () => cache
  };
})(typeof window !== "undefined" ? window : globalThis);
