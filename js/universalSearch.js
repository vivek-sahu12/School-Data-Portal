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

  if (!sourceSelect || !columnSelect || !searchInput) return;

  // Set default selection
  sourceSelect.value = "School Data";

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

  // Bind input event on search query
  if (!searchInput.dataset.listenerBound) {
    searchInput.addEventListener("input", () => {
      executeUniversalSearch();
    });
    searchInput.dataset.listenerBound = "true";
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
    const opt = document.createElement("option");
    opt.value = col;
    opt.textContent = col;
    // Default to Name column for best UX
    if (col === "Name") {
      opt.selected = true;
    }
    columnSelect.appendChild(opt);
  });
}

/**
 * Return headers/keys of the first object in a sheet array
 */
function getSheetHeaders(sheetName) {
  if (!universalOriginalData || !universalOriginalData[sheetName]) return [];
  const rows = universalOriginalData[sheetName];
  return rows.length > 0 ? Object.keys(rows[0]) : [];
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
    return;
  }

  let results = [];
  let isCombined = selectedSource === "All";

  // 2. Perform search query filtering
  if (isCombined) {
    // Search in all three sheets
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
        results.push(row);
      }
    });
  }

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
    return;
  }

  // Show table, hide empty panel
  table.classList.remove("hidden");
  emptyState.classList.add("hidden");

  // 5. Render appropriate table headers & rows
  let headersToRender = [];

  if (isCombined) {
    // Headers for combined search: "Source" + common columns
    const udiseCols = getSheetHeaders("UDISE");
    const threeCols = getSheetHeaders("3.0");
    const schoolCols = getSheetHeaders("School Data");

    const commonCols = udiseCols.filter(col => 
      threeCols.includes(col) && schoolCols.includes(col)
    );
    
    // Set rendering headers (Make sure Name, Class, Section come first for visual coherence)
    const priority = ["Name", "Class", "Section"];
    const rest = commonCols.filter(c => !priority.includes(c));
    
    headersToRender = ["Source", ...priority, ...rest];
    
    // Render Head
    const tr = document.createElement("tr");
    headersToRender.forEach(h => {
      const th = document.createElement("th");
      th.textContent = h;
      tr.appendChild(th);
    });
    thead.appendChild(tr);

    // Render Body
    results.forEach(row => {
      const tr = document.createElement("tr");
      
      headersToRender.forEach(h => {
        const td = document.createElement("td");
        
        if (h === "Source") {
          // Source badge rendering
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
          td.textContent = (val !== undefined && val !== null) ? val.toString() : "";
        }
        
        tr.appendChild(td);
      });
      
      tbody.appendChild(tr);
    });

  } else {
    // Headers for single sheet search: display all sheet columns
    headersToRender = getSheetHeaders(selectedSource);

    // Render Head
    const tr = document.createElement("tr");
    headersToRender.forEach(h => {
      const th = document.createElement("th");
      th.textContent = h;
      tr.appendChild(th);
    });
    thead.appendChild(tr);

    // Render Body
    results.forEach(row => {
      const tr = document.createElement("tr");
      
      headersToRender.forEach(h => {
        const td = document.createElement("td");
        const val = row[h];
        td.textContent = (val !== undefined && val !== null) ? val.toString() : "";
        tr.appendChild(td);
      });
      
      tbody.appendChild(tr);
    });
  }
}
