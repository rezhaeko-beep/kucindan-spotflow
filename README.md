# SpotFlow Kucindan

Parkir + valet operasional **PT Kucindan Usaha Pratama**.

Live: https://rezhaeko-beep.github.io/kucindan-spotflow/

Vanilla HTML/CSS/JS · hash routes · `localStorage` cache · multi-lokasi.

## Halaman

| Route | Fitur |
|-------|--------|
| `#/operasi` | Kanban Lobby → Di parkir → Dipanggil → Siap |
| `#/pegawai` | Roster Septiawan/Saptahendra (+ placeholder) |
| `#/slot` | Peta V-01…V-12 |
| `#/tim` | Anomali SLA, booking, performa, saran shift |
| `#/laporan` | KPI kas vs tip · CSV setoran · cetak |
| `#/booking` | Form tamu |
| `#/lacak?kode=` | Timeline |

## Tim IT notes

- **Lokasi:** MOP / Sate Maranggi / Lyma Brisket / Kalimalang / Pasar Minggu / …
- **Tip ≠ kas:** `jasa_kas` masuk setoran; `tip` terpisah
- **SLA:** lobby 12 mnt · panggil 8 mnt — override wajib alasan
- **Reset:** soft-archive (bukan wipe)
- **Sheet sync:** `docs/SHEET-SYNC.md` + `apps-script/Code.gs`

## Demo

1. Pilih lokasi di topbar → Operasi kanban.
2. Alur Parkirkan / Panggil / Siap / Serahkan & bayar (isi alasan jika SLA lewat).
3. Laporan → **CSV setoran** (kolom Excel ops).
4. **Arsip & muat demo** di sidebar jika perlu.
