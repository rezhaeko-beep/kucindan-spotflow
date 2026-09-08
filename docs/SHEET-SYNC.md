# Sync Google Sheets (opsional)

SpotFlow Kucindan menyimpan operasi di **localStorage** (cache offline). Sync ke Sheet dipakai untuk setoran HQ / Tania — bukan sumber kebenaran lapangan.

## Alur

1. Operasi harian → browser `localStorage` (`spotflow_kucindan_v2`).
2. Export **CSV setoran** dari Laporan (kolom `jasa_kas` terpisah dari `tip`).
3. Atau POST event ke Apps Script Web App (lihat `apps-script/Code.gs`).

## Setup Sheet

1. Buat spreadsheet, mis. `SpotFlow Kucindan Transaksi`.
2. Tab **Transaksi** — header: lihat `sheet-headers-setoran.csv`.
3. Extensions → Apps Script → tempel `apps-script/Code.gs`.
4. Set `SECRET_TOKEN`, Deploy → Web app (Anyone).
5. Di lapangan: tempel Web App URL + token di catatan leader (belum ada UI settings di MVP — sync via CSV dulu).

## Kolom setoran penting

| Kolom | Arti |
|-------|------|
| `jasa_kas` | Omzet masuk kas perusahaan |
| `tip` | Tip petugas — **tidak** masuk kas |
| `total` | jasa_kas + tip (referensi saja) |
| `lokasi` | MOP / Maranggi / Lyma / … |
| `sla_override_alasan` | Wajib jika lewat SLA |

`lokasi` multi-site — jangan hardcode Menara Artha.
