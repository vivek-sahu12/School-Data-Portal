/**
 * Dashboard Analytics Module
 * Computes metrics and renders Chart.js visualizations.
 */

if (typeof ChartDataLabels !== 'undefined') {
  Chart.register(ChartDataLabels);
}

let genderChartInstance = null;
let categoryChartInstance = null;
let classChartInstance = null;
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
 * Perform stats calculations and draw the charts
 * @param {string} sourceName - The active worksheet name
 */
function calculateAndRenderDashboard(sourceName) {
  if (!currentSchoolData || !currentSchoolData[sourceName]) {
    console.warn(`Worksheet ${sourceName} not found in loaded data.`);
    return;
  }

  const rows = currentSchoolData[sourceName];
  
  // Render Charts
  renderGenderChart(rows);
  renderCategoryChart(rows);
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
    if (fallback) {
      fallback.classList.remove("hidden");
      fallback.textContent = "No data available in this sheet.";
    }
    return;
  }

  // Find header representing gender
  const headers = Object.keys(rows[0]);
  const genderKey = headers.find(h => /gender|sex/i.test(h));

  if (!genderKey) {
    canvas.classList.add("hidden");
    if (fallback) {
      fallback.classList.remove("hidden");
      fallback.textContent = "No gender/sex column detected in this worksheet.";
    }
    return;
  }

  canvas.classList.remove("hidden");
  if (fallback) fallback.classList.add("hidden");

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

  if (boys === 0 && girls === 0 && others === 0) {
    canvas.classList.add("hidden");
    if (fallback) {
      fallback.classList.remove("hidden");
      fallback.textContent = "Gender values are blank or unrecognized.";
    }
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
            font: { family: 'Inter', size: 12 }
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
        },
        datalabels: {
          color: '#ffffff',
          font: { family: 'Inter', weight: 'bold', size: 11 },
          formatter: (value, ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(0);
            return `${value}\n(${percentage}%)`;
          },
          textAlign: 'center'
        }
      },
      cutout: '70%'
    }
  });
}

/**
 * Dynamically look for category/caste column and draw pie chart
 */
function renderCategoryChart(rows) {
  const canvas = document.getElementById("categoryChart");
  const fallback = document.getElementById("category-chart-fallback");
  
  if (!canvas) return;

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
    categoryChartInstance = null;
  }

  if (rows.length === 0) {
    canvas.classList.add("hidden");
    if (fallback) {
      fallback.classList.remove("hidden");
      fallback.textContent = "No data available in this sheet.";
    }
    return;
  }

  // Find header representing category (caste, category, social category, religion, etc.)
  const headers = Object.keys(rows[0]);
  const categoryKey = headers.find(h => /category|caste|social|group|religion/i.test(h));

  if (!categoryKey) {
    canvas.classList.add("hidden");
    if (fallback) {
      fallback.classList.remove("hidden");
      fallback.textContent = "No category/caste column found in this worksheet.";
    }
    return;
  }

  canvas.classList.remove("hidden");
  if (fallback) fallback.classList.add("hidden");

  // Aggregate category counts
  const categoryCounts = {};
  rows.forEach(row => {
    let val = row[categoryKey];
    val = (val !== undefined && val !== null && val.toString().trim() !== "") ? val.toString().trim() : "General/Unknown";
    categoryCounts[val] = (categoryCounts[val] || 0) + 1;
  });

  const labels = Object.keys(categoryCounts);
  const values = Object.values(categoryCounts);

  const backgroundColors = [
    "#3b82f6", // Blue
    "#10b981", // Emerald
    "#f59e0b", // Amber
    "#8b5cf6", // Purple
    "#ec4899", // Pink
    "#f43f5e", // Rose
    "#06b6d4", // Cyan
    "#94a3b8"  // Slate
  ];

  const ctx = canvas.getContext("2d");
  categoryChartInstance = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: backgroundColors.slice(0, labels.length),
        borderWidth: 0
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
            padding: 15,
            color: document.documentElement.getAttribute("data-theme") === "dark" ? "#cbd5e1" : "#475569",
            font: { family: 'Inter', size: 11 }
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
        },
        datalabels: {
          color: '#ffffff',
          font: { family: 'Inter', weight: 'bold', size: 10 },
          formatter: (value, ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(0);
            return `${value}\n(${percentage}%)`;
          },
          textAlign: 'center'
        }
      }
    }
  });
}

/**
 * Render class distribution chart (Bar chart showing student count)
 */
function renderClassChart(rows) {
  const canvas = document.getElementById("classChart");
  if (!canvas) return;

  if (classChartInstance) {
    classChartInstance.destroy();
    classChartInstance = null;
  }

  if (rows.length === 0) return;

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
        },
        datalabels: {
          anchor: 'end',
          align: 'top',
          color: document.documentElement.getAttribute("data-theme") === "dark" ? "#f1f5f9" : "#0f172a",
          font: { family: 'Inter', weight: 'bold', size: 10 },
          formatter: (value) => value
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
          grace: '15%', // adds 15% padding at top to avoid labels getting cut off
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
