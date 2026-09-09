/* SpotFlow HO — papan kontrol masalah SPOT (OPS 17–23 Agu 2026).
 * Mount otomatis di .ho-wrap. Bukan tuduhan HR. NOT READY production. */
(function (global) {
  "use strict";
  const KEY = "spotflow_spot_control_v1";
  const SITES = [
    { id: "rskm1", name: "RSKM 1", problem: "Kendaraan & aset harus tercatat" },
    { id: "rskm3", name: "RSKM 3", problem: "Setoran di luar roster" },
    { id: "kalimalang", name: "Kalimalang Square", problem: "CCTV PK/PM mati" },
    { id: "pemalang", name: "RSUD Pemalang", problem: "Tiket rusak + DVR tidak simpan" },
    { id: "moss", name: "Moss Padel", problem: "CCTV down" },
    { id: "redwood", name: "Redwood", problem: "Tiket di security (off-system)" },
    { id: "cove", name: "Padel Cove", problem: "Selisih catat vs volume" },
    { id: "mop", name: "MOP", problem: "Site hidup — jangan longgar kontrol" }
  ];

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
  }
  function siteState(id) {
    const all = load();
    return all[id] || { cctv: "unknown", insurance: "unknown", ticket: "spot", setoran: "roster" };
  }
  function setSite(id, patch) {
    const all = load();
    all[id] = Object.assign(siteState(id), patch, { at: new Date().toISOString() });
    save(all);
  }
  function rag(site) {
    const st = siteState(site.id);
    if (st.cctv === "down" || st.insurance === "expired" || st.ticket === "off") return "P0";
    if (st.cctv === "unknown" || st.insurance === "unknown" || st.setoran === "luar") return "P1";
    return "OK";
  }
  function opt(v, label, cur) {
    return "<option value=\"" + v + "\"" + (cur === v ? " selected" : "") + ">" + label + "</option>";
  }

  function renderBoard(root) {
    const reports = (load()._reports || []).slice(-5).reverse();
    root.innerHTML =
      '<section class="ho-card ho-spot-control" aria-label="Papan kontrol SPOT">' +
      "<h2>Papan kontrol SPOT</h2>" +
      '<p class="hint">Menutup celah report 17–23 Agu: CCTV, asuransi, tiket off-system, setoran, laporan tanpa kendaraan. Skor bukan vonis.</p>' +
      '<div class="ho-spot-grid">' +
      SITES.map(function (site) {
        const st = siteState(site.id);
        const band = rag(site);
        return '<article class="ho-spot-card band-' + band + '" data-site="' + site.id + '">' +
          "<h3>" + esc(site.name) + ' <span class="pill">' + band + "</span></h3>" +
          '<p class="hint">' + esc(site.problem) + "</p>" +
          "<label>CCTV / NVR</label><select data-f=\"cctv\">" +
          opt("unknown", "Belum dicek", st.cctv) + opt("ok", "Hidup + rekam", st.cctv) + opt("down", "Mati / tidak rekam", st.cctv) +
          "</select><label>Asuransi</label><select data-f=\"insurance\">" +
          opt("unknown", "Belum dicek", st.insurance) + opt("ok", "Aktif", st.insurance) + opt("expired", "Habis / kosong", st.insurance) +
          "</select><label>Tiket</label><select data-f=\"ticket\">" +
          opt("spot", "Di tangan Spot", st.ticket) + opt("off", "Off-system / security", st.ticket) +
          "</select><label>Setoran</label><select data-f=\"setoran\">" +
          opt("roster", "Petugas roster", st.setoran) + opt("luar", "Bekas PIC / luar roster", st.setoran) +
          "</select></article>";
      }).join("") +
      "</div><div class=\"ho-spot-report\"><h3>Laporan mingguan — terkunci tanpa angka</h3>" +
      '<p class="hint">Tidak ada tombol lancar saja. Wajib kendaraan + aset.</p>' +
      "<label>Lokasi</label><select id=\"scrSite\">" +
      SITES.map(function (s) { return "<option value=\"" + s.id + "\">" + esc(s.name) + "</option>"; }).join("") +
      "</select><label>Kendaraan masuk</label><input id=\"scrIn\" type=\"number\" min=\"0\" placeholder=\"wajib\">" +
      "<label>Kendaraan keluar</label><input id=\"scrOut\" type=\"number\" min=\"0\" placeholder=\"wajib\">" +
      "<label>Aset kritis</label><select id=\"scrAsset\">" +
      "<option value=\"\">— pilih —</option><option>OK</option><option>CCTV_DOWN</option><option>PRINTER_DOWN</option><option>ASURANSI_HABIS</option></select>" +
      "<label>Catatan</label><input id=\"scrNote\" placeholder=\"hujan / event / sepi\">" +
      '<button type="button" class="btn" id="scrSend">Kirim laporan</button><p id="scrMsg" class="hint"></p>' +
      (reports.length ? "<h3>Arsip lokal</h3><ul>" + reports.map(function (r) {
        return "<li>" + esc(r.at) + " · " + esc(r.site) + " · in " + r.vin + " / out " + r.vout + " · " + esc(r.asset) + "</li>";
      }).join("") + "</ul>" : "") +
      "</div></section>";

    root.querySelectorAll(".ho-spot-card").forEach(function (card) {
      const id = card.getAttribute("data-site");
      card.querySelectorAll("select").forEach(function (sel) {
        sel.onchange = function () {
          const patch = {};
          patch[sel.getAttribute("data-f")] = sel.value;
          setSite(id, patch);
          renderBoard(root);
        };
      });
    });
    const send = root.querySelector("#scrSend");
    if (send) send.onclick = function () {
      const vin = root.querySelector("#scrIn").value;
      const vout = root.querySelector("#scrOut").value;
      const asset = root.querySelector("#scrAsset").value;
      const msg = root.querySelector("#scrMsg");
      const missing = [];
      if (vin === "") missing.push("vehicles_in");
      if (vout === "") missing.push("vehicles_out");
      if (!asset) missing.push("aset_kritis");
      if (missing.length) {
        msg.textContent = "DIKUNCI: " + missing.join(", ") + ". Jangan tulis lancar.";
        msg.style.color = "#B42318";
        return;
      }
      const all = load();
      all._reports = all._reports || [];
      all._reports.push({
        site: root.querySelector("#scrSite").value,
        vin: Number(vin), vout: Number(vout), asset: asset,
        note: root.querySelector("#scrNote").value || "",
        at: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
      });
      save(all);
      msg.textContent = "Tersimpan di browser HO. Bukan Sheet — sinkron menyusul.";
      msg.style.color = "#1F7A4D";
      renderBoard(root);
    };
  }

  function ensureRoot() {
    const wrap = document.querySelector(".ho-wrap");
    if (!wrap) return null;
    let el = document.getElementById("ho-spot-control-root");
    if (!el) {
      el = document.createElement("div");
      el.id = "ho-spot-control-root";
      const anom = document.getElementById("ho-anomaly-root");
      if (anom && anom.parentNode) anom.parentNode.insertBefore(el, anom);
      else wrap.appendChild(el);
    }
    return el;
  }
  function boot() {
    const el = ensureRoot();
    if (el) renderBoard(el);
  }
  function watch() {
    boot();
    const view = document.getElementById("view");
    if (view && !view._spotCtrlObs) {
      const obs = new MutationObserver(function () { boot(); });
      obs.observe(view, { childList: true, subtree: false });
      view._spotCtrlObs = obs;
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(watch, 0); });
  } else {
    setTimeout(watch, 0);
  }
  global.addEventListener("hashchange", function () { setTimeout(watch, 80); });
  global.SpotFlowSpotControl = { boot: boot, sites: SITES };
})(window);
