# SpotFlow Kucindan

Parkir + valet operasional **PT Kucindan Usaha Pratama**.

Live: https://rezhaeko-beep.github.io/kucindan-spotflow/

Vanilla HTML/CSS/JS · hash routes · `localStorage` cache · **Google Sheet = sumber kebenaran** setoran/events · PWA shell (`sw.js`).

## Lapangan — 3 langkah

1. **Buka app** di HP lapangan (Pages). Kanban mulai **kosong** (tanpa tiket demo). Pilih lokasi + petugas. Opsional: **📗 Buka shift**.
2. **Hubungkan Sheet** (sekali): deploy `apps-script/Code.gs` → Web App → tempel URL di **⚙️ Sheets sync** (token + sheetId sudah di-prefill dari `data/sheet-sync.json`). Lihat `docs/SHEET-SYNC.md`.
3. **Operasi**: Terima kunci → Parkirkan → Panggil → Siap → Serahkan & bayar. Semua event masuk antrian sync. HP kedua: **⬇️ Ambil dari Sheet** (atau auto-hydrate jika URL sudah ada). Tutup shift → baris Laporan + CSV.

Demo: sidebar **Arsip** → **🧪 Muat demo** (eksplisit saja).

## Halaman

| Route | Fitur |
|-------|--------|
| `#/operasi` | Kanban · buka/tutup shift · Ambil dari Sheet |
| `#/pegawai` | Roster Septiawan/Saptahendra (+ placeholder) |
| `#/slot` | Peta V-01…V-12 |
| `#/tim` | Anomali SLA, booking, shift, performa |
| `#/laporan` | KPI kas vs tip · CSV setoran · cetak |
| `#/ho` | Kantor HO · KPI · anomali · input cepat (Valet + Parkir gate) — tutorial: `docs/HO-TUTORIAL.md` |
| `#/booking` | Form tamu |
| `#/lacak?kode=` | Timeline |

## Tim IT notes

- **Lokasi:** MOP / Sate Maranggi / Lyma Brisket / Kalimalang / Pasar Minggu / …
- **Tip ≠ kas:** `jasa_kas` masuk setoran; `tip` terpisah
- **SLA:** lobby 12 mnt · panggil 8 mnt — override wajib alasan (`sla_override`)
- **Reset:** soft-archive (bukan wipe); wipe → kanban kosong
- **Events synced:** `terima_kunci`, `parkirkan`, `panggil`, `siap`, `serahkan_bayar`, `sla_override`, `archive`, `shift_open`, `shift_close`
- **Sheet sync:** `docs/SHEET-SYNC.md` + `apps-script/Code.gs` + `data/sheet-sync.json`

## Human still needed

Apps Script **Web App URL** after deploy (Execute as: Me · Anyone). Paste into Settings or `data/sheet-sync.json` `"url"`.
