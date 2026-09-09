/**
 * SpotFlow Kucindan — Google Apps Script Web App
 * Deploy: Deploy → New deployment → Web app
 *   Execute as: Me
 *   Who has access: Anyone
 * Then paste the Web App URL + token into the SpotFlow Kucindan app Settings
 * (or into data/sheet-sync.json "url" field).
 *
 * Spreadsheet tabs expected: Transaksi | Absensi | Laporan
 * (created automatically on first write if missing)
 *
 * GET ?action=list&tab=Transaksi&lokasi=&limit=50&token=
 *   → recent rows as JSON (hydrate second phone)
 */

var SECRET_TOKEN = 'spotflow-mop-2026'; // must match token in app Settings
var SPREADSHEET_ID = '1M3bBUqGgzP5VqTBz6Ujoy6n948RJIPAHKv874IWdj50'; // SpotFlow Kucindan / MOP shared sheet

function getSpreadsheet_() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ensureSheet_(name, headers) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function checkToken_(e) {
  var token = '';
  if (e && e.parameter && e.parameter.token) token = String(e.parameter.token);
  if (!token && e && e.parameter && e.parameter.Authorization) {
    token = String(e.parameter.Authorization).replace(/^Bearer\s+/i, '');
  }
  try {
    if (e && e.postData && e.postData.contents) {
      var body = JSON.parse(e.postData.contents);
      if (body && body.token) token = String(body.token);
    }
  } catch (err) {}
  return token === SECRET_TOKEN;
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

var HEADERS_TRANSAKSI = [
  'timestamp', 'lokasi', 'event', 'id', 'plat', 'status', 'tamu', 'wa',
  'slot', 'jenis', 'metode_bayar', 'jasa_kas', 'tip', 'total', 'petugas',
  'shift', 'catatan', 'sla_override_alasan'
];
// Folder 04 template aliases (CSV/export): Omzet=jasa_kas, Tip=tip,
// Setor_Tunai/Setor_Nontunai = jasa_kas split by metode_bayar (tip never in Setor).
var HEADERS_ABSENSI = [
  'timestamp', 'lokasi', 'event', 'petugas', 'status_dinas', 'catatan'
];
var HEADERS_LAPORAN = [
  'timestamp', 'lokasi', 'periode', 'kendaraan', 'omzet', 'tip', 'catatan'
];

function sheetToObjects_(sh, limit) {
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h || '').trim();
  });
  var start = Math.max(2, lastRow - (limit || 50) + 1);
  var num = lastRow - start + 1;
  var values = sh.getRange(start, 1, num, lastCol).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var v = values[i][c];
      if (v instanceof Date) v = v.toISOString();
      obj[headers[c]] = v;
    }
    rows.push(obj);
  }
  rows.reverse(); // newest first
  return rows;
}

function handleList_(e) {
  if (!checkToken_(e)) {
    return jsonOut_({ ok: false, error: 'unauthorized' });
  }
  var tab = (e.parameter.tab || 'Transaksi').toString();
  var lokasi = (e.parameter.lokasi || '').toString();
  var limit = parseInt(e.parameter.limit || '50', 10);
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 200) limit = 200;

  var headers = HEADERS_TRANSAKSI;
  var name = 'Transaksi';
  if (tab === 'Absensi' || tab === 'absensi') {
    name = 'Absensi';
    headers = HEADERS_ABSENSI;
  } else if (tab === 'Laporan' || tab === 'laporan') {
    name = 'Laporan';
    headers = HEADERS_LAPORAN;
  }

  var sh = ensureSheet_(name, headers);
  // fetch more than limit if filtering by lokasi
  var fetchLimit = lokasi ? Math.min(200, limit * 4) : limit;
  var rows = sheetToObjects_(sh, fetchLimit);
  if (lokasi) {
    rows = rows.filter(function (r) {
      return String(r.lokasi || '') === lokasi;
    }).slice(0, limit);
  }
  return jsonOut_({
    ok: true,
    tab: name,
    lokasi: lokasi || null,
    count: rows.length,
    rows: rows
  });
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : '';
  if (action === 'list') {
    return handleList_(e);
  }
  var ok = checkToken_(e) || (e && e.parameter && e.parameter.ping === '1');
  return jsonOut_({
    ok: true,
    app: 'SpotFlow Kucindan',
    lokasi: 'MOP',
    time: new Date().toISOString(),
    auth: checkToken_(e),
    hint: 'POST JSON with token to append rows; GET ?action=list&tab=Transaksi&lokasi=&limit=50&token= to hydrate'
  });
}

function doPost(e) {
  try {
    if (!checkToken_(e)) {
      return jsonOut_({ ok: false, error: 'unauthorized' });
    }
    var raw = e.postData && e.postData.contents ? e.postData.contents : '{}';
    var data = JSON.parse(raw);
    var tab = (data.tab || data.sheet || 'Transaksi').toString();
    var row = data.row || data;
    var event = (data.event || row.event || 'update').toString();

    var sh, values;
    if (tab === 'Absensi' || tab === 'absensi') {
      sh = ensureSheet_('Absensi', HEADERS_ABSENSI);
      values = [
        row.timestamp || new Date().toISOString(),
        row.lokasi || 'MOP',
        event,
        row.petugas || '',
        row.status_dinas || row.status || '',
        row.catatan || ''
      ];
    } else if (tab === 'Laporan' || tab === 'laporan') {
      sh = ensureSheet_('Laporan', HEADERS_LAPORAN);
      values = [
        row.timestamp || new Date().toISOString(),
        row.lokasi || 'MOP',
        row.periode || '',
        row.kendaraan || 0,
        row.omzet || 0,
        row.tip || 0,
        row.catatan || ''
      ];
    } else {
      sh = ensureSheet_('Transaksi', HEADERS_TRANSAKSI);
      values = [
        row.timestamp || new Date().toISOString(),
        row.lokasi || 'MOP',
        event,
        row.id || '',
        row.plat || '',
        row.status || '',
        row.tamu || '',
        row.wa || '',
        row.slot || '',
        row.jenis || '',
        row.metode_bayar || row.metode || '',
        row.jasa_kas != null ? row.jasa_kas : (row.Omzet != null ? row.Omzet : (row.omzet != null ? row.omzet : (row.fee || 0))),
        row.tip != null ? row.tip : (row.Tip != null ? row.Tip : 0),
        row.total != null ? row.total : ((Number(row.jasa_kas || row.fee || 0)) + (Number(row.tip || 0))),
        row.petugas || '',
        row.shift || '',
        row.catatan || '',
        row.sla_override_alasan || ''
      ];
    }

    sh.appendRow(values);
    return jsonOut_({ ok: true, tab: sh.getName(), row: values });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}
