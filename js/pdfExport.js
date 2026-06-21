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
  const selectAllCheckbox = document.getElementById("pdf-select-all-checkbox");

  if (closeModalBtn && !closeModalBtn.dataset.listenerBound) {
    closeModalBtn.addEventListener("click", closePdfModal);
    closeModalBtn.dataset.listenerBound = "true";
  }

  if (cancelModalBtn && !cancelModalBtn.dataset.listenerBound) {
    cancelModalBtn.addEventListener("click", closePdfModal);
    cancelModalBtn.dataset.listenerBound = "true";
  }

  if (selectAllCheckbox && !selectAllCheckbox.dataset.listenerBound) {
    selectAllCheckbox.addEventListener("change", (e) => {
      toggleAllPdfColumns(e.target.checked);
    });
    selectAllCheckbox.dataset.listenerBound = "true";
  }

  if (generatePdfBtn && !generatePdfBtn.dataset.listenerBound) {
    generatePdfBtn.addEventListener("click", generatePdfReport);
    generatePdfBtn.dataset.listenerBound = "true";
  }
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

  // Retrieve original column list from the first record
  pdfOriginalHeaders = Object.keys(records[0]).filter(col => !col.startsWith("_"));
  
  // Initialize state (keep all checked by default in their original order)
  selectedPdfColumnsOrdered = [...pdfOriginalHeaders];

  // Sync Select All checkbox
  const selectAllCheckbox = document.getElementById("pdf-select-all-checkbox");
  if (selectAllCheckbox) selectAllCheckbox.checked = true;

  // Render the checklist grid
  renderPdfColumnsList();

  // Show Modal Overlay
  const modal = document.getElementById("pdf-export-modal");
  if (modal) modal.classList.remove("hidden");
}

/**
 * Close PDF Modal
 */
function closePdfModal() {
  const modal = document.getElementById("pdf-export-modal");
  if (modal) modal.classList.add("hidden");
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
 * Check if all columns are selected and sync the header checkbox
 */
function syncSelectAllHeader() {
  const selectAllCheckbox = document.getElementById("pdf-select-all-checkbox");
  if (!selectAllCheckbox) return;

  const total = pdfOriginalHeaders.length;
  const selected = selectedPdfColumnsOrdered.length;

  if (selected === total) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else if (selected === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true; // Shows partial check (minus line)
  }
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

  // Sync Select All checkbox state
  syncSelectAllHeader();
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

    // 2. Prepend S.No. header
    const pdfHeaders = ["S.No.", ...selectedPdfColumnsOrdered];

    // 3. Map rows data for AutoTable input using order, prepending serial number
    const tableBody = records.map((row, idx) => {
      const rowData = selectedPdfColumnsOrdered.map(colName => {
        const val = row[colName];
        return (val !== undefined && val !== null) ? val.toString() : "";
      });
      return [(idx + 1).toString(), ...rowData];
    });

    // 4. Generate AutoTable starting at the very top with minimal margin
    doc.autoTable({
      head: [pdfHeaders],
      body: tableBody,
      startY: 10,
      theme: 'striped',
      headStyles: {
        fillColor: [79, 70, 229], // Indigo-600 primary color
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'left'
      },
      styles: {
        font: 'Helvetica',
        fontSize: 8.5,
        cellPadding: 3,
        valign: 'middle',
        overflow: 'linebreak'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252] // Very light slate zebra-striping
      },
      margin: { left: 10, right: 10, top: 10, bottom: 10 }
    });

    // 5. Download file
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
