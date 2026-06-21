/**
 * PDF Export Configurator & Generator Module
 * Provides column select checklist, drag-less reordering, and jsPDF integration.
 */

let activePdfSheetKey = null;
let pdfColumnsState = []; // Array of { name: string, checked: boolean }

/**
 * Initialize PDF Export UI listeners
 */
/**
 * Initialize PDF Export UI listeners
 */
function initPdfExport(data) {
  // Bind close buttons
  const closeModalBtn = document.getElementById("close-pdf-modal");
  const cancelModalBtn = document.getElementById("cancel-pdf-btn");
  const generatePdfBtn = document.getElementById("generate-pdf-btn");
  const selectAllCheckbox = document.getElementById("pdf-select-all-checkbox");
  const listContainer = document.getElementById("pdf-columns-list");

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

  // Bind Drag & Drop, and Touch reordering events
  if (listContainer && !listContainer.dataset.listenersBound) {
    setupDragAndDrop(listContainer);
    listContainer.dataset.listenersBound = "true";
  }
}

/**
 * Open the column selection modal for a specific sheet
 * @param {string} sheetKey - "UDISE", "3.0", or "School Data"
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
  const originalHeaders = Object.keys(records[0]);
  
  // Initialize state (keep all checked by default)
  pdfColumnsState = originalHeaders.map(col => ({
    name: col,
    checked: true
  }));

  // Sync Select All checkbox
  const selectAllCheckbox = document.getElementById("pdf-select-all-checkbox");
  if (selectAllCheckbox) selectAllCheckbox.checked = true;

  // Render the checklist
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
  pdfColumnsState = [];
}

/**
 * Toggle all column checked states
 */
function toggleAllPdfColumns(isChecked) {
  pdfColumnsState.forEach(col => {
    col.checked = isChecked;
  });
  renderPdfColumnsList();
}

/**
 * Check if all columns are selected and sync the header checkbox
 */
function syncSelectAllHeader() {
  const selectAllCheckbox = document.getElementById("pdf-select-all-checkbox");
  if (!selectAllCheckbox) return;

  const allChecked = pdfColumnsState.every(col => col.checked);
  const noneChecked = pdfColumnsState.every(col => !col.checked);

  if (allChecked) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else if (noneChecked) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true; // Shows partial check (minus line)
  }
}

/**
 * Synchronize state from HTML DOM reordered elements
 */
function syncPdfStateFromDom() {
  const listContainer = document.getElementById("pdf-columns-list");
  if (!listContainer) return;
  const items = Array.from(listContainer.querySelectorAll(".column-config-item"));
  
  pdfColumnsState = items.map(item => {
    const name = item.dataset.columnName;
    const checked = item.querySelector("input[type='checkbox']").checked;
    return { name, checked };
  });
}

/**
 * Setup Desktop mouse drag & drop and Mobile touch-drag reordering listeners
 */
function setupDragAndDrop(list) {
  // Desktop Drag events
  list.addEventListener("dragstart", (e) => {
    const item = e.target.closest(".column-config-item");
    if (item) {
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.dataset.columnName);
    }
  });

  list.addEventListener("dragend", (e) => {
    const item = e.target.closest(".column-config-item");
    if (item) {
      item.classList.remove("dragging");
    }
    syncPdfStateFromDom();
    syncSelectAllHeader();
  });

  list.addEventListener("dragover", (e) => {
    e.preventDefault();
    const draggingEl = list.querySelector(".dragging");
    if (!draggingEl) return;

    const afterElement = getDragAfterElement(list, e.clientY);
    if (afterElement == null) {
      list.appendChild(draggingEl);
    } else {
      list.insertBefore(draggingEl, afterElement);
    }
  });

  // Mobile Touch events for reordering
  let touchDraggingEl = null;

  list.addEventListener("touchstart", (e) => {
    const handle = e.target.closest(".drag-handle");
    if (!handle) return;

    const item = handle.closest(".column-config-item");
    if (item) {
      touchDraggingEl = item;
      item.classList.add("dragging");
      e.preventDefault(); // Stop mobile scroll when dragging handle
    }
  }, { passive: false });

  list.addEventListener("touchmove", (e) => {
    if (!touchDraggingEl) return;
    e.preventDefault();

    const touch = e.touches[0];
    const afterElement = getDragAfterElement(list, touch.clientY);
    if (afterElement == null) {
      list.appendChild(touchDraggingEl);
    } else {
      list.insertBefore(touchDraggingEl, afterElement);
    }
  }, { passive: false });

  list.addEventListener("touchend", (e) => {
    if (touchDraggingEl) {
      touchDraggingEl.classList.remove("dragging");
      touchDraggingEl = null;
      syncPdfStateFromDom();
      syncSelectAllHeader();
    }
  });
}

/**
 * Helper to determine which item the dragging element is hover positioned over
 */
function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.column-config-item:not(.dragging)')];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

/**
 * Render columns inside the Modal checklist with Drag Handles
 */
function renderPdfColumnsList() {
  const listContainer = document.getElementById("pdf-columns-list");
  if (!listContainer) return;

  listContainer.innerHTML = "";

  pdfColumnsState.forEach((col) => {
    const item = document.createElement("div");
    item.className = "column-config-item";
    item.setAttribute("draggable", "true");
    item.dataset.columnName = col.name;

    // Left elements (checkbox + name)
    const leftDiv = document.createElement("div");
    leftDiv.className = "column-config-item-left";

    const label = document.createElement("label");
    label.className = "checkbox-container";
    
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = col.checked;
    checkbox.addEventListener("change", (e) => {
      col.checked = e.target.checked;
      syncSelectAllHeader();
    });

    const checkmark = document.createElement("span");
    checkmark.className = "checkmark";

    const spanText = document.createElement("span");
    spanText.textContent = col.name;

    label.appendChild(checkbox);
    label.appendChild(checkmark);
    label.appendChild(spanText);
    leftDiv.appendChild(label);

    // Right elements (Drag Handle)
    const rightDiv = document.createElement("div");
    rightDiv.className = "drag-handle";
    rightDiv.title = "Drag to reorder";
    rightDiv.innerHTML = `<i data-lucide="grip-vertical"></i>`;

    item.appendChild(leftDiv);
    item.appendChild(rightDiv);
    listContainer.appendChild(item);
  });

  // Sync Select All checkbox state
  syncSelectAllHeader();

  // Create Lucide grip-vertical icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

/**
 * Generate PDF document using jsPDF & AutoTable
 */
function generatePdfReport() {
  if (!activePdfSheetKey) return;

  const records = window.activeFilteredData[activePdfSheetKey] || [];
  const school = getCurrentSchool();
  const schoolName = school ? school.schoolName : "School";

  // Filter out unchecked columns
  const selectedColumns = pdfColumnsState.filter(c => c.checked).map(c => c.name);

  if (selectedColumns.length === 0) {
    showToast("Please select at least one column to export.", "warning");
    return;
  }

  showToast("Generating PDF document...", "info");

  try {
    // 1. Initialize jsPDF
    const { jsPDF } = window.jspdf;
    
    // Choose orientation based on number of columns selected
    const orientation = selectedColumns.length > 5 ? "landscape" : "portrait";
    const doc = new jsPDF({
      orientation: orientation,
      unit: "mm",
      format: "a4"
    });

    // 2. Add Branding Header
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42); // Primary dark slate
    doc.text(schoolName, 14, 15);
    
    doc.setFontSize(11);
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(71, 85, 105); // Secondary slate
    doc.text(`Sheet: ${activePdfSheetKey} Student Records`, 14, 21);
    
    // Timestamp
    const dateStr = new Date().toLocaleString();
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184); // Light slate/muted
    
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.text(`Generated: ${dateStr}`, pageWidth - 14, 21, { align: "right" });

    // Header separator line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(14, 25, pageWidth - 14, 25);

    // 3. Map rows data for AutoTable input
    const tableBody = records.map(row => {
      return selectedColumns.map(colName => {
        const val = row[colName];
        return (val !== undefined && val !== null) ? val.toString() : "";
      });
    });

    // 4. Generate AutoTable
    doc.autoTable({
      head: [selectedColumns],
      body: tableBody,
      startY: 28,
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
      margin: { left: 14, right: 14, bottom: 15 },
      
      // Page numbering footer
      didDrawPage: function (data) {
        const str = `Page ${data.pageNumber} of ${doc.internal.getNumberOfPages()}`;
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(str, 14, doc.internal.pageSize.getHeight() - 10);
      }
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
