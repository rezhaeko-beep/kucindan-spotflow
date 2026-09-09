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
  const DEFAULT_TOKEN = "spotflow-mop-2026";
  const DEFAULT_SHEET_ID = "1M3bBUqGgzP5VqTBz6Ujoy6n948RJIPAHKv874IWdj50";
  let cfg = loadCfg();
  let queue = loadQueue();
  /** UI flags for sync chip: syncing / hydrate fail (url empty handled via cfg). */
  let syncUi = { syncing: false, hydrateFail: false };


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
  function emptyState() {
    return {
      activeStaffId: "sapta-hendra",
      activeLokasi: SITE_DEFAULT,
      archive: [],
      tickets: [],
      bookings: [],
      attendance: [],
      shiftOpen: null
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY) || localStorage.getItem("spotflow_kucindan_v1");
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.tickets)) return normalizeState(s);
      }
    } catch (e) {}
    return emptyState();
  }
  function normalizeState(s) {
    if (!s.activeLokasi || !LOCS.includes(s.activeLokasi)) s.activeLokasi = SITE_DEFAULT;
    if (!STAFF.some(x => x.id === s.activeStaffId)) s.activeStaffId = "sapta-hendra";
    if (!Array.isArray(s.archive)) s.archive = [];
    if (!Array.isArray(s.bookings)) s.bookings = [];
    if (!Array.isArray(s.attendance)) s.attendance = [];
    if (s.shiftOpen === undefined) s.shiftOpen = null;
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
      if (c.url == null) c.url = "";
      return c;
    } catch (e) {
      return { url: "", token: DEFAULT_TOKEN, sheetId: DEFAULT_SHEET_ID };
    }
  }
  function saveCfg() {
    cfg._userSaved = true;
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }
  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(Q_KEY) || "[]"); } catch (e) { return []; }
  }
  function saveQueue() { localStorage.setItem(Q_KEY, JSON.stringify(queue)); }

  function ticketSyncRow(t, extra) {
    return Object.assign({
      id: (t && (t.id || t.kode)) || "",
      plat: (t && t.plate) || "",
      status: (t && t.valetStatus) || "",
      tamu: (t && t.guestName) || "",
      wa: (t && t.guestPhone) || "",
      slot: (t && t.spotId) || "",
      jenis: (t && t.vehicleType) || "",
      metode_bayar: (t && t.payment) || "",
      jasa_kas: t ? (t.fee || 0) : 0,
      tip: t ? (t.tip || 0) : 0,
      total: t ? ((t.fee || 0) + (t.tip || 0)) : 0,
      petugas: (t && t.staff) || ((activeStaff() && activeStaff().name) || ""),
      shift: (t && t.shift) || shiftOf(),
      catatan: (t && t.note) || "",
      sla_override_alasan: (t && t.slaOverrideAlasan) || ""
    }, extra || {});
  }
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
  async function postSheets(payload, opts) {
    opts = opts || {};
    if (!cfg.url || !cfg.token) {
      updateSyncChip();
      return { ok: false, skipped: true };
    }
    const Sync = window.SpotFlowSync;
    if (Sync && Sync.postSheets) {
      const r = await Sync.postSheets(cfg, payload, { noQueue: !!opts.noQueue });
      if (!r.ok && !r.skipped && !opts.noQueue) {
        queue = Sync.loadQueue();
        saveQueue();
      }
      updateSyncChip();
      return r;
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
      if (!opts.noQueue) {
        queue.push({ at: iso(), payload, tries: 0 });
        saveQueue();
      }
      updateSyncChip();
      return { ok: false, error: String(err) };
    }
  }
  async function syncEvent(event, row, tab) {
    const payload = syncPayload(event, row, tab);
    // Always enqueue first so offline/no-cors losses still retry via flush
    if (cfg.url && cfg.token) {
      const already = queue.some(q => q.payload && q.payload.event === event &&
        q.payload.row && row && q.payload.row.id === row.id && q.payload.row.timestamp === payload.row.timestamp);
      if (!already) {
        queue.push({ at: iso(), payload, tries: 0 });
        saveQueue();
      }
    }
    const r = await postSheets(payload, { noQueue: true });
    if (r.skipped) { updateSyncChip(); return; }
    if (r.ok) {
      // drop matching queued item on success
      queue = queue.filter(q => q.payload !== payload);
      saveQueue();
      updateSyncChip();
    } else {
      updateSyncChip();
    }
  }
  async function flushQueue() {
    if (!cfg.url || !String(cfg.url).trim() || !cfg.token) { updateSyncChip(); return; }
    const Sync = window.SpotFlowSync;
    if (Sync && Sync.flushQueue) {
      syncUi.syncing = true;
      updateSyncChip();
      try {
        Sync.saveQueue(queue);
        const r = await Sync.flushQueue(cfg, (left) => { queue = left; updateSyncChip(); });
        queue = Sync.loadQueue();
        saveQueue();
        if (queue.length || r.sent) toast(queue.length ? ("Antrian sisa " + queue.length) : "Antrian terkirim");
      } finally {
        syncUi.syncing = false;
        updateSyncChip();
      }
      return;
    }
    if (!queue.length) { updateSyncChip(); return; }
    const left = [];
    for (const item of queue) {
      const tries = (item.tries || 0) + 1;
      const r = await postSheets(item.payload, { noQueue: true });
      if (!r.ok && tries < 5) left.push(Object.assign({}, item, { tries }));
    }
    queue = left; saveQueue(); updateSyncChip();
    toast(left.length ? ("Antrian sisa " + left.length) : "Antrian terkirim");
  }
  function updateSyncChip() {
    const el = document.getElementById("syncChip");
    const top = document.getElementById("syncChipTop");
    const set = (node) => {
      if (!node) return;
      if (!cfg.url || !String(cfg.url).trim() || !cfg.token) {
        node.textContent = "Sheets: lokal saja";
        node.className = "sync-chip warn";
      } else if (queue.length) {
        node.textContent = "Sheets: antrian " + queue.length;
        node.className = "sync-chip warn";
      } else if (syncUi.syncing) {
        node.textContent = "Sheets: sinkron…";
        node.className = "sync-chip warn";
      } else if (syncUi.hydrateFail) {
        node.textContent = "Sheets: hydrate gagal";
        node.className = "sync-chip warn";
      } else {
        node.textContent = "Sheets: OK";
        node.className = "sync-chip ok";
      }
    };
    set(el); set(top);
    if (top) {
      const show = !cfg.url || !String(cfg.url).trim() || queue.length || syncUi.syncing || syncUi.hydrateFail;
      top.style.display = show ? "" : "none";
    }
  }

  async function hydrateFromSheet(opts) {
    opts = opts || {};
    const Sync = window.SpotFlowSync;
    if (!cfg.url || !String(cfg.url).trim() || !cfg.token) {
      syncUi.hydrateFail = false;
      syncUi.syncing = false;
      updateSyncChip();
      if (!opts.silent) toast("Sheets: lokal saja — isi Web App URL dulu");
      return { ok: false, skipped: true };
    }
    if (!Sync || !Sync.listFromSheet) {
      if (!opts.silent) toast("Modul sync belum siap");
      return { ok: false };
    }
    syncUi.syncing = true;
    syncUi.hydrateFail = false;
    updateSyncChip();
    try {
      const r = await Sync.listFromSheet(cfg, {
        tab: "Transaksi",
        lokasi: currentLokasi(),
        limit: 50,
        retries: 2
      });
      if (!r.ok) {
        if (r.skipped) {
          syncUi.hydrateFail = false;
          updateSyncChip();
          return r;
        }
        syncUi.hydrateFail = true;
        updateSyncChip();
        if (!opts.silent) toast("Gagal ambil Sheet: " + (r.error || "cors/deploy?"));
        return r;
      }
      const merged = Sync.mergeHydrate(state.tickets, r.rows, currentLokasi());
      state.tickets = merged.tickets;
      save();
      syncUi.hydrateFail = false;
      if (!opts.silent) toast(merged.added ? ("Sheet: +" + merged.added + " tiket aktif") : "Sheet: tidak ada tiket baru");
      if (merged.added) render();
      return { ok: true, added: merged.added };
    } finally {
      syncUi.syncing = false;
      updateSyncChip();
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
      syncEvent("sla_override", ticketSyncRow(t, {
        status: t.valetStatus,
        catatan: overrideAlasan,
        sla_override_alasan: t.slaOverrideAlasan
      }));
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
    let syncName = null;
    if (col.next === "dipanggil") {
      t.calledAt = ts;
      t.events.push({ at: ts, label: "Dipanggil — petugas menuju slot" });
      syncName = "panggil";
    }
    if (col.next === "siap") {
      t.readyAt = ts;
      t.events.push({ at: ts, label: "Siap di lobby" });
      syncName = "siap";
    }
    t.valetStatus = col.next;
    save();
    if (syncName) syncEvent(syncName, ticketSyncRow(t));
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
      syncEvent("parkirkan", ticketSyncRow(t));
      render();
    };
  }

  function openPayModal(t) {
    payDraft = t;
    showModal(`
      <h3>Serahkan & bayar</h3>
      <p style="margin:0 0 4px;font-weight:800;font-size:20px">${esc(t.plate)}</p>
      <p style="margin:0 0 12px;color:var(--mut);font-size:13px">${esc(t.guestName)} · ${durLabel(minsBetween(t.checkIn))} · ${esc(t.kode)}</p>
      <label>Jasa valet <span style="color:var(--teal-d)">(masuk kas / setoran)</span></label>
      <input id="payFee" type="number" min="0" step="1000" value="${t.fee}" />
      <label>Tip petugas <span style="color:#b45309">(opsional · bukan kas perusahaan)</span></label>
      <input id="payTip" type="number" min="0" step="1000" value="${t.tip || 0}" />
      <div class="pay-split" id="paySplit">
        <div class="cell kas"><div class="lbl">Jasa → kas</div><div class="val" id="payKasVal">${rp(t.fee)}</div></div>
        <div class="cell tip"><div class="lbl">Tip petugas</div><div class="val" id="payTipVal">${rp(t.tip || 0)}</div></div>
        <div class="hint">Tip tidak masuk setoran jasa. Total ditagih ke tamu = jasa + tip.</div>
      </div>
      <div class="pay-total"><span>Total tagihan</span><span id="payTotalVal">${rp((t.fee || 0) + (t.tip || 0))}</span></div>
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
    const refreshPay = () => {
      const fee = Number(document.getElementById("payFee").value) || 0;
      const tip = Number(document.getElementById("payTip").value) || 0;
      document.getElementById("payKasVal").textContent = rp(fee);
      document.getElementById("payTipVal").textContent = rp(tip);
      document.getElementById("payTotalVal").textContent = rp(fee + tip);
    };
    document.getElementById("payFee").oninput = refreshPay;
    document.getElementById("payTip").oninput = refreshPay;
    document.getElementById("payCancel").onclick = hideModal;
    document.getElementById("payOk").onclick = () => {
      const fee = Number(document.getElementById("payFee").value) || t.fee;
      const tip = Number(document.getElementById("payTip").value) || 0;
      const payment = document.getElementById("payMethod").value;
      const ts = iso();
      t.fee = fee; t.tip = tip; t.payment = payment;
      t.checkOut = ts; t.valetStatus = "selesai";
      t.events.push({ at: ts, label: "Diserahkan & dibayar (" + payment + ") · jasa " + rp(fee) + " · tip " + rp(tip) });
      save();
      hideModal();
      toast(t.plate + " selesai · kas " + rp(fee) + (tip ? " · tip " + rp(tip) : ""));
      syncEvent("serahkan_bayar", ticketSyncRow(t, {
        status: "selesai",
        metode_bayar: payment,
        jasa_kas: fee,
        tip: tip,
        total: fee + tip
      }));
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
      syncEvent("terima_kunci", ticketSyncRow(t));
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
    syncEvent("archive", {
      id: "archive-" + Date.now(),
      status: "arsip",
      catatan: done.length + " tiket",
      jasa_kas: done.reduce((s, t) => s + (t.fee || 0), 0),
      tip: done.reduce((s, t) => s + (t.tip || 0), 0),
      total: done.reduce((s, t) => s + (t.fee || 0) + (t.tip || 0), 0)
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
    const fresh = emptyState();
    fresh.archive = archive;
    fresh.activeLokasi = SITE_DEFAULT;
    state = fresh;
    save();
    toast("Data di-wipe · kanban kosong · arsip pre-wipe tersimpan");
    render();
  }

  function loadDemoData() {
    if (!confirm("Muat data demo? Tiket aktif saat ini akan diganti contoh demo (roster & lokasi tetap).")) return;
    const loc = currentLokasi();
    const staffId = state.activeStaffId;
    const archive = Array.isArray(state.archive) ? state.archive.slice() : [];
    const fresh = seed();
    fresh.activeLokasi = loc;
    fresh.activeStaffId = staffId;
    fresh.archive = archive;
    fresh.shiftOpen = state.shiftOpen || null;
    state = fresh;
    save();
    toast("Demo dimuat · " + state.tickets.filter(t => t.valetStatus !== "selesai").length + " tiket aktif");
    render();
  }

  function openArchiveMenu() {
    const nDone = state.tickets.filter(t => t.valetStatus === "selesai").length;
    const nArch = Array.isArray(state.archive) ? state.archive.length : 0;
    const nAct = activeTickets().length;
    showModal(`
      <h3>Arsip & data</h3>
      <p style="font-size:13px;color:var(--mut);margin:0 0 12px">Produksi mulai kosong. Soft-archive: tiket selesai ke arsip. Demo hanya via tombol eksplisit.</p>
      <p style="font-size:13px;margin:0 0 10px"><b>${nAct}</b> aktif · <b>${nDone}</b> selesai · <b>${nArch}</b> batch arsip</p>
      <button class="btn btn-primary btn-block" type="button" id="archDone">🗂️ Arsipkan tiket selesai</button>
      <button class="btn btn-block" type="button" id="archDemo" style="margin-top:8px">🧪 Muat demo</button>
      <button class="btn btn-block" type="button" id="archHydrate" style="margin-top:8px">⬇️ Ambil dari Sheet</button>
      <button class="btn btn-block" type="button" id="archSettings" style="margin-top:8px">⚙️ Pengaturan Sheets</button>
      <button class="btn btn-block" type="button" id="archWipe" style="margin-top:8px;color:var(--bad)">⚠️ Wipe semua (konfirmasi)</button>
      <button class="btn btn-block" type="button" id="archClose" style="margin-top:8px">Tutup</button>
    `);
    document.getElementById("archDone").onclick = () => { hideModal(); archiveCompletedTickets(); };
    document.getElementById("archDemo").onclick = () => { hideModal(); loadDemoData(); };
    document.getElementById("archHydrate").onclick = () => { hideModal(); hydrateFromSheet(); };
    document.getElementById("archSettings").onclick = () => { hideModal(); openSettings(); };
    document.getElementById("archWipe").onclick = () => { hideModal(); wipeAllConfirm(); };
    document.getElementById("archClose").onclick = hideModal;
  }

  function openSettings() {
    showModal(`
      <h3>Pengaturan Sheets</h3>
      <p style="font-size:13px;color:var(--mut);margin:0 0 10px">Sheet = sumber kebenaran setoran/events. Prefill dari <code>data/sheet-sync.json</code>; localStorage menang jika sudah disimpan. URL Web App wajib setelah deploy Apps Script. Lihat docs/SHEET-SYNC.md.</p>
      <label>Web App URL</label>
      <input id="cfgUrl" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(cfg.url || "")}" />
      <label>Token rahasia</label>
      <input id="cfgToken" placeholder="spotflow-mop-2026" value="${esc(cfg.token || "")}" />
      <label>Spreadsheet ID</label>
      <input id="cfgSheetId" placeholder="1M3bBUqGgzP5VqTBz6Ujoy6n948RJIPAHKv874IWdj50" value="${esc(cfg.sheetId || "")}" />
      <p id="cfgStatus" style="font-size:12px;color:var(--mut);margin:8px 0">Antrian: ${queue.length}${cfg.url ? " · URL OK" : " · URL kosong (deploy dulu)"}</p>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button class="btn" type="button" id="btnTestSync">Tes koneksi</button>
        <button class="btn btn-primary" type="button" id="btnSaveCfg">Simpan</button>
        <button class="btn" type="button" id="btnRetryQueue">Kirim ulang antrian</button>
        <button class="btn" type="button" id="btnHydrateCfg">Ambil dari Sheet</button>
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
      updateSyncChip();
      const Sync = window.SpotFlowSync;
      if (!cfg.url) {
        toast("Sheets: lokal saja — isi Web App URL dulu");
        return;
      }
      syncUi.syncing = true;
      updateSyncChip();
      try {
        if (Sync && Sync.ping) {
          const r = await Sync.ping(cfg);
          if (r.skipped) toast("Sheets: lokal saja");
          else if (r.ok) toast(r.opaque ? "Tes dikirim (opaque/no-cors)" : "Ping OK");
          else toast("Ping gagal soft: " + (r.error || "?"));
        } else {
          const u = cfg.url + (cfg.url.includes("?") ? "&" : "?") + "action=ping&token=" + encodeURIComponent(cfg.token || "");
          await fetch(u, { method: "GET", mode: "no-cors" });
          toast("Tes dikirim (cek Spreadsheet / log Apps Script)");
        }
      } catch (e) { toast("Gagal: " + e); }
      finally {
        syncUi.syncing = false;
        updateSyncChip();
      }
    };
    document.getElementById("btnRetryQueue").onclick = () => flushQueue();
    document.getElementById("btnHydrateCfg").onclick = () => { hideModal(); hydrateFromSheet(); };
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

  /* ---------- shift open/close ---------- */
  function openShift() {
    const petugas = activeStaff().name;
    const lokasi = currentLokasi();
    if (state.shiftOpen && state.shiftOpen.open) {
      toast("Shift sudah terbuka · " + (state.shiftOpen.petugas || ""));
      return;
    }
    state.shiftOpen = { open: true, lokasi, petugas, openedAt: iso(), shift: shiftOf() };
    save();
    syncEvent("shift_open", {
      id: "shift-" + Date.now(),
      status: "shift_open",
      petugas,
      shift: shiftOf(),
      catatan: "buka shift · " + lokasi
    }, "Absensi");
    toast("Shift dibuka · " + lokasi + " · " + petugas);
    render();
  }
  function closeShift() {
    if (!state.shiftOpen || !state.shiftOpen.open) {
      toast("Belum ada shift terbuka");
      return;
    }
    const opened = state.shiftOpen;
    const todayDone = state.tickets.filter(t => t.valetStatus === "selesai" && todayKey(new Date(t.checkOut)) === todayKey() && (t.lokasi || currentLokasi()) === currentLokasi());
    const omzet = todayDone.reduce((s, t) => s + (t.fee || 0), 0);
    const tip = todayDone.reduce((s, t) => s + (t.tip || 0), 0);
    const catatan = "tutup shift · dibuka " + fmtTime(opened.openedAt) + " · " + (opened.petugas || "");
    syncEvent("shift_close", {
      periode: todayKey() + " " + (opened.shift || shiftOf()),
      kendaraan: todayDone.length,
      omzet,
      tip,
      catatan
    }, "Laporan");
    state.shiftOpen = Object.assign({}, opened, { open: false, closedAt: iso() });
    save();
    toast("Shift ditutup · " + todayDone.length + " tiket · kas " + rpShort(omzet));
    if (confirm("Unduh CSV setoran shift hari ini?")) {
      downloadCsv(todayDone, "shift");
    }
    render();
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
    const breach = ticketSlaBreach(t);
    const slaClass = breach ? (breach.kind === "dipanggil" ? "sla-bad" : "sla-warn") : "";
    const slaPill = breach
      ? `<div class="sla-pill"><span class="pill ${breach.kind === "dipanggil" ? "bad" : "warn"}">SLA +${breach.mins - (breach.kind === "lobby" ? SLA_LOBBY : SLA_PANGGIL)} mnt</span></div>`
      : "";
    const spotBit = t.spotId ? " · " + esc(t.spotId) : "";

    return `<article class="ticket ${slaClass}" data-id="${t.id}" id="ticket-${t.id}">
      <div class="top">
        <div class="plate">${esc(t.plate)}</div>
        <div class="price">${rp(t.fee)}</div>
      </div>
      <div class="kode">${esc(t.kode)}${spotBit} · <span class="pill teal">${esc(t.lokasi || currentLokasi())}</span></div>
      <div class="meta">${esc(t.guestName)}${t.guestPhone ? " · " + esc(t.guestPhone) : ""}<br/>${meta}</div>
      ${t.note ? `<div class="note">${esc(t.note)}</div>` : ""}
      ${slaPill}
      <div class="actions">
        <button class="btn btn-primary btn-sm btn-block" type="button" data-act="advance">${esc(col ? col.action : "Lanjut")}</button>
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

    const shOpen = state.shiftOpen && state.shiftOpen.open;
    const shLabel = shOpen
      ? ("Shift buka · " + (state.shiftOpen.petugas || st.name) + " · " + fmtTime(state.shiftOpen.openedAt))
      : "Shift belum dibuka";
    let html = `
      <div class="page-head">
        <div>
          <p class="eyebrow">SpotFlow · ${esc(currentLokasi())}</p>
          <h1>Operasi valet</h1>
          <p>${esc(currentLokasi())} · ${esc(st.name)} · ${used}/${SLOT_DEFS.length} slot · ${esc(shLabel)}</p>
        </div>
        <div class="btn-row">
          <button class="btn" type="button" id="btnHp">HP petugas</button>
          <button class="btn" type="button" id="btnHydrate">⬇️ Ambil dari Sheet</button>
          ${shOpen
            ? '<button class="btn" type="button" id="btnShiftClose">📕 Tutup shift</button>'
            : '<button class="btn" type="button" id="btnShiftOpen">📗 Buka shift</button>'}
          <button class="btn btn-primary" type="button" id="btnTerima">🔑 Terima kunci</button>
        </div>
      </div>`;
    if (anoms.length) {
      html += `<div class="alert-bar" id="anomBar">${anoms.map(a => `<button type="button" class="chip" data-anom="${esc(a.id)}">${esc(a.text)}</button>`).join("")}</div>`;
    }
    html += `<div class="kpis">
      <div class="kpi"><div class="label">Valet aktif</div><div class="n">${act.length}</div><div class="sub">Kunci masih di pos.</div></div>
      <div class="kpi"><div class="label kas">Jasa hari ini</div><div class="n">${rpShort(jasaToday)}</div><div class="sub">${todayDone.length} tiket selesai · masuk setoran</div></div>
      <div class="kpi"><div class="label tip">Tip petugas</div><div class="n">${rpShort(tipToday)}</div><div class="sub">Tidak masuk kas perusahaan</div></div>
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
    const bh = document.getElementById("btnHydrate");
    if (bh) bh.onclick = () => hydrateFromSheet();
    const bso = document.getElementById("btnShiftOpen");
    if (bso) bso.onclick = openShift;
    const bsc = document.getElementById("btnShiftClose");
    if (bsc) bsc.onclick = closeShift;
    document.querySelectorAll(".ticket").forEach(card => {
      const id = card.getAttribute("data-id");
      card.querySelector('[data-act="advance"]').onclick = () => advanceTicket(id);
      card.querySelector('[data-act="track"]').onclick = () => {
        const t = findTicket(id);
        if (t) go("lacak", t.kode);
      };
    });
    document.querySelectorAll("#anomBar [data-anom]").forEach(chip => {
      chip.onclick = () => {
        const el = document.getElementById("ticket-" + chip.getAttribute("data-anom"));
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.style.outline = "2px solid var(--warn)";
          setTimeout(() => { el.style.outline = ""; }, 1600);
        }
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

    const shOpenTim = state.shiftOpen && state.shiftOpen.open;
    document.getElementById("view").innerHTML = `
      <div class="page-head">
        <div>
          <p class="eyebrow">Owner & supervisor</p>
          <h1>Tim & kualitas</h1>
          <p>Absensi, booking, anomali, saran shift · ${shOpenTim ? "shift terbuka" : "shift tutup"}.</p>
        </div>
        <div class="btn-row">
          ${shOpenTim
            ? '<button class="btn" type="button" id="btnShiftCloseTim">📕 Tutup shift</button>'
            : '<button class="btn" type="button" id="btnShiftOpenTim">📗 Buka shift</button>'}
          <button class="btn" type="button" id="btnHydrateTim">⬇️ Ambil dari Sheet</button>
        </div>
      </div>
      <div class="grid2">
        <div class="card">
          <h2>Anomali sekarang</h2>
          ${anoms.length ? anoms.map(a => `
            <button type="button" class="anom-card ${a.tone === "warn" ? "warn" : ""}" data-go-ticket="${esc(a.id)}">
              <div class="ttl">${esc(a.text)}</div>
              <div class="sub">${a.tone === "danger" ? "SLA panggil terlampaui · wajib alasan override" : "SLA lobby terlampaui · pantau / override"}</div>
            </button>`).join("") : '<div class="empty">Tidak ada anomali.</div>'}
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
              <div style="font-size:12px;color:var(--mut)">ETA ${fmtTime(b.eta)} · ${esc(b.lokasi || currentLokasi())} · ${esc(b.note || "—")}</div>
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
    const sot = document.getElementById("btnShiftOpenTim");
    if (sot) sot.onclick = openShift;
    const sct = document.getElementById("btnShiftCloseTim");
    if (sct) sct.onclick = closeShift;
    const ht = document.getElementById("btnHydrateTim");
    if (ht) ht.onclick = () => hydrateFromSheet();
    document.querySelectorAll("[data-go-ticket]").forEach(btn => {
      btn.onclick = () => {
        go("operasi");
        setTimeout(() => {
          const el = document.getElementById("ticket-" + btn.getAttribute("data-go-ticket"));
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.style.outline = "2px solid var(--bad)";
            setTimeout(() => { el.style.outline = ""; }, 1800);
          }
        }, 120);
      };
    });
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
        const nt = state.tickets[0];
        if (nt) syncEvent("terima_kunci", ticketSyncRow(nt, { catatan: "dari_booking" }));
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
        <div class="kpi"><div class="label kas">Jasa valet</div><div class="n">${rpShort(jasa)}</div><div class="sub">${rp(jasa)} · masuk setoran (jasa_kas)</div></div>
        <div class="kpi"><div class="label tip">Tip petugas</div><div class="n">${rpShort(tip)}</div><div class="sub">${rp(tip)} · tidak masuk kas</div></div>
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
    // Kolom SpotFlow + alias Folder 04 (Omzet/Setor Tunai+Nontunai; tip terpisah)
    const rows = [["timestamp","lokasi","event","id","plat","status","tamu","wa","slot","jenis","metode_bayar","jasa_kas","tip","total","Omzet","Tip","Setor_Tunai","Setor_Nontunai","petugas","shift","catatan","sla_override_alasan"]];
    for (const t of list) {
      const jasa = Number(t.fee || 0);
      const tip = Number(t.tip || 0);
      const pay = String(t.payment || "").toLowerCase();
      const tunai = /tunai|cash/.test(pay) ? jasa : 0;
      const nontunai = jasa - tunai;
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
        jasa,
        tip,
        tunai,
        nontunai,
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
    toast("CSV setoran diunduh (Omzet=jasa_kas · Tip terpisah · Setor≠tip)");
    syncEvent("export_setoran", {
      periode: period,
      kendaraan: list.length,
      omzet: list.reduce((s, t) => s + (t.fee || 0), 0),
      tip: list.reduce((s, t) => s + (t.tip || 0), 0),
      catatan: "export_csv_setoran"
    }, "Laporan");
  }

  function renderBooking() {
    const pending = state.bookings.filter(b => b.status === "menunggu").length;
    document.getElementById("view").innerHTML = `
      <div class="page-head">
        <div>
          <p class="eyebrow">Tamu</p>
          <h1>Booking valet</h1>
          <p>Reservasi tamu ${esc(COMPANY)} · ${pending} menunggu di Tim.</p>
        </div>
        <div class="btn-row">
          <button class="btn" type="button" id="bkToTim">Lihat di Tim</button>
        </div>
      </div>
      <div class="card" style="max-width:520px">
        <label class="booking-loc">Lokasi</label>
        <select id="bkLokasi">${LOCS.map(l => `<option value="${esc(l)}" ${l === currentLokasi() ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
        <label>Plat nomor</label>
        <input id="bkPlate" placeholder="B 1234 ABC" style="text-transform:uppercase" autocomplete="off" />
        <label>Nama tamu</label>
        <input id="bkName" placeholder="Bapak / Ibu …" />
        <label>No. WhatsApp</label>
        <input id="bkPhone" placeholder="08…" inputmode="tel" />
        <label>ETA (jam lokal)</label>
        <input id="bkEta" type="datetime-local" />
        <label>Catatan drop / keperluan</label>
        <textarea id="bkNote" rows="2" placeholder="Drop lobby utara, rapat Lt. …"></textarea>
        <button class="btn btn-primary btn-block" type="button" id="bkSave" style="margin-top:14px">Kirim booking</button>
      </div>`;
    document.getElementById("bkToTim").onclick = () => go("tim");
    const eta = document.getElementById("bkEta");
    const d = now();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset() + 60);
    eta.value = d.toISOString().slice(0, 16);
    document.getElementById("bkSave").onclick = () => {
      const plate = document.getElementById("bkPlate").value.trim().toUpperCase();
      const guestName = document.getElementById("bkName").value.trim();
      if (!plate || !guestName) { toast("Isi plat & nama"); return; }
      const lokasi = document.getElementById("bkLokasi").value || currentLokasi();
      state.bookings.unshift({
        id: uid("B"), plate, guestName,
        guestPhone: document.getElementById("bkPhone").value.trim(),
        eta: new Date(document.getElementById("bkEta").value || Date.now()).toISOString(),
        note: document.getElementById("bkNote").value.trim(),
        lokasi,
        status: "menunggu"
      });
      save();
      toast("Booking tersimpan · " + lokasi);
      go("tim");
    };
  }

  function trackUrlFor(kode) {
    const base = location.href.split("#")[0].split("?")[0];
    return base + "?kode=" + encodeURIComponent(kode) + "#/lacak?kode=" + encodeURIComponent(kode);
  }

  function renderLacak() {
    const kode = (route.kode || "").trim().toUpperCase();
    let t = null;
    if (kode) t = state.tickets.find(x => x.kode.toUpperCase() === kode || x.plate.toUpperCase() === kode);
    document.getElementById("view").innerHTML = `
      <div class="page-head"><div>
        <p class="eyebrow">Lacak tamu</p>
        <h1>Status kendaraan</h1>
        <p>Kode lacak / plat · bagikan QR ke tamu.</p>
      </div></div>
      <div class="card" style="max-width:520px">
        <label>Kode / plat</label>
        <input id="lkQ" value="${esc(route.kode || "")}" placeholder="KC-XXXX atau B 1234 ABC" />
        <button class="btn btn-primary btn-block" type="button" id="lkGo" style="margin-top:12px">Lacak</button>
      </div>
      <div id="lkResult"></div>`;
    const show = (ticket) => {
      const box = document.getElementById("lkResult");
      if (!ticket) { box.innerHTML = '<div class="card empty">Tidak ditemukan. Cek kode / plat.</div>'; return; }
      const statusLabel = ({ lobby: "Di lobby", parkir: "Sedang parkir", dipanggil: "Sedang dipanggil", siap: "Siap di lobby", selesai: "Selesai" })[ticket.valetStatus] || ticket.valetStatus;
      const url = trackUrlFor(ticket.kode);
      const qrSrc = "https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=" + encodeURIComponent(url);
      const wa = "https://wa.me/?text=" + encodeURIComponent("Lacak valet " + ticket.plate + " (" + ticket.kode + "): " + url);
      box.innerHTML = `
        <div class="track-hero">
          <div class="plate">${esc(ticket.plate)}</div>
          <div style="margin-top:8px"><span class="pill teal">${esc(statusLabel)}</span>
            ${ticket.lokasi ? ' <span class="pill">' + esc(ticket.lokasi) + '</span>' : ""}</div>
          <div style="margin-top:8px;color:var(--mut);font-size:13px">Kode ${esc(ticket.kode)} · ${esc(ticket.guestName)}</div>
        </div>
        <div class="track-qr">
          <img src="${qrSrc}" alt="QR lacak ${esc(ticket.kode)}" width="160" height="160" loading="lazy" />
          <div class="track-url">${esc(url)}</div>
          <div class="btn-row" style="justify-content:center">
            <button class="btn btn-sm" type="button" id="lkCopy">Salin link</button>
            <a class="btn btn-sm btn-primary" id="lkWa" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>
          </div>
        </div>
        <div class="card">
          <h2>Timeline</h2>
          <div class="timeline">
            ${(ticket.events || []).map(e => `
              <div class="ev"><div class="t">${fmtTime(e.at)} WIB</div><div class="d">${esc(e.label)}</div></div>`).join("")}
          </div>
          ${ticket.spotId ? `<p style="font-size:13px;color:var(--mut)">Slot: <b>${esc(ticket.spotId)}</b> · Petugas: ${esc(ticket.staff)}</p>` : ""}
        </div>`;
      const copyBtn = document.getElementById("lkCopy");
      if (copyBtn) copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast("Link lacak disalin");
        } catch (e) {
          toast(url);
        }
      };
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

  async function applySheetSyncFile() {
    const Sync = window.SpotFlowSync;
    if (!Sync || !Sync.loadSheetSyncDefaults) return;
    const merged = await Sync.loadSheetSyncDefaults();
    const saved = Sync.loadLocalCfg();
    // Keep localStorage if user saved OR already has a Web App URL
    const keepLocal = !!(saved && (saved._userSaved || (saved.url && String(saved.url).trim())));
    if (keepLocal) {
      cfg.url = saved.url != null ? saved.url : "";
      cfg.token = saved.token || merged.token || DEFAULT_TOKEN;
      cfg.sheetId = saved.sheetId || merged.sheetId || DEFAULT_SHEET_ID;
      cfg._userSaved = !!saved._userSaved;
    } else {
      cfg.url = merged.url || "";
      cfg.token = merged.token || DEFAULT_TOKEN;
      cfg.sheetId = merged.sheetId || DEFAULT_SHEET_ID;
      localStorage.setItem(CFG_KEY, JSON.stringify({
        url: cfg.url, token: cfg.token, sheetId: cfg.sheetId
      }));
    }
    updateSyncChip();
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
        if (cfg.url) hydrateFromSheet({ silent: true });
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
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    // support /lacak?kode= without hash
    const q = new URLSearchParams(location.search);
    if (q.get("kode") && !location.hash.includes("lacak")) {
      location.hash = "#/lacak?kode=" + encodeURIComponent(q.get("kode"));
    }
    if (!location.hash) location.hash = "#/operasi";
    await applySheetSyncFile();
    bindShell();
    render();
    // auto-hydrate from Sheet when URL configured (second phone / field)
    if (cfg.url && cfg.token) {
      setTimeout(() => hydrateFromSheet({ silent: true }), 800);
    }
  });
})();
