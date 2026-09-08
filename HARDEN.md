# HARDEN — SpotFlow Kucindan field-ops

Branch: `harden/field-ops` (also merged/fast-forwarded on `main` for Pages at `/`).

Repo: https://github.com/rezhaeko-beep/kucindan-spotflow  
Live: https://rezhaeko-beep.github.io/kucindan-spotflow/

## Super Grok — push / Pages

```bash
cd /workspace/kucindan-spotflow
git checkout harden/field-ops
git push -u origin harden/field-ops
# Pages serves main / — merge PR or fast-forward main after review
```

If push fails (no auth): keep this tree + HARDEN.md; Super Grok pushes with credentials.

## Changes vs original MVP demo

### Roster lapangan
- Replaced Agus / Doni / Rizky / Putri(Tania demo) with:
  - **Saptahendra Septiansyah** (Leader Valet)
  - Saifurohman, Sapta, Topan, Arfan
  - **Petugas MOP 1** / **Petugas MOP 2** — role note *Menunggu daftar final Septiawan*

### Multi-lokasi
- Default **MOP**, selectable: MOP, Sate Maranggi, Lyma Brisket, Taman Teras Tebet, Bakmi Berdikari, Pasar Minggu, Kalimalang
- Sidebar `#locSelect`; tickets carry `lokasi`

### Soft-archive
- Sidebar: **Arsip tiket selesai** (was Reset data demo)
- Archives completed tickets into `state.archive`; **keeps event history**
- Full wipe only via double confirm (pre-wipe snapshot retained)

### SLA
- Lobby >12m or panggil >8m → require reason text before advance
- Stored in `slaOverrideAlasan` + timeline; CSV/Sheet column `sla_override_alasan`

### Sheet sync (pola `/workspace/spotflow-mop/`)
- UI **⚙️ Sheets sync**: URL + token + spreadsheet id (localStorage cfg)
- Client defaults empty (Pages-safe); placeholders / docs use token `spotflow-mop-2026`, sheet `1M3bBUqGgzP5VqTBz6Ujoy6n948RJIPAHKv874IWdj50`
- `apps-script/Code.gs` sets SECRET_TOKEN + SPREADSHEET_ID for deploy
- Export **CSV setoran** (`jasa_kas` ≠ `tip`) + optional POST events + offline queue

### Storage / UX
- Key `spotflow_kucindan_v2` (migrates v1)
- Hash routes / sidebar / mobile nav unchanged
- **Match Kit not touched**

## Paths

| Path | Notes |
|------|--------|
| `/workspace/kucindan-spotflow/` | Git clone (preferred) |
| `js/app.js` | Harden logic |
| `index.html` | Lokasi, Sheets, Arsip |
| `css/styles.css` | loc-select, sync-chip |
| `apps-script/Code.gs` | Web App |
| `docs/SHEET-SYNC.md` | Setup |
| `HARDEN.md` | This file |
| `/workspace/kucindan-spotflow-harden/` | Live download mirror + copy of harden artifacts |

## Commits already on origin (as of this note)

- `371b93d` Harden SpotFlow Kucindan for Tim IT checklist
- `6f88aa8` Complete Tim IT harden: Sheet settings UI, soft-archive, sanitized cfg defaults
- *(plus follow-up commit with HARDEN.md + settings placeholders if pushed)*
