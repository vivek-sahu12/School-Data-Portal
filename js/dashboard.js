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
  if (selectSource) {
    selectSource.value = defaultSource;
  }

  calculateAndRenderDashboard(defaultSource);
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

  // Sort classes naturally
  const sortedClasses = Object.keys(classCounts).sort((a, b) => {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });

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
    labelEl.textContent = `Class ${cls}`;

    const valEl = document.createElement("span");
    valEl.className = "chip-value";
    valEl.textContent = classCounts[cls];

    chip.appendChild(labelEl);
    chip.appendChild(valEl);
    container.appendChild(chip);
  });
}
