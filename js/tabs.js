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

/**
 * Initialize all worksheet tabs
 * @param {object} data - Complete spreadsheet JSON
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

  // 1. Populate Filter Dropdowns dynamically
  populateDropdownFilters(rows, classSelect, sectionSelect, domPrefix);

  // 2. Perform initial filter (empty search) & render table
  applyFiltersAndRender(sheetKey, domPrefix, rows);

  // 3. Bind Search input (real-time filtering)
  if (searchInput && !searchInput.dataset.listenerBound) {
    searchInput.addEventListener("input", () => {
      applyFiltersAndRender(sheetKey, domPrefix, rows);
    });
    searchInput.dataset.listenerBound = "true";
  }

  // 4. Bind Dropdowns changes
  if (classSelect && !classSelect.dataset.listenerBound) {
    classSelect.addEventListener("change", () => {
      applyFiltersAndRender(sheetKey, domPrefix, rows);
    });
    classSelect.dataset.listenerBound = "true";
  }

  if (sectionSelect && !sectionSelect.dataset.listenerBound) {
    sectionSelect.addEventListener("change", () => {
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
 * Render standard tabular HTML from dataset and headers
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

  // Create Header Row
  const headerTr = document.createElement("tr");
  originalHeaders.forEach(header => {
    const th = document.createElement("th");
    th.textContent = header;
    headerTr.appendChild(th);
  });
  thead.appendChild(headerTr);

  // Create Body Rows
  filteredRows.forEach(row => {
    const tr = document.createElement("tr");
    originalHeaders.forEach(header => {
      const td = document.createElement("td");
      // Format null/undefined cleanly
      const cellVal = row[header];
      td.textContent = (cellVal !== undefined && cellVal !== null) ? cellVal.toString() : "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

// Bind Navigation clicks
document.addEventListener("DOMContentLoaded", () => {
  const navItems = document.querySelectorAll(".nav-item");

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const target = item.dataset.target;

      // Update active nav state
      navItems.forEach(ni => ni.classList.remove("active"));
      item.classList.add("active");

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

        // Re-align layouts or update Lucide icons if required
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      }
    });
  });
});
