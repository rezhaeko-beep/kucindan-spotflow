# Papan kontrol SPOT

Modul HO yang menutup celah Report OPS 17–23 Agu 2026.

| Masalah lapangan | Kontrol di `#/ho` |
|---|---|
| CCTV mati tidak kelihatan HO | Status CCTV/NVR per site |
| Asuransi habis | Status polis |
| Tiket di security (Redwood) | Flag off-system |
| Setoran bekas PIC (RSKM 3) | Flag setoran luar roster |
| Laporan “lancar” tanpa angka | Form kunci vehicles + aset |

Data tersimpan localStorage `spotflow_spot_control_v1`. Bukan system of record Sheet. Label: PROTOTYPE.

Jangan merge PR #3 (`SEE_FILE`) sebelum restore.
