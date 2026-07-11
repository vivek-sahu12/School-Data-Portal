/**
 * Excel / CSV Export Module
 * Generates CSV files from datasets with UTF-8 BOM for perfect Excel compatibility.
 */

/**
 * Downloads the given headers and records as a CSV file.
 * @param {Array<string>} headers 
 * @param {Array<object>} records 
 * @param {string} filename 
 */
function downloadCsvData(headers, records, filename) {
  if (!records || records.length === 0) {
    showToast("No data to export.", "warning");
    return;
  }

  // Prepend UTF-8 BOM to ensure Excel opens it correctly with proper encoding
  let csvContent = "\uFEFF";

  // Headers row
  csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";

  // Data rows
  records.forEach(row => {
    const rowValues = headers.map(h => {
      const val = row[h];
      const valStr = (val !== undefined && val !== null) ? val.toString() : "";
      return `"${valStr.replace(/"/g, '""')}"`;
    });
    csvContent += rowValues.join(",") + "\n";
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Excel report downloaded successfully.", "success");
}

/**
 * Helper to determine if a key is an internal database identifier that should not be exported.
 * @param {string} k 
 * @returns {boolean}
 */
const isUidKey = window.isSystemColumn;

/**
 * Exports current active filtered worksheet data to CSV.
 * @param {string} sheetKey 
 */
function exportSheetToExcel(sheetKey) {
  // Security block: Verify Excel export permission
  const sdipRaw = localStorage.getItem("sdip_session");
  let excelPermission = "No";
  if (sdipRaw) {
    try {
      const session = JSON.parse(sdipRaw);
      excelPermission = window.findValueIgnoreCaseAndSpaces(session, "excel") || "No";
    } catch (e) {}
  }
  const isExcelEnabled = String(excelPermission || "").trim() === "Yes";
  if (!isExcelEnabled) {
    if (typeof showToast === "function") {
      showToast("Access Denied: Excel export is disabled.", "error");
    }
    return;
  }

  const records = window.activeFilteredData[sheetKey] || [];
  if (records.length === 0) {
    showToast("No filtered records to export. Please adjust your search criteria.", "warning");
    return;
  }

  const headers = Object.keys(records[0]).filter(col => !isUidKey(col));

  // Determine current school details
  const sessionRaw = localStorage.getItem("sdip_session");
  let schoolName = "School";
  if (sessionRaw) {
    try {
      const session = JSON.parse(sessionRaw);
      schoolName = session.schoolName || "School";
    } catch (e) {}
  }
  
  const cleanSchoolName = schoolName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const cleanSheetName = sheetKey.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  
  downloadCsvData(headers, records, `${cleanSchoolName}_${cleanSheetName}_report.csv`);
}

/**
 * Exports current active discrepancy/analysis report to CSV.
 */
function exportReportToExcel() {
  // Security block: Verify Excel export permission
  const sdipRaw = localStorage.getItem("sdip_session");
  let excelPermission = "No";
  if (sdipRaw) {
    try {
      const session = JSON.parse(sdipRaw);
      excelPermission = window.findValueIgnoreCaseAndSpaces(session, "excel") || "No";
    } catch (e) {}
  }
  const isExcelEnabled = String(excelPermission || "").trim() === "Yes";
  if (!isExcelEnabled) {
    if (typeof showToast === "function") {
      showToast("Access Denied: Excel export is disabled.", "error");
    }
    return;
  }

  const catId = REPORTS_STATE.activeCategory;
  const cat = REPORT_CATEGORIES.find(c => c.id === catId);
  if (!cat) return;

  const data = getFilteredCategoryData();
  if (data.length === 0) {
    showToast("No records to export.", "warning");
    return;
  }

  const formatted = data.map(r => {
    const obj = {};
    if (cat.isChart && !REPORTS_STATE.activeSubset) {
      cat.headers.forEach(h => {
        if (isUidKey(h)) return;
        let val = r[h];
        if (typeof formatCellValue === "function") {
          val = formatCellValue(val);
        }
        obj[h] = val;
      });
    } else {
      // Copy and format all keys from the mapped record (so custom report columns exist)
      Object.keys(r).forEach(k => {
        if (isUidKey(k)) return;
        let val = r[k];
        if (typeof formatCellValue === "function") {
          val = formatCellValue(val);
        }
        obj[k] = val;
      });
      // Copy and format all keys from the original sheet row (to get all the other columns from School Data)
      const originalRow = r._original || {};
      Object.keys(originalRow).forEach(k => {
        if (isUidKey(k)) return;
        let val = originalRow[k];
        if (typeof formatCellValue === "function") {
          val = formatCellValue(val);
        }
        obj[k] = val;
      });
    }
    return obj;
  });

  const headers = Object.keys(formatted[0]);
  
  // Determine current school details
  const sessionRaw = localStorage.getItem("sdip_session");
  let schoolName = "School";
  if (sessionRaw) {
    try {
      const session = JSON.parse(sessionRaw);
      schoolName = session.schoolName || "School";
    } catch (e) {}
  }
  
  const cleanSchoolName = schoolName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const cleanCategoryName = cat.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();

  downloadCsvData(headers, formatted, `${cleanSchoolName}_report_${cleanCategoryName}.csv`);
}

/**
 * Expose globally to show/hide all Excel buttons based on active session permissions
 */
window.updateExcelButtonsVisibility = function() {
  const sdipRaw = localStorage.getItem("sdip_session");
  let excelPermission = "No";
  if (sdipRaw) {
    try {
      const session = JSON.parse(sdipRaw);
      excelPermission = window.findValueIgnoreCaseAndSpaces(session, "excel") || "No";
    } catch (e) {}
  }
  
  const isExcelEnabled = String(excelPermission || "").trim() === "Yes";
  
  const excelButtons = document.querySelectorAll(".excel-btn");
  excelButtons.forEach(btn => {
    if (isExcelEnabled) {
      btn.classList.remove("hidden");
    } else {
      btn.classList.add("hidden");
    }
  });
};
