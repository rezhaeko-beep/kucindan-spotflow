# Tutorial: isi Dashboard Kantor (HO) dengan data benar

Tujuan: KPI, anomali, dan laporan di **`#/ho`** terisi dari **Google Sheet nyata** — bukan tombol Muat demo.

Live app: https://rezhaeko-beep.github.io/kucindan-spotflow/#/ho  
Sheet: https://docs.google.com/spreadsheets/d/1M3bBUqGgzP5VqTBz6Ujoy6n948RJIPAHKv874IWdj50/edit  
Token sync: `spotflow-mop-2026` (sudah di-prefill)

---

## 0) Jangan pakai demo

1. Buka app → pastikan **bukan** dari **🧪 Muat demo**.
2. Kalau sudah pernah muat demo: menu **Arsip** / reset lokal, lalu **⬇️ Ambil dari Sheet** supaya isi dari Sheet saja.
3. HO membaca Sheet lewat Web App `/exec`. Tanpa sync, KPI/anomali kosong atau “lokal saja”.

---

## 1) Pastikan Sheet sync hidup (sekali saja)

### Cek cepat

1. Buka https://rezhaeko-beep.github.io/kucindan-spotflow/
2. Klik **⚙️ Sheets sync**
3. Pastikan:
   - **Web App URL** = `https://script.google.com/macros/s/AKfycbyfdhf2GdNOtok92o758JxO7aS4R5rG7zkpyqviGXKB3TBFjsD81yUbLz_R5d-LwvwL/exec`
   - **Token** = `spotflow-mop-2026`
4. Simpan → chip sync harus **bukan** “Sheets: lokal saja”.
5. Di HO klik **⬇️ Ambil dari Sheet** (atau biarkan auto-hydrate).

### Kalau sync gagal

- Login Google yang **bisa tulis** Sheet (owner `rezhaoek11` / writer `rezha.eko`).
- Apps Script harus Deploy **Anyone** + Execute as **Me** (versi Web App sudah live).
- Hard refresh Pages (Ctrl+Shift+R) setelah deploy baru.

Detail teknis: `docs/SHEET-SYNC.md`.

---

## 2) Pilih lokasi & petugas dulu

Di sidebar / header:

1. **Lokasi lapangan** (MOP, Sate Maranggi, Lyma, …) — default sering **MOP**.
2. Petugas dinas (roster sementara sampai Septiawan final).

Semua form HO & operasi memakai default lokasi + petugas ini.

---

## 3) Cara mengisi data — 3 jalur (pilih yang cocok)

### A) Kantor — form cepat di `#/ho` (paling mudah untuk HO)

Buka **Kantor** → scroll ke form bawah KPI/anomali.

#### 1) Catat setoran / Omzet

| Field | Isi benar |
|-------|-----------|
| Layanan | **Valet** atau **Parkir gate** |
| Lokasi | Lokasi operasional hari itu |
| Tanggal | Hari ini (otomatis) |
| Omzet / jasa_kas | Uang **kas perusahaan** saja (bukan tip) |
| Tip | Tip petugas (boleh 0) — **jangan** campur ke Omzet |
| Metode | Tunai / nontunai / QR / transfer |
| Petugas | Nama yang bertanggung jawab |
| Catatan | Opsional singkat |

Simpan → baris masuk tab **Transaksi** / event setoran di Sheet.

#### 2) Absensi singkat

| Field | Isi |
|-------|-----|
| Petugas | Nama |
| Lokasi | Lokasi dinas |
| Status | On / off dinas |
| Catatan | Opsional |

→ tab **Absensi**.

#### 3) Tiket cepat

| Field | Valet | Parkir gate |
|-------|-------|-------------|
| Plat | Wajib | Wajib |
| Status | lobby / parkir / … | masuk gate / keluar |
| Omzet | Saat bayar/selesai | Saat keluar/bayar |
| Tip | Opsional | Biasanya 0 |

→ tab **Transaksi** (event sesuai status).

**Aturan emas uang:**

- `jasa_kas` / **Omzet** = masuk setoran perusahaan  
- `tip` = tip petugas, **bukan** kas  
- `total` = jasa_kas + tip (referensi tagihan tamu)

Sesuai map Folder 04: Omzet = jasa_kas; Tip terpisah; Setor Tunai/Nontunai dari metode (tip tidak masuk Setor). Lihat `docs/SHEET-SYNC.md`.

---

### B) Lapangan — alur Valet penuh (`#/operasi`)

Untuk data operasional harian yang “hidup”:

1. Pilih lokasi + petugas → opsional **Buka shift**
2. **Terima kunci** (plat wajib)
3. **Parkirkan** → slot
4. **Panggil** → **Siap** → **Serahkan & bayar** (isi jasa + tip + metode)
5. **Tutup shift** → baris **Laporan** + unduh CSV kalau perlu

Setiap langkah POST ke Sheet. HP lain: **Ambil dari Sheet**.

---

### C) Parkir gate / system (sementara lewat SpotFlow)

Belum ada konektor vendor gate. Sementara:

1. Di HO form, set layanan **Parkir gate**
2. Catat plat masuk / keluar + Omzet + metode
3. Atau impor nanti lewat CSV/export vendor (menyusul)

Jangan campur tip valet ke omzet gate.

---

## 4) Baca dashboard setelah data masuk

Refresh `#/ho` atau **Ambil dari Sheet**.

### KPI (blok atas)

- Filter **lokasi**, **Minggu/Bulan**, **Semua | Valet | Parkir gate**
- Omzet KPI = **jasa_kas saja** (tip ditampilkan terpisah)
- Tiket aktif / selesai mengikuti status Transaksi

### Anomali (blok tengah)

Otomatis dari Sheet — contoh yang perlu diperbaiki di input:

| Anomali | Arti | Perbaiki dengan |
|---------|------|-----------------|
| Double bayar | Plat/id bayar dobel hari yang sama | Jangan double submit; koreksi di Sheet |
| Gap omzet vs tiket | Selesai tanpa jasa_kas / beda Laporan | Isi Omzet saat bayar; tutup shift |
| Tip tercampur jasa | Tip = kas / total aneh | Pisah tip vs jasa_kas |
| Mismatch tunai/nontunai | Metode kosong / tidak konsisten | Isi metode bayar |
| Shift close tanpa laporan | Tutup shift tanpa baris Laporan | Tutup shift dari app |
| Gate open tanpa tiket | Masuk gate tanpa jejak tiket | Catat plat masuk Parkir gate |

Kalau “Belum ada anomali” + KPI 0: belum ada baris Sheet di periode filter, atau sync belum jalan.

### Input (blok bawah)

Pakai terus untuk koreksi harian tanpa buka kanban HP.

---

## 5) Checklist harian head office (15 menit)

1. [ ] Buka `#/ho` — sync OK  
2. [ ] Filter lokasi = lokasi fokus hari ini  
3. [ ] **Ambil dari Sheet**  
4. [ ] Cek KPI Omzet vs tip masuk akal  
5. [ ] Baca anomali P0/P1 — betulkan lewat form atau Sheet  
6. [ ] Input setoran yang belum tercatat lapangan  
7. [ ] Absensi petugas on-dinas  
8. [ ] (Opsional) Unduh CSV setoran di Laporan / form shift  

---

## 6) Verifikasi di Google Sheet

Buka spreadsheet → tab:

1. **Transaksi** — ada baris baru (timestamp, lokasi, plat, jasa_kas, tip, metode_bayar, petugas)  
2. **Absensi** — on/off dinas  
3. **Laporan** — setelah tutup shift (periode, kendaraan, omzet, tip)

Kalau form HO “sukses” tapi Sheet kosong: token salah, URL `/exec` salah, atau akun Google tidak punya akses tulis.

---

## 7) Troubleshooting singkat

| Gejala | Coba |
|--------|------|
| KPI selalu kosong | Sync URL/token; Ambil dari Sheet; filter periode “Minggu” |
| Chip “lokal saja” | Isi URL `/exec` di Settings |
| Anomali tip tercampur | Jangan isi tip di kolom Omzet |
| Double bayar muncul | Satu plat satu bayar/hari; hapus baris dobel di Sheet |
| Data demo mengganggu | Jangan Muat demo; Ambil dari Sheet |
| HP lapangan offline | Antrian lokal → Kirim ulang saat online |

---

## Ringkas untuk briefing tim

1. Sync Sheet sudah live — jangan Muat demo.  
2. Uang kas = **Omzet/jasa_kas**; tip terpisah.  
3. Isi lewat **Kantor** (cepat) atau **Operasi** HP (lengkap).  
4. Baca KPI + anomali setiap hari di `#/ho`.  
5. Sumber kebenaran = **Google Sheet**, bukan layar HP saja.
