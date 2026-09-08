/**
 * SpotFlow Kucindan — Google Apps Script Web App
 * Deploy: Deploy → New deployment → Web app
 *   Execute as: Me
 *   Who has access: Anyone
 * Then paste the Web App URL + token into the SpotFlow Kucindan app Settings.
 *
 * Spreadsheet tabs expected: Transaksi | Absensi | Laporan
 * (created automatically on first write if missing)
 */

var SECRET_TOKEN = 'GANTI_TOKEN_RAHASIA'; // must match token in app Settings
var SPREADSHEET_ID = ''; // leave empty to use the spreadsheet bound to this script

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
  if (!token && e && e.postData && e.postData.type) {
    // also allow header X-Spotflow-Token via query only (Apps Script limited)
  }
  if (!token && e && e.parameter && e.parameter.Authorization) {
    token = String(e.parameter.Authorization).replace(/^Bearer\s+/i, '');
  }
  // Accept token in JSON body too
  try {
    if (e && e.postData && e.postData.contents) {
      var body = JSON.parse(e.postData.contents);
      if (body && body.token) token = String(body.token);
    }
  } catch (err) {}
  return token === SECRET_TOKEN;
}

function jsonOut_(obj, code) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var ok = checkToken_(e) || (e && e.parameter && e.parameter.ping === '1');
  return jsonOut_({
    ok: true,
    app: 'SpotFlow Kucindan',
    lokasi: 'MOP',
    time: new Date().toISOString(),
    auth: checkToken_(e),
    hint: 'POST JSON with token to append rows'
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

    var headersTransaksi = [
      'timestamp', 'lokasi', 'event', 'id', 'plat', 'status', 'tamu', 'wa',
      'slot', 'jenis', 'metode_bayar', 'jasa_kas', 'tip', 'total', 'petugas',
      'shift', 'catatan', 'sla_override_alasan'
    ];
    var headersAbsensi = [
      'timestamp', 'lokasi', 'event', 'petugas', 'status_dinas', 'catatan'
    ];
    var headersLaporan = [
      'timestamp', 'lokasi', 'periode', 'kendaraan', 'omzet', 'tip', 'catatan'
    ];

    var sh, values;
    if (tab === 'Absensi' || tab === 'absensi') {
      sh = ensureSheet_('Absensi', headersAbsensi);
      values = [
        row.timestamp || new Date().toISOString(),
        row.lokasi || 'MOP',
        event,
        row.petugas || '',
        row.status_dinas || row.status || '',
        row.catatan || ''
      ];
    } else if (tab === 'Laporan' || tab === 'laporan') {
      sh = ensureSheet_('Laporan', headersLaporan);
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
      sh = ensureSheet_('Transaksi', headersTransaksi);
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
        row.jasa_kas != null ? row.jasa_kas : (row.fee || 0),
        row.tip != null ? row.tip : 0,
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
