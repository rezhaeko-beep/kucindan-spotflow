# Sync Google Sheets — lapangan

SpotFlow Kucindan memakai **localStorage sebagai cache offline**. **Google Sheet adalah sumber kebenaran** untuk setoran dan event operasi (bukan demo-only).

## Lapangan — 3 langkah

1. **Deploy Apps Script** (wajib untuk URL):
   - Buka spreadsheet `1M3bBUqGgzP5VqTBz6Ujoy6n948RJIPAHKv874IWdj50`
   - Extensions → Apps Script → tempel `apps-script/Code.gs`
   - `SECRET_TOKEN = 'spotflow-mop-2026'`
   - Deploy → **New deployment** → Web app · Execute as: **Me** · Who has access: **Anyone**
   - Salin **Web App URL** (`https://script.google.com/macros/s/…/exec`)
2. **Tempel URL di app**: ⚙️ Sheets sync → Web App URL → Simpan.  
   Atau isi `"url"` di `data/sheet-sync.json` lalu commit (token + sheetId sudah ada; `url` kosong sampai deploy).
3. **Operasi lapangan**: buka app → (opsional) Buka shift → Terima kunci … bayar. Event masuk Sheet via antrian + retry. HP kedua: **Ambil dari Sheet** / auto-hydrate on boot.

Tanpa langkah 1–2, app tetap jalan lokal; chip menampilkan “Sheets: lokal saja”.

## Prefill `data/sheet-sync.json`

```json
{ "url": "", "token": "spotflow-mop-2026", "sheetId": "1M3bBUqGgzP5VqTBz6Ujoy6n948RJIPAHKv874IWdj50" }
```

- Dimuat saat boot (`js/sync.js`).
- **localStorage menang** jika user sudah Simpan di Settings (`_userSaved`).
- Biarkan `"url": ""` sampai Web App di-deploy.

## Event yang di-POST (tab Transaksi / Absensi / Laporan)

| Event | Tab | Kapan |
|-------|-----|--------|
| `terima_kunci` | Transaksi | Kunci masuk lobby |
| `parkirkan` | Transaksi | Pilih slot |
| `panggil` | Transaksi | Panggil mobil |
| `siap` | Transaksi | Siap di lobby |
| `serahkan_bayar` | Transaksi | Bayar & selesai |
| `sla_override` | Transaksi | Alasan lewat SLA |
| `archive` | Laporan | Arsip tiket selesai |
| `shift_open` | Absensi | Buka shift |
| `shift_close` | Laporan | Tutup shift (+ CSV prompt) |

Antrian offline: `localStorage` key `spotflow_kucindan_q` · flush + retry (max 5) saat online / boot / “Kirim ulang antrian”.

## GET list (hydrate HP kedua)

```
GET ?action=list&tab=Transaksi&lokasi=MOP&limit=50&token=spotflow-mop-2026
```

Response JSON: `{ ok, tab, lokasi, count, rows:[{ timestamp, lokasi, event, id, plat, status, … }] }`.

Client: tombol **Ambil dari Sheet** + auto-hydrate on boot jika `url` terisi. Hanya menggabungkan tiket **aktif** (bukan selesai); tidak menimpa plat yang sudah ada lokal.

## Kolom setoran penting

| Kolom | Arti |
|-------|------|
| `jasa_kas` | Omzet masuk kas perusahaan |
| `tip` | Tip petugas — **tidak** masuk kas |
| `total` | jasa_kas + tip (referensi saja) |
| `lokasi` | MOP / Maranggi / Lyma / Teras / Berdikari / Pasar Minggu / Kalimalang |
| `sla_override_alasan` | Wajib jika lewat SLA lobby>12m atau panggil>8m |

## PWA

`sw.js` meng-cache shell (HTML/CSS/JS/icon). **Tidak** meng-cache `script.google.com`.
