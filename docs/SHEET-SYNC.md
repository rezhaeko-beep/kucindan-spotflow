# Sync Google Sheets (opsional)

SpotFlow Kucindan menyimpan operasi di **localStorage** (cache offline). Sync ke Sheet dipakai untuk setoran HQ — bukan sumber kebenaran lapangan.

## Alur

1. Operasi harian → browser `localStorage` (`spotflow_kucindan_v2`).
2. Export **CSV setoran** dari Laporan (kolom `jasa_kas` terpisah dari `tip`).
3. Atau POST event ke Apps Script Web App (lihat `apps-script/Code.gs`).

## Setup Sheet

1. Spreadsheet id default: `1M3bBUqGgzP5VqTBz6Ujoy6n948RJIPAHKv874IWdj50`
2. Tab **Transaksi** — header: lihat `sheet-headers-setoran.csv`
3. Extensions → Apps Script → tempel `apps-script/Code.gs`
4. `SECRET_TOKEN = 'spotflow-mop-2026'` (sama pola SpotFlow MOP)
5. Deploy → Web app (Anyone) → tempel **Web App URL** + token di **⚙️ Sheets sync** di app

## Kolom setoran penting

| Kolom | Arti |
|-------|------|
| `jasa_kas` | Omzet masuk kas perusahaan |
| `tip` | Tip petugas — **tidak** masuk kas |
| `total` | jasa_kas + tip (referensi saja) |
| `lokasi` | MOP / Maranggi / Lyma / Teras / Berdikari / Pasar Minggu / Kalimalang |
| `sla_override_alasan` | Wajib jika lewat SLA lobby>12m atau panggil>8m |

`lokasi` multi-site — default **MOP**, selectable di sidebar.
