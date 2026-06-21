/**
 * Dashboard Analytics Module
 * Computes metrics and renders Chart.js visualizations.
 */

let genderChartInstance = null;
let classChartInstance = null;
let currentSchoolData = null;

/**
 * Initialize or update the dashboard with new data
 * @param {object} data - Normalized school sheets data
 */
function initDashboard(data) {
  currentSchoolData = data;
  
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
 * Perform stats calculations and draw the charts
 * @param {string} sourceName - The active worksheet name
 */
function calculateAndRenderDashboard(sourceName) {
  if (!currentSchoolData || !currentSchoolData[sourceName]) {
    console.warn(`Worksheet ${sourceName} not found in loaded data.`);
    return;
  }

  const rows = currentSchoolData[sourceName];
  
  // 1. Calculate Metrics
  const totalStudents = rows.length;
  
  // Extract Classes and Sections
  const classesList = new Set();
  const sectionsList = new Set();
  
  rows.forEach(row => {
    if (row["Class"] !== undefined && row["Class"] !== null && row["Class"] !== "") {
      classesList.add(row["Class"].toString().trim());
    }
    if (row["Section"] !== undefined && row["Section"] !== null && row["Section"] !== "") {
      sectionsList.add(row["Section"].toString().trim());
    }
  });

  const totalClasses = classesList.size;
  const totalSections = sectionsList.size;

  // Render Metric values
  document.getElementById("stat-total-students").textContent = totalStudents;
  document.getElementById("stat-total-classes").textContent = totalClasses;
  document.getElementById("stat-total-sections").textContent = totalSections;
  document.getElementById("stat-current-source").textContent = sourceName;

  // 2. Render Charts
  renderGenderChart(rows);
  renderClassChart(rows);
}

/**
 * Dynamically look for gender column and draw doughnut chart
 */
function renderGenderChart(rows) {
  const canvas = document.getElementById("genderChart");
  const fallback = document.getElementById("gender-chart-fallback");
  
  if (!canvas) return;

  // Destroy previous instance
  if (genderChartInstance) {
    genderChartInstance.destroy();
    genderChartInstance = null;
  }

  if (rows.length === 0) {
    canvas.classList.add("hidden");
    fallback.classList.remove("hidden");
    fallback.textContent = "No data available in this sheet.";
    return;
  }

  // Find header representing gender (case insensitive match for Gender/Sex/Boy/Girl)
  const headers = Object.keys(rows[0]);
  const genderKey = headers.find(h => /gender|sex/i.test(h));

  if (!genderKey) {
    canvas.classList.add("hidden");
    fallback.classList.remove("hidden");
    fallback.textContent = "No gender/sex column detected in this worksheet.";
    return;
  }

  canvas.classList.remove("hidden");
  fallback.classList.add("hidden");

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

  // If gender column is blank for all rows
  if (boys === 0 && girls === 0 && others === 0) {
    canvas.classList.add("hidden");
    fallback.classList.remove("hidden");
    fallback.textContent = "Gender values are blank or unrecognized.";
    return;
  }

  const dataValues = [];
  const dataLabels = [];
  const backgroundColors = [];

  if (boys > 0) {
    dataValues.push(boys);
    dataLabels.push("Boys");
    backgroundColors.push("#4f46e5"); // Indigo
  }
  if (girls > 0) {
    dataValues.push(girls);
    dataLabels.push("Girls");
    backgroundColors.push("#ec4899"); // Pink
  }
  if (others > 0) {
    dataValues.push(others);
    dataLabels.push("Others");
    backgroundColors.push("#94a3b8"); // Slate
  }

  // Draw chart
  const ctx = canvas.getContext("2d");
  genderChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: dataLabels,
      datasets: [{
        data: dataValues,
        backgroundColor: backgroundColors,
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            padding: 20,
            color: document.documentElement.getAttribute("data-theme") === "dark" ? "#cbd5e1" : "#475569",
            font: {
              family: 'Inter',
              size: 12
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const value = context.raw;
              const percentage = ((value / total) * 100).toFixed(1);
              return `${context.label}: ${value} (${percentage}%)`;
            }
          }
        }
      },
      cutout: '70%'
    }
  });
}

/**
 * Render class distribution chart (Bar chart)
 */
function renderClassChart(rows) {
  const canvas = document.getElementById("classChart");
  if (!canvas) return;

  if (classChartInstance) {
    classChartInstance.destroy();
    classChartInstance = null;
  }

  if (rows.length === 0) return;

  // Class is guaranteed to exist.
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

  const datasetValues = sortedClasses.map(cls => classCounts[cls]);

  const ctx = canvas.getContext("2d");

  // Create Indigo to Violet gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, '#6366f1');
  gradient.addColorStop(1, '#4f46e5');

  classChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedClasses,
      datasets: [{
        label: 'Students Count',
        data: datasetValues,
        backgroundColor: gradient,
        borderRadius: 8,
        maxBarThickness: 36
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { family: 'Inter', weight: 'bold' },
          bodyFont: { family: 'Inter' }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: document.documentElement.getAttribute("data-theme") === "dark" ? "#cbd5e1" : "#475569",
            font: { family: 'Inter', size: 11 }
          }
        },
        y: {
          grid: {
            color: document.documentElement.getAttribute("data-theme") === "dark" ? "#1f2937" : "#e2e8f0"
          },
          ticks: {
            color: document.documentElement.getAttribute("data-theme") === "dark" ? "#cbd5e1" : "#475569",
            font: { family: 'Inter', size: 11 },
            stepSize: 1
          }
        }
      }
    }
  });
}
