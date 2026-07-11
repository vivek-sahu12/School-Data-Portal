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
    var deletedRows = [];
    for (var i = 1; i < data.length; i++) {
      var rowData = {};
      for (var j = 0; j < headers.length; j++) {
        var key = headers[j] ? headers[j].toString().trim() : "Column_" + j;
        rowData[key] = data[i][j];
      }
      
      if (sheetName === "School Data") {
        var statusVal = rowData["Status"] || rowData["status"] || "";
        if (statusVal.toString().trim().toLowerCase() === "deleted") {
          deletedRows.push(rowData);
        } else {
          rows.push(rowData);
        }
      } else {
        rows.push(rowData);
      }
    }
    result[sheetName] = rows;
    if (sheetName === "School Data") {
      result["Deleted_Students"] = deletedRows;
    }
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

  // Ensure Status column exists
  var statusIndex = -1;
  for (var k = 0; k < headers.length; k++) {
    if (headers[k].toString().trim().toLowerCase() === "status") {
      statusIndex = k;
      break;
    }
  }
  if (statusIndex === -1) {
    statusIndex = headers.length;
    sheet.getRange(1, statusIndex + 1).setValue("Status");
    headers.push("Status");
    // Reload values to match headers length
    dataRange = sheet.getDataRange();
    values = dataRange.getValues();
  }

  edits.forEach(function(edit) {
    var rowUid = edit.row_uid;
    var userId = edit.userId || "";
    var action = edit.action || "edit";
    var changedFields = edit.changedFields || {};

    if (action === "add") {
      try {
        var rowData = edit.data || {};
        var newRowValues = [];
        for (var j = 0; j < headers.length; j++) {
          var header = headers[j];
          if (header === "row_uid") {
            newRowValues.push(rowUid);
          } else if (header.toLowerCase() === "status") {
            newRowValues.push("Active");
          } else if (rowData[header] !== undefined) {
            newRowValues.push(rowData[header]);
          } else {
            newRowValues.push("");
          }
        }
        sheet.appendRow(newRowValues);

        // Log add event
        var simulatedChangedFields = {};
        for (var field in rowData) {
          simulatedChangedFields[field] = {
            old: "",
            new: rowData[field]
          };
        }
        logEdit(ss, userId, rowData, headers, simulatedChangedFields, "Add");

        results.push({
          row_uid: rowUid,
          success: true
        });
      } catch (addErr) {
        results.push({
          row_uid: rowUid,
          success: false,
          message: addErr.message
        });
      }
      return;
    }

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

    if (action === "delete") {
      try {
        sheet.getRange(rowIndex + 1, statusIndex + 1).setValue("Deleted");
        rowValues[statusIndex] = "Deleted";

        var simulatedChangedFields = {
          "Status": {
            old: originalStudentData[headers[statusIndex]] || "",
            new: "Deleted"
          }
        };

        logEdit(ss, userId, originalStudentData, headers, simulatedChangedFields, "Delete");

        results.push({
          row_uid: rowUid,
          success: true
        });
      } catch (delErr) {
        results.push({
          row_uid: rowUid,
          success: false,
          message: delErr.message
        });
      }
      return;
    }

    if (action === "recover") {
      try {
        sheet.getRange(rowIndex + 1, statusIndex + 1).setValue("Active");
        rowValues[statusIndex] = "Active";

        var simulatedChangedFields = {
          "Status": {
            old: originalStudentData[headers[statusIndex]] || "",
            new: "Active"
          }
        };

        logEdit(ss, userId, originalStudentData, headers, simulatedChangedFields, "Recover");

        results.push({
          row_uid: rowUid,
          success: true
        });
      } catch (recErr) {
        results.push({
          row_uid: rowUid,
          success: false,
          message: recErr.message
        });
      }
      return;
    }

    // Default: action === "edit"
    try {
      // Update spreadsheet cells for changed fields
      for (var field in changedFields) {
        var colIndex = -1;
        var normField = field.toString().trim().toLowerCase();
        for (var k = 0; k < headers.length; k++) {
          if (headers[k].toString().trim().toLowerCase() === normField) {
            colIndex = k;
            break;
          }
        }
        if (colIndex !== -1) {
          var newVal = changedFields[field].new;
          sheet.getRange(rowIndex + 1, colIndex + 1).setValue(newVal);
          rowValues[colIndex] = newVal; // Update locally in case of subsequent edits
        }
      }

      // Log edit event in the edit_log sheet
      logEdit(ss, userId, originalStudentData, headers, changedFields, "Edit");

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
function logEdit(ss, userId, studentRowValues, headers, changedFields, actionType) {
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

  var action = actionType || "Edit";

  logSheet.appendRow([
    new Date(),
    userId,
    classVal,
    scholarVal,
    nameVal,
    action,
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
