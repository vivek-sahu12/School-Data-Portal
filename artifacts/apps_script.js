/**
 * Google Sheets Apps Script for per-school spreadsheet integration.
 * Deploy as a Web App (Execute as "Me", Access: "Anyone").
 */

// GET Handler: Retrieves sheet data and performs self-healing row_uid insertion
function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var result = {};

  sheets.forEach(function(sheet) {
    var sheetName = sheet.getName();
    var data = sheet.getDataRange().getValues();

    if (data.length === 0) {
      result[sheetName] = [];
      return;
    }

    var headers = data[0];

    // Self-healing row_uid logic for "School Data" specifically
    if (sheetName === "School Data") {
      var uidIndex = headers.indexOf("row_uid");
      if (uidIndex === -1) {
        uidIndex = headers.length;
        sheet.getRange(1, uidIndex + 1).setValue("row_uid");
        headers.push("row_uid");
      }

      // Populate empty row_uid cells in the sheet
      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        var uidVal = row[uidIndex];
        if (uidVal === undefined || uidVal === null || uidVal.toString().trim() === "") {
          var newUuid = Utilities.getUuid();
          sheet.getRange(i + 1, uidIndex + 1).setValue(newUuid);
          
          // Sync local memory representation
          while (row.length <= uidIndex) {
            row.push("");
          }
          row[uidIndex] = newUuid;
        }
      }
    }

    var rows = [];
    for (var i = 1; i < data.length; i++) {
      var rowData = {};
      for (var j = 0; j < headers.length; j++) {
        var key = headers[j] ? headers[j].toString().trim() : "Column_" + j;
        rowData[key] = data[i][j];
      }
      rows.push(rowData);
    }
    result[sheetName] = rows;
  });

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// POST Handler: Applies queued edits from the frontend client
function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("School Data");

  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "'School Data' sheet not found in the spreadsheet."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var postData;
  try {
    postData = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "Malformed JSON payload: " + err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (postData.action !== "applyEdits") {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "Unsupported action parameter."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var edits = postData.edits || [];
  var results = [];

  var dataRange = sheet.getDataRange();
  var values = dataRange.getValues();
  var headers = values[0];
  var uidIndex = headers.indexOf("row_uid");

  if (uidIndex === -1) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "row_uid column not initialized in 'School Data' sheet."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  edits.forEach(function(edit) {
    var rowUid = edit.row_uid;
    var userId = edit.userId || "";
    var changedFields = edit.changedFields || {};
    
    // Locate row index matching rowUid
    var rowIndex = -1;
    for (var i = 1; i < values.length; i++) {
      if (values[i][uidIndex] === rowUid) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) {
      results.push({
        row_uid: rowUid,
        success: false,
        message: "No row found with row_uid: " + rowUid
      });
      return;
    }

    var rowValues = values[rowIndex];
    var originalStudentData = {};
    for (var j = 0; j < headers.length; j++) {
      originalStudentData[headers[j]] = rowValues[j];
    }

    try {
      // Update spreadsheet cells for changed fields
      for (var field in changedFields) {
        var colIndex = headers.indexOf(field);
        if (colIndex !== -1) {
          var newVal = changedFields[field].new;
          sheet.getRange(rowIndex + 1, colIndex + 1).setValue(newVal);
          rowValues[colIndex] = newVal; // Update locally in case of subsequent edits
        }
      }

      // Log edit event in the edit_log sheet
      logEdit(ss, userId, originalStudentData, headers, changedFields);

      results.push({
        row_uid: rowUid,
        success: true
      });
    } catch (writeErr) {
      results.push({
        row_uid: rowUid,
        success: false,
        message: writeErr.message
      });
    }
  });

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    results: results
  })).setMimeType(ContentService.MimeType.JSON);
}

// Log edit event helper
function logEdit(ss, userId, studentRowValues, headers, changedFields) {
  var logSheet = ss.getSheetByName("edit_log");
  if (!logSheet) {
    logSheet = ss.insertSheet("edit_log");
    var logHeaders = [
      "Timestamp", "User_ID", "Class", "Scholar_No", 
      "Student_Name", "Action_Type", "Changed_Fields", 
      "Previous_Values", "New_Values"
    ];
    logSheet.appendRow(logHeaders);
    logSheet.getRange(1, 1, 1, logHeaders.length).setFontWeight("bold");
  }

  var classHeader = findClassHeader(headers);
  var scholarHeader = findScholarNoHeader(headers);
  var nameHeader = findStudentNameHeader(headers);

  var classVal = studentRowValues[classHeader] || "";
  var scholarVal = studentRowValues[scholarHeader] || "";
  var nameVal = studentRowValues[nameHeader] || "";

  var changedFieldNames = Object.keys(changedFields);
  var oldValues = {};
  var newValues = {};

  changedFieldNames.forEach(function(field) {
    oldValues[field] = changedFields[field].old;
    newValues[field] = changedFields[field].new;
  });

  logSheet.appendRow([
    new Date(),
    userId,
    classVal,
    scholarVal,
    nameVal,
    "Edit",
    JSON.stringify(changedFieldNames),
    JSON.stringify(oldValues),
    JSON.stringify(newValues)
  ]);
}

// Header Finder helpers
function findScholarNoHeader(headers) {
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i].toString().toLowerCase();
    if (h.includes("scholar") || h.includes("admission") || h.includes("adm") || h.includes("sch")) {
      return headers[i];
    }
  }
  return "Scholar_No";
}

function findStudentNameHeader(headers) {
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i].toString().toLowerCase();
    if (h === "name" || h === "student name" || h.includes("student_name")) {
      return headers[i];
    }
  }
  return "Name";
}

function findClassHeader(headers) {
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i].toString().toLowerCase();
    if (h === "class" || h.includes("class")) {
      return headers[i];
    }
  }
  return "Class";
}
