/**
 * PDF Export Configurator & Generator Module
 * Provides column select checklist, grid-tile reordering, and jsPDF integration.
 */

let activePdfSheetKey = null;
let pdfOriginalHeaders = [];
let selectedPdfColumnsOrdered = []; // List of column names in the exact order selected

/**
 * Initialize PDF Export UI listeners
 */
function initPdfExport(data) {
  const closeModalBtn = document.getElementById("close-pdf-modal");
  const cancelModalBtn = document.getElementById("cancel-pdf-btn");
  const generatePdfBtn = document.getElementById("generate-pdf-btn");
  const selectAllBtn = document.getElementById("pdf-select-all-btn");
  const deselectAllBtn = document.getElementById("pdf-deselect-all-btn");

  if (closeModalBtn && !closeModalBtn.dataset.listenerBound) {
    closeModalBtn.addEventListener("click", closePdfModal);
    closeModalBtn.dataset.listenerBound = "true";
  }

  if (cancelModalBtn && !cancelModalBtn.dataset.listenerBound) {
    cancelModalBtn.addEventListener("click", closePdfModal);
    cancelModalBtn.dataset.listenerBound = "true";
  }

  if (selectAllBtn && !selectAllBtn.dataset.listenerBound) {
    selectAllBtn.addEventListener("click", () => toggleAllPdfColumns(true));
    selectAllBtn.dataset.listenerBound = "true";
  }

  if (deselectAllBtn && !deselectAllBtn.dataset.listenerBound) {
    deselectAllBtn.addEventListener("click", () => toggleAllPdfColumns(false));
    deselectAllBtn.dataset.listenerBound = "true";
  }

  if (generatePdfBtn && !generatePdfBtn.dataset.listenerBound) {
    generatePdfBtn.addEventListener("click", generatePdfReport);
    generatePdfBtn.dataset.listenerBound = "true";
  }

  const addBlankBtn = document.getElementById("add-blank-column-btn");
  if (addBlankBtn && !addBlankBtn.dataset.listenerBound) {
    addBlankBtn.addEventListener("click", () => {
      const uniqueId = `__blank_${Math.random().toString(36).substr(2, 5)}`;
      selectedPdfColumnsOrdered.push(uniqueId);
      renderPdfColumnsList();
    });
    addBlankBtn.dataset.listenerBound = "true";
  }
}

/**
 * Get smart default column list based on report category or sheet key
 */
function getSmartDefaultColumns(sheetKey, headers) {
  const normKey = sheetKey.toLowerCase();
  
  const findHeader = (pattern) => {
    return headers.find(h => pattern.test(h.toLowerCase().trim()));
  };

  const nameKey = findHeader(/name/);
  const classKey = findHeader(/class/);
  const sectionKey = findHeader(/section/);

  const defaults = [];
  if (nameKey) defaults.push(nameKey);
  if (classKey) defaults.push(classKey);
  if (sectionKey) defaults.push(sectionKey);

  if (normKey === "a1") {
    const aadhar = findHeader(/aadhar|adhar/);
    if (aadhar) defaults.push(aadhar);
  } else if (normKey === "a2") {
    const phone = findHeader(/phone|mobile|contact/);
    if (phone) defaults.push(phone);
  } else if (normKey === "b1" || normKey === "b2") {
    const pen = findHeader(/pen/);
    if (pen) defaults.push(pen);
  } else if (normKey === "b3" || normKey === "b4") {
    const samagra = findHeader(/samagra/);
    if (samagra) defaults.push(samagra);
  } else if (normKey === "c1" || normKey === "c2") {
    return headers;
  } else {
    // Standard tables - name, class, section + first 4 rest columns
    const rest = headers.filter(h => h !== nameKey && h !== classKey && h !== sectionKey);
    return [...defaults, ...rest.slice(0, 4)];
  }

  return headers.filter(h => defaults.includes(h));
}

/**
 * Open the column selection modal for a specific sheet
 * @param {string} sheetKey - "UDISE", "3.0", "School Data", or "universal"
 */
function openPdfModalForSheet(sheetKey) {
  activePdfSheetKey = sheetKey;
  
  // Verify that we have filtered data to export
  const records = window.activeFilteredData[sheetKey] || [];
  if (records.length === 0) {
    showToast("No filtered records to export. Please adjust your search criteria.", "warning");
    return;
  }

  // Retrieve original column list from the first record, excluding UID keys
  const isUidKey = window.isSystemColumn;
  pdfOriginalHeaders = Object.keys(records[0]).filter(col => !isUidKey(col));
  
  // Smart Default Selection based on report category
  selectedPdfColumnsOrdered = getSmartDefaultColumns(sheetKey, pdfOriginalHeaders);

  // Render the checklist grid
  renderPdfColumnsList();

  // Show Modal Overlay
  const modal = document.getElementById("pdf-export-modal");
  if (typeof window.pushModalHistory === "function") {
    window.pushModalHistory();
  }
  if (modal) {
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
}

/**
 * Close PDF Modal
 * @param {boolean} fromPopState - If true, do not call history.back() to avoid infinite loop
 */
function closePdfModal(fromPopState = false) {
  if (fromPopState !== true && history.state && history.state.modalOpen) {
    history.back();
    return;
  }
  const modal = document.getElementById("pdf-export-modal");
  if (modal) {
    modal.classList.add("hidden");
    document.body.style.overflow = "";
  }
  activePdfSheetKey = null;
  pdfOriginalHeaders = [];
  selectedPdfColumnsOrdered = [];
}

/**
 * Toggle all column checked states
 */
function toggleAllPdfColumns(isChecked) {
  if (isChecked) {
    selectedPdfColumnsOrdered = [...pdfOriginalHeaders];
  } else {
    selectedPdfColumnsOrdered = [];
  }
  renderPdfColumnsList();
}


/**
 * Render columns inside the Modal checklist with click-order tile UI
 */
function renderPdfColumnsList() {
  const listContainer = document.getElementById("pdf-columns-list");
  if (!listContainer) return;

  listContainer.innerHTML = "";

  pdfOriginalHeaders.forEach((col) => {
    const tile = document.createElement("div");
    tile.className = "column-config-tile";
    tile.dataset.columnName = col;

    const isSelected = selectedPdfColumnsOrdered.includes(col);
    if (isSelected) {
      tile.classList.add("selected");
      
      const badge = document.createElement("div");
      badge.className = "tile-badge";
      badge.textContent = selectedPdfColumnsOrdered.indexOf(col) + 1;
      tile.appendChild(badge);
    }

    const nameSpan = document.createElement("span");
    nameSpan.className = "tile-name";
    nameSpan.textContent = col;
    tile.appendChild(nameSpan);

    // Toggle logic on click
    tile.addEventListener("click", () => {
      const index = selectedPdfColumnsOrdered.indexOf(col);
      if (index > -1) {
        // Deselect and remove from ordered list
        selectedPdfColumnsOrdered.splice(index, 1);
      } else {
        // Select and push to the end of ordered list
        selectedPdfColumnsOrdered.push(col);
      }
      renderPdfColumnsList();
    });

    listContainer.appendChild(tile);
  });

  // Render blank columns
  selectedPdfColumnsOrdered.forEach((col) => {
    if (col.startsWith("__blank_")) {
      const tile = document.createElement("div");
      tile.className = "column-config-tile selected blank-column-tile";
      tile.dataset.columnName = col;

      const badge = document.createElement("div");
      badge.className = "tile-badge";
      badge.textContent = selectedPdfColumnsOrdered.indexOf(col) + 1;
      tile.appendChild(badge);

      const nameSpan = document.createElement("span");
      nameSpan.className = "tile-name";
      nameSpan.innerHTML = `<i data-lucide="layout" style="width: 12px; height: 12px; vertical-align: middle; margin-right: 4px;"></i> Blank Column`;
      tile.appendChild(nameSpan);

      // Clicking removes this blank column
      tile.addEventListener("click", () => {
        const index = selectedPdfColumnsOrdered.indexOf(col);
        if (index > -1) {
          selectedPdfColumnsOrdered.splice(index, 1);
        }
        renderPdfColumnsList();
      });

      listContainer.appendChild(tile);
    }
  });

  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }


}

/**
 * Generate PDF document using jsPDF & AutoTable in the exact order selected
 */
function generatePdfReport() {
  if (!activePdfSheetKey) return;

  const records = window.activeFilteredData[activePdfSheetKey] || [];
  const school = getCurrentSchool();
  const schoolName = school ? school.schoolName : "School";

  if (selectedPdfColumnsOrdered.length === 0) {
    showToast("Please select at least one column to export.", "warning");
    return;
  }

  showToast("Generating PDF document...", "info");

  try {
    // 1. Initialize jsPDF
    const { jsPDF } = window.jspdf;
    
    // Choose orientation based on number of columns selected
    const orientation = selectedPdfColumnsOrdered.length > 5 ? "landscape" : "portrait";
    const doc = new jsPDF({
      orientation: orientation,
      unit: "mm",
      format: "a4"
    });

    // Write school name at the top of the first page of the PDF only
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0); // Black
    doc.text(schoolName, 10, 15);

    // 2. Prepend S.No. header
    const pdfHeaders = ["S.No.", ...selectedPdfColumnsOrdered.map(colName => {
      if (colName.startsWith("__blank_")) return "";
      return colName;
    })];

    // 3. Map rows data for AutoTable input using order, prepending serial number
    const tableBody = records.map((row, idx) => {
      const rowData = selectedPdfColumnsOrdered.map(colName => {
        if (colName.startsWith("__blank_")) return "";
        const val = row[colName];
        return (val !== undefined && val !== null) ? val.toString() : "";
      });
      return [(idx + 1).toString(), ...rowData];
    });

    // 4. Calculate column widths dynamically based on content length
    const maxChars = [];
    maxChars.push(Math.max(5, records.length.toString().length + 2)); // Serial Number

    selectedPdfColumnsOrdered.forEach(colName => {
      if (colName.startsWith("__blank_")) {
        maxChars.push(8); // Reduced width weight allocated for handwritten notes
      } else {
        let maxL = colName.length;
        records.forEach(row => {
          const val = row[colName];
          if (val !== undefined && val !== null) {
            const len = val.toString().length;
            if (len > maxL) maxL = len;
          }
        });
        if (maxL > 40) maxL = 40;
        maxChars.push(maxL);
      }
    });

    const printWidth = (orientation === "landscape" ? 277 : 190);

    // Calculate required width based on content character lengths (2.0mm per character + padding)
    const reqWidths = maxChars.map(chars => {
      return chars * 2.0 + 4;
    });

    const sumReq = reqWidths.reduce((s, w) => s + w, 0);
    let finalWidths = [...reqWidths];

    // Scale column widths proportionally to exactly fit the printable page width.
    // This prevents overflowing off the right page boundary when many columns are selected.
    const scale = printWidth / sumReq;
    finalWidths = reqWidths.map(w => w * scale);

    const columnStyles = {};
    finalWidths.forEach((w, idx) => {
      columnStyles[idx] = { cellWidth: w };
    });

    // 5. Generate AutoTable starting below the school name on page 1
    doc.autoTable({
      head: [pdfHeaders],
      body: tableBody,
      startY: 22,
      theme: 'grid',
      columnStyles: columnStyles,
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.1,
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'left'
      },
      styles: {
        font: 'Helvetica',
        fontSize: 8.5,
        cellPadding: 3,
        valign: 'middle',
        overflow: 'ellipsize',
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.1
      },
      alternateRowStyles: {
        fillColor: [255, 255, 255]
      },
      margin: { left: 10, right: 10, top: 10, bottom: 10 }
    });

    // 6. Download file
    const cleanSchoolName = schoolName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const cleanSheetName = activePdfSheetKey.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(`${cleanSchoolName}_${cleanSheetName}_report.pdf`);

    showToast("PDF report downloaded successfully.", "success");
    closePdfModal();
  } catch (err) {
    console.error("PDF generation failed: ", err);
    showToast("Failed to compile PDF. Try reducing selected columns.", "error");
  }
}
