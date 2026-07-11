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

// Helper to get compact column headers to display in the table
window.getTableHeadersToRender = function(originalHeaders, isMobile, contextColumn) {
  const isUidKey = window.isSystemColumn;
  const filteredOriginalHeaders = originalHeaders.filter(h => !isUidKey(h));
  const classKey = filteredOriginalHeaders.find(h => h.toLowerCase() === "class") || "Class";
  const nameKey = filteredOriginalHeaders.find(h => h.toLowerCase() === "name") || "Name";
  
  const cols = [classKey, nameKey];
  
  if (isMobile) {
    // Show contextual column on mobile if active, otherwise try to show Section
    if (contextColumn && filteredOriginalHeaders.includes(contextColumn) && contextColumn !== classKey && contextColumn !== nameKey) {
      cols.push(contextColumn);
    } else {
      const sectionKey = filteredOriginalHeaders.find(h => h.toLowerCase() === "section");
      if (sectionKey) {
        cols.push(sectionKey);
      }
    }
  } else {
    // Desktop layout - show more columns!
    const sectionKey = filteredOriginalHeaders.find(h => h.toLowerCase() === "section");
    if (sectionKey && !cols.includes(sectionKey)) {
      cols.push(sectionKey);
    }
    if (contextColumn && !cols.includes(contextColumn) && filteredOriginalHeaders.includes(contextColumn)) {
      cols.push(contextColumn);
    }
    
    // Add 2-3 more columns from filteredOriginalHeaders
    filteredOriginalHeaders.forEach(h => {
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
window.openStudentDetailModal = function(studentData, sourcePrefix) {
  const modal = document.getElementById("student-detail-modal");
  const body = document.getElementById("student-modal-body");
  if (!modal || !body) return;

  body.innerHTML = "";
  
  const grid = document.createElement("div");
  grid.className = "student-detail-grid";

  // Determine the sheet/section type to order columns accordingly
  let sheetType = ""; // "udise", "school-data", or "three-point-zero"
  if (sourcePrefix) {
    const pref = sourcePrefix.toLowerCase();
    if (pref.includes("udise")) sheetType = "udise";
    else if (pref.includes("three") || pref.includes("3")) sheetType = "three-point-zero";
    else sheetType = "school-data";
  } else if (studentData._sourceSheet) {
    const src = studentData._sourceSheet.toLowerCase();
    if (src.includes("udise")) sheetType = "udise";
    else if (src.includes("3.0")) sheetType = "three-point-zero";
    else sheetType = "school-data";
  } else {
    // Fallback detection from column headers
    const keys = Object.keys(studentData);
    if (keys.some(k => /samagra/i.test(k))) {
      sheetType = "three-point-zero";
    } else {
      sheetType = "school-data";
    }
  }

  const isUidKey = window.isSystemColumn;
  const keys = Object.keys(studentData).filter(k => !isUidKey(k));
  let orderedKeys = [];

  if (sheetType === "udise" || sheetType === "school-data") {
    // For UDISE and School Data: Class, Section (if it exists), then others
    const classKey = keys.find(k => k.toLowerCase() === "class");
    const sectionKey = keys.find(k => k.toLowerCase() === "section");
    
    if (classKey) orderedKeys.push(classKey);
    if (sectionKey) orderedKeys.push(sectionKey);
    
    keys.forEach(k => {
      if (!orderedKeys.includes(k)) {
        orderedKeys.push(k);
      }
    });
  } else if (sheetType === "three-point-zero") {
    // For 3.0: Samagra ID, Name, Gender, Category, Father's Name, Mother's Name, then others
    const leadingKeys = [];
    const findAndPush = (patterns) => {
      for (const pattern of patterns) {
        const found = keys.find(k => {
          if (leadingKeys.includes(k)) return false;
          if (pattern instanceof RegExp) {
            return pattern.test(k);
          }
          return k.toLowerCase() === pattern.toLowerCase() || k.toLowerCase().includes(pattern.toLowerCase());
        });
        if (found) {
          leadingKeys.push(found);
          break;
        }
      }
    };

    // 1. Samagra ID
    findAndPush([/samagra\s*id/i, /member\s*id/i, /samagra/i, /id/i]);
    // 2. Name
    findAndPush([/student\s*name/i, /^name$/i, /name/i]);
    // 3. Gender
    findAndPush([/^gender$/i, /^sex$/i, /gender/i]);
    // 4. Category
    findAndPush([/^category$/i, /^caste$/i, /social/i, /category/i]);
    // 5. Father's Name
    findAndPush([/father/i]);
    // 6. Mother's Name
    findAndPush([/mother/i]);

    orderedKeys = [...leadingKeys];
    keys.forEach(k => {
      if (!orderedKeys.includes(k)) {
        orderedKeys.push(k);
      }
    });
  } else {
    orderedKeys = keys;
  }

  orderedKeys.forEach(key => {
    const group = document.createElement("div");
    group.className = "detail-group";

    const label = document.createElement("span");
    label.className = "detail-label";
    label.textContent = key;

    const value = document.createElement("span");
    value.className = "detail-value";
    value.textContent = (studentData[key] !== undefined && studentData[key] !== null && studentData[key] !== "") 
      ? formatCellValue(studentData[key]) 
      : "-";

    group.appendChild(label);
    group.appendChild(value);
    grid.appendChild(group);
  });

  body.appendChild(grid);

  // Render Delete button in the header if delete is allowed and from School Data tab
  const oldDeleteBtn = document.getElementById("delete-student-btn");
  if (oldDeleteBtn) oldDeleteBtn.remove();

  const session = window.getCurrentPermissions ? window.getCurrentPermissions() : {};
  const deletePermission = window.findValueIgnoreCaseAndSpaces(session, "delete") || "No";
  let isDeleteAllowed = String(deletePermission || "").trim().toLowerCase() === "yes";
  if (typeof window.isAdminViewingSession === "function" && window.isAdminViewingSession()) {
    isDeleteAllowed = true;
  }

  if (sheetType === "school-data" && isDeleteAllowed) {
    const header = modal.querySelector(".modal-header");
    const closeBtn = document.getElementById("close-student-modal");
    if (header && closeBtn) {
      const deleteBtn = document.createElement("button");
      deleteBtn.id = "delete-student-btn";
      deleteBtn.className = "icon-btn";
      deleteBtn.style.color = "var(--danger)";
      deleteBtn.style.marginRight = "8px";
      deleteBtn.title = "Delete Student";
      deleteBtn.innerHTML = `<i data-lucide="trash-2" style="width: 18px; height: 18px;"></i>`;
      header.insertBefore(deleteBtn, closeBtn);

      if (window.lucide) {
        window.lucide.createIcons();
      }

      deleteBtn.addEventListener("click", () => {
        if (typeof window.confirmDeleteStudent === "function") {
          window.confirmDeleteStudent(studentData);
        }
      });
    }
  }

  // Render Edit button if editable and from School Data tab
  if (typeof injectEditButton === "function") {
    injectEditButton(modal, studentData, sourcePrefix);
  }

  if (typeof window.pushModalHistory === "function") {
    window.pushModalHistory();
  }
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
};

/**
 * Close Student Detail Modal
 */
window.closeStudentDetailModal = function() {
  if (history.state && history.state.modalOpen) {
    history.back();
    return;
  }
  const modal = document.getElementById("student-detail-modal");
  if (modal) {
    modal.classList.add("hidden");
    document.body.style.overflow = "";
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
  const excelBtn = document.getElementById(`${domPrefix}-excel-btn`);
  const resetBtn = document.getElementById(`${domPrefix}-reset-btn`);

  // Helper to dynamically get the most up-to-date data for this sheet
  const getLatestRows = () => (window.activeOriginalData && window.activeOriginalData[sheetKey]) || rows;

  // 1. Populate Filter Dropdowns dynamically
  populateDropdownFilters(getLatestRows(), classSelect, columnSelect, domPrefix);

  // 2. Perform initial filter (empty search) & render table
  applyFiltersAndRender(sheetKey, domPrefix, getLatestRows());

  // 3. Bind Search input (real-time filtering with 250ms debounce)
  if (searchInput && !searchInput.dataset.listenerBound) {
    searchInput.addEventListener("input", debounce(() => {
      applyFiltersAndRender(sheetKey, domPrefix, getLatestRows());
    }, 250));
    searchInput.dataset.listenerBound = "true";
  }

  // 4. Bind Dropdowns changes
  if (classSelect && !classSelect.dataset.listenerBound) {
    classSelect.addEventListener("change", () => {
      applyFiltersAndRender(sheetKey, domPrefix, getLatestRows());
    });
    classSelect.dataset.listenerBound = "true";
  }

  if (columnSelect && !columnSelect.dataset.listenerBound) {
    columnSelect.addEventListener("change", () => {
      applyFiltersAndRender(sheetKey, domPrefix, getLatestRows());
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
      applyFiltersAndRender(sheetKey, domPrefix, getLatestRows());
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

  // 7. Bind Excel Export trigger
  if (excelBtn && !excelBtn.dataset.listenerBound) {
    excelBtn.addEventListener("click", () => {
      if (typeof exportSheetToExcel === "function") {
        exportSheetToExcel(sheetKey);
      }
    });
    excelBtn.dataset.listenerBound = "true";
  }
}

/**
 * Extract unique classes and populate dropdown elements
 */
function populateDropdownFilters(rows, classSelect, columnSelect, domPrefix) {
  const prevClassVal = classSelect ? classSelect.value : "";
  const prevColVal = columnSelect ? columnSelect.value : "";

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
    const sortedClasses = typeof sortClasses === 'function' ? sortClasses(classes) : Array.from(classes).sort();
    sortedClasses.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = /^\d+$/.test(c) ? `Class ${c}` : c;
      classSelect.appendChild(opt);
    });

    if (prevClassVal && Array.from(classSelect.options).some(opt => opt.value === prevClassVal)) {
      classSelect.value = prevClassVal;
    }
  }

  // Populate Column dropdown with available sheet headers
  if (columnSelect && rows.length > 0) {
    columnSelect.innerHTML = "";
    const isUidKey = window.isSystemColumn;
    const headers = Object.keys(rows[0]);
    headers.forEach(h => {
      if (isUidKey(h)) return; // skip internal columns
      const opt = document.createElement("option");
      opt.value = h;
      opt.textContent = h;
      if (h.toLowerCase() === "name") {
        opt.selected = true; // Default search column is Name
      }
      columnSelect.appendChild(opt);
    });

    if (prevColVal && Array.from(columnSelect.options).some(opt => opt.value === prevColVal)) {
      columnSelect.value = prevColVal;
    }
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
    
    const headerLower = header.toLowerCase();
    if (headerLower === "class" || headerLower === "section" || headerLower === "s.no" || headerLower === "sno" || headerLower === "sr.no") {
      th.className = "col-shrink";
    } else if (headerLower === "name" || headerLower === "student name") {
      th.className = "col-expand";
    }
    
    headerTr.appendChild(th);
  });
  
  // Action header
  const actionTh = document.createElement("th");
  actionTh.textContent = "Action";
  actionTh.style.width = "75px";
  headerTr.appendChild(actionTh);
  
  thead.appendChild(headerTr);

  // Create Body Rows (render all rows)
  filteredRows.forEach(row => {
    const tr = document.createElement("tr");
    columnsToRender.forEach(header => {
      const td = document.createElement("td");
      const cellVal = row[header];
      td.textContent = (cellVal !== undefined && cellVal !== null) ? formatCellValue(cellVal) : "";
      
      const headerLower = header.toLowerCase();
      if (headerLower === "class" || headerLower === "section" || headerLower === "s.no" || headerLower === "sno" || headerLower === "sr.no") {
        td.className = "col-shrink";
      } else if (headerLower === "name" || headerLower === "student name") {
        td.className = "col-expand";
        if (typeof hasPendingEdit === "function" && hasPendingEdit(row.row_uid)) {
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
      window.openStudentDetailModal(row, domPrefix);
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

// State and handler for the mobile drawer
let isDrawerOpen = false;
function setDrawerState(open) {
  isDrawerOpen = open;
  const drawer = document.getElementById("mobile-drawer");
  if (!drawer) return;

  if (isDrawerOpen) {
    drawer.classList.add("active");
    document.body.style.overflow = "hidden"; // Lock background scroll
  } else {
    drawer.classList.remove("active");
    document.body.style.overflow = ""; // Restore background scroll
  }
}

// Unified history state navigation function
window.navigateState = function(state, push = true) {
  if (!state) return;

  // Ignore navigation if not logged in
  if (!localStorage.getItem("sdip_session") && !window.__adminViewSession) {
    return;
  }

  const target = state.tab || "dashboard";
  window.currentActiveTab = target;

  // 1. Sync active state in navigation bars
  const navItems = document.querySelectorAll(".nav-item");
  const drawerItems = document.querySelectorAll(".drawer-nav-item");
  
  navItems.forEach(ni => {
    if (ni.dataset.target === target) ni.classList.add("active");
    else ni.classList.remove("active");
  });

  drawerItems.forEach(di => {
    if (di.dataset.target === target) di.classList.add("active");
    else di.classList.remove("active");
  });

  // 2. Update view section visibilities
  const sections = document.querySelectorAll(".view-section");
  sections.forEach(sec => sec.classList.add("hidden"));

  let viewId = "";
  if (target === "dashboard") viewId = "dashboard-view";
  else if (target === "udise") viewId = "udise-view";
  else if (target === "three-point-zero") viewId = "three-point-zero-view";
  else if (target === "school-data") viewId = "school-data-view";
  else if (target === "universal-search") viewId = "universal-search-view";
  else if (target === "reports") viewId = "reports-view";
  else if (target === "age-calculator") viewId = "age-calculator-view";
  else if (target === "edit-logs") {
    const school = typeof getCurrentSchool === "function" ? getCurrentSchool() : null;
    if (!school || !window.isEditAllowed(school.editable)) {
      setTimeout(() => {
        window.navigateToTab("dashboard");
      }, 0);
      return;
    }
    viewId = "edit-logs-view";
  }
  else if (target === "add-student") {
    const school = typeof getCurrentSchool === "function" ? getCurrentSchool() : null;
    const isAddAllowed = school && (typeof window.isAdminViewingSession === "function" && window.isAdminViewingSession() || String(window.findValueIgnoreCaseAndSpaces(school, "add") || "").trim().toLowerCase() === "yes");
    if (!isAddAllowed) {
      setTimeout(() => {
        window.navigateToTab("dashboard");
      }, 0);
      return;
    }
    viewId = "add-student-view";
    if (typeof window.initAddStudentView === "function") {
      window.initAddStudentView();
    }
  }

  const targetSec = document.getElementById(viewId);
  if (targetSec) {
    targetSec.classList.remove("hidden");
  }

  // 3. Handle Reports State if target is reports
  if (target === "reports") {
    if (window.REPORTS_STATE) {
      window.REPORTS_STATE.activeCategory = state.reportCategory || null;
      window.REPORTS_STATE.activeSubset = state.reportSubset || null;
      
      const mainHeader = document.getElementById("reports-main-header");
      const mainContent = document.getElementById("reports-main-content");
      const detailHeader = document.getElementById("reports-detail-header");
      const detailContent = document.getElementById("reports-detail-content");

      if (mainHeader && mainContent && detailHeader && detailContent) {
        if (state.reportCategory) {
          mainHeader.classList.add("hidden");
          mainContent.classList.add("hidden");
          detailHeader.classList.remove("hidden");
          detailContent.classList.remove("hidden");

          // Reset inputs and sync with subset state
          const searchInput = document.getElementById("report-search-input");
          if (searchInput) {
            searchInput.value = "";
            window.REPORTS_STATE.searchQuery = "";
          }
          
          // Populate class list dropdown first so we can select the class
          if (typeof getCachedDatabase === "function" && typeof populateClassFilter === "function") {
            const cachedDb = getCachedDatabase();
            if (cachedDb) {
              populateClassFilter(cachedDb["School Data"] || []);
            }
          }

          const classSelect = document.getElementById("report-class-select");
          if (classSelect) {
            const desiredClass = (state.reportSubset && state.reportSubset.class) ? state.reportSubset.class : "";
            classSelect.value = desiredClass;
            window.REPORTS_STATE.selectedClass = desiredClass;
          }

          if (typeof window.renderActiveCategoryDetail === "function") {
            window.renderActiveCategoryDetail();
          }
        } else {
          mainHeader.classList.remove("hidden");
          mainContent.classList.remove("hidden");
          detailHeader.classList.add("hidden");
          detailContent.classList.add("hidden");

          if (typeof window.renderReports === "function") {
            window.renderReports();
          }
        }
      }
    }
  }

  // 4. Push history state if requested
  if (push) {
    history.pushState(state, "", "");
  }

  // Create Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
};

// Initialize history state on page load
window.addEventListener("load", () => {
  if (localStorage.getItem("sdip_session") || window.__adminViewSession) {
    const initialState = {
      tab: window.currentActiveTab || "dashboard",
      reportCategory: (window.REPORTS_STATE && window.REPORTS_STATE.activeCategory) || null,
      reportSubset: (window.REPORTS_STATE && window.REPORTS_STATE.activeSubset) || null
    };
    history.replaceState(initialState, "", "");
  }
});

// Global Modal History Utilities
window.pushModalHistory = function() {
  const currentState = history.state || {};
  if (!currentState.modalOpen) {
    history.pushState({ ...currentState, modalOpen: true }, "", "");
  }
};

window.closeAllModals = function() {
  const detailModal = document.getElementById("student-detail-modal");
  const editModal = document.getElementById("student-edit-modal");
  const pdfModal = document.getElementById("pdf-export-modal");
  let closed = false;

  if (detailModal && !detailModal.classList.contains("hidden")) {
    detailModal.classList.add("hidden");
    closed = true;
  }
  if (editModal && !editModal.classList.contains("hidden")) {
    editModal.classList.add("hidden");
    closed = true;
  }
  if (pdfModal && !pdfModal.classList.contains("hidden")) {
    if (typeof closePdfModal === "function") {
      closePdfModal(true);
    } else {
      pdfModal.classList.add("hidden");
    }
    closed = true;
  }
  const deleteModal = document.getElementById("delete-student-modal");
  if (deleteModal && !deleteModal.classList.contains("hidden")) {
    deleteModal.classList.add("hidden");
    closed = true;
  }
  const recoverModal = document.getElementById("recover-student-modal");
  if (recoverModal && !recoverModal.classList.contains("hidden")) {
    recoverModal.classList.add("hidden");
    closed = true;
  }
  
  if (closed) {
    document.body.style.overflow = "";
  }
  
  return closed;
};

// Bind popstate event
window.addEventListener("popstate", (event) => {
  if (!localStorage.getItem("sdip_session") && !window.__adminViewSession) {
    return;
  }
  
  // Close any open modals first
  const closedModal = window.closeAllModals();
  if (closedModal && event.state && event.state.tab === window.currentActiveTab) {
    // If a modal was closed and we are staying on the same tab, stop routing
    return;
  }

  if (event.state) {
    window.navigateState(event.state, false);
  } else {
    // Fallback to dashboard
    window.navigateState({
      tab: "dashboard",
      reportCategory: null,
      reportSubset: null
    }, false);
  }
});

// Bind Navigation and Drawer clicks
document.addEventListener("DOMContentLoaded", () => {
  const navItems = document.querySelectorAll(".nav-item");
  const drawerItems = document.querySelectorAll(".drawer-nav-item");

  // Handle normal Navigation clicks
  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const target = item.dataset.target;
      window.navigateState({
        tab: target,
        reportCategory: null,
        reportSubset: null
      });
    });
  });

  // Bind Hamburger menu toggles
  const menuToggle = document.getElementById("mobile-menu-toggle");
  const closeDrawer = document.getElementById("close-mobile-drawer");
  const drawer = document.getElementById("mobile-drawer");

  if (menuToggle && !menuToggle.dataset.listenerBound) {
    menuToggle.addEventListener("click", () => setDrawerState(true));
    menuToggle.dataset.listenerBound = "true";
  }

  if (closeDrawer && !closeDrawer.dataset.listenerBound) {
    closeDrawer.addEventListener("click", () => setDrawerState(false));
    closeDrawer.dataset.listenerBound = "true";
  }

  if (drawer && !drawer.dataset.listenerBound) {
    drawer.addEventListener("click", (e) => {
      if (e.target === drawer) {
        setDrawerState(false);
      }
    });
    drawer.dataset.listenerBound = "true";
  }

  // Drawer nav clicks
  drawerItems.forEach(dItem => {
    if (dItem.dataset.listenerBound) return;
    dItem.dataset.listenerBound = "true";

    if (dItem.id === "drawer-logout-btn") {
      dItem.addEventListener("click", () => {
        setDrawerState(false);
        if (typeof logout === "function") {
          logout();
        }
      });
      return;
    }

    dItem.addEventListener("click", () => {
      const target = dItem.dataset.target;
      setDrawerState(false);

      window.navigateState({
        tab: target,
        reportCategory: null,
        reportSubset: null
      });
    });
  });

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
