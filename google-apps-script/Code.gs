/**
 * Collegamento di scrittura VolleyStars 2026 v2.
 * 1. Aprire il foglio Google ufficiale con l'account proprietario.
 * 2. Estensioni > Apps Script, incollare questo file.
 * 3. Proprietà del progetto > Proprietà script: aggiungere WRITE_SECRET.
 * 4. Distribuisci > Nuova distribuzione > App web.
 *    Esegui come: Me. Chi ha accesso: Chiunque.
 */
const TAB_GIDS = { U13: 802213441, U14: 381131148, U15: 276050103, U17: 0 };

function doPost(event) {
  try {
    const input = JSON.parse(event.postData.contents || "{}");
    const expected = PropertiesService.getScriptProperties().getProperty("WRITE_SECRET");
    if (!expected || input.secret !== expected) return json_({ ok: false, error: "Non autorizzato" });
    if (input.action === "read") return readData_();
    if (!/^\d{4}$/.test(String(input.gameId || "")) || !TAB_GIDS.hasOwnProperty(input.category)) return json_({ ok: false, error: "Partita non valida" });

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheets().find(item => item.getSheetId() === TAB_GIDS[input.category]);
    if (!sheet) return json_({ ok: false, error: "Scheda categoria non trovata" });

    const lastRow = sheet.getLastRow();
    const ids = sheet.getRange(1, 3, lastRow, 1).getDisplayValues();
    const index = ids.findIndex(row => String(row[0]).trim() === String(input.gameId));
    if (index < 0) return json_({ ok: false, error: "Numero gara non trovato" });

    const sets = Array.isArray(input.sets) ? input.sets : [];
    sheet.getRange(index + 1, 8, 1, 4).setValues([[
      String(input.result || "").trim(),
      String(sets[0] || "").trim(),
      String(sets[1] || "").trim(),
      String(sets[2] || "").trim()
    ]]);
    SpreadsheetApp.flush();
    return json_({ ok: true });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message || error) });
  }
}

function readData_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const rows = {};
  Object.keys(TAB_GIDS).forEach(category => {
    const sheet = spreadsheet.getSheets().find(item => item.getSheetId() === TAB_GIDS[category]);
    rows[category] = sheet ? sheet.getDataRange().getDisplayValues() : [];
  });
  return json_({ ok: true, rows: rows, notices: [] });
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
