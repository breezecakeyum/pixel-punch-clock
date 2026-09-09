/**
 * Time Tracker webhook backend.
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
 * Each tab (sheet) gets a header row: Task | Description | Start Time | End Time | Duration | Status
 * "Start" appends a new row with Status = Running.
 * "Stop" finds that task's most recent Running row and fills in End Time / Duration.
 *
 * The request's "tab" field routes the row to the matching sheet (creating it
 * if needed) but isn't written into the row itself — which sheet the row is
 * on already says that.
 */

var HEADERS = ['Task', 'Description', 'Start Time', 'End Time', 'Duration', 'Status'];

function doGet() {
  return ContentService.createTextOutput('Time Tracker API is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  var result;
  try {
    var body = JSON.parse(e.postData.contents);
    var task = String(body.task || '').trim();
    var description = String(body.description || '').trim();
    var action = String(body.action || '').trim();
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

function appendStartRow(sheet, task, description, startTime) {
  sheet.appendRow([task, description, startTime, '', '', 'Running']);
}

function stopMatchingRow(sheet, task, description, stopTime) {
  var data = sheet.getDataRange().getValues();
  // Search bottom-up for this task's most recent still-running row.
  for (var r = data.length - 1; r >= 1; r--) {
    var row = data[r];
    if (row[0] === task && row[5] === 'Running') {
      var startTime = new Date(row[2]);
      var durationMs = stopTime.getTime() - startTime.getTime();
      var rowIndex = r + 1; // 1-based, header already accounted for
      sheet.getRange(rowIndex, 4).setValue(stopTime); // End Time
      sheet.getRange(rowIndex, 5).setValue(formatDuration(durationMs)); // Duration
      sheet.getRange(rowIndex, 6).setValue('Complete'); // Status
      return;
    }
  }
  // No matching Start row found (e.g. Start was made before this script existed,
  // or the queue delivered Stop out of order) — log it anyway instead of failing.
  sheet.appendRow([task, description, '', stopTime, '', 'Stop (no matching Start)']);
}

function formatDuration(ms) {
  var totalSeconds = Math.max(0, Math.round(ms / 1000));
  var h = Math.floor(totalSeconds / 3600);
  var m = Math.floor((totalSeconds % 3600) / 60);
  var s = totalSeconds % 60;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return pad(h) + ':' + pad(m) + ':' + pad(s);
}
