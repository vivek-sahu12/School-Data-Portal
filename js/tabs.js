/**
 * Sheet Tabs View Module
 * Manages tab switching, search, and dynamic table rendering for the three sheets.
 */

// Global state for active tabs data
window.activeFilteredData = {
  "UDISE": [],
  "3.0": [],
  "School Data": [],
  "universal": []
};
window.activeOriginalData = null;
window.currentActiveTab = "dashboard";

// Current contextual column for the table (e.g. for drill-down views)
window.currentTableContextColumn = {
  "udise": null,
  "three-point-zero": null,
  "school-data": null,
  "universal": null
};

// Global table pagination limits
window.tablePaginationLimit = {
  "udise": 25,
  "three-point-zero": 25,
  "school-data": 25,
  "universal": 25
};

/**
 * Helper to get compact column headers to display in the table
 */
window.getTableHeadersToRender = function(originalHeaders, isMobile, contextColumn) {
  const classKey = originalHeaders.find(h => h.toLowerCase() === "class") || "Class";
  const nameKey = originalHeaders.find(h => h.toLowerCase() === "name") || "Name";
  
  const cols = [classKey, nameKey];
  
  if (isMobile) {
    // Show contextual column on mobile if active, otherwise try to show Section
    if (contextColumn && originalHeaders.includes(contextColumn) && contextColumn !== classKey && contextColumn !== nameKey) {
      cols.push(contextColumn);
    } else {
      const sectionKey = originalHeaders.find(h => h.toLowerCase() === "section");
      if (sectionKey) {
        cols.push(sectionKey);
      }
    }
  } else {
    // Desktop layout - show more columns!
    const sectionKey = originalHeaders.find(h => h.toLowerCase() === "section");
    if (sectionKey && !cols.includes(sectionKey)) {
      cols.push(sectionKey);
    }
    if (contextColumn && !cols.includes(contextColumn) && originalHeaders.includes(contextColumn)) {
      cols.push(contextColumn);
    }
    
    // Add 2-3 more columns from originalHeaders
    originalHeaders.forEach(h => {
      if (!cols.includes(h) && h !== classKey && h !== nameKey && cols.length < 6) {
        cols.push(h);
      }
    });
  }
  
  return cols;
};

/**
 * Open Student Detail Modal
 */
window.openStudentDetailModal = function(studentData) {
  const modal = document.getElementById("student-detail-modal");
  const body = document.getElementById("student-modal-body");
  if (!modal || !body) return;

  body.innerHTML = "";
  
  const grid = document.createElement("div");
  grid.className = "student-detail-grid";

  Object.keys(studentData).forEach(key => {
    if (key.startsWith("_")) return;

    const group = document.createElement("div");
    group.className = "detail-group";

    const label = document.createElement("span");
    label.className = "detail-label";
    label.textContent = key;

    const value = document.createElement("span");
    value.className = "detail-value";
    value.textContent = (studentData[key] !== undefined && studentData[key] !== null && studentData[key] !== "") 
      ? studentData[key].toString() 
      : "-";

    group.appendChild(label);
    group.appendChild(value);
    grid.appendChild(group);
  });

  body.appendChild(grid);
  modal.classList.remove("hidden");
};

/**
 * Close Student Detail Modal
 */
window.closeStudentDetailModal = function() {
  const modal = document.getElementById("student-detail-modal");
  if (modal) {
    modal.classList.add("hidden");
  }
};

/**
 * Global function to navigate to a tab programmatically
 */
window.navigateToTab = function(target) {
  const navItem = Array.from(document.querySelectorAll(".nav-item")).find(ni => ni.dataset.target === target);
  if (navItem) {
    navItem.click();
  }
};

/**
 * Initialize all worksheet tabs
 * @param {object} data - Complete school sheets data
 */
function initTabs(data) {
  window.activeOriginalData = data;

  // Initialize each sheet tab (School Data -> UDISE -> 3.0 order)
  setupSheetTab("School Data", "school-data", data["School Data"] || []);
  setupSheetTab("UDISE", "udise", data["UDISE"] || []);
  setupSheetTab("3.0", "three-point-zero", data["3.0"] || []);
}

/**
 * Configure DOM event bindings and initial renders for a single worksheet tab
 */
function setupSheetTab(sheetKey, domPrefix, rows) {
  const searchInput = document.getElementById(`${domPrefix}-search-input`);
  const classSelect = document.getElementById(`${domPrefix}-class-select`);
  const columnSelect = document.getElementById(`${domPrefix}-column-select`);
  const pdfBtn = document.getElementById(`${domPrefix}-pdf-btn`);
  const resetBtn = document.getElementById(`${domPrefix}-reset-btn`);
  const viewMoreBtn = document.getElementById(`${domPrefix}-view-more-btn`);

  // 1. Populate Filter Dropdowns dynamically
  populateDropdownFilters(rows, classSelect, columnSelect, domPrefix);

  // 2. Perform initial filter (empty search) & render table
  applyFiltersAndRender(sheetKey, domPrefix, rows);

  // 3. Bind Search input (real-time filtering)
  if (searchInput && !searchInput.dataset.listenerBound) {
    searchInput.addEventListener("input", () => {
      window.tablePaginationLimit[domPrefix] = 25; // Reset limit
      applyFiltersAndRender(sheetKey, domPrefix, rows);
    });
    searchInput.dataset.listenerBound = "true";
  }

  // 4. Bind Dropdowns changes
  if (classSelect && !classSelect.dataset.listenerBound) {
    classSelect.addEventListener("change", () => {
      window.tablePaginationLimit[domPrefix] = 25; // Reset limit
      applyFiltersAndRender(sheetKey, domPrefix, rows);
    });
    classSelect.dataset.listenerBound = "true";
  }

  if (columnSelect && !columnSelect.dataset.listenerBound) {
    columnSelect.addEventListener("change", () => {
      window.tablePaginationLimit[domPrefix] = 25; // Reset limit
      applyFiltersAndRender(sheetKey, domPrefix, rows);
    });
    columnSelect.dataset.listenerBound = "true";
  }

  // 5. Bind Reset Button
  if (resetBtn && !resetBtn.dataset.listenerBound) {
    resetBtn.addEventListener("click", () => {
      if (classSelect) classSelect.value = "";
      if (columnSelect) {
        // Reset to default column (usually Name)
        const nameOption = Array.from(columnSelect.options).find(opt => opt.value.toLowerCase() === "name");
        if (nameOption) columnSelect.value = nameOption.value;
      }
      if (searchInput) searchInput.value = "";
      window.currentTableContextColumn[domPrefix] = null;
      window.tablePaginationLimit[domPrefix] = 25;
      applyFiltersAndRender(sheetKey, domPrefix, rows);
    });
    resetBtn.dataset.listenerBound = "true";
  }

  // 6. Bind PDF Export trigger
  if (pdfBtn && !pdfBtn.dataset.listenerBound) {
    pdfBtn.addEventListener("click", () => {
      openPdfModalForSheet(sheetKey);
    });
    pdfBtn.dataset.listenerBound = "true";
  }

  // 7. Bind View More button
  if (viewMoreBtn && !viewMoreBtn.dataset.listenerBound) {
    viewMoreBtn.addEventListener("click", () => {
      window.tablePaginationLimit[domPrefix] = (window.tablePaginationLimit[domPrefix] || 25) + 25;
      applyFiltersAndRender(sheetKey, domPrefix, rows);
    });
    viewMoreBtn.dataset.listenerBound = "true";
  }
}

/**
 * Extract unique classes and populate dropdown elements
 */
function populateDropdownFilters(rows, classSelect, columnSelect, domPrefix) {
  const classes = new Set();
  let hasClassColumn = false;

  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    hasClassColumn = headers.includes("Class");
  }

  // Hide or show filters based on whether columns exist
  const classWrapper = document.getElementById(`${domPrefix}-class-filter-wrapper`);
  if (classWrapper) {
    if (hasClassColumn) {
      classWrapper.classList.remove("hidden");
    } else {
      classWrapper.classList.add("hidden");
    }
  }

  rows.forEach(row => {
    if (hasClassColumn && row["Class"] !== undefined && row["Class"] !== null && row["Class"] !== "") {
      classes.add(row["Class"].toString().trim());
    }
  });

  // Populate Class dropdown (natural alphanumeric sorting)
  if (classSelect && hasClassColumn) {
    classSelect.innerHTML = '<option value="">All Classes</option>';
    const sortedClasses = Array.from(classes).sort((a, b) => {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    sortedClasses.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = `Class ${c}`;
      classSelect.appendChild(opt);
    });
  }

  // Populate Column dropdown with available sheet headers
  if (columnSelect && rows.length > 0) {
    columnSelect.innerHTML = "";
    const headers = Object.keys(rows[0]);
    headers.forEach(h => {
      if (h.startsWith("_")) return; // skip internal columns
      const opt = document.createElement("option");
      opt.value = h;
      opt.textContent = h;
      if (h.toLowerCase() === "name") {
        opt.selected = true; // Default search column is Name
      }
      columnSelect.appendChild(opt);
    });
  }
}

/**
 * Filter the rows based on query inputs and update the table DOM
 */
function applyFiltersAndRender(sheetKey, domPrefix, rows) {
  const searchInput = document.getElementById(`${domPrefix}-search-input`);
  const classSelect = document.getElementById(`${domPrefix}-class-select`);
  const columnSelect = document.getElementById(`${domPrefix}-column-select`);

  const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : "";
  const selectedClass = (classSelect && !classSelect.parentElement.classList.contains("hidden")) ? classSelect.value : "";
  const selectedColumn = columnSelect ? columnSelect.value : "";

  // Perform search & filter
  const filtered = rows.filter(row => {
    // 1. Filter by Class
    if (selectedClass) {
      const cls = row["Class"] ? row["Class"].toString().trim() : "";
      if (cls !== selectedClass) return false;
    }

    // 2. Search within the chosen column
    if (searchQuery && selectedColumn) {
      const val = row[selectedColumn] ? row[selectedColumn].toString().toLowerCase() : "";
      if (!val.includes(searchQuery)) return false;
    }

    return true;
  });

  // Save to active state for PDF export
  window.activeFilteredData[sheetKey] = filtered;

  // Render Table
  renderTable(domPrefix, filtered, rows.length > 0 ? Object.keys(rows[0]) : []);
}

/**
 * Render standard tabular HTML with compact column selection & view detail options
 */
function renderTable(domPrefix, filteredRows, originalHeaders) {
  const table = document.getElementById(`${domPrefix}-table`);
  const rowCountSpan = document.getElementById(`${domPrefix}-row-count`);
  const emptyState = document.getElementById(`${domPrefix}-empty-state`);

  if (!table) return;

  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");

  thead.innerHTML = "";
  tbody.innerHTML = "";

  // Update row counts
  if (rowCountSpan) {
    rowCountSpan.textContent = `Showing ${filteredRows.length} rows`;
  }

  // Handle empty state
  if (filteredRows.length === 0) {
    table.classList.add("hidden");
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }

  table.classList.remove("hidden");
  if (emptyState) emptyState.classList.add("hidden");

  // Determine current column scheme
  const isMobile = window.innerWidth <= 768;
  const contextCol = window.currentTableContextColumn[domPrefix];
  const columnsToRender = window.getTableHeadersToRender(originalHeaders, isMobile, contextCol);

  // Create Header Row
  const headerTr = document.createElement("tr");
  columnsToRender.forEach(header => {
    const th = document.createElement("th");
    th.textContent = header;
    headerTr.appendChild(th);
  });
  
  // Action header
  const actionTh = document.createElement("th");
  actionTh.textContent = "Action";
  actionTh.style.width = "75px";
  headerTr.appendChild(actionTh);
  
  thead.appendChild(headerTr);

  // Pagination bounds slice
  const limit = window.tablePaginationLimit[domPrefix] || 25;
  const slicedRows = filteredRows.slice(0, limit);

  // Update pagination footer container display
  const paginationContainer = document.getElementById(`${domPrefix}-pagination-container`);
  if (paginationContainer) {
    if (limit < filteredRows.length) {
      paginationContainer.classList.remove("hidden");
    } else {
      paginationContainer.classList.add("hidden");
    }
  }

  // Create Body Rows
  slicedRows.forEach(row => {
    const tr = document.createElement("tr");
    columnsToRender.forEach(header => {
      const td = document.createElement("td");
      const cellVal = row[header];
      td.textContent = (cellVal !== undefined && cellVal !== null) ? cellVal.toString() : "";
      tr.appendChild(td);
    });

    // Actions cell
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
      window.openStudentDetailModal(row);
    });
    
    actionTd.appendChild(viewBtn);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  });

  // Re-create icons inside view buttons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

/**
 * Handle dashboard chart slice clicks to filter rows and change tabs
 */
window.handleChartSegmentClick = function(type, value) {
  const selectSource = document.getElementById("dashboard-source-select");
  if (!selectSource) return;
  const sourceName = selectSource.value; // "School Data", "UDISE", or "3.0"

  // Map sourceName to domPrefix
  let domPrefix = "";
  if (sourceName === "School Data") domPrefix = "school-data";
  else if (sourceName === "UDISE") domPrefix = "udise";
  else if (sourceName === "3.0") domPrefix = "three-point-zero";

  if (!domPrefix) return;

  const classSelect = document.getElementById(`${domPrefix}-class-select`);
  const columnSelect = document.getElementById(`${domPrefix}-column-select`);
  const searchInput = document.getElementById(`${domPrefix}-search-input`);

  if (!classSelect || !columnSelect || !searchInput) return;

  // Reset pagination
  window.tablePaginationLimit[domPrefix] = 25;

  if (type === "Class") {
    classSelect.value = value;
    const nameOption = Array.from(columnSelect.options).find(opt => opt.value.toLowerCase() === "name");
    if (nameOption) columnSelect.value = nameOption.value;
    searchInput.value = "";
    window.currentTableContextColumn[domPrefix] = null;
  } else if (type === "Gender") {
    classSelect.value = "";
    
    const records = window.activeOriginalData ? window.activeOriginalData[sourceName] : [];
    if (records.length > 0) {
      const headers = Object.keys(records[0]);
      const genderKey = headers.find(h => /gender|sex/i.test(h));
      if (genderKey) {
        columnSelect.value = genderKey;
        window.currentTableContextColumn[domPrefix] = genderKey;
      }
    }
    
    if (value === "Boys") {
      searchInput.value = "Boy";
    } else if (value === "Girls") {
      searchInput.value = "Girl";
    } else {
      searchInput.value = value;
    }
  } else if (type === "Category") {
    classSelect.value = "";
    
    const records = window.activeOriginalData ? window.activeOriginalData[sourceName] : [];
    if (records.length > 0) {
      const headers = Object.keys(records[0]);
      const categoryKey = headers.find(h => /category|caste|social|group|religion/i.test(h));
      if (categoryKey) {
        columnSelect.value = categoryKey;
        window.currentTableContextColumn[domPrefix] = categoryKey;
      }
    }
    
    searchInput.value = value;
  }

  // Trigger filtering
  if (window.activeOriginalData) {
    applyFiltersAndRender(sourceName, domPrefix, window.activeOriginalData[sourceName]);
  }

  // Switch to the target tab
  window.navigateToTab(domPrefix);
};

// Bind Navigation and Drawer clicks
document.addEventListener("DOMContentLoaded", () => {
  const navItems = document.querySelectorAll(".nav-item");
  const drawerItems = document.querySelectorAll(".drawer-nav-item");

  // Handle normal Navigation clicks (both top desktop nav and mobile bottom bar)
  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const target = item.dataset.target;

      // Sync active state in navigation bars
      navItems.forEach(ni => {
        if (ni.dataset.target === target) ni.classList.add("active");
        else ni.classList.remove("active");
      });

      // Sync active state in mobile drawer items
      drawerItems.forEach(di => {
        if (di.dataset.target === target) di.classList.add("active");
        else di.classList.remove("active");
      });

      // Update view section visibilities
      const sections = document.querySelectorAll(".view-section");
      sections.forEach(sec => sec.classList.add("hidden"));

      let viewId = "";
      if (target === "dashboard") viewId = "dashboard-view";
      else if (target === "udise") viewId = "udise-view";
      else if (target === "three-point-zero") viewId = "three-point-zero-view";
      else if (target === "school-data") viewId = "school-data-view";
      else if (target === "universal-search") viewId = "universal-search-view";

      const targetSec = document.getElementById(viewId);
      if (targetSec) {
        targetSec.classList.remove("hidden");
        window.currentActiveTab = target;

        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      }
    });
  });

  // Bind Hamburger menu toggles (active class for smooth animation)
  const drawer = document.getElementById("mobile-drawer");
  const menuToggle = document.getElementById("mobile-menu-toggle");
  const closeDrawer = document.getElementById("close-mobile-drawer");

  if (menuToggle && drawer) {
    menuToggle.addEventListener("click", () => {
      drawer.classList.add("active");
    });
  }

  if (closeDrawer && drawer) {
    closeDrawer.addEventListener("click", () => {
      drawer.classList.remove("active");
    });
  }

  if (drawer) {
    drawer.addEventListener("click", (e) => {
      if (e.target === drawer) {
        drawer.classList.remove("active");
      }
    });
  }

  // Drawer nav clicks
  drawerItems.forEach(dItem => {
    if (dItem.id === "drawer-logout-btn") return;
    dItem.addEventListener("click", () => {
      const target = dItem.dataset.target;
      if (drawer) drawer.classList.remove("active");

      // Find nav-item and click it
      const navItem = Array.from(document.querySelectorAll(".nav-item")).find(ni => ni.dataset.target === target);
      if (navItem) {
        navItem.click();
      }
    });
  });

  // Drawer Sign Out button click
  const drawerLogoutBtn = document.getElementById("drawer-logout-btn");
  const mainLogoutBtn = document.getElementById("logout-btn");
  if (drawerLogoutBtn && mainLogoutBtn) {
    drawerLogoutBtn.addEventListener("click", () => {
      if (drawer) drawer.classList.remove("active");
      mainLogoutBtn.click();
    });
  }

  // Student details modal close actions
  const closeStudentModalX = document.getElementById("close-student-modal");
  const closeStudentModalBtn = document.getElementById("close-student-modal-btn");
  const studentModal = document.getElementById("student-detail-modal");

  if (closeStudentModalX) {
    closeStudentModalX.addEventListener("click", window.closeStudentDetailModal);
  }
  if (closeStudentModalBtn) {
    closeStudentModalBtn.addEventListener("click", window.closeStudentDetailModal);
  }
  if (studentModal) {
    studentModal.addEventListener("click", (e) => {
      if (e.target === studentModal) {
        window.closeStudentDetailModal();
      }
    });
  }
});
