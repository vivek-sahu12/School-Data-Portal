/**
 * Sheet Tabs View Module
 * Manages tab switching, search, and dynamic table rendering for the three sheets.
 */

// Global state for active tabs data
window.activeFilteredData = {
  "UDISE": [],
  "3.0": [],
  "School Data": []
};
window.activeOriginalData = null;
window.currentActiveTab = "dashboard";

// Global table pagination limits
window.tablePaginationLimit = {
  "udise": 25,
  "three-point-zero": 25,
  "school-data": 25,
  "universal": 25
};

/**
 * Helper to get 3 compact columns to display in table
 */
window.getCompactHeaders = function(originalHeaders) {
  const preferred = ["Name", "Class", "Section"];
  const matched = [];
  preferred.forEach(pref => {
    const key = originalHeaders.find(h => h.toLowerCase() === pref.toLowerCase());
    if (key) matched.push(key);
  });
  
  // Fill up to 3 columns if we don't have enough preferred ones
  if (matched.length < 3) {
    originalHeaders.forEach(h => {
      if (!matched.includes(h) && matched.length < 3) {
        matched.push(h);
      }
    });
  }
  return matched;
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

  // Initialize each sheet tab
  setupSheetTab("UDISE", "udise", data["UDISE"] || []);
  setupSheetTab("3.0", "three-point-zero", data["3.0"] || []);
  setupSheetTab("School Data", "school-data", data["School Data"] || []);
}

/**
 * Configure DOM event bindings and initial renders for a single worksheet tab
 */
function setupSheetTab(sheetKey, domPrefix, rows) {
  const searchInput = document.getElementById(`${domPrefix}-search-input`);
  const classSelect = document.getElementById(`${domPrefix}-class-select`);
  const sectionSelect = document.getElementById(`${domPrefix}-section-select`);
  const pdfBtn = document.getElementById(`${domPrefix}-pdf-btn`);
  const viewMoreBtn = document.getElementById(`${domPrefix}-view-more-btn`);

  // 1. Populate Filter Dropdowns dynamically
  populateDropdownFilters(rows, classSelect, sectionSelect, domPrefix);

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

  if (sectionSelect && !sectionSelect.dataset.listenerBound) {
    sectionSelect.addEventListener("change", () => {
      window.tablePaginationLimit[domPrefix] = 25; // Reset limit
      applyFiltersAndRender(sheetKey, domPrefix, rows);
    });
    sectionSelect.dataset.listenerBound = "true";
  }

  // 5. Bind PDF Export trigger
  if (pdfBtn && !pdfBtn.dataset.listenerBound) {
    pdfBtn.addEventListener("click", () => {
      openPdfModalForSheet(sheetKey);
    });
    pdfBtn.dataset.listenerBound = "true";
  }

  // 6. Bind View More button
  if (viewMoreBtn && !viewMoreBtn.dataset.listenerBound) {
    viewMoreBtn.addEventListener("click", () => {
      window.tablePaginationLimit[domPrefix] = (window.tablePaginationLimit[domPrefix] || 25) + 25;
      applyFiltersAndRender(sheetKey, domPrefix, rows);
    });
    viewMoreBtn.dataset.listenerBound = "true";
  }
}

/**
 * Extract unique classes and sections and populate dropdown elements
 */
function populateDropdownFilters(rows, classSelect, sectionSelect, domPrefix) {
  const classes = new Set();
  const sections = new Set();

  let hasClassColumn = false;
  let hasSectionColumn = false;

  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    hasClassColumn = headers.includes("Class");
    hasSectionColumn = headers.includes("Section");
  }

  // Hide or show filters based on whether columns exist
  const classWrapper = document.getElementById(`${domPrefix}-class-filter-wrapper`);
  const sectionWrapper = document.getElementById(`${domPrefix}-section-filter-wrapper`);

  if (classWrapper) {
    if (hasClassColumn) {
      classWrapper.classList.remove("hidden");
    } else {
      classWrapper.classList.add("hidden");
    }
  }

  if (sectionWrapper) {
    if (hasSectionColumn) {
      sectionWrapper.classList.remove("hidden");
    } else {
      sectionWrapper.classList.add("hidden");
    }
  }

  rows.forEach(row => {
    if (hasClassColumn && row["Class"] !== undefined && row["Class"] !== null && row["Class"] !== "") {
      classes.add(row["Class"].toString().trim());
    }
    if (hasSectionColumn && row["Section"] !== undefined && row["Section"] !== null && row["Section"] !== "") {
      sections.add(row["Section"].toString().trim());
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

  // Populate Section dropdown (alphabetical sorting)
  if (sectionSelect && hasSectionColumn) {
    sectionSelect.innerHTML = '<option value="">All Sections</option>';
    const sortedSections = Array.from(sections).sort();
    sortedSections.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = `Section ${s}`;
      sectionSelect.appendChild(opt);
    });
  }
}

/**
 * Filter the rows based on query inputs and update the table DOM
 */
function applyFiltersAndRender(sheetKey, domPrefix, rows) {
  const searchInput = document.getElementById(`${domPrefix}-search-input`);
  const classSelect = document.getElementById(`${domPrefix}-class-select`);
  const sectionSelect = document.getElementById(`${domPrefix}-section-select`);

  const nameQuery = searchInput ? searchInput.value.toLowerCase().trim() : "";
  const selectedClass = (classSelect && !classSelect.parentElement.classList.contains("hidden")) ? classSelect.value : "";
  const selectedSection = (sectionSelect && !sectionSelect.parentElement.classList.contains("hidden")) ? sectionSelect.value : "";

  // Perform search & filter
  const filtered = rows.filter(row => {
    // 1. Search by Name
    const name = row["Name"] ? row["Name"].toString().toLowerCase() : "";
    if (nameQuery && !name.includes(nameQuery)) {
      return false;
    }

    // 2. Filter by Class
    if (selectedClass) {
      const cls = row["Class"] ? row["Class"].toString().trim() : "";
      if (cls !== selectedClass) return false;
    }

    // 3. Filter by Section
    if (selectedSection) {
      const sec = row["Section"] ? row["Section"].toString().trim() : "";
      if (sec !== selectedSection) return false;
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

  // Get compact columns
  const compactHeaders = window.getCompactHeaders(originalHeaders);

  // Create Header Row
  const headerTr = document.createElement("tr");
  compactHeaders.forEach(header => {
    const th = document.createElement("th");
    th.textContent = header;
    headerTr.appendChild(th);
  });
  
  // Action header
  const actionTh = document.createElement("th");
  actionTh.textContent = "Action";
  actionTh.style.width = "80px";
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
    compactHeaders.forEach(header => {
      const td = document.createElement("td");
      const cellVal = row[header];
      td.textContent = (cellVal !== undefined && cellVal !== null) ? cellVal.toString() : "";
      tr.appendChild(td);
    });

    // Actions cell
    const actionTd = document.createElement("td");
    const viewBtn = document.createElement("button");
    viewBtn.className = "btn-secondary btn-view-row";
    viewBtn.style.padding = "6px 12px";
    viewBtn.style.fontSize = "0.8rem";
    viewBtn.style.display = "inline-flex";
    viewBtn.style.alignItems = "center";
    viewBtn.style.gap = "4px";
    viewBtn.innerHTML = `<i data-lucide="eye" style="width: 14px; height: 14px;"></i>View`;
    
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

// Bind Navigation and Drawer clicks
document.addEventListener("DOMContentLoaded", () => {
  const navItems = document.querySelectorAll(".nav-item");
  const drawerItems = document.querySelectorAll(".drawer-nav-item");

  // Handle normal Navigation clicks
  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const target = item.dataset.target;

      // Sync active state in sidebar/bottom navigation
      navItems.forEach(ni => ni.classList.remove("active"));
      item.classList.add("active");

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

  // Bind Hamburger menu toggles
  const drawer = document.getElementById("mobile-drawer");
  const menuToggle = document.getElementById("mobile-menu-toggle");
  const closeDrawer = document.getElementById("close-mobile-drawer");

  if (menuToggle && drawer) {
    menuToggle.addEventListener("click", () => {
      drawer.classList.remove("hidden");
    });
  }

  if (closeDrawer && drawer) {
    closeDrawer.addEventListener("click", () => {
      drawer.classList.add("hidden");
    });
  }

  if (drawer) {
    drawer.addEventListener("click", (e) => {
      if (e.target === drawer) {
        drawer.classList.add("hidden");
      }
    });
  }

  // Drawer nav clicks
  drawerItems.forEach(dItem => {
    if (dItem.id === "drawer-logout-btn") return;
    dItem.addEventListener("click", () => {
      const target = dItem.dataset.target;
      if (drawer) drawer.classList.add("hidden");

      // Find normal sidebar nav-item and click it to change tab
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
      if (drawer) drawer.classList.add("hidden");
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
