/* SpotFlow Kucindan — PT Kucindan Usaha Pratama */
(function () {
  "use strict";

  const KEY = "spotflow_kucindan_v2";
  const COMPANY = "PT Kucindan Usaha Pratama";
  const HOURS = "06.00–22.00";
  const LOCS = [
    "MOP", "Sate Maranggi", "Lyma Brisket", "Taman Teras Tebet",
    "Bakmi Berdikari", "Pasar Minggu", "Kalimalang"
  ];
  const SITE_DEFAULT = "MOP";
  const FEE = 35000;
  const TZ = "Asia/Jakarta";

  const STAFF = [
    { id: "sapta-hendra", name: "Saptahendra Septiansyah", role: "Leader Valet" },
    { id: "saifu", name: "Saifurohman", role: "Valet" },
    { id: "sapta", name: "Sapta", role: "Valet" },
    { id: "topan", name: "Topan", role: "Valet" },
    { id: "arfan", name: "Arfan", role: "Valet" },
    { id: "mop1", name: "Petugas MOP 1", role: "Menunggu daftar final Septiawan" },
    { id: "mop2", name: "Petugas MOP 2", role: "Menunggu daftar final Septiawan" }
  ];

  const SLOT_DEFS = [
    { code: "V-01", type: "mobil", vip: false },
    { code: "V-02", type: "mobil", vip: false },
    { code: "V-03", type: "mobil", vip: false },
    { code: "V-04", type: "mobil", vip: false },
    { code: "V-05", type: "mobil", vip: true },
    { code: "V-06", type: "mobil", vip: true },
    { code: "V-07", type: "mobil", vip: false },
    { code: "V-08", type: "mobil", vip: false },
    { code: "V-09", type: "box", vip: false },
    { code: "V-10", type: "mobil", vip: false },
    { code: "V-11", type: "mobil", vip: false },
    { code: "V-12", type: "box", vip: false }
  ];

  const SLA_LOBBY = 12; // mnt
  const SLA_PANGGIL = 8; // mnt

  const COLS = [
    { id: "lobby", label: "Lobby", action: "Parkirkan", next: "parkir" },
    { id: "parkir", label: "Di parkir", action: "Panggil mobil", next: "dipanggil" },
    { id: "dipanggil", label: "Dipanggil", action: "Siap di lobby", next: "siap" },
    { id: "siap", label: "Siap", action: "Serahkan & bayar", next: "selesai" }
  ];

  let state = load();
  let route = { page: "operasi", kode: null };
  let payDraft = null;

  const CFG_KEY = "spotflow_kucindan_cfg";
  const Q_KEY = "spotflow_kucindan_q";
  const DEFAULT_TOKEN = "";
  const DEFAULT_SHEET_ID = "";
  let cfg = loadCfg();
  let queue = loadQueue();


  /* ---------- time helpers (WIB) ---------- */
  function now() { return new Date(); }
  function iso(d) { return (d || now()).toISOString(); }
  function todayKey(d) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d || now());
  }
  function fmtDate(d) {
    return new Intl.DateTimeFormat("id-ID", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d || now());
  }
  function fmtTime(d) {
    return new Intl.DateTimeFormat("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(typeof d === "string" ? new Date(d) : (d || now()));
  }
  function minsBetween(a, b) {
    const t0 = new Date(a).getTime();
    const t1 = new Date(b || now()).getTime();
    return Math.max(0, Math.round((t1 - t0) / 60000));
  }
  function durLabel(m) {
    if (m < 60) return m + " mnt";
    const h = Math.floor(m / 60), r = m % 60;
    return r ? h + " jam " + r + " mnt" : h + " jam";
  }
  function shiftOf(d) {
    const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(typeof d === "string" ? new Date(d) : (d || now())));
    if (h >= 6 && h < 14) return "pagi";
    if (h >= 14 && h < 22) return "siang";
    return "malam";
  }
  function shiftLabel(s) {
    return ({ pagi: "Pagi (06–14)", siang: "Siang (14–22)", malam: "Malam (22–06)" })[s] || s;
  }
  function rp(n) {
    return "Rp " + Math.round(n || 0).toLocaleString("id-ID");
  }
  function rpShort(n) {
    n = Math.round(n || 0);
    if (n >= 1e6) return "Rp " + (n / 1e6).toFixed(1).replace(".0", "") + " jt";
    if (n >= 1e3) return "Rp " + Math.round(n / 1e3) + " rb";
    return rp(n);
  }
  function uid(prefix) {
    return (prefix || "ID") + "-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
  }
  function trackCode() {
    const a = Math.random().toString(36).slice(2, 6).toUpperCase();
    const b = Math.random().toString(36).slice(2, 4).toUpperCase();
    return "KC-" + a + b;
  }

  /* ---------- persistence ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(KEY) || localStorage.getItem("spotflow_kucindan_v1");
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.tickets)) return normalizeState(s);
      }
    } catch (e) {}
    return seed();
  }
  function normalizeState(s) {
    if (!s.activeLokasi || !LOCS.includes(s.activeLokasi)) s.activeLokasi = SITE_DEFAULT;
    if (!STAFF.some(x => x.id === s.activeStaffId)) s.activeStaffId = "sapta-hendra";
    if (!Array.isArray(s.archive)) s.archive = [];
    if (!Array.isArray(s.bookings)) s.bookings = [];
    if (!Array.isArray(s.attendance)) s.attendance = [];
    for (const ticket of s.tickets) {
      if (!ticket.lokasi) ticket.lokasi = s.activeLokasi;
      if (ticket.slaOverrideAlasan == null) ticket.slaOverrideAlasan = "";
    }
    return s;
  }
  function currentLokasi() {
    return state.activeLokasi || SITE_DEFAULT;
  }
  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }
  function loadCfg() {
    try {
      const c = JSON.parse(localStorage.getItem(CFG_KEY) || "{}");
      if (!c.token) c.token = DEFAULT_TOKEN;
      if (!c.sheetId) c.sheetId = DEFAULT_SHEET_ID;
      return c;
    } catch (e) {
      return { url: "", token: DEFAULT_TOKEN, sheetId: DEFAULT_SHEET_ID };
    }
  }
  function saveCfg() { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }
  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(Q_KEY) || "[]"); } catch (e) { return []; }
  }
  function saveQueue() { localStorage.setItem(Q_KEY, JSON.stringify(queue)); }

  function syncPayload(event, row, tab) {
    return {
      token: cfg.token || "",
      tab: tab || "Transaksi",
      event: event,
      row: Object.assign({
        timestamp: iso(),
        lokasi: currentLokasi(),
        petugas: (activeStaff() && activeStaff().name) || "",
        sheetId: cfg.sheetId || DEFAULT_SHEET_ID
      }, row)
    };
  }
  async function postSheets(payload) {
    if (!cfg.url || !cfg.token) {
      updateSyncChip();
      return { ok: false, skipped: true };
    }
    const url = cfg.url + (cfg.url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(cfg.token);
    try {
      await fetch(url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      return { ok: true, opaque: true };
    } catch (err) {
      queue.push({ at: iso(), payload });
      saveQueue();
      updateSyncChip();
      return { ok: false, error: String(err) };
    }
  }
  async function syncEvent(event, row, tab) {
    const payload = syncPayload(event, row, tab);
    const r = await postSheets(payload);
    if (r.skipped) return;
    if (r.ok) toast("Tersimpan · sync Sheets");
    else toast("Offline · masuk antrian");
    updateSyncChip();
  }
  async function flushQueue() {
    if (!cfg.url || !cfg.token || !queue.length) { updateSyncChip(); return; }
    const left = [];
    for (const item of queue) {
      const r = await postSheets(item.payload);
      if (!r.ok) left.push(item);
    }
    queue = left; saveQueue(); updateSyncChip();
    toast(left.length ? ("Antrian sisa " + left.length) : "Antrian terkirim");
  }
  function updateSyncChip() {
    const el = document.getElementById("syncChip");
    if (!el) return;
    if (!cfg.url || !cfg.token) {
      el.textContent = "Sheets: lokal saja";
      el.className = "sync-chip warn";
    } else if (queue.length) {
      el.textContent = "Sheets: antrian " + queue.length;
      el.className = "sync-chip warn";
    } else {
      el.textContent = "Sheets: OK";
      el.className = "sync-chip ok";
    }
  }

  function hoursAgo(h) {
    return new Date(now().getTime() - h * 3600000).toISOString();
  }
  function minsAgo(m) {
    return new Date(now().getTime() - m * 60000).toISOString();
  }

  function seed() {
    const leader = "Saptahendra Septiansyah";
    const loc = SITE_DEFAULT;
    const tickets = [
      {
        id: uid("T"), kode: "KC-LOBBY1", plate: "B 1288 XP", guestName: "Bapak Andi", guestPhone: "0812-1000-1111",
        vehicleType: "mobil", fee: FEE, tip: 0, note: "Jangan geser kursi pengemudi.", lokasi: loc,
        valetStatus: "lobby", spotId: null, staff: "Saifurohman", slaOverrideAlasan: "",
        checkIn: minsAgo(13), parkedAt: null, calledAt: null, readyAt: null, checkOut: null,
        payment: null, shift: shiftOf(minsAgo(13)), events: [
          { at: minsAgo(13), label: "Kunci diterima di lobby · " + loc }
        ]
      },
      {
        id: uid("T"), kode: "KC-LOBBY2", plate: "B 4401 HN", guestName: "Ibu Maya", guestPhone: "0813-2000-2222",
        vehicleType: "mobil", fee: FEE, tip: 0, note: "", lokasi: loc,
        valetStatus: "lobby", spotId: null, staff: "Topan", slaOverrideAlasan: "",
        checkIn: minsAgo(20), parkedAt: null, calledAt: null, readyAt: null, checkOut: null,
        payment: null, shift: shiftOf(minsAgo(20)), events: [
          { at: minsAgo(20), label: "Kunci diterima di lobby · " + loc }
        ]
      },
      {
        id: uid("T"), kode: "KC-LOBBY3", plate: "B 9012 KL", guestName: "Bapak Fajar", guestPhone: "0812-3000-3333",
        vehicleType: "mobil", fee: 40000, tip: 0, note: "VIP — ambil cepat jika dipanggil.", lokasi: "Sate Maranggi",
        valetStatus: "lobby", spotId: null, staff: leader, slaOverrideAlasan: "",
        checkIn: minsAgo(6), parkedAt: null, calledAt: null, readyAt: null, checkOut: null,
        payment: null, shift: shiftOf(minsAgo(6)), events: [
          { at: minsAgo(6), label: "Kunci diterima di lobby · Sate Maranggi" }
        ]
      },
      {
        id: uid("T"), kode: "KC-PARK01", plate: "B 1721 MZ", guestName: "Ibu Sari", guestPhone: "0812-4000-4444",
        vehicleType: "mobil", fee: FEE, tip: 0, note: "Child seat belakang.", lokasi: loc,
        valetStatus: "parkir", spotId: "V-01", staff: "Saifurohman", slaOverrideAlasan: "",
        checkIn: hoursAgo(1.2), parkedAt: hoursAgo(1.0), calledAt: null, readyAt: null, checkOut: null,
        payment: null, shift: shiftOf(hoursAgo(1.2)), events: [
          { at: hoursAgo(1.2), label: "Kunci diterima di lobby" },
          { at: hoursAgo(1.0), label: "Diparkir di V-01" }
        ]
      },
      {
        id: uid("T"), kode: "KC-PARK02", plate: "B 5510 QR", guestName: "Bapak Yoga", guestPhone: "0812-5000-5555",
        vehicleType: "mobil", fee: FEE, tip: 5000, note: "", lokasi: "Lyma Brisket",
        valetStatus: "parkir", spotId: "V-03", staff: "Sapta", slaOverrideAlasan: "",
        checkIn: hoursAgo(2.1), parkedAt: hoursAgo(2.0), calledAt: null, readyAt: null, checkOut: null,
        payment: null, shift: shiftOf(hoursAgo(2.1)), events: [
          { at: hoursAgo(2.1), label: "Kunci diterima di lobby · Lyma Brisket" },
          { at: hoursAgo(2.0), label: "Diparkir di V-03" }
        ]
      },
      {
        id: uid("T"), kode: "KC-PARK03", plate: "B 3344 TT", guestName: "Ibu Lina", guestPhone: "0812-6000-6666",
        vehicleType: "mobil", fee: FEE, tip: 0, note: "VIP — ambil cepat jika dipanggil.", lokasi: loc,
        valetStatus: "parkir", spotId: "V-05", staff: "Arfan", slaOverrideAlasan: "",
        checkIn: hoursAgo(0.8), parkedAt: hoursAgo(0.7), calledAt: null, readyAt: null, checkOut: null,
        payment: null, shift: shiftOf(hoursAgo(0.8)), events: [
          { at: hoursAgo(0.8), label: "Kunci diterima di lobby" },
          { at: hoursAgo(0.7), label: "Diparkir di V-05 (VIP)" }
        ]
      },
      {
        id: uid("T"), kode: "KC-PARK04", plate: "B 7788 UV", guestName: "Bapak Reza", guestPhone: "0812-7000-7777",
        vehicleType: "box", fee: 45000, tip: 0, note: "", lokasi: loc,
        valetStatus: "parkir", spotId: "V-09", staff: leader, slaOverrideAlasan: "",
        checkIn: hoursAgo(1.5), parkedAt: hoursAgo(1.4), calledAt: null, readyAt: null, checkOut: null,
        payment: null, shift: shiftOf(hoursAgo(1.5)), events: [
          { at: hoursAgo(1.5), label: "Kunci diterima di lobby" },
          { at: hoursAgo(1.4), label: "Diparkir di V-09" }
        ]
      },
      {
        id: uid("T"), kode: "KC-CALL01", plate: "B 1330 SAK", guestName: "Bapak Hendra", guestPhone: "0812-8000-8888",
        vehicleType: "mobil", fee: FEE, tip: 0, note: "Child seat belakang.", lokasi: loc,
        valetStatus: "dipanggil", spotId: "V-02", staff: "Saifurohman", slaOverrideAlasan: "",
        checkIn: hoursAgo(1.6), parkedAt: hoursAgo(1.5), calledAt: minsAgo(11), readyAt: null, checkOut: null,
        payment: null, shift: shiftOf(hoursAgo(1.6)), events: [
          { at: hoursAgo(1.6), label: "Kunci diterima di lobby" },
          { at: hoursAgo(1.5), label: "Diparkir di V-02" },
          { at: minsAgo(11), label: "Dipanggil — petugas menuju slot" }
        ]
      },
      {
        id: uid("T"), kode: "KC-CALL02", plate: "B 2201 WW", guestName: "Ibu Nina", guestPhone: "0812-9000-9999",
        vehicleType: "mobil", fee: FEE, tip: 10000, note: "", lokasi: "Kalimalang",
        valetStatus: "dipanggil", spotId: "V-07", staff: "Petugas MOP 1", slaOverrideAlasan: "",
        checkIn: hoursAgo(0.9), parkedAt: hoursAgo(0.8), calledAt: minsAgo(4), readyAt: null, checkOut: null,
        payment: null, shift: shiftOf(hoursAgo(0.9)), events: [
          { at: hoursAgo(0.9), label: "Kunci diterima di lobby · Kalimalang" },
          { at: hoursAgo(0.8), label: "Diparkir di V-07" },
          { at: minsAgo(4), label: "Dipanggil — petugas menuju slot" }
        ]
      },
      {
        id: uid("T"), kode: "KC-READY1", plate: "B 6600 XY", guestName: "Bapak Dimas", guestPhone: "0813-1111-0001",
        vehicleType: "mobil", fee: FEE, tip: 0, note: "", lokasi: loc,
        valetStatus: "siap", spotId: "V-04", staff: leader, slaOverrideAlasan: "",
        checkIn: hoursAgo(1.25), parkedAt: hoursAgo(1.15), calledAt: minsAgo(18), readyAt: minsAgo(8), checkOut: null,
        payment: null, shift: shiftOf(hoursAgo(1.25)), events: [
          { at: hoursAgo(1.25), label: "Kunci diterima di lobby" },
          { at: hoursAgo(1.15), label: "Diparkir di V-04" },
          { at: minsAgo(18), label: "Dipanggil" },
          { at: minsAgo(8), label: "Siap di lobby" }
        ]
      },
      {
        id: uid("T"), kode: "KC-READY2", plate: "B 1199 ZZ", guestName: "Ibu Rina Hartono", guestPhone: "0813-2222-0002",
        vehicleType: "mobil", fee: FEE, tip: 5000, note: "Drop lobby utara.", lokasi: "Pasar Minggu",
        valetStatus: "siap", spotId: "V-08", staff: "Petugas MOP 2", slaOverrideAlasan: "",
        checkIn: hoursAgo(2.5), parkedAt: hoursAgo(2.4), calledAt: minsAgo(25), readyAt: minsAgo(12), checkOut: null,
        payment: null, shift: shiftOf(hoursAgo(2.5)), events: [
          { at: hoursAgo(2.5), label: "Kunci diterima di lobby · Pasar Minggu" },
          { at: hoursAgo(2.4), label: "Diparkir di V-08" },
          { at: minsAgo(25), label: "Dipanggil" },
          { at: minsAgo(12), label: "Siap di lobby" }
        ]
      }
    ];

    const hist = [];
    const histLocs = ["MOP", "Sate Maranggi", "Lyma Brisket", "Taman Teras Tebet", "Bakmi Berdikari", "Pasar Minggu", "Kalimalang"];
    for (let i = 0; i < 18; i++) {
      const agoH = 8 + i * 7;
      const checkIn = hoursAgo(agoH + 1.5);
      const checkOut = hoursAgo(agoH);
      hist.push({
        id: uid("H"), kode: "KC-H" + String(i + 1).padStart(2, "0"),
        plate: "B " + String(1000 + i * 37).slice(-4) + " " + ["AA","BB","CC","DD"][i % 4],
        guestName: "Tamu " + (i + 1), guestPhone: "",
        vehicleType: i % 5 === 0 ? "box" : "mobil",
        fee: i % 5 === 0 ? 45000 : FEE, tip: i % 3 === 0 ? 5000 : 0, note: "",
        lokasi: histLocs[i % histLocs.length],
        valetStatus: "selesai", spotId: "V-0" + ((i % 8) + 1),
        staff: STAFF[i % Math.min(7, STAFF.length)].name,
        slaOverrideAlasan: "",
        checkIn, parkedAt: hoursAgo(agoH + 1.3), calledAt: hoursAgo(agoH + 0.2), readyAt: hoursAgo(agoH + 0.1), checkOut,
        payment: ["tunai", "qris", "kartu"][i % 3],
        shift: shiftOf(checkIn),
        events: [{ at: checkIn, label: "Check-in" }, { at: checkOut, label: "Selesai & bayar" }]
      });
    }

    return {
      activeStaffId: "sapta-hendra",
      activeLokasi: SITE_DEFAULT,
      archive: [],
      tickets: tickets.concat(hist),
      bookings: [
        {
          id: uid("B"), plate: "B 2210 RX", guestName: "Ibu Rina Hartono", guestPhone: "0813-2222-0002",
          eta: hoursAgo(-0.5), note: "Drop lobby utara · MOP", status: "menunggu", lokasi: "MOP"
        },
        {
          id: uid("B"), plate: "B 8871 PT", guestName: "Bapak Yoga", guestPhone: "0812-5000-5555",
          eta: hoursAgo(0.2), note: "Sudah konfirmasi · Lyma", status: "diterima", lokasi: "Lyma Brisket"
        }
      ],
      attendance: [
        { id: "at-saifu", name: "Saifurohman", clockIn: minsAgo(120), clockOut: null, lokasi: "Lobby MOP" },
        { id: "at-topan", name: "Topan", clockIn: hoursAgo(8), clockOut: hoursAgo(1), lokasi: "Lobby MOP" }
      ]
    };
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function activeStaff() {
    return STAFF.find(s => s.id === state.activeStaffId) || STAFF[0];
  }

  function activeTickets() {
    return state.tickets.filter(t => t.valetStatus !== "selesai");
  }

  function freeSlots(vehicleType) {
    const used = new Set(activeTickets().filter(t => t.spotId).map(t => t.spotId));
    return SLOT_DEFS.filter(s => !used.has(s.code) && (!vehicleType || s.type === vehicleType || (vehicleType === "mobil" && s.type === "mobil")));
  }

  function ticketSlaBreach(t) {
    if (t.valetStatus === "lobby") {
      const m = minsBetween(t.checkIn);
      if (m > SLA_LOBBY) return { kind: "lobby", mins: m, text: t.plate + " masih di lobby " + m + " mnt (SLA " + SLA_LOBBY + ")" };
    }
    if (t.valetStatus === "dipanggil" && t.calledAt) {
      const m = minsBetween(t.calledAt);
      if (m > SLA_PANGGIL) return { kind: "dipanggil", mins: m, text: t.plate + " dipanggil " + m + " mnt (SLA " + SLA_PANGGIL + ")" };
    }
    return null;
  }
  function anomalies() {
    const list = [];
    for (const t of activeTickets()) {
      const b = ticketSlaBreach(t);
      if (b) list.push({ id: t.id, tone: b.kind === "dipanggil" ? "danger" : "warn", text: b.text });
    }
    return list;
  }

  /* ---------- routing ---------- */
  function parseRoute() {
    const hash = (location.hash || "#/operasi").replace(/^#\/?/, "");
    const [pathPart, queryPart] = hash.split("?");
    const parts = pathPart.split("/").filter(Boolean);
    const page = parts[0] || "operasi";
    const params = new URLSearchParams(queryPart || "");
    // also support real query ?kode=
    const urlQ = new URLSearchParams(location.search);
    const kode = params.get("kode") || urlQ.get("kode") || parts[1] || null;
    const map = {
      operasi: "operasi", home: "operasi", "": "operasi",
      pegawai: "pegawai", hp: "pegawai",
      slot: "slot", slots: "slot",
      tim: "tim",
      laporan: "laporan",
      booking: "booking",
      lacak: "lacak"
    };
    route = { page: map[page] || "operasi", kode };
  }

  function go(page, kode) {
    if (page === "lacak" && kode) location.hash = "#/lacak?kode=" + encodeURIComponent(kode);
    else location.hash = "#/" + page;
  }

  /* ---------- actions ---------- */
  function findTicket(id) {
    return state.tickets.find(t => t.id === id);
  }

  function advanceTicket(id, overrideAlasan) {
    const t = findTicket(id);
    if (!t) return;
    const col = COLS.find(c => c.id === t.valetStatus);
    if (!col) return;
    const breach = ticketSlaBreach(t);
    const alreadyAck = breach && t._slaAckStatus === t.valetStatus;
    if (breach && !overrideAlasan && !alreadyAck) {
      openSlaOverrideModal(t, breach);
      return;
    }
    if (breach && overrideAlasan) {
      t.slaOverrideAlasan = (t.slaOverrideAlasan ? t.slaOverrideAlasan + " | " : "") + overrideAlasan;
      t._slaAckStatus = t.valetStatus;
      t.events.push({ at: iso(), label: "SLA override: " + overrideAlasan });
    }
    if (col.next === "parkir") {
      openParkModal(t);
      return;
    }
    if (col.next === "selesai") {
      openPayModal(t);
      return;
    }
    const ts = iso();
    if (col.next === "dipanggil") {
      t.calledAt = ts;
      t.events.push({ at: ts, label: "Dipanggil — petugas menuju slot" });
    }
    if (col.next === "siap") {
      t.readyAt = ts;
      t.events.push({ at: ts, label: "Siap di lobby" });
    }
    t.valetStatus = col.next;
    save();
    toast(t.plate + " → " + (COLS.find(c => c.id === t.valetStatus)?.label || t.valetStatus));
    render();
  }

  function openSlaOverrideModal(t, breach) {
    showModal(`
      <h3>Override SLA</h3>
      <p style="color:var(--bad);font-weight:700;font-size:14px;margin:0 0 8px">${esc(breach.text)}</p>
      <p style="font-size:13px;color:var(--mut);margin:0 0 10px">Isi alasan wajib sebelum lanjut (audit Tim IT / Tania).</p>
      <label>Alasan override</label>
      <textarea id="slaReason" rows="3" placeholder="Contoh: tamu masih meeting · petugas antar VIP · slot penuh"></textarea>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn btn-block" type="button" id="slaCancel">Batal</button>
        <button class="btn btn-primary btn-block" type="button" id="slaOk">Lanjut dengan alasan</button>
      </div>
    `);
    document.getElementById("slaCancel").onclick = hideModal;
    document.getElementById("slaOk").onclick = () => {
      const reason = (document.getElementById("slaReason").value || "").trim();
      if (reason.length < 5) { toast("Alasan minimal 5 karakter"); return; }
      hideModal();
      advanceTicket(t.id, reason);
    };
  }

  function openParkModal(t) {
    const free = freeSlots(t.vehicleType);
    if (!free.length) { toast("Tidak ada slot kosong"); return; }
    const opts = free.map(s => `<option value="${s.code}">${s.code} · ${s.type}${s.vip ? " · VIP" : ""}</option>`).join("");
    showModal(`
      <h3>Parkirkan ${esc(t.plate)}</h3>
      <p class="meta" style="color:var(--mut);font-size:13px;margin:0 0 8px">${esc(t.guestName)} · ${esc(t.staff)}</p>
      <label>Pilih slot</label>
      <select id="parkSlot">${opts}</select>
      <label>Petugas</label>
      <select id="parkStaff">${STAFF.map(s => `<option ${s.name === t.staff ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn btn-block" type="button" id="parkCancel">Batal</button>
        <button class="btn btn-primary btn-block" type="button" id="parkOk">Parkirkan</button>
      </div>
    `);
    document.getElementById("parkCancel").onclick = hideModal;
    document.getElementById("parkOk").onclick = () => {
      const slot = document.getElementById("parkSlot").value;
      const staff = document.getElementById("parkStaff").value;
      const ts = iso();
      t.spotId = slot;
      t.staff = staff;
      t.parkedAt = ts;
      t.valetStatus = "parkir";
      t.events.push({ at: ts, label: "Diparkir di " + slot });
      save();
      hideModal();
      toast(t.plate + " diparkir di " + slot);
      render();
    };
  }

  function openPayModal(t) {
    payDraft = t;
    showModal(`
      <h3>Serahkan & bayar</h3>
      <p style="margin:0 0 4px;font-weight:800;font-size:20px">${esc(t.plate)}</p>
      <p style="margin:0 0 12px;color:var(--mut);font-size:13px">${esc(t.guestName)} · ${durLabel(minsBetween(t.checkIn))}</p>
      <label>Jasa valet</label>
      <input id="payFee" type="number" value="${t.fee}" />
      <label>Tip petugas (opsional)</label>
      <input id="payTip" type="number" value="${t.tip || 0}" />
      <label>Metode bayar</label>
      <select id="payMethod">
        <option value="tunai">Tunai</option>
        <option value="qris">QRIS</option>
        <option value="kartu">Kartu</option>
      </select>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn btn-block" type="button" id="payCancel">Batal</button>
        <button class="btn btn-primary btn-block" type="button" id="payOk">Selesai</button>
      </div>
    `);
    document.getElementById("payCancel").onclick = hideModal;
    document.getElementById("payOk").onclick = () => {
      const fee = Number(document.getElementById("payFee").value) || t.fee;
      const tip = Number(document.getElementById("payTip").value) || 0;
      const payment = document.getElementById("payMethod").value;
      const ts = iso();
      t.fee = fee; t.tip = tip; t.payment = payment;
      t.checkOut = ts; t.valetStatus = "selesai";
      t.events.push({ at: ts, label: "Diserahkan & dibayar (" + payment + ")" });
      save();
      hideModal();
      toast(t.plate + " selesai · " + rp(fee));
      syncEvent("serahkan_bayar", {
        id: t.id || t.kode,
        plat: t.plate,
        status: "selesai",
        tamu: t.guestName || "",
        wa: t.guestPhone || "",
        slot: t.spotId || "",
        jenis: t.vehicleType || "",
        metode_bayar: payment,
        jasa_kas: fee,
        tip: tip,
        total: fee + tip,
        petugas: t.staff || "",
        shift: t.shift || "",
        catatan: t.note || "",
        sla_override_alasan: t.slaOverrideAlasan || ""
      });
      render();
    };
  }

  function receiveKeys() {
    showModal(`
      <h3>Terima kunci</h3>
      <label>Plat nomor</label>
      <input id="nkPlate" placeholder="B 1234 ABC" style="text-transform:uppercase" />
      <label>Nama tamu</label>
      <input id="nkGuest" placeholder="Bapak / Ibu …" />
      <label>No. WA (opsional)</label>
      <input id="nkPhone" placeholder="08…" />
      <label>Jenis</label>
      <select id="nkType"><option value="mobil">Mobil</option><option value="box">Box / Pickup</option></select>
      <label>Tarif jasa</label>
      <input id="nkFee" type="number" value="${FEE}" />
      <label>Catatan</label>
      <textarea id="nkNote" rows="2" placeholder="Catatan khusus (kursi, VIP, …)"></textarea>
      <label>Petugas</label>
      <select id="nkStaff">${STAFF.map(s => `<option ${s.id === state.activeStaffId ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn btn-block" type="button" id="nkCancel">Batal</button>
        <button class="btn btn-primary btn-block" type="button" id="nkOk">Simpan ke Lobby</button>
      </div>
    `);
    document.getElementById("nkCancel").onclick = hideModal;
    document.getElementById("nkOk").onclick = () => {
      const plate = document.getElementById("nkPlate").value.trim().toUpperCase();
      if (!plate) { toast("Isi plat nomor"); return; }
      const ts = iso();
      const t = {
        id: uid("T"), kode: trackCode(), plate,
        guestName: document.getElementById("nkGuest").value.trim() || "Tamu",
        guestPhone: document.getElementById("nkPhone").value.trim(),
        vehicleType: document.getElementById("nkType").value,
        fee: Number(document.getElementById("nkFee").value) || FEE,
        tip: 0, note: document.getElementById("nkNote").value.trim(),
        lokasi: currentLokasi(),
        valetStatus: "lobby", spotId: null,
        staff: document.getElementById("nkStaff").value,
        slaOverrideAlasan: "",
        checkIn: ts, parkedAt: null, calledAt: null, readyAt: null, checkOut: null,
        payment: null, shift: shiftOf(ts),
        events: [{ at: ts, label: "Kunci diterima di lobby · " + currentLokasi() }]
      };
      state.tickets.unshift(t);
      save();
      hideModal();
      toast(plate + " masuk Lobby · kode " + t.kode);
      syncEvent("terima_kunci", {
        id: t.id || t.kode,
        plat: t.plate,
        status: "lobby",
        tamu: t.guestName || "",
        wa: t.guestPhone || "",
        jenis: t.vehicleType || "",
        jasa_kas: t.fee || 0,
        tip: 0,
        total: t.fee || 0,
        petugas: t.staff || "",
        catatan: t.note || ""
      });
      go("operasi");
      render();
    };
  }

  function archiveCompletedTickets() {
    const done = state.tickets.filter(t => t.valetStatus === "selesai");
    if (!done.length) { toast("Tidak ada tiket selesai untuk diarsipkan"); return; }
    if (!confirm("Arsipkan " + done.length + " tiket selesai? Tiket aktif & riwayat event tetap ada.")) return;
    const snap = {
      at: iso(),
      kind: "completed",
      activeLokasi: currentLokasi(),
      tickets: done.map(t => Object.assign({}, t, { events: (t.events || []).slice() }))
    };
    if (!Array.isArray(state.archive)) state.archive = [];
    state.archive.unshift(snap);
    while (state.archive.length > 20) state.archive.pop();
    // keep aktif + event history on aktif; remove only completed from working list
    state.tickets = state.tickets.filter(t => t.valetStatus !== "selesai");
    save();
    toast(done.length + " tiket diarsipkan · event history tersimpan");
    syncEvent("archive_completed", {
      id: "archive-" + Date.now(),
      status: "arsip",
      catatan: done.length + " tiket",
      jasa_kas: done.reduce((s, t) => s + (t.fee || 0), 0),
      tip: done.reduce((s, t) => s + (t.tip || 0), 0)
    }, "Laporan");
    render();
  }

  function wipeAllConfirm() {
    if (!confirm("HAPUS SEMUA data lokal (termasuk arsip)? Tindakan ini tidak bisa dibatalkan.")) return;
    if (!confirm("Yakin total wipe? Ketik OK di langkah berikutnya tidak tersedia — konfirmasi lagi.")) return;
    // soft-keep last snapshot then seed
    const snap = {
      at: iso(),
      kind: "pre_wipe",
      tickets: state.tickets,
      bookings: state.bookings,
      attendance: state.attendance,
      archive: state.archive
    };
    const archive = Array.isArray(state.archive) ? state.archive.slice() : [];
    archive.unshift(snap);
    while (archive.length > 20) archive.pop();
    const fresh = seed();
    fresh.archive = archive;
    fresh.activeLokasi = SITE_DEFAULT;
    state = fresh;
    save();
    toast("Data di-wipe · arsip pre-wipe tersimpan lokal");
    render();
  }

  function openArchiveMenu() {
    const nDone = state.tickets.filter(t => t.valetStatus === "selesai").length;
    const nArch = Array.isArray(state.archive) ? state.archive.length : 0;
    showModal(`
      <h3>Arsip & data</h3>
      <p style="font-size:13px;color:var(--mut);margin:0 0 12px">Soft-archive: tiket selesai dipindah ke arsip. Event history tidak dihapus. Wipe total butuh konfirmasi ganda.</p>
      <p style="font-size:13px;margin:0 0 10px"><b>${nDone}</b> tiket selesai · <b>${nArch}</b> batch arsip lokal</p>
      <button class="btn btn-primary btn-block" type="button" id="archDone">🗂️ Arsipkan tiket selesai</button>
      <button class="btn btn-block" type="button" id="archSettings" style="margin-top:8px">⚙️ Pengaturan Sheets</button>
      <button class="btn btn-block" type="button" id="archWipe" style="margin-top:8px;color:var(--bad)">⚠️ Wipe semua (konfirmasi)</button>
      <button class="btn btn-block" type="button" id="archClose" style="margin-top:8px">Tutup</button>
    `);
    document.getElementById("archDone").onclick = () => { hideModal(); archiveCompletedTickets(); };
    document.getElementById("archSettings").onclick = () => { hideModal(); openSettings(); };
    document.getElementById("archWipe").onclick = () => { hideModal(); wipeAllConfirm(); };
    document.getElementById("archClose").onclick = hideModal;
  }

  function openSettings() {
    showModal(`
      <h3>Pengaturan Sheets</h3>
      <p style="font-size:13px;color:var(--mut);margin:0 0 10px">Sync opsional ke Google Sheets (pola SpotFlow MOP). Field: token <code>spotflow-mop-2026</code>, sheet <code>1M3bBUqGgzP5VqTBz6Ujoy6n948RJIPAHKv874IWdj50</code> — isi manual (tidak di-hardcode ke Pages). Lihat docs/SHEET-SYNC.md.</p>
      <label>Web App URL</label>
      <input id="cfgUrl" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(cfg.url || "")}" />
      <label>Token rahasia</label>
      <input id="cfgToken" placeholder="spotflow-mop-2026" value="${esc(cfg.token || "")}" />
      <label>Spreadsheet ID</label>
      <input id="cfgSheetId" placeholder="1M3bBUqGgzP5VqTBz6Ujoy6n948RJIPAHKv874IWdj50" value="${esc(cfg.sheetId || "")}" />
      <p id="cfgStatus" style="font-size:12px;color:var(--mut);margin:8px 0">Antrian gagal: ${queue.length}${cfg.url ? " · URL tersimpan" : " · belum URL"}</p>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button class="btn" type="button" id="btnTestSync">Tes koneksi</button>
        <button class="btn btn-primary" type="button" id="btnSaveCfg">Simpan</button>
        <button class="btn" type="button" id="btnRetryQueue">Kirim ulang antrian</button>
      </div>
      <button class="btn btn-block" type="button" id="cfgClose" style="margin-top:10px">Tutup</button>
    `);
    document.getElementById("btnSaveCfg").onclick = () => {
      cfg.url = document.getElementById("cfgUrl").value.trim();
      cfg.token = document.getElementById("cfgToken").value.trim() || DEFAULT_TOKEN;
      cfg.sheetId = document.getElementById("cfgSheetId").value.trim() || DEFAULT_SHEET_ID;
      saveCfg(); updateSyncChip(); toast("Pengaturan disimpan");
    };
    document.getElementById("btnTestSync").onclick = async () => {
      cfg.url = document.getElementById("cfgUrl").value.trim();
      cfg.token = document.getElementById("cfgToken").value.trim() || DEFAULT_TOKEN;
      saveCfg();
      if (!cfg.url) { toast("Isi Web App URL dulu"); return; }
      try {
        const u = cfg.url + (cfg.url.includes("?") ? "&" : "?") + "ping=1&token=" + encodeURIComponent(cfg.token || "");
        await fetch(u, { method: "GET", mode: "no-cors" });
        toast("Tes dikirim (cek Spreadsheet / log Apps Script)");
      } catch (e) { toast("Gagal: " + e); }
    };
    document.getElementById("btnRetryQueue").onclick = () => flushQueue();
    document.getElementById("cfgClose").onclick = hideModal;
  }

  /* ---------- modal ---------- */
  function showModal(html) {
    const bg = document.getElementById("modalBg");
    document.getElementById("modalBody").innerHTML = html;
    bg.classList.remove("hidden");
  }
  function hideModal() {
    document.getElementById("modalBg").classList.add("hidden");
    payDraft = null;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- renderers ---------- */
  function setNavActive() {
    document.querySelectorAll("[data-nav]").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-nav") === route.page);
    });
  }

  function renderTopbar() {
    const st = activeStaff();
    document.getElementById("topDate").textContent = fmtDate();
    document.getElementById("topShift").textContent = currentLokasi() + " · " + shiftLabel(shiftOf()) + " · " + st.name;
    document.getElementById("topClock").textContent = fmtTime() + " WIB";
    const locSel = document.getElementById("locSelect");
    if (locSel && locSel.value !== currentLokasi()) locSel.value = currentLokasi();
  }

  function ticketCard(t) {
    const col = COLS.find(c => c.id === t.valetStatus);
    let meta = "";
    if (t.valetStatus === "lobby") meta = "Masuk " + fmtTime(t.checkIn) + " · " + durLabel(minsBetween(t.checkIn)) + " · " + esc(t.staff);
    else if (t.valetStatus === "parkir") meta = (t.spotId || "—") + " · " + durLabel(minsBetween(t.checkIn)) + " · " + esc(t.staff);
    else if (t.valetStatus === "dipanggil") meta = "Dipanggil " + durLabel(minsBetween(t.calledAt)) + " lalu · " + (t.spotId || "") + " · " + esc(t.staff);
    else meta = durLabel(minsBetween(t.checkIn)) + " · " + esc(t.staff);

    return `<article class="ticket" data-id="${t.id}">
      <div class="plate">${esc(t.plate)}</div>
      <div class="price">${rp(t.fee)}${t.spotId ? " · " + esc(t.spotId) : ""} · <span class="pill teal">${esc(t.lokasi || currentLokasi())}</span></div>
      <div class="meta">${esc(t.guestName)}${t.guestPhone ? " · " + esc(t.guestPhone) : ""}<br/>${meta}</div>
      ${t.note ? `<div class="note">${esc(t.note)}</div>` : ""}
      <div class="actions">
        <button class="btn btn-primary btn-sm" type="button" data-act="advance">${esc(col ? col.action : "Lanjut")}</button>
        <button class="linkish" type="button" data-act="track">Lacak tamu</button>
      </div>
    </article>`;
  }

  function renderOperasi() {
    const act = activeTickets();
    const used = act.filter(t => t.spotId).length;
    const st = activeStaff();
    const anoms = anomalies();
    const todayDone = state.tickets.filter(t => t.valetStatus === "selesai" && todayKey(new Date(t.checkOut)) === todayKey());
    const monthDone = state.tickets.filter(t => t.valetStatus === "selesai" && (t.checkOut || "").slice(0, 7) === todayKey().slice(0, 7));
    const jasaToday = todayDone.reduce((s, t) => s + (t.fee || 0), 0);
    const tipToday = todayDone.reduce((s, t) => s + (t.tip || 0), 0);
    const jasaMonth = monthDone.reduce((s, t) => s + (t.fee || 0), 0);

    let html = `
      <div class="page-head">
        <div>
          <p class="eyebrow">Operasi</p>
          <h1>Operasi valet</h1>
          <p>${esc(currentLokasi())} · ${esc(st.name)} · ${used}/${SLOT_DEFS.length} slot · ambil ~6 mnt</p>
        </div>
        <div class="btn-row">
          <button class="btn" type="button" id="btnHp">HP petugas</button>
          <button class="btn btn-primary" type="button" id="btnTerima">🔑 Terima kunci</button>
        </div>
      </div>`;
    if (anoms.length) {
      html += `<div class="alert-bar">${anoms.map(a => `<span class="chip">${esc(a.text)}</span>`).join("")}</div>`;
    }
    html += `<div class="kpis">
      <div class="kpi"><div class="label">Valet aktif</div><div class="n">${act.length}</div><div class="sub">Kunci masih di pos.</div></div>
      <div class="kpi"><div class="label">Kas (jasa) hari ini</div><div class="n">${rpShort(jasaToday)}</div><div class="sub">${todayDone.length} tiket · masuk kas perusahaan</div></div>
      <div class="kpi"><div class="label">Tip petugas</div><div class="n">${rpShort(tipToday)}</div><div class="sub">Terpisah dari kas / setoran.</div></div>
      <div class="kpi"><div class="label">Jasa bulan ini</div><div class="n">${rpShort(jasaMonth)}</div><div class="sub">${monthDone.length} tiket.</div></div>
    </div>
    <div class="kanban">`;
    for (const col of COLS) {
      const items = act.filter(t => t.valetStatus === col.id);
      html += `<section class="col"><div class="col-head"><span>${col.label}</span><span class="count">${items.length}</span></div>
        ${items.length ? items.map(ticketCard).join("") : `<div class="empty">Kosong</div>`}
      </section>`;
    }
    html += `</div>`;
    document.getElementById("view").innerHTML = html;
    document.getElementById("btnHp").onclick = () => go("pegawai");
    document.getElementById("btnTerima").onclick = receiveKeys;
    document.querySelectorAll(".ticket").forEach(card => {
      const id = card.getAttribute("data-id");
      card.querySelector('[data-act="advance"]').onclick = () => advanceTicket(id);
      card.querySelector('[data-act="track"]').onclick = () => {
        const t = findTicket(id);
        if (t) go("lacak", t.kode);
      };
    });
  }

  function renderPegawai() {
    document.getElementById("view").innerHTML = `
      <div class="page-head"><div>
        <p class="eyebrow">HP petugas</p>
        <h1>Pilih pegawai</h1>
        <p>Roster lapangan · menunggu daftar final Septiawan. Leader: Saptahendra Septiansyah.</p>
      </div></div>
      <div class="staff-grid">
        ${STAFF.map(s => `
          <button class="staff-card ${s.id === state.activeStaffId ? "active" : ""}" type="button" data-sid="${s.id}">
            <div class="name">${esc(s.name)}</div>
            <div class="role">${esc(s.role)}</div>
            ${s.id === state.activeStaffId ? '<div style="margin-top:8px"><span class="pill teal">Aktif sekarang</span></div>' : ""}
          </button>`).join("")}
      </div>
      <div class="card" style="margin-top:14px">
        <h2>Absensi demo</h2>
        ${state.attendance.map(a => `
          <div class="list-row">
            <div><b>${esc(a.name)}</b><div style="font-size:12px;color:var(--mut)">${a.clockOut ? "Pulang " + fmtTime(a.clockOut) : "Masuk " + fmtTime(a.clockIn)} · ${esc(a.lokasi)}</div></div>
            <span class="pill ${a.clockOut ? "" : "ok"}">${a.clockOut ? "Selesai" : "Dinas"}</span>
          </div>`).join("") || '<div class="empty">Belum ada absensi.</div>'}
      </div>`;
    document.querySelectorAll("[data-sid]").forEach(btn => {
      btn.onclick = () => {
        state.activeStaffId = btn.getAttribute("data-sid");
        save();
        toast("Petugas: " + activeStaff().name);
        render();
      };
    });
  }

  function renderSlot() {
    const used = {};
    for (const t of activeTickets()) if (t.spotId) used[t.spotId] = t;
    document.getElementById("view").innerHTML = `
      <div class="page-head"><div>
        <p class="eyebrow">Denah</p>
        <h1>Peta slot</h1>
        <p>${Object.keys(used).length}/${SLOT_DEFS.length} terisi · ${esc(currentLokasi())}</p>
      </div></div>
      <div class="slots">
        ${SLOT_DEFS.map(s => {
          const t = used[s.code];
          return `<div class="slot ${t ? "busy" : "free"} ${s.vip ? "vip" : ""}">
            <div class="code">${s.code}</div>
            <div class="st">${s.type}${s.vip ? " · VIP" : ""} · ${t ? "Terisi" : "Kosong"}</div>
            ${t ? `<div class="who">${esc(t.plate)}</div><div class="st">${esc(t.staff)}</div>` : ""}
          </div>`;
        }).join("")}
      </div>`;
  }

  function renderTim() {
    const anoms = anomalies();
    const perf = state.tickets.filter(t => t.valetStatus === "selesai" && todayKey(new Date(t.checkOut)) === todayKey());
    const byStaff = {};
    for (const t of perf) {
      byStaff[t.staff] = byStaff[t.staff] || { n: 0, fee: 0, tip: 0 };
      byStaff[t.staff].n++; byStaff[t.staff].fee += t.fee; byStaff[t.staff].tip += t.tip || 0;
    }
    const weekDone = state.tickets.filter(t => t.valetStatus === "selesai" && minsBetween(t.checkOut) < 7 * 24 * 60);
    const shifts = ["pagi", "siang", "malam"].map(sh => {
      const n = weekDone.filter(t => t.shift === sh).length;
      const perDay = Math.round(n / 7);
      return { shift: sh, perDay, staff: perDay > 18 ? 2 : 1 };
    });

    document.getElementById("view").innerHTML = `
      <div class="page-head"><div>
        <p class="eyebrow">Owner & supervisor</p>
        <h1>Tim & kualitas</h1>
        <p>Absensi, booking, anomali, dan saran shift dari data 7 hari.</p>
      </div></div>
      <div class="grid2">
        <div class="card">
          <h2>Anomali sekarang</h2>
          ${anoms.length ? anoms.map(a => `<div class="list-row"><span style="color:var(--bad)">${esc(a.text)}</span></div>`).join("") : '<div class="empty">Tidak ada anomali.</div>'}
        </div>
        <div class="card">
          <h2>Absensi hari ini</h2>
          ${state.attendance.map(a => `
            <div class="list-row">
              <div><b>${esc(a.name)}</b><div style="font-size:12px;color:var(--mut)">Masuk ${fmtTime(a.clockIn)} WIB · ${esc(a.lokasi)}</div></div>
              <span class="pill ${a.clockOut ? "" : "teal"}">${a.clockOut ? "Selesai" : "Dinas"}</span>
            </div>`).join("")}
        </div>
      </div>
      <div class="card">
        <h2>Booking tamu</h2>
        ${state.bookings.map(b => `
          <div class="list-row">
            <div>
              <b>${esc(b.plate)}</b> · ${esc(b.guestName)}
              <div style="font-size:12px;color:var(--mut)">ETA ${fmtTime(b.eta)} · ${esc(b.note || "—")}</div>
            </div>
            ${b.status === "menunggu"
              ? `<button class="btn btn-primary btn-sm" type="button" data-accept="${b.id}">Terima di lobby</button>`
              : `<span class="pill teal">Diterima</span>`}
          </div>`).join("") || '<div class="empty">Belum ada booking.</div>'}
        <button class="btn btn-block" type="button" id="btnOpenBooking" style="margin-top:10px">Buka form booking tamu</button>
      </div>
      <div class="grid2">
        <div class="card">
          <h2>Performa hari ini</h2>
          ${Object.keys(byStaff).length
            ? `<table class="table"><thead><tr><th>Petugas</th><th>Tiket</th><th>Jasa</th><th>Tip</th></tr></thead><tbody>
                ${Object.entries(byStaff).map(([n, v]) => `<tr><td>${esc(n)}</td><td>${v.n}</td><td>${rp(v.fee)}</td><td>${rp(v.tip)}</td></tr>`).join("")}
              </tbody></table>`
            : '<div class="empty">Belum ada tiket selesai.</div>'}
        </div>
        <div class="card">
          <h2>Saran shift (7 hari)</h2>
          ${shifts.map(s => `
            <div class="list-row">
              <div><b>${shiftLabel(s.shift)}</b><div style="font-size:12px;color:var(--mut)">~${s.perDay} tiket/hari</div></div>
              <span class="pill">Perlu ${s.staff} petugas</span>
            </div>`).join("")}
        </div>
      </div>`;
    document.getElementById("btnOpenBooking").onclick = () => go("booking");
    document.querySelectorAll("[data-accept]").forEach(btn => {
      btn.onclick = () => {
        const b = state.bookings.find(x => x.id === btn.getAttribute("data-accept"));
        if (!b) return;
        b.status = "diterima";
        const ts = iso();
        state.tickets.unshift({
          id: uid("T"), kode: trackCode(), plate: b.plate, guestName: b.guestName, guestPhone: b.guestPhone,
          vehicleType: "mobil", fee: FEE, tip: 0, note: b.note || "",
          lokasi: b.lokasi || currentLokasi(),
          valetStatus: "lobby", spotId: null, staff: activeStaff().name,
          slaOverrideAlasan: "",
          checkIn: ts, parkedAt: null, calledAt: null, readyAt: null, checkOut: null,
          payment: null, shift: shiftOf(ts), events: [{ at: ts, label: "Booking diterima di lobby · " + (b.lokasi || currentLokasi()) }]
        });
        save();
        toast(b.plate + " masuk Lobby");
        render();
      };
    });
  }

  function periodTickets(period) {
    const done = state.tickets.filter(t => t.valetStatus === "selesai" && t.checkOut);
    const nowMs = now().getTime();
    if (period === "hari") return done.filter(t => todayKey(new Date(t.checkOut)) === todayKey());
    if (period === "7hari") return done.filter(t => nowMs - new Date(t.checkOut).getTime() < 7 * 86400000);
    // bulan
    const ym = todayKey().slice(0, 7);
    return done.filter(t => (t.checkOut || "").slice(0, 7) === ym || todayKey(new Date(t.checkOut)).slice(0, 7) === ym);
  }

  function renderLaporan(period) {
    period = period || renderLaporan._p || "hari";
    renderLaporan._p = period;
    const list = periodTickets(period);
    const jasa = list.reduce((s, t) => s + (t.fee || 0), 0);
    const tip = list.reduce((s, t) => s + (t.tip || 0), 0);
    const avg = list.length ? Math.round(list.reduce((s, t) => s + minsBetween(t.checkIn, t.checkOut), 0) / list.length) : 0;
    const byStaff = {};
    for (const t of list) {
      byStaff[t.staff] = byStaff[t.staff] || { n: 0, fee: 0, tip: 0 };
      byStaff[t.staff].n++; byStaff[t.staff].fee += t.fee; byStaff[t.staff].tip += (t.tip || 0);
    }
    const pay = { tunai: { n: 0, rp: 0 }, qris: { n: 0, rp: 0 }, kartu: { n: 0, rp: 0 } };
    const veh = { mobil: 0, box: 0 };
    const sh = { pagi: 0, siang: 0, malam: 0 };
    for (const t of list) {
      if (pay[t.payment]) { pay[t.payment].n++; pay[t.payment].rp += t.fee; }
      if (t.vehicleType === "box") veh.box++; else veh.mobil++;
      if (sh[t.shift] != null) sh[t.shift]++;
    }

    document.getElementById("view").innerHTML = `
      <div class="page-head">
        <div>
          <p class="eyebrow">${esc(COMPANY)}</p>
          <h1>Laporan valet</h1>
          <p>${esc(currentLokasi())} · multi-lokasi · filter & ekspor CSV / cetak</p>
        </div>
        <div class="btn-row">
          <button class="btn" type="button" id="btnCsv">CSV setoran</button>
          <button class="btn" type="button" id="btnPrint">Cetak</button>
        </div>
      </div>
      <div class="seg" id="lapSeg">
        <button type="button" data-p="hari" class="${period === "hari" ? "on" : ""}">Hari ini</button>
        <button type="button" data-p="7hari" class="${period === "7hari" ? "on" : ""}">7 hari</button>
        <button type="button" data-p="bulan" class="${period === "bulan" ? "on" : ""}">Bulan</button>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="label">Tiket selesai</div><div class="n">${list.length}</div><div class="sub">Periode terpilih</div></div>
        <div class="kpi"><div class="label">Kas (jasa_kas)</div><div class="n">${rpShort(jasa)}</div><div class="sub">${rp(jasa)} · masuk setoran</div></div>
        <div class="kpi"><div class="label">Tip (bukan kas)</div><div class="n">${rpShort(tip)}</div><div class="sub">${rp(tip)} · tidak disetor sebagai jasa</div></div>
        <div class="kpi"><div class="label">Rata-rata durasi</div><div class="n">${avg} <span style="font-size:14px">mnt</span></div><div class="sub">Check-in → selesai</div></div>
      </div>
      <div class="card">
        <h2>Per petugas</h2>
        ${Object.keys(byStaff).length
          ? `<table class="table"><thead><tr><th>Petugas</th><th>Tiket</th><th>Jasa</th><th>Tip</th></tr></thead><tbody>
              ${Object.entries(byStaff).map(([n, v]) => `<tr><td>${esc(n)}</td><td>${v.n}</td><td>${rp(v.fee)}</td><td>${rp(v.tip)}</td></tr>`).join("")}
            </tbody></table>`
          : '<div class="empty">Belum ada tiket selesai di periode ini.</div>'}
      </div>
      <div class="grid3">
        <div class="card"><h2>Pembayaran</h2>
          ${["tunai","qris","kartu"].map(k => `<div class="list-row"><span>${k.toUpperCase()}</span><b>${pay[k].n} · ${rp(pay[k].rp)}</b></div>`).join("")}
        </div>
        <div class="card"><h2>Jenis kendaraan</h2>
          <div class="list-row"><span>Mobil</span><b>${veh.mobil}</b></div>
          <div class="list-row"><span>Box / Pickup</span><b>${veh.box}</b></div>
        </div>
        <div class="card"><h2>Shift</h2>
          ${["pagi","siang","malam"].map(k => `<div class="list-row"><span>${shiftLabel(k)}</span><b>${sh[k]}</b></div>`).join("")}
        </div>
      </div>`;
    document.querySelectorAll("#lapSeg button").forEach(btn => {
      btn.onclick = () => renderLaporan(btn.getAttribute("data-p"));
    });
    document.getElementById("btnPrint").onclick = () => window.print();
    document.getElementById("btnCsv").onclick = () => downloadCsv(list, period);
  }

  function downloadCsv(list, period) {
    // Kolom selaras Excel setoran / Apps Script Transaksi
    const rows = [["timestamp","lokasi","event","id","plat","status","tamu","wa","slot","jenis","metode_bayar","jasa_kas","tip","total","petugas","shift","catatan","sla_override_alasan"]];
    for (const t of list) {
      const jasa = Number(t.fee || 0);
      const tip = Number(t.tip || 0);
      rows.push([
        t.checkOut || t.readyAt || t.checkIn || "",
        t.lokasi || currentLokasi(),
        "serahkan_bayar",
        t.id || t.kode || "",
        t.plate || "",
        "selesai",
        t.guestName || "",
        t.guestPhone || "",
        t.spotId || "",
        t.vehicleType || "",
        t.payment || "",
        jasa,
        tip,
        jasa + tip,
        t.staff || "",
        t.shift || "",
        t.note || "",
        t.slaOverrideAlasan || ""
      ]);
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "setoran-spotflow-kucindan-" + period + "-" + todayKey() + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("CSV setoran diunduh (jasa_kas ≠ tip)");
    syncEvent("export_setoran", {
      periode: period,
      kendaraan: list.length,
      omzet: list.reduce((s, t) => s + (t.fee || 0), 0),
      tip: list.reduce((s, t) => s + (t.tip || 0), 0),
      catatan: "export_csv_setoran"
    }, "Laporan");
  }

  function renderBooking() {
    document.getElementById("view").innerHTML = `
      <div class="page-head"><div>
        <p class="eyebrow">Tamu</p>
        <h1>Booking valet</h1>
        <p>Form reservasi untuk tamu ${esc(COMPANY)}.</p>
      </div></div>
      <div class="card" style="max-width:480px">
        <label>Plat nomor</label>
        <input id="bkPlate" placeholder="B 1234 ABC" style="text-transform:uppercase" />
        <label>Nama tamu</label>
        <input id="bkName" placeholder="Bapak / Ibu …" />
        <label>No. WhatsApp</label>
        <input id="bkPhone" placeholder="08…" />
        <label>ETA (jam lokal)</label>
        <input id="bkEta" type="datetime-local" />
        <label>Catatan</label>
        <textarea id="bkNote" rows="2" placeholder="Drop lobby, keperluan, …"></textarea>
        <button class="btn btn-primary btn-block" type="button" id="bkSave" style="margin-top:14px">Kirim booking</button>
      </div>`;
    const eta = document.getElementById("bkEta");
    const d = now();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset() + 60);
    eta.value = d.toISOString().slice(0, 16);
    document.getElementById("bkSave").onclick = () => {
      const plate = document.getElementById("bkPlate").value.trim().toUpperCase();
      const guestName = document.getElementById("bkName").value.trim();
      if (!plate || !guestName) { toast("Isi plat & nama"); return; }
      state.bookings.unshift({
        id: uid("B"), plate, guestName,
        guestPhone: document.getElementById("bkPhone").value.trim(),
        eta: new Date(document.getElementById("bkEta").value || Date.now()).toISOString(),
        note: document.getElementById("bkNote").value.trim(),
        status: "menunggu"
      });
      save();
      toast("Booking tersimpan");
      go("tim");
    };
  }

  function renderLacak() {
    const kode = (route.kode || "").trim().toUpperCase();
    let t = null;
    if (kode) t = state.tickets.find(x => x.kode.toUpperCase() === kode || x.plate.toUpperCase() === kode);
    document.getElementById("view").innerHTML = `
      <div class="page-head"><div>
        <p class="eyebrow">Lacak tamu</p>
        <h1>Status kendaraan</h1>
        <p>Masukkan kode lacak atau plat nomor.</p>
      </div></div>
      <div class="card" style="max-width:480px">
        <label>Kode / plat</label>
        <input id="lkQ" value="${esc(route.kode || "")}" placeholder="KC-XXXX atau B 1234 ABC" />
        <button class="btn btn-primary btn-block" type="button" id="lkGo" style="margin-top:12px">Lacak</button>
      </div>
      <div id="lkResult"></div>`;
    const show = (ticket) => {
      const box = document.getElementById("lkResult");
      if (!ticket) { box.innerHTML = '<div class="card empty">Tidak ditemukan. Cek kode / plat.</div>'; return; }
      const statusLabel = ({ lobby: "Di lobby", parkir: "Sedang parkir", dipanggil: "Sedang dipanggil", siap: "Siap di lobby", selesai: "Selesai" })[ticket.valetStatus] || ticket.valetStatus;
      box.innerHTML = `
        <div class="track-hero">
          <div class="plate">${esc(ticket.plate)}</div>
          <div style="margin-top:8px"><span class="pill teal">${esc(statusLabel)}</span></div>
          <div style="margin-top:8px;color:var(--mut);font-size:13px">Kode ${esc(ticket.kode)} · ${esc(ticket.guestName)}</div>
        </div>
        <div class="card">
          <h2>Timeline</h2>
          <div class="timeline">
            ${(ticket.events || []).map(e => `
              <div class="ev"><div class="t">${fmtTime(e.at)} WIB</div><div class="d">${esc(e.label)}</div></div>`).join("")}
          </div>
          ${ticket.spotId ? `<p style="font-size:13px;color:var(--mut)">Slot: <b>${esc(ticket.spotId)}</b> · Petugas: ${esc(ticket.staff)}</p>` : ""}
        </div>`;
    };
    document.getElementById("lkGo").onclick = () => {
      const q = document.getElementById("lkQ").value.trim();
      go("lacak", q);
    };
    if (kode) show(t);
  }

  function render() {
    parseRoute();
    setNavActive();
    renderTopbar();
    document.getElementById("sidebar").classList.remove("open");
    const pages = {
      operasi: renderOperasi,
      pegawai: renderPegawai,
      slot: renderSlot,
      tim: renderTim,
      laporan: () => renderLaporan(),
      booking: renderBooking,
      lacak: renderLacak
    };
    (pages[route.page] || renderOperasi)();
  }

  function bindShell() {
    document.querySelectorAll("[data-nav]").forEach(btn => {
      btn.onclick = () => {
        go(btn.getAttribute("data-nav"));
      };
    });
    document.getElementById("btnReset").onclick = openArchiveMenu;
    document.getElementById("btnResetMobile") && (document.getElementById("btnResetMobile").onclick = openArchiveMenu);
    const btnSettings = document.getElementById("btnSettings");
    if (btnSettings) btnSettings.onclick = openSettings;
    updateSyncChip();
    window.addEventListener("online", flushQueue);
    setTimeout(flushQueue, 1500);
    const locSel = document.getElementById("locSelect");
    if (locSel) {
      locSel.innerHTML = LOCS.map(l => `<option value="${l}">${l}</option>`).join("");
      locSel.value = currentLokasi();
      locSel.onchange = () => {
        state.activeLokasi = locSel.value;
        save();
        toast("Lokasi: " + locSel.value);
        render();
      };
    }
    document.getElementById("menuToggle").onclick = () => {
      document.getElementById("sidebar").classList.toggle("open");
    };
    document.getElementById("modalBg").addEventListener("click", e => {
      if (e.target.id === "modalBg") hideModal();
    });
    window.addEventListener("hashchange", render);
    setInterval(() => {
      document.getElementById("topClock").textContent = fmtTime() + " WIB";
    }, 15000);
  }

  document.addEventListener("DOMContentLoaded", () => {
    // support /lacak?kode= without hash
    const q = new URLSearchParams(location.search);
    if (q.get("kode") && !location.hash.includes("lacak")) {
      location.hash = "#/lacak?kode=" + encodeURIComponent(q.get("kode"));
    }
    if (!location.hash) location.hash = "#/operasi";
    bindShell();
    render();
  });
})();
