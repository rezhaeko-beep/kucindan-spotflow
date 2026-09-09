/* SpotFlow Kucindan — HO quick input (Valet + Parkir gate)
 * Mount: SpotFlowHoInput.render(rootEl, api)
 * api: { LOCS, STAFF, FEE, TZ, currentLokasi, activeStaff, syncEvent,
 *        toast, save, state, uid, trackCode, iso, todayKey, shiftOf,
 *        esc, onChanged, lastPetugasKey }
 */
(function (global) {
  "use strict";

  var LAST_KEY = "spotflow_kucindan_ho_petugas";

  function loadLastPetugas(api) {
    try {
      var n = localStorage.getItem(api.lastPetugasKey || LAST_KEY);
      if (n) return n;
    } catch (e) {}
    return (api.activeStaff() && api.activeStaff().name) || "";
  }

  function saveLastPetugas(api, name) {
    try { localStorage.setItem(api.lastPetugasKey || LAST_KEY, name); } catch (e) {}
    var st = api.STAFF.find(function (s) { return s.name === name; });
    if (st) {
      api.state.activeStaffId = st.id;
      api.save();
    }
  }

  function todayLocalInput(api) {
    return api.todayKey();
  }

  function staffOptions(api, selected) {
    return api.STAFF.map(function (s) {
      return '<option value="' + api.esc(s.name) + '"' + (s.name === selected ? " selected" : "") + ">" + api.esc(s.name) + "</option>";
    }).join("");
  }

  function locOptions(api, selected) {
    var cur = selected || api.currentLokasi();
    return api.LOCS.map(function (l) {
      return '<option value="' + api.esc(l) + '"' + (l === cur ? " selected" : "") + ">" + api.esc(l) + "</option>";
    }).join("");
  }

  function wireLayananToggle(card) {
    var sel = card.querySelector("[data-ho-layanan]");
    if (!sel) return;
    function apply() {
      card.setAttribute("data-layanan", sel.value);
    }
    sel.addEventListener("change", apply);
    apply();
  }

  function renderSetoranForm(api) {
    var petugas = loadLastPetugas(api);
    return (
      '<div class="ho-card" data-layanan="valet" id="hoCardSetoran">' +
        "<h2>Catat setoran / Omzet</h2>" +
        '<p class="hint">Masuk Sheet tab Laporan · tip terpisah dari kas (jasa_kas).</p>' +
        "<label>Layanan</label>" +
        '<select data-ho-layanan id="hoSetLayanan">' +
          '<option value="valet">Valet</option>' +
          '<option value="parkir_gate">Parkir gate</option>' +
        "</select>" +
        '<div class="row2">' +
          "<div><label>Lokasi</label><select id=\"hoSetLokasi\">" + locOptions(api) + "</select></div>" +
          "<div><label>Tanggal</label><input type=\"date\" id=\"hoSetTanggal\" value=\"" + todayLocalInput(api) + "\" /></div>" +
        "</div>" +
        '<div class="row2">' +
          "<div><label>Omzet / jasa_kas (Rp)</label><input type=\"number\" id=\"hoSetOmzet\" min=\"0\" step=\"1000\" placeholder=\"35000\" /></div>" +
          '<div class="ho-tip-field"><label>Tip (opsional)</label><input type="number" id="hoSetTip" min="0" step="1000" placeholder="0" /></div>' +
        "</div>" +
        '<div class="row2">' +
          "<div><label>Metode</label><select id=\"hoSetMetode\"><option value=\"tunai\">Tunai</option><option value=\"nontunai\">Non-tunai</option></select></div>" +
          "<div><label>Petugas</label><select id=\"hoSetPetugas\">" + staffOptions(api, petugas) + "</select></div>" +
        "</div>" +
        '<label>Catatan singkat</label>' +
        '<input id="hoSetCatatan" placeholder="Mis. setoran shift pagi" />' +
        '<div class="btn-row"><button class="btn btn-primary" type="button" id="hoSetSubmit">Simpan setoran</button></div>' +
      "</div>"
    );
  }

  function renderAbsensiForm(api) {
    var petugas = loadLastPetugas(api);
    return (
      '<div class="ho-card" id="hoCardAbsensi">' +
        "<h2>Absensi singkat</h2>" +
        '<p class="hint">Masuk Sheet tab Absensi · status dinas on/off.</p>' +
        '<div class="row2">' +
          "<div><label>Petugas</label><select id=\"hoAbsPetugas\">" + staffOptions(api, petugas) + "</select></div>" +
          "<div><label>Lokasi</label><select id=\"hoAbsLokasi\">" + locOptions(api) + "</select></div>" +
        "</div>" +
        "<label>Status dinas</label>" +
        '<select id="hoAbsStatus">' +
          '<option value="on">Dinas (on)</option>' +
          '<option value="off">Pulang (off)</option>' +
        "</select>" +
        '<div class="btn-row"><button class="btn btn-primary" type="button" id="hoAbsSubmit">Simpan absensi</button></div>' +
      "</div>"
    );
  }

  function renderTiketForm(api) {
    var petugas = loadLastPetugas(api);
    return (
      '<div class="ho-card" data-layanan="valet" id="hoCardTiket">' +
        "<h2>Tiket cepat</h2>" +
        '<p class="hint">Plat wajib · Valet = lobby/parkir · Gate = masuk/keluar.</p>' +
        "<label>Layanan</label>" +
        '<select data-ho-layanan id="hoTikLayanan">' +
          '<option value="valet">Valet</option>' +
          '<option value="parkir_gate">Parkir gate</option>' +
        "</select>" +
        '<div class="row2">' +
          '<div><label>Plat nomor *</label><input id="hoTikPlat" placeholder="B 1234 ABC" style="text-transform:uppercase" /></div>' +
          "<div><label>Lokasi</label><select id=\"hoTikLokasi\">" + locOptions(api) + "</select></div>" +
        "</div>" +
        '<div class="ho-valet-fields">' +
          "<label>Status valet</label>" +
          '<select id="hoTikStatusValet">' +
            '<option value="lobby">Lobby</option>' +
            '<option value="parkir">Parkir</option>' +
          "</select>" +
        "</div>" +
        '<div class="ho-gate-fields">' +
          '<div class="row2">' +
            "<div><label>Event gate</label><select id=\"hoTikGateEvent\">" +
              '<option value="gate_masuk">Masuk</option>' +
              '<option value="gate_keluar">Keluar</option>' +
            "</select></div>" +
            '<div><label>Omzet / jasa_kas (Rp)</label><input type="number" id="hoTikOmzet" min="0" step="1000" placeholder="0" /></div>' +
          "</div>" +
          "<label>Metode bayar</label>" +
          '<select id="hoTikMetode"><option value="tunai">Tunai</option><option value="nontunai">Non-tunai</option><option value="">—</option></select>' +
        "</div>" +
        "<label>Petugas</label>" +
        '<select id="hoTikPetugas">' + staffOptions(api, petugas) + "</select>" +
        '<div class="btn-row"><button class="btn btn-primary" type="button" id="hoTikSubmit">Buat tiket</button></div>' +
      "</div>"
    );
  }

  function submitSetoran(api) {
    var layanan = document.getElementById("hoSetLayanan").value;
    var lokasi = document.getElementById("hoSetLokasi").value;
    var tanggal = document.getElementById("hoSetTanggal").value || api.todayKey();
    var omzet = Number(document.getElementById("hoSetOmzet").value) || 0;
    var tipEl = document.getElementById("hoSetTip");
    var tip = layanan === "parkir_gate" ? 0 : (Number(tipEl && tipEl.value) || 0);
    var metode = document.getElementById("hoSetMetode").value;
    var petugas = document.getElementById("hoSetPetugas").value;
    var catatan = document.getElementById("hoSetCatatan").value.trim();
    if (omzet <= 0) {
      api.toast("Isi Omzet / jasa_kas");
      return;
    }
    saveLastPetugas(api, petugas);
    var note = [
      "setoran_ho",
      "layanan:" + layanan,
      "metode:" + metode,
      catatan || ""
    ].filter(Boolean).join(" · ");
    api.syncEvent("setoran_ho", {
      periode: tanggal,
      kendaraan: 0,
      omzet: omzet,
      tip: tip,
      lokasi: lokasi,
      petugas: petugas,
      catatan: note,
      metode_bayar: metode,
      jasa_kas: omzet
    }, "Laporan");
    if (!Array.isArray(api.state.hoLedger)) api.state.hoLedger = [];
    api.state.hoLedger.unshift({
      at: api.iso(),
      tanggal: tanggal,
      lokasi: lokasi,
      layanan: layanan,
      omzet: omzet,
      tip: tip,
      metode: metode,
      petugas: petugas,
      catatan: catatan
    });
    while (api.state.hoLedger.length > 200) api.state.hoLedger.pop();
    api.save();
    api.toast("Setoran tersimpan · " + layanan + " · Rp " + omzet.toLocaleString("id-ID"));
    document.getElementById("hoSetOmzet").value = "";
    if (tipEl) tipEl.value = "";
    document.getElementById("hoSetCatatan").value = "";
    if (api.onChanged) api.onChanged();
  }

  function submitAbsensi(api) {
    var petugas = document.getElementById("hoAbsPetugas").value;
    var lokasi = document.getElementById("hoAbsLokasi").value;
    var status = document.getElementById("hoAbsStatus").value;
    var on = status === "on";
    saveLastPetugas(api, petugas);
    var ts = api.iso();
    if (!Array.isArray(api.state.attendance)) api.state.attendance = [];
    if (on) {
      api.state.attendance.unshift({
        id: api.uid("AT"),
        name: petugas,
        clockIn: ts,
        clockOut: null,
        lokasi: lokasi
      });
    } else {
      var open = api.state.attendance.find(function (a) {
        return a.name === petugas && !a.clockOut;
      });
      if (open) open.clockOut = ts;
      else {
        api.state.attendance.unshift({
          id: api.uid("AT"),
          name: petugas,
          clockIn: ts,
          clockOut: ts,
          lokasi: lokasi
        });
      }
    }
    api.save();
    api.syncEvent(on ? "absensi_on" : "absensi_off", {
      petugas: petugas,
      lokasi: lokasi,
      status_dinas: on ? "on" : "off",
      status: on ? "on" : "off",
      catatan: (on ? "dinas" : "pulang") + " · HO"
    }, "Absensi");
    api.toast((on ? "Dinas on" : "Pulang") + " · " + petugas);
    if (api.onChanged) api.onChanged();
  }

  function submitTiket(api) {
    var layanan = document.getElementById("hoTikLayanan").value;
    var plat = document.getElementById("hoTikPlat").value.trim().toUpperCase();
    var lokasi = document.getElementById("hoTikLokasi").value;
    var petugas = document.getElementById("hoTikPetugas").value;
    if (!plat) {
      api.toast("Plat wajib diisi");
      return;
    }
    saveLastPetugas(api, petugas);
    var ts = api.iso();

    if (layanan === "parkir_gate") {
      var gateEv = document.getElementById("hoTikGateEvent").value;
      var omzet = Number(document.getElementById("hoTikOmzet").value) || 0;
      var metode = document.getElementById("hoTikMetode").value;
      var active = gateEv === "gate_masuk";
      var t = {
        id: api.uid("G"),
        kode: api.trackCode(),
        plate: plat,
        guestName: "Gate",
        guestPhone: "",
        vehicleType: "mobil",
        layanan: "parkir_gate",
        fee: omzet || api.FEE,
        tip: 0,
        note: "HO · parkir gate · " + gateEv,
        lokasi: lokasi,
        valetStatus: active ? "parkir" : "selesai",
        spotId: null,
        staff: petugas,
        slaOverrideAlasan: "",
        checkIn: ts,
        parkedAt: ts,
        calledAt: null,
        readyAt: null,
        checkOut: active ? null : ts,
        payment: metode || null,
        shift: api.shiftOf(ts),
        events: [{ at: ts, label: "HO gate · " + gateEv + " · " + lokasi }]
      };
      api.state.tickets.unshift(t);
      api.save();
      api.syncEvent(gateEv, {
        id: t.id,
        plat: plat,
        status: active ? "parkir" : "selesai",
        jenis: "parkir_gate",
        metode_bayar: metode || "",
        jasa_kas: omzet,
        tip: 0,
        total: omzet,
        petugas: petugas,
        lokasi: lokasi,
        shift: t.shift,
        catatan: "HO · " + gateEv
      }, "Transaksi");
      api.toast(plat + " · " + (gateEv === "gate_masuk" ? "masuk gate" : "keluar gate"));
    } else {
      var st = document.getElementById("hoTikStatusValet").value || "lobby";
      var t2 = {
        id: api.uid("T"),
        kode: api.trackCode(),
        plate: plat,
        guestName: "Tamu",
        guestPhone: "",
        vehicleType: "mobil",
        layanan: "valet",
        fee: api.FEE,
        tip: 0,
        note: "HO · tiket cepat",
        lokasi: lokasi,
        valetStatus: st,
        spotId: null,
        staff: petugas,
        slaOverrideAlasan: "",
        checkIn: ts,
        parkedAt: st === "parkir" ? ts : null,
        calledAt: null,
        readyAt: null,
        checkOut: null,
        payment: null,
        shift: api.shiftOf(ts),
        events: [{ at: ts, label: "HO tiket cepat · " + st + " · " + lokasi }]
      };
      api.state.tickets.unshift(t2);
      api.save();
      api.syncEvent("terima_kunci", {
        id: t2.id,
        plat: plat,
        status: st,
        jenis: "mobil",
        jasa_kas: t2.fee,
        tip: 0,
        total: t2.fee,
        petugas: petugas,
        lokasi: lokasi,
        shift: t2.shift,
        catatan: "HO · tiket cepat · layanan:valet"
      }, "Transaksi");
      api.toast(plat + " · " + st + " · " + t2.kode);
    }
    document.getElementById("hoTikPlat").value = "";
    if (api.onChanged) api.onChanged();
  }

  function render(rootEl, api) {
    if (!rootEl || !api) return;
    rootEl.innerHTML =
      '<div class="ho-forms">' +
        renderSetoranForm(api) +
        renderAbsensiForm(api) +
        '<div style="grid-column:1/-1">' + renderTiketForm(api) + "</div>" +
      "</div>";

    var setoranCard = document.getElementById("hoCardSetoran");
    var tiketCard = document.getElementById("hoCardTiket");
    if (setoranCard) wireLayananToggle(setoranCard);
    if (tiketCard) wireLayananToggle(tiketCard);

    var btnSet = document.getElementById("hoSetSubmit");
    var btnAbs = document.getElementById("hoAbsSubmit");
    var btnTik = document.getElementById("hoTikSubmit");
    if (btnSet) btnSet.onclick = function () { submitSetoran(api); };
    if (btnAbs) btnAbs.onclick = function () { submitAbsensi(api); };
    if (btnTik) btnTik.onclick = function () { submitTiket(api); };
  }

  global.SpotFlowHoInput = { render: render, LAST_KEY: LAST_KEY };
})(typeof window !== "undefined" ? window : globalThis);
