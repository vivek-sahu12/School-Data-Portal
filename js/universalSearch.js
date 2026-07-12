/**
 * Universal Search Module
 * Manages cross-sheet database querying with dynamic column intersections.
 */

let universalOriginalData = null;

/**
 * Initialize universal search component
 * @param {object} data - Complete school data
 */
function initUniversalSearch(data) {
  universalOriginalData = data;

  const sourceSelect = document.getElementById("universal-source-select");
  const columnSelect = document.getElementById("universal-column-select");
  const searchInput = document.getElementById("universal-search-input");
  const resetBtn = document.getElementById("universal-reset-btn");
  const pdfBtn = document.getElementById("universal-pdf-btn");
  const excelBtn = document.getElementById("universal-excel-btn");

  if (!sourceSelect || !columnSelect || !searchInput) return;

  // Set default selection, preserving previous value if present
  const prevSource = sourceSelect.value;
  if (prevSource && Array.from(sourceSelect.options).some(opt => opt.value === prevSource)) {
    sourceSelect.value = prevSource;
  } else {
    sourceSelect.value = "School Data";
  }

  // Bind change event on source selection
  if (!sourceSelect.dataset.listenerBound) {
    sourceSelect.addEventListener("change", () => {
      populateUniversalSearchColumns();
      executeUniversalSearch();
    });
    sourceSelect.dataset.listenerBound = "true";
  }

  // Bind change event on column selection
  if (!columnSelect.dataset.listenerBound) {
    columnSelect.addEventListener("change", () => {
      executeUniversalSearch();
    });
    columnSelect.dataset.listenerBound = "true";
  }

  // Bind input event on search query with a 250ms debounce
  if (!searchInput.dataset.listenerBound) {
    searchInput.addEventListener("input", debounce(() => {
      executeUniversalSearch();
    }, 250));
    searchInput.dataset.listenerBound = "true";
  }

  // Bind Reset button
  if (resetBtn && !resetBtn.dataset.listenerBound) {
    resetBtn.addEventListener("click", () => {
      sourceSelect.value = "School Data";
      searchInput.value = "";
      populateUniversalSearchColumns();
      executeUniversalSearch();
    });
    resetBtn.dataset.listenerBound = "true";
  }

  // Bind PDF export button
  if (pdfBtn && !pdfBtn.dataset.listenerBound) {
    pdfBtn.addEventListener("click", () => {
      // Open PDF modal passing "universal" as the sheet key
      if (typeof openPdfModalForSheet === 'function') {
        openPdfModalForSheet("universal");
      }
    });
    pdfBtn.dataset.listenerBound = "true";
  }

  // Bind Excel export button
  if (excelBtn && !excelBtn.dataset.listenerBound) {
    excelBtn.addEventListener("click", () => {
      if (typeof exportSheetToExcel === "function") {
        exportSheetToExcel("universal");
      }
    });
    excelBtn.dataset.listenerBound = "true";
  }

  // Initial column populate
  populateUniversalSearchColumns();
  executeUniversalSearch();
}

/**
 * Dynamically populate column selector based on the active search scope
 */
function populateUniversalSearchColumns() {
  const sourceSelect = document.getElementById("universal-source-select");
  const columnSelect = document.getElementById("universal-column-select");
  
  if (!sourceSelect || !columnSelect || !universalOriginalData) return;

  const selectedSource = sourceSelect.value;
  const prevColVal = columnSelect.value;
  columnSelect.innerHTML = "";

  let columnsToShow = [];

  if (selectedSource === "All") {
    // Calculate the intersection of columns across all three sheets
    const udiseCols = getSheetHeaders("UDISE");
    const threeCols = getSheetHeaders("3.0");
    const schoolCols = getSheetHeaders("School Data");

    // Columns present in all sheets
    columnsToShow = udiseCols.filter(col => 
      threeCols.includes(col) && schoolCols.includes(col)
    );

    // Fallback guarantees: Name, Class, Section should always match, but compute actuals
    if (columnsToShow.length === 0) {
      columnsToShow = ["Name", "Class", "Section"];
    }
  } else {
    // Specific sheet columns
    columnsToShow = getSheetHeaders(selectedSource);
  }

  // Populate drop-down options
  columnsToShow.forEach(col => {
    if (col.startsWith("_")) return; // skip internal columns
    const opt = document.createElement("option");
    opt.value = col;
    opt.textContent = col;
    // Default to Name column for best UX
    if (col.toLowerCase() === "name") {
      opt.selected = true;
    }
    columnSelect.appendChild(opt);
  });

  if (prevColVal && Array.from(columnSelect.options).some(opt => opt.value === prevColVal)) {
    columnSelect.value = prevColVal;
  }
}

/**
 * Return headers/keys of the first object in a sheet array
 */
function getSheetHeaders(sheetName) {
  if (!universalOriginalData || !universalOriginalData[sheetName]) return [];
  const rows = universalOriginalData[sheetName];
  const isUidKey = window.isInternalField;
  return rows.length > 0 ? Object.keys(rows[0]).filter(k => !isUidKey(k)) : [];
}

/**
 * Perform search filtering and render results
 */
function executeUniversalSearch() {
  const sourceSelect = document.getElementById("universal-source-select");
  const columnSelect = document.getElementById("universal-column-select");
  const searchInput = document.getElementById("universal-search-input");
  
  const table = document.getElementById("universal-table");
  const rowCountSpan = document.getElementById("universal-row-count");
  const emptyState = document.getElementById("universal-empty-state");

  if (!table || !rowCountSpan || !emptyState || !universalOriginalData) return;

  const query = searchInput.value.toLowerCase().trim();
  const selectedSource = sourceSelect.value;
  const selectedColumn = columnSelect.value;

  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  
  thead.innerHTML = "";
  tbody.innerHTML = "";

  // 1. If search text is empty, clear table and show help state
  if (!query) {
    table.classList.add("hidden");
    emptyState.classList.remove("hidden");
    emptyState.querySelector("p").textContent = "Type a keyword above to find students.";
    
    // Set icon back to search
    const icon = emptyState.querySelector("i");
    if (icon) {
      icon.setAttribute("data-lucide", "search");
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    
    rowCountSpan.textContent = "No search executed";
    
    // Hide pagination container when empty
    const paginationContainer = document.getElementById("universal-pagination-container");
    if (paginationContainer) paginationContainer.classList.add("hidden");
    
    // Clear active filtered data
    window.activeFilteredData["universal"] = [];
    return;
  }

  let results = [];
  let isCombined = selectedSource === "All";

  // 2. Perform search query filtering
  if (isCombined) {
    // Search in all three sheets (School Data first, then UDISE, then 3.0 order)
    const sheets = ["School Data", "UDISE", "3.0"];
    
    sheets.forEach(sheet => {
      const rows = universalOriginalData[sheet] || [];
      rows.forEach(row => {
        const cellValue = row[selectedColumn] ? row[selectedColumn].toString().toLowerCase() : "";
        if (cellValue.includes(query)) {
          // Clone and tag row with source sheet
          results.push({
            ...row,
            _sourceSheet: sheet
          });
        }
      });
    });
  } else {
    // Search in single sheet
    const rows = universalOriginalData[selectedSource] || [];
    rows.forEach(row => {
      const cellValue = row[selectedColumn] ? row[selectedColumn].toString().toLowerCase() : "";
      if (cellValue.includes(query)) {
        results.push({
          ...row,
          _sourceSheet: selectedSource
        });
      }
    });
  }

  // Save to active state for PDF export
  window.activeFilteredData["universal"] = results;

  // 3. Update Row count display
  rowCountSpan.textContent = `Found ${results.length} matching record${results.length === 1 ? '' : 's'}`;

  // 4. Handle empty search results state
  if (results.length === 0) {
    table.classList.add("hidden");
    emptyState.classList.remove("hidden");
    emptyState.querySelector("p").textContent = `No records found containing "${searchInput.value}" in column "${selectedColumn}".`;
    
    const icon = emptyState.querySelector("i");
    if (icon) {
      icon.setAttribute("data-lucide", "search-code");
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    const paginationContainer = document.getElementById("universal-pagination-container");
    if (paginationContainer) paginationContainer.classList.add("hidden");

    return;
  }

  // Show table, hide empty panel
  table.classList.remove("hidden");
  emptyState.classList.add("hidden");

  // 5. Render appropriate table headers & rows (using contextual column order logic)
  let headersToRender = [];
  const isMobile = window.innerWidth <= 768;

  if (isCombined) {
    // Headers for combined search: "Source" + Class + Name + Contextual/Section
    const udiseCols = getSheetHeaders("UDISE");
    const threeCols = getSheetHeaders("3.0");
    const schoolCols = getSheetHeaders("School Data");

    const commonCols = udiseCols.filter(col => 
      threeCols.includes(col) && schoolCols.includes(col)
    );
    
    const columnsToRender = window.getTableHeadersToRender(commonCols, isMobile, selectedColumn);
    headersToRender = ["Source", ...columnsToRender];
  } else {
    // Headers for single sheet search: display Class, Name, Contextual/Section
    headersToRender = window.getTableHeadersToRender(getSheetHeaders(selectedSource), isMobile, selectedColumn);
  }

  // Create Header Row
  const tr = document.createElement("tr");
  headersToRender.forEach(h => {
    const th = document.createElement("th");
    th.textContent = h;
    
    const hLower = h.toLowerCase();
    if (hLower === "class" || hLower === "section" || hLower === "s.no" || hLower === "sno" || hLower === "sr.no") {
      th.className = "col-shrink";
    } else if (hLower === "name" || hLower === "student name") {
      th.className = "col-expand";
    }
    
    tr.appendChild(th);
  });
  
  // Action header
  const actionTh = document.createElement("th");
  actionTh.textContent = "Action";
  actionTh.style.width = "75px";
  tr.appendChild(actionTh);
  thead.appendChild(tr);

  // Render Body
  results.forEach(row => {
    const bodyTr = document.createElement("tr");
    
    headersToRender.forEach(h => {
      const td = document.createElement("td");
      
      const hLower = h.toLowerCase();
      if (hLower === "class" || hLower === "section" || hLower === "s.no" || hLower === "sno" || hLower === "sr.no") {
        td.className = "col-shrink";
      } else if (hLower === "name" || hLower === "student name") {
        td.className = "col-expand";
        if (row._sourceSheet === "School Data" && typeof hasPendingEdit === "function" && hasPendingEdit(row.row_uid)) {
          const queue = typeof getPendingQueue === "function" ? getPendingQueue() : [];
          const entry = queue.find(e => e.row_uid === row.row_uid);
          const action = entry ? (entry.action || "edit") : "edit";

          let badgeText = "Pending";
          let badgeBg = "var(--warning)";
          let badgeIcon = "refresh-cw";

          if (entry && entry.status === "failed") {
            badgeText = "Failed Sync";
            badgeBg = "var(--danger)";
            badgeIcon = "alert-triangle";
          } else if (action === "add") {
            badgeText = "Pending Add";
            badgeBg = "var(--success)";
            badgeIcon = "user-plus";
          } else if (action === "delete") {
            badgeText = "Pending Del";
            badgeBg = "var(--danger)";
            badgeIcon = "trash-2";
          }

          const badge = document.createElement("span");
          badge.className = "pending-sync-badge";
          badge.style.display = "inline-flex";
          badge.style.alignItems = "center";
          badge.style.marginLeft = "8px";
          badge.style.padding = "2px 6px";
          badge.style.fontSize = "10px";
          badge.style.fontWeight = "bold";
          badge.style.backgroundColor = badgeBg;
          badge.style.color = "var(--bg-surface)";
          badge.style.borderRadius = "4px";
          badge.innerHTML = `<i data-lucide="${badgeIcon}" style="width: 10px; height: 10px; margin-right: 3px;"></i>${badgeText}`;
          td.appendChild(badge);
        }
      }

      if (h === "Source") {
        const badge = document.createElement("span");
        const src = row._sourceSheet;
        let badgeClass = "school-data";
        
        if (src === "UDISE") badgeClass = "udise";
        else if (src === "3.0") badgeClass = "three-point-zero";
        
        badge.className = `source-badge ${badgeClass}`;
        badge.textContent = src;
        td.appendChild(badge);
      } else {
        const val = row[h];
        const textVal = (val !== undefined && val !== null) ? formatCellValue(val) : "";
        
        // Highlighting match keyword in selected search column
        if (query && h === selectedColumn) {
          const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regex = new RegExp(`(${escapedQuery})`, 'gi');
          td.innerHTML = textVal.replace(regex, '<mark class="highlight">$1</mark>');
        } else {
          td.textContent = textVal;
        }
      }
      
      bodyTr.appendChild(td);
    });

    // View action button
    const actionTd = document.createElement("td");
    const viewBtn = document.createElement("button");
    viewBtn.className = "btn-secondary btn-view-row";
    viewBtn.style.padding = "4px 8px";
    viewBtn.style.fontSize = "0.75rem";
    viewBtn.style.display = "inline-flex";
    viewBtn.style.alignItems = "center";
    viewBtn.style.gap = "4px";
    viewBtn.innerHTML = `<i data-lucide="eye" style="width: 12px; height: 12px;"></i>View`;
    
    viewBtn.addEventListener("click", () => {
      window.openStudentDetailModal(row, row._sourceSheet);
    });
    
    actionTd.appendChild(viewBtn);
    bodyTr.appendChild(actionTd);
    tbody.appendChild(bodyTr);
  });

  // Re-create icons inside view buttons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}
