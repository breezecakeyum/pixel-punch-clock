/**
 * Pixel Punch Clock webhook backend.
 *
 * Setup:
 *   1. Open (or create) the Google Sheet you want to log to.
 *   2. Extensions > Apps Script, delete the boilerplate, paste this file in as Code.gs.
 *      (Container-bound to the sheet, so SpreadsheetApp.getActiveSpreadsheet() below
 *      always resolves to that sheet even when this runs as a headless web app.)
 *   3. Deploy > New deployment > type "Web app".
 *      - Execute as: Me
 *      - Who has access: Anyone
 *   4. Copy the /exec URL into the app's Settings panel.
 *
 * Each tab (sheet) gets a header row:
 *   Task | Description | Date | Start Time | Stop Time | Duration | Status
 * "Start" appends a new row with Status = Running.
 * "Stop" finds that task's most recent Running row and fills in Stop Time / Duration.
 *
 * Date, Start Time and Stop Time all store the full underlying timestamp (so
 * duration math stays exact) — only their cell number-format differs, so Date
 * displays just the day and Start/Stop Time display just the clock time
 * instead of a repeated full datetime in every column.
 *
 * The request's "tab" field routes the row to the matching sheet (creating it
 * if needed) but isn't written into the row itself — which sheet the row is
 * on already says that.
 *
 * GET ?action=data returns every tab's rows as JSON for the app's Metrics
 * view. It's requested via a <script> tag (JSONP), not fetch(): a normal
 * cross-origin fetch needs Access-Control-Allow-Origin on the actual
 * response to be readable, which Apps Script doesn't reliably send, while a
 * <script src="..."> load is never subject to CORS at all. Pass
 * &callback=NAME to get the JSON wrapped as `NAME(...)`; without it, the
 * endpoint just returns plain JSON (e.g. for manual testing in a browser).
 *
 * Game progression (level/streak/gear) syncs the same way, through a hidden
 * "_GameState" tab holding a single overwritten row: POST action=saveState
 * upserts it, GET ?action=state (also JSONP) reads it back. The app always
 * sends its full current snapshot and merges whatever it reads back locally
 * (max XP, union of found gear, latest-wins for streak/equipped) rather than
 * trusting either side outright — see mergeStatePayloads() in app.js — so
 * this endpoint doesn't need to do anything smarter than store the last
 * snapshot it was given.
 */

var HEADERS = ['Task', 'Description', 'Date', 'Start Time', 'Stop Time', 'Duration', 'Status'];
var DATE_FORMAT = 'M/d/yyyy';
var TIME_FORMAT = 'h:mm:ss am/pm';
var TEXT_FORMAT = '@';
// One format per HEADERS column, applied to a new row before any value is
// written, and Task/Description/Status/Duration are also written with a
// leading forceText() apostrophe — Sheets' documented "treat this literally"
// marker. Despite both of those, the Duration cell has still round-tripped
// back as a coerced Date in production across multiple attempts (a plain
// time-shaped string, and separately a plain number formatted for duration
// display) — whatever Sheets is actually doing there via the API is subtler
// than the documented behavior suggests. So the JSON API (getAllData, below)
// no longer trusts this cell's read-back value for Duration at all: it
// recomputes duration from the Start Time / Stop Time cells instead, which
// have round-tripped correctly every single time. What gets written here is
// purely for whoever looks at the raw spreadsheet.
var COLUMN_FORMATS = [TEXT_FORMAT, TEXT_FORMAT, DATE_FORMAT, TIME_FORMAT, TIME_FORMAT, TEXT_FORMAT, TEXT_FORMAT];

function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.action === 'data') {
    return respondWithJSONP(getAllData(), params);
  }
  if (params.action === 'state') {
    return respondWithJSONP(loadGameState(), params);
  }
  return ContentService.createTextOutput('Pixel Punch Clock API is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function respondWithJSONP(payload, params) {
  // Only safe JS-identifier characters — this string gets embedded directly
  // into the response as executable code, so it must be sanitized.
  var callback = String(params.callback || '').replace(/[^a-zA-Z0-9_]/g, '');
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(payload) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function getAllData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var tabs = {};
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    if (sheet.getName() === GAME_STATE_SHEET_NAME) continue; // not a task-log tab
    var values = sheet.getDataRange().getValues();
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      if (!row[0]) continue; // skip stray blank rows
      var startDate = row[3] instanceof Date ? row[3] : null;
      var stopDate = row[4] instanceof Date ? row[4] : null;
      rows.push({
        task: stripForcedTextMarker(row[0]),
        description: row[1] ? stripForcedTextMarker(row[1]) : '',
        date: row[2] instanceof Date ? row[2].toISOString() : null,
        startTime: startDate ? startDate.toISOString() : null,
        stopTime: stopDate ? stopDate.toISOString() : null,
        // Computed from Start/Stop Time, not read from the Duration cell —
        // see the comment on COLUMN_FORMATS above for why.
        duration: (startDate && stopDate) ? formatDuration(stopDate.getTime() - startDate.getTime()) : null,
        status: row[6] ? stripForcedTextMarker(row[6]) : null,
      });
    }
    tabs[sheet.getName()] = rows;
  }
  return { ok: true, tabs: tabs };
}

function doPost(e) {
  var result;
  try {
    var body = JSON.parse(e.postData.contents);
    var action = String(body.action || '').trim();

    if (action === 'saveState') {
      result = saveGameState(body);
    } else {
      var task = String(body.task || '').trim();
      var description = String(body.description || '').trim();
      var tabName = String(body.tab || 'Work').trim() || 'Work';
      var timestamp = body.timestamp ? new Date(body.timestamp) : new Date();

      if (!task || (action !== 'Start' && action !== 'Stop')) {
        throw new Error('Request must include "task" and action "Start" or "Stop".');
      }

      var sheet = getOrCreateSheet(tabName);

      if (action === 'Start') {
        appendStartRow(sheet, task, description, timestamp);
      } else {
        stopMatchingRow(sheet, task, description, timestamp);
      }

      result = { ok: true, action: action, task: task, tab: tabName };
    }
  } catch (err) {
    result = { ok: false, error: err.message };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(tabName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* ---------- Game state (level / streak / gear), one overwritten row ---------- */

var GAME_STATE_SHEET_NAME = '_GameState';
// EventProgress and Appearance appended at the end (not inserted earlier) so
// a sheet from before those columns existed keeps its existing column
// positions intact.
var GAME_STATE_HEADERS = ['UpdatedAt', 'TotalXp', 'StreakCount', 'LastStreakDate', 'FoundItems', 'Equipped', 'EventProgress', 'Appearance'];

function getOrCreateGameStateSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GAME_STATE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(GAME_STATE_SHEET_NAME);
    sheet.appendRow(GAME_STATE_HEADERS);
    sheet.setFrozenRows(1);
    // LastStreakDate/FoundItems/Equipped/Appearance hold date-shaped or JSON
    // text — force plain-text format on that row up front so Sheets never
    // reinterprets them (see the COLUMN_FORMATS comment above for why that
    // matters here).
    sheet.getRange(2, 4, 1, 3).setNumberFormat(TEXT_FORMAT);
    sheet.getRange(2, 8, 1, 1).setNumberFormat(TEXT_FORMAT);
    try { sheet.hideSheet(); } catch (err) {} // best-effort; fine if it stays visible
  }
  return sheet;
}

function saveGameState(body) {
  var sheet = getOrCreateGameStateSheet_();
  var row = [
    Number(body.updatedAt) || Date.now(),
    Number(body.xp) || 0,
    Number(body.sc) || 0,
    forceText(body.lsd ? String(body.lsd) : ''),
    forceText(JSON.stringify(body.f || {})),
    forceText(JSON.stringify(body.e || {})),
    Number(body.ep) || 0,
    forceText(JSON.stringify(body.ap || {})),
  ];
  sheet.getRange(2, 1, 1, row.length).setValues([row]);
  return { ok: true };
}

function loadGameState() {
  var sheet = getOrCreateGameStateSheet_();
  if (sheet.getLastRow() < 2) return { ok: true, state: null };
  var row = sheet.getRange(2, 1, 1, GAME_STATE_HEADERS.length).getValues()[0];
  var foundItems = {}, equipped = {}, appearance = {};
  try { foundItems = JSON.parse(stripForcedTextMarker(row[4]) || '{}'); } catch (err) {}
  try { equipped = JSON.parse(stripForcedTextMarker(row[5]) || '{}'); } catch (err) {}
  try { appearance = JSON.parse(stripForcedTextMarker(row[7]) || '{}'); } catch (err) {}
  var lsd = row[3] ? stripForcedTextMarker(row[3]) : '';
  return {
    ok: true,
    state: {
      updatedAt: Number(row[0]) || 0,
      xp: Number(row[1]) || 0,
      sc: Number(row[2]) || 0,
      lsd: lsd || null,
      f: foundItems,
      e: equipped,
      ep: Number(row[6]) || 0,
      ap: appearance,
    },
  };
}

function appendStartRow(sheet, task, description, startTime) {
  appendFormattedRow(sheet, [task, description, startTime, startTime, '', '', 'Running']);
}

function stopMatchingRow(sheet, task, description, stopTime) {
  var data = sheet.getDataRange().getValues();
  // Search bottom-up for this task's most recent still-running row.
  for (var r = data.length - 1; r >= 1; r--) {
    var row = data[r];
    if (row[0] === task && row[6] === 'Running') {
      var startTime = new Date(row[3]); // Start Time cell holds the full timestamp
      var durationMs = stopTime.getTime() - startTime.getTime();
      var rowIndex = r + 1; // 1-based, header already accounted for
      sheet.getRange(rowIndex, 5).setValue(stopTime); // Stop Time — a real Date, no ambiguity
      // Best-effort human-readable text for the raw spreadsheet — the app
      // itself no longer reads this cell (see the comment on COLUMN_FORMATS).
      sheet.getRange(rowIndex, 6).setValue(forceText(formatDuration(durationMs)));
      sheet.getRange(rowIndex, 7).setValue(forceText('Complete')); // Status
      return;
    }
  }
  // No matching Start row found (e.g. Start was made before this script existed,
  // or the queue delivered Stop out of order) — log it anyway instead of failing.
  appendFormattedRow(sheet, [task, description, stopTime, '', stopTime, '', 'Stop (no matching Start)']);
}

// Appends a row with each column's format set before its value is written,
// and forces Task/Description/Status/Duration to literal text via Sheets'
// documented leading-apostrophe convention (the same thing a user gets by
// typing `'2` instead of `2`) rather than relying on the format alone.
function appendFormattedRow(sheet, values) {
  var rowIndex = sheet.getLastRow() + 1;
  var formats = COLUMN_FORMATS.slice(0, values.length);
  var range = sheet.getRange(rowIndex, 1, 1, values.length);
  range.setNumberFormats([formats]);
  var prepared = values.map(function (v, i) {
    return (formats[i] === TEXT_FORMAT && typeof v === 'string' && v !== '') ? forceText(v) : v;
  });
  range.setValues([prepared]);
  return rowIndex;
}

function forceText(value) {
  return "'" + value;
}

// Defensive: the leading apostrophe is an input-side marker that Sheets is
// documented to strip before storing/displaying the value, so this should
// normally be a no-op — kept as a safety net in case a cell ends up holding
// it literally.
function stripForcedTextMarker(value) {
  var str = String(value);
  return str.charAt(0) === "'" ? str.slice(1) : str;
}

function formatDuration(ms) {
  var totalSeconds = Math.max(0, Math.round(ms / 1000));
  var h = Math.floor(totalSeconds / 3600);
  var m = Math.floor((totalSeconds % 3600) / 60);
  var s = totalSeconds % 60;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return pad(h) + ':' + pad(m) + ':' + pad(s);
}
