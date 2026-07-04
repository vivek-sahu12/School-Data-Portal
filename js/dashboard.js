/**
 * Dashboard Analytics Module
 * Computes metrics and renders clean, number-based stat cards and tiles.
 */

let currentSchoolData = null;

/**
 * Initialize or update the dashboard with new data
 * @param {object} data - Normalized school sheets data
 */
function initDashboard(data) {
  currentSchoolData = data;

  // Render static total counts for all three sources permanently
  const udiseCount = data["UDISE"] ? data["UDISE"].length : 0;
  const threeCount = data["3.0"] ? data["3.0"].length : 0;
  const schoolCount = data["School Data"] ? data["School Data"].length : 0;

  const udiseEl = document.getElementById("stat-udise-students");
  const threeEl = document.getElementById("stat-three-point-zero-students");
  const schoolEl = document.getElementById("stat-school-data-students");

  if (udiseEl) udiseEl.textContent = udiseCount;
  if (threeEl) threeEl.textContent = threeCount;
  if (schoolEl) schoolEl.textContent = schoolCount;

  // Update Configured Range status
  const rangeDisplay = document.getElementById("configured-range-display");
  if (rangeDisplay) {
    const sessionRaw = localStorage.getItem("school-portal-session") || localStorage.getItem("sdip_session");
    let startClass = "";
    let endClass = "";
    if (sessionRaw) {
      try {
        const session = JSON.parse(sessionRaw);
        startClass = window.findValueIgnoreCaseAndSpaces(session, 'startclass') || "";
        endClass = window.findValueIgnoreCaseAndSpaces(session, 'endclass') || "";
      } catch(e) {}
    }
    if (startClass && endClass) {
      rangeDisplay.textContent = `${startClass} to ${endClass}`;
    } else {
      rangeDisplay.textContent = "Not Configured (showing all Nursery to Class 12)";
    }
  }

  // Bind clickable metric cards
  document.querySelectorAll(".clickable-metric-card").forEach(card => {
    if (!card.dataset.listenerBound) {
      card.addEventListener("click", () => {
        const target = card.dataset.target;
        if (target && typeof window.navigateToTab === 'function') {
          window.navigateToTab(target);
        }
      });
      card.dataset.listenerBound = "true";
    }
  });

  // Set up source change listener if not already done
  const selectSource = document.getElementById("dashboard-source-select");
  if (selectSource && !selectSource.dataset.listenerBound) {
    selectSource.addEventListener("change", () => {
      calculateAndRenderDashboard(selectSource.value);
    });
    selectSource.dataset.listenerBound = "true";
  }

  // Default to "School Data" if it exists, otherwise use the first sheet available
  const defaultSource = data["School Data"] ? "School Data" : Object.keys(data)[0];
  let activeSource = defaultSource;
  if (selectSource) {
    const prevSource = selectSource.value;
    if (prevSource && Array.from(selectSource.options).some(opt => opt.value === prevSource)) {
      selectSource.value = prevSource;
      activeSource = prevSource;
    } else {
      selectSource.value = defaultSource;
    }
  }

  calculateAndRenderDashboard(activeSource);
}

/**
 * Perform stats calculations and draw the dashboard cards/tiles
 * @param {string} sourceName - The active worksheet name
 */
function calculateAndRenderDashboard(sourceName) {
  if (!currentSchoolData || !currentSchoolData[sourceName]) {
    console.warn(`Worksheet ${sourceName} not found in loaded data.`);
    return;
  }

  const rows = currentSchoolData[sourceName];

  // Render Stats
  renderSchoolProfile();
  renderInsights(rows);
  renderGenderChart(rows);
  renderCategoryChart(rows);
  renderClassChart(rows);
}

/**
 * Dynamically look for gender column and draw stat tiles
 */
function renderGenderChart(rows) {
  const container = document.getElementById("gender-stats-container");
  if (!container) return;

  container.innerHTML = "";

  if (rows.length === 0) {
    container.innerHTML = `<p class="chart-fallback-text">No data available.</p>`;
    return;
  }

  // Find header representing gender
  const headers = Object.keys(rows[0]);
  const genderKey = headers.find(h => /gender|sex/i.test(h));

  if (!genderKey) {
    container.innerHTML = `<p class="chart-fallback-text">No gender/sex column detected.</p>`;
    return;
  }

  // Calculate counts
  let boys = 0;
  let girls = 0;
  let others = 0;

  rows.forEach(row => {
    const val = row[genderKey] ? row[genderKey].toString().trim().toLowerCase() : "";
    if (val === "male" || val === "boy" || val === "m") {
      boys++;
    } else if (val === "female" || val === "girl" || val === "f") {
      girls++;
    } else if (val) {
      others++;
    }
  });

  const stats = [
    { label: "Boys", value: boys, className: "boys" },
    { label: "Girls", value: girls, className: "girls" }
  ];
  if (others > 0) {
    stats.push({ label: "Others", value: others, className: "others" });
  }

  stats.forEach(stat => {
    const tile = document.createElement("div");
    tile.className = `stat-tile ${stat.className}`;
    tile.addEventListener("click", () => {
      if (typeof handleChartSegmentClick === 'function') {
        handleChartSegmentClick("Gender", stat.label);
      }
    });

    const labelEl = document.createElement("span");
    labelEl.className = "stat-tile-label";
    labelEl.textContent = stat.label;

    const valEl = document.createElement("span");
    valEl.className = "stat-tile-value";
    valEl.textContent = stat.value;

    tile.appendChild(labelEl);
    tile.appendChild(valEl);
    container.appendChild(tile);
  });
}

/**
 * Dynamically look for category/caste column and draw stat tiles
 */
function renderCategoryChart(rows) {
  const container = document.getElementById("category-stats-container");
  if (!container) return;

  container.innerHTML = "";

  if (rows.length === 0) {
    container.innerHTML = `<p class="chart-fallback-text">No data available.</p>`;
    return;
  }

  // Find header representing category (caste, category, social category, religion, etc.)
  const headers = Object.keys(rows[0]);
  const categoryKey = headers.find(h => /category|caste|social|group|religion/i.test(h));

  if (!categoryKey) {
    container.innerHTML = `<p class="chart-fallback-text">No category/caste column found.</p>`;
    return;
  }

  // Aggregate category counts
  const categoryCounts = {};
  rows.forEach(row => {
    let val = row[categoryKey];
    val = (val !== undefined && val !== null && val.toString().trim() !== "") ? val.toString().trim() : "General/Unknown";
    categoryCounts[val] = (categoryCounts[val] || 0) + 1;
  });

  const sortedCategories = Object.keys(categoryCounts).sort();

  sortedCategories.forEach(cat => {
    const tile = document.createElement("div");
    // Class name based on clean string to avoid spaces
    const cleanCatClass = cat.toLowerCase().replace(/[^a-z0-9]/g, "-");
    tile.className = `stat-tile category-${cleanCatClass}`;
    tile.addEventListener("click", () => {
      if (typeof handleChartSegmentClick === 'function') {
        handleChartSegmentClick("Category", cat);
      }
    });

    const labelEl = document.createElement("span");
    labelEl.className = "stat-tile-label";
    labelEl.textContent = cat;

    const valEl = document.createElement("span");
    valEl.className = "stat-tile-value";
    valEl.textContent = categoryCounts[cat];

    tile.appendChild(labelEl);
    tile.appendChild(valEl);
    container.appendChild(tile);
  });
}

/**
 * Render class strength grid (glanceable chips instead of chart)
 */
function renderClassChart(rows) {
  const container = document.getElementById("class-strength-grid");
  if (!container) return;

  container.innerHTML = "";

  if (rows.length === 0) {
    container.innerHTML = `<p class="chart-fallback-text">No class distribution data available.</p>`;
    return;
  }

  // Aggregate counts per class
  const classCounts = {};
  rows.forEach(row => {
    const cls = row["Class"] ? row["Class"].toString().trim() : "Unknown";
    classCounts[cls] = (classCounts[cls] || 0) + 1;
  });

  // Sort classes according to school sorting rules (Nursery, KG1, KG2, 1-12)
  const sortedClasses = typeof sortClasses === 'function' ? sortClasses(Object.keys(classCounts)) : Object.keys(classCounts).sort();

  sortedClasses.forEach(cls => {
    const chip = document.createElement("div");
    chip.className = "class-strength-chip";
    chip.addEventListener("click", () => {
      if (typeof handleChartSegmentClick === 'function') {
        handleChartSegmentClick("Class", cls);
      }
    });

    const labelEl = document.createElement("span");
    labelEl.className = "chip-label";
    // Prepend 'Class ' for numeric grades, keep text names as is
    labelEl.textContent = /^\d+$/.test(cls) ? `Class ${cls}` : cls;

    const valEl = document.createElement("span");
    valEl.className = "chip-value";
    valEl.textContent = classCounts[cls];

    chip.appendChild(labelEl);
    chip.appendChild(valEl);
    container.appendChild(chip);
  });
}

/**
 * Render School Profile Details Card
 */
function renderSchoolProfile() {
  const profileContainer = document.getElementById("profile-info-container");
  if (!profileContainer) return;

  const school = typeof getCurrentSchool === 'function' ? getCurrentSchool() : null;
  if (!school) {
    profileContainer.innerHTML = `<p class="chart-fallback-text">No active session.</p>`;
    return;
  }

  profileContainer.innerHTML = `
    <div class="profile-info-row">
      <span class="profile-info-label">School Name</span>
      <span class="profile-info-value" title="${school.schoolName || 'Unknown'}">${school.schoolName || 'Unknown'}</span>
    </div>
    <div class="profile-info-row">
      <span class="profile-info-label">UDISE Code / ID</span>
      <span class="profile-info-value">${school.userId || 'Unknown'}</span>
    </div>
    <div class="profile-info-row">
      <span class="profile-info-label">Database Status</span>
      <span class="profile-info-value" style="color: var(--success); display: inline-flex; align-items: center; gap: 4px;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--success); display: inline-block;"></span> Connected
      </span>
    </div>
    <div class="profile-info-row">
      <span class="profile-info-label">Google Sheet</span>
      <span class="profile-info-value">
        ${school.sheetUrl
      ? `<a href="${school.sheetUrl}" target="_blank" class="profile-info-link"><i data-lucide="external-link" style="width:12px; height:12px; vertical-align: middle;"></i> View Sheet</a>`
      : 'No URL Cached'}
      </span>
    </div>
  `;

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

/**
 * Render Administrative Insights Card
 */
function renderInsights(rows) {
  const container = document.getElementById("insights-stats-container");
  if (!container) return;

  container.innerHTML = "";

  if (!rows || rows.length === 0) {
    container.innerHTML = `<p class="chart-fallback-text">No insights data available.</p>`;
    return;
  }

  // 1. Class counts & unique classes
  const classes = new Set();
  let primaryCount = 0;
  let upperCount = 0;

  rows.forEach(row => {
    const cls = row["Class"] ? row["Class"].toString().trim() : "";
    if (cls) {
      classes.add(cls);
      const normCls = typeof normalizeClassName === 'function' ? normalizeClassName(cls) : cls.toLowerCase();
      if (["nursery", "kg1", "kg2", "1", "2", "3", "4", "5"].includes(normCls)) {
        primaryCount++;
      } else {
        upperCount++;
      }
    }
  });

  const uniqueClassesCount = classes.size || 1;
  const avgClassSize = Math.round(rows.length / uniqueClassesCount);

  // 2. Gender Ratio calculation
  const headers = Object.keys(rows[0] || {});
  const genderKey = headers.find(h => /gender|sex/i.test(h));
  let genderRatioText = "N/A";
  if (genderKey) {
    let boys = 0;
    let girls = 0;
    rows.forEach(row => {
      const val = row[genderKey] ? row[genderKey].toString().trim().toLowerCase() : "";
      if (val === "male" || val === "boy" || val === "m") {
        boys++;
      } else if (val === "female" || val === "girl" || val === "f") {
        girls++;
      }
    });
    if (boys > 0) {
      genderRatioText = Math.round((girls / boys) * 1000).toString();
    }
  }

  const insights = [
    { label: "Avg Class Size", value: `${avgClassSize} Studs`, className: "avg-size" },
    { label: "Gender Ratio", value: genderRatioText !== "N/A" ? `${genderRatioText} ♀/1k ♂` : "N/A", className: "ratio" },
    { label: "Primary (N-5)", value: primaryCount, className: "primary-strength" },
    { label: "Secondary (6-12)", value: upperCount, className: "secondary-strength" }
  ];

  insights.forEach(insight => {
    const tile = document.createElement("div");
    tile.className = `stat-tile ${insight.className}`;

    // Assign custom border/background color accents matching the design system
    if (insight.className === "avg-size") {
      tile.style.borderLeftColor = "var(--info)";
      tile.style.backgroundColor = "var(--info-light)";
    } else if (insight.className === "ratio") {
      tile.style.borderLeftColor = "var(--warning)";
      tile.style.backgroundColor = "var(--warning-light)";
    } else if (insight.className === "primary-strength") {
      tile.style.borderLeftColor = "var(--success)";
      tile.style.backgroundColor = "var(--success-light)";
    } else {
      tile.style.borderLeftColor = "var(--primary)";
      tile.style.backgroundColor = "var(--primary-light)";
    }

    const labelEl = document.createElement("span");
    labelEl.className = "stat-tile-label";
    labelEl.textContent = insight.label;

    const valEl = document.createElement("span");
    valEl.className = "stat-tile-value";
    valEl.textContent = insight.value;
    valEl.style.fontSize = "1.2rem";

    tile.appendChild(labelEl);
    tile.appendChild(valEl);
    container.appendChild(tile);
  });
}
