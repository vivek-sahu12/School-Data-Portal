/**
 * Reports & Data Validation Module
 * Performs local data discrepancy filtering, multi-page categories, and analytics rendering.
 */

window.reportsCharts = {};

// Global reports state management
const REPORTS_STATE = {
  activeCategory: null,  // e.g. "a1", "a2", "b1", "b2", "b3", "b4", "b5", "d1", "d2", "c1", "c2"
  searchQuery: "",
  selectedClass: "",
  currentPage: 1,
  pageSize: 15,
  activeSubset: null
};
window.REPORTS_STATE = REPORTS_STATE;

let duplicatesCache = null;

/**
 * Rebuild cache of duplicates within School Data sheet
 */
function buildDuplicatesCache(schoolData, schoolHeaders) {
  const aadharKey = schoolHeaders.find(h => /aadhar|adhar/i.test(h));
  const samagraKey = schoolHeaders.find(h => /samagra/i.test(h));
  const phoneKey = schoolHeaders.find(h => /phone|mobile|contact/i.test(h));

  const aadharCounts = {};
  const samagraCounts = {};
  const phoneCounts = {};

  schoolData.forEach(row => {
    if (aadharKey) {
      const val = (row[aadharKey] || "").toString().trim();
      if (val && !isAadharMissing(val)) {
        aadharCounts[val] = (aadharCounts[val] || 0) + 1;
      }
    }
    if (samagraKey) {
      const val = (row[samagraKey] || "").toString().trim();
      if (val && !["0", "na", "n/a", "-"].includes(val.toLowerCase())) {
        samagraCounts[val] = (samagraCounts[val] || 0) + 1;
      }
    }
    if (phoneKey) {
      const val = (row[phoneKey] || "").toString().trim();
      if (val && !isPhoneMissing(val)) {
        phoneCounts[val] = (phoneCounts[val] || 0) + 1;
      }
    }
  });

  duplicatesCache = {
    aadhar: aadharCounts,
    samagra: samagraCounts,
    phone: phoneCounts,
    aadharKey,
    samagraKey,
    phoneKey
  };
}

/**
 * Reads local theme variables dynamically
 */
function getThemeColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    primary: style.getPropertyValue('--primary').trim() || '#4f46e5',
    success: style.getPropertyValue('--success').trim() || '#10b981',
    warning: style.getPropertyValue('--warning').trim() || '#f59e0b',
    danger: style.getPropertyValue('--danger').trim() || '#ef4444',
    info: style.getPropertyValue('--info').trim() || '#06b6d4',
    text: style.getPropertyValue('--text-primary').trim() || '#0f172a',
    muted: style.getPropertyValue('--text-muted').trim() || '#94a3b8',
    border: style.getPropertyValue('--border-color').trim() || '#e2e8f0'
  };
}

/**
 * Helper to check if a value represents a missing Aadhar
 */
function isAadharMissing(val) {
  if (val === undefined || val === null) return true;
  const str = val.toString().trim();
  if (str === "") return true;
  if (["0", "na", "n/a", "-"].includes(str.toLowerCase())) return true;
  return false;
}

/**
 * Helper to check if a value represents a missing phone/mobile number
 */
function isPhoneMissing(val) {
  if (val === undefined || val === null) return true;
  const str = val.toString().trim();
  if (str === "") return true;
  if (["0", "na", "n/a", "-"].includes(str.toLowerCase())) return true;
  return false;
}

/**
 * Check if a cell is empty/null/blank
 */
function isNullOrEmpty(val) {
  return val === undefined || val === null || val.toString().trim() === "";
}

/** Common placeholder values treated as missing */
const MISSING_PLACEHOLDERS = ["0", "na", "n/a", "ne", "null", "-", "nil", "none"];

/** Check if a value is a placeholder (not blank, but still not real data) */
function isPlaceholder(val) {
  if (val === undefined || val === null) return false;
  const str = val.toString().trim().toLowerCase();
  return str !== "" && MISSING_PLACEHOLDERS.includes(str);
}

/** Check if value is missing OR placeholder */
function isValueMissing(val) {
  if (val === undefined || val === null) return true;
  const str = val.toString().trim();
  if (str === "") return true;
  return MISSING_PLACEHOLDERS.includes(str.toLowerCase());
}

/** Samagra ID: valid = exactly 9 numeric digits. Returns true if present but invalid. */
function isSamagraInvalid(val) {
  if (isValueMissing(val)) return false; // missing, not invalid
  const str = val.toString().trim();
  return !/^\d{9}$/.test(str);
}

/** PEN/PAN: valid = exactly 11 numeric digits. Returns true if present but invalid. */
function isPenInvalid(val) {
  if (isValueMissing(val)) return false;
  const str = val.toString().trim();
  return !/^\d{11}$/.test(str);
}

/** Aadhaar: valid = exactly 12 numeric digits. Returns true if present but invalid. */
function isAadharInvalid(val) {
  if (isValueMissing(val)) return false;
  const str = val.toString().trim();
  return !/^\d{12}$/.test(str);
}

/**
 * Categories configuration definition
 */
const REPORT_CATEGORIES = [
  {
    id: "c1",
    title: "Class-wise Gender Ratio",
    description: "Class-wise breakdown of Boys, Girls, and Total with analytical bar chart.",
    icon: "bar-chart-2",
    badge: "Analytics",
    headers: ["Class", "Boys", "Girls", "Total"],
    isChart: true,
    compute: (schoolData, schoolHeaders, sortedClasses) => {
      const genderKey = schoolHeaders.find(h => /gender|sex/i.test(h)) || "Gender";
      return sortedClasses.map(cls => {
        let boys = 0, girls = 0;
        schoolData.forEach(row => {
          if ((row["Class"] || "").toString().trim() === cls) {
            const g = (row[genderKey] || "").toString().trim().toLowerCase();
            if (g.startsWith("b") || g === "male" || g === "m") boys++;
            else if (g.startsWith("g") || g === "female" || g === "f") girls++;
          }
        });
        return { "Class": cls, "Boys": boys, "Girls": girls, "Total": boys + girls };
      });
    }
  },
  {
    id: "c2",
    title: "Category Breakdown",
    description: "Class-wise breakdown of caste categories (GEN, OBC, SC, ST) with stacked bar chart.",
    icon: "pie-chart",
    badge: "Analytics",
    headers: ["Class", "GEN", "OBC", "SC", "ST", "Total"],
    isChart: true,
    compute: (schoolData, schoolHeaders, sortedClasses) => {
      const categoryKey = schoolHeaders.find(h => /category|caste|social/i.test(h)) || "Category";
      return sortedClasses.map(cls => {
        let gen = 0, obc = 0, sc = 0, st = 0;
        schoolData.forEach(row => {
          if ((row["Class"] || "").toString().trim() === cls) {
            const cat = (row[categoryKey] || "").toString().trim().toUpperCase();
            if (cat === "GEN" || cat === "GENERAL") gen++;
            else if (cat === "OBC") obc++;
            else if (cat === "SC") sc++;
            else if (cat === "ST") st++;
          }
        });
        return { "Class": cls, "GEN": gen, "OBC": obc, "SC": sc, "ST": st, "Total": gen + obc + sc + st };
      });
    }
  },
  {
    id: "a1",
    title: "Aadhaar Missing",
    description: "Students with missing or blank Aadhaar numbers.",
    icon: "user-check",
    badge: "Discrepancy",
    headers: ["Name", "Class", "Aadhaar Number"],
    filter: (row, schoolHeaders) => {
      const key = schoolHeaders.find(h => /aadhar|adhar/i.test(h)) || "Aadhar Number";
      return isValueMissing(row[key]);
    },
    map: (row, schoolHeaders) => {
      const key = schoolHeaders.find(h => /aadhar|adhar/i.test(h)) || "Aadhar Number";
      return { "Name": row["Name"] || "-", "Class": row["Class"] || "-", "Aadhaar Number": isNullOrEmpty(row[key]) ? "Missing" : row[key] };
    }
  },
  {
    id: "a3",
    title: "Invalid Aadhaar",
    description: "Students with Aadhaar numbers that are not exactly 12 numeric digits.",
    icon: "shield-alert",
    badge: "Validation",
    headers: ["Name", "Class", "Aadhaar Number"],
    filter: (row, schoolHeaders) => {
      const key = schoolHeaders.find(h => /aadhar|adhar/i.test(h)) || "Aadhar Number";
      return isAadharInvalid(row[key]);
    },
    map: (row, schoolHeaders) => {
      const key = schoolHeaders.find(h => /aadhar|adhar/i.test(h)) || "Aadhar Number";
      return { "Name": row["Name"] || "-", "Class": row["Class"] || "-", "Aadhaar Number": row[key] || "-" };
    }
  },
  {
    id: "a2",
    title: "Phone Number Missing",
    description: "Students with missing or blank mobile numbers.",
    icon: "phone",
    badge: "Discrepancy",
    headers: ["Name", "Class", "Mobile No."],
    filter: (row, schoolHeaders) => {
      const key = schoolHeaders.find(h => /phone|mobile|contact/i.test(h)) || "Mobile No.";
      return isValueMissing(row[key]);
    },
    map: (row, schoolHeaders) => {
      const key = schoolHeaders.find(h => /phone|mobile|contact/i.test(h)) || "Mobile No.";
      return { "Name": row["Name"] || "-", "Class": row["Class"] || "-", "Mobile No.": isNullOrEmpty(row[key]) ? "Missing" : row[key] };
    }
  },
  {
    id: "b4",
    title: "Samagra ID Missing",
    description: "Students who do not have a Samagra ID assigned.",
    icon: "user-minus",
    badge: "Discrepancy",
    headers: ["Name", "Class"],
    filter: (row, schoolHeaders) => {
      const key = schoolHeaders.find(h => /samagra/i.test(h)) || "Samagra ID";
      return isValueMissing(row[key]);
    },
    map: (row) => ({ "Name": row["Name"] || "-", "Class": row["Class"] || "-" })
  },
  {
    id: "b5",
    title: "Invalid Samagra ID",
    description: "Students with Samagra IDs that are not exactly 9 numeric digits.",
    icon: "shield-alert",
    badge: "Validation",
    headers: ["Name", "Class", "Samagra ID"],
    filter: (row, schoolHeaders) => {
      const key = schoolHeaders.find(h => /samagra/i.test(h)) || "Samagra ID";
      return isSamagraInvalid(row[key]);
    },
    map: (row, schoolHeaders) => {
      const key = schoolHeaders.find(h => /samagra/i.test(h)) || "Samagra ID";
      return { "Name": row["Name"] || "-", "Class": row["Class"] || "-", "Samagra ID": row[key] || "-" };
    }
  },
  {
    id: "b2",
    title: "PEN Missing",
    description: "Students who do not have a PEN assigned.",
    icon: "file-warning",
    badge: "Discrepancy",
    headers: ["Name", "Class"],
    filter: (row, schoolHeaders) => {
      const key = schoolHeaders.find(h => h.trim().toUpperCase() === "PEN") || "PEN";
      return isValueMissing(row[key]);
    },
    map: (row) => ({ "Name": row["Name"] || "-", "Class": row["Class"] || "-" })
  },
  {
    id: "b6",
    title: "Invalid PEN",
    description: "Students with PEN values that are not exactly 11 numeric digits.",
    icon: "shield-alert",
    badge: "Validation",
    headers: ["Name", "Class", "PEN"],
    filter: (row, schoolHeaders) => {
      const key = schoolHeaders.find(h => h.trim().toUpperCase() === "PEN") || "PEN";
      return isPenInvalid(row[key]);
    },
    map: (row, schoolHeaders) => {
      const key = schoolHeaders.find(h => h.trim().toUpperCase() === "PEN") || "PEN";
      return { "Name": row["Name"] || "-", "Class": row["Class"] || "-", "PEN": row[key] || "-" };
    }
  },
  {
    id: "b1",
    title: "Not in Udise",
    description: "Students present in School Data but missing from UDISE (matched by PEN).",
    icon: "alert-triangle",
    badge: "Discrepancy",
    headers: ["Name", "Class", "PEN"],
    filter: (row, schoolHeaders, cachedData) => {
      const schoolPenKey = schoolHeaders.find(h => h.trim().toUpperCase() === "PEN") || "PEN";
      const pen = (row[schoolPenKey] || "").toString().trim();
      if (!pen) return false;
      const udiseData = cachedData["UDISE"] || [];
      const udiseHeaders = Object.keys(udiseData[0] || {});
      const udisePenKey = udiseHeaders.find(h => h.trim().toUpperCase() === "PEN") || "PEN";
      if (!window._udisePensSet) {
        window._udisePensSet = new Set(udiseData.map(r => (r[udisePenKey] || "").toString().trim()).filter(Boolean));
      }
      return !window._udisePensSet.has(pen);
    },
    map: (row, schoolHeaders) => {
      const key = schoolHeaders.find(h => h.trim().toUpperCase() === "PEN") || "PEN";
      return { "Name": row["Name"] || "-", "Class": row["Class"] || "-", "PEN": row[key] || "-" };
    }
  },
  {
    id: "b3",
    title: "Not in 3.0",
    description: "Students present in School Data but missing from 3.0 Portal (matched by Samagra ID).",
    icon: "users",
    badge: "Discrepancy",
    headers: ["Name", "Class", "Samagra ID"],
    filter: (row, schoolHeaders, cachedData) => {
      const key = schoolHeaders.find(h => /samagra/i.test(h)) || "Samagra ID";
      const samagra = (row[key] || "").toString().trim();
      if (!samagra) return false;
      const threeData = cachedData["3.0"] || [];
      const threeHeaders = Object.keys(threeData[0] || {});
      const threeKey = threeHeaders.find(h => /samagra/i.test(h)) || "Samagra ID";
      if (!window._threeSamagrasSet) {
        window._threeSamagrasSet = new Set(threeData.map(r => (r[threeKey] || "").toString().trim()).filter(Boolean));
      }
      return !window._threeSamagrasSet.has(samagra);
    },
    map: (row, schoolHeaders) => {
      const key = schoolHeaders.find(h => /samagra/i.test(h)) || "Samagra ID";
      return { "Name": row["Name"] || "-", "Class": row["Class"] || "-", "Samagra ID": row[key] || "-" };
    }
  }
];

/**
 * Exposes updateReportsNavVisibility globally
 */
window.updateReportsNavVisibility = function () {
  const sessionRaw = localStorage.getItem("sdip_session");
  let isReportEnabled = false;
  if (sessionRaw) {
    try {
      const session = JSON.parse(sessionRaw);
      const reportVal = session.report !== undefined ? session.report : session.Report;
      const valStr = (reportVal !== undefined && reportVal !== null) ? reportVal.toString().trim().toLowerCase() : "";
      isReportEnabled = valStr === "yes" || valStr === "true";
    } catch (e) {
      console.error("Error reading report permission from sdip_session:", e);
    }
  }

  const desktopNav = document.querySelector(".header-nav");
  const mobileNav = document.querySelector(".app-navigation");
  const drawerNav = document.querySelector(".mobile-drawer-nav");

  if (isReportEnabled) {
    if (desktopNav && !document.getElementById("nav-item-reports-desktop")) {
      const btn = document.createElement("button");
      btn.className = "nav-item";
      btn.id = "nav-item-reports-desktop";
      btn.dataset.target = "reports";
      btn.innerHTML = `<i data-lucide="file-bar-chart-2"></i><span>Reports</span>`;
      const searchBtn = desktopNav.querySelector('[data-target="universal-search"]');
      if (searchBtn) {
        desktopNav.insertBefore(btn, searchBtn);
      } else {
        desktopNav.appendChild(btn);
      }
      bindReportsNavClick(btn);
    }

    if (mobileNav && !document.getElementById("nav-item-reports-mobile")) {
      const btn = document.createElement("button");
      btn.className = "nav-item";
      btn.id = "nav-item-reports-mobile";
      btn.dataset.target = "reports";
      btn.innerHTML = `<i data-lucide="file-bar-chart-2"></i><span>Reports</span>`;
      const searchBtn = mobileNav.querySelector('[data-target="universal-search"]');
      if (searchBtn) {
        mobileNav.insertBefore(btn, searchBtn);
      } else {
        mobileNav.appendChild(btn);
      }
      bindReportsNavClick(btn);
    }

    if (drawerNav && !document.getElementById("drawer-nav-item-reports")) {
      const btn = document.createElement("button");
      btn.className = "drawer-nav-item";
      btn.id = "drawer-nav-item-reports";
      btn.dataset.target = "reports";
      btn.innerHTML = `<i data-lucide="file-bar-chart-2"></i><span>Reports</span>`;
      const searchBtn = drawerNav.querySelector('[data-target="universal-search"]');
      if (searchBtn) {
        drawerNav.insertBefore(btn, searchBtn);
      } else {
        drawerNav.appendChild(btn);
      }

      btn.addEventListener("click", () => {
        const drawer = document.getElementById("mobile-drawer");
        if (drawer) {
          drawer.classList.remove("active");
          document.body.style.overflow = "";
        }
        const destBtn = document.getElementById("nav-item-reports-desktop") || document.getElementById("nav-item-reports-mobile");
        if (destBtn) destBtn.click();
      });
    }

    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }
  } else {
    const btnD = document.getElementById("nav-item-reports-desktop");
    if (btnD) btnD.remove();
    const btnM = document.getElementById("nav-item-reports-mobile");
    if (btnM) btnM.remove();
    const btnDr = document.getElementById("drawer-nav-item-reports");
    if (btnDr) btnDr.remove();

    if (window.currentActiveTab === "reports") {
      const dashNav = document.querySelector('.nav-item[data-target="dashboard"]');
      if (dashNav) dashNav.click();
    }
  }
};

/**
 * Handle reports navigation clicks
 */
function bindReportsNavClick(btn) {
  btn.addEventListener("click", () => {
    const target = "reports";

    document.querySelectorAll(".nav-item").forEach(ni => {
      if (ni.dataset.target === target) ni.classList.add("active");
      else ni.classList.remove("active");
    });
    document.querySelectorAll(".drawer-nav-item").forEach(di => {
      if (di.dataset.target === target) di.classList.add("active");
      else di.classList.remove("active");
    });

    document.querySelectorAll(".view-section").forEach(sec => sec.classList.add("hidden"));

    const targetSec = document.getElementById("reports-view");
    if (targetSec) {
      targetSec.classList.remove("hidden");
      window.currentActiveTab = target;

      // Default to main category view
      REPORTS_STATE.activeCategory = null;
      document.getElementById("reports-main-header").classList.remove("hidden");
      document.getElementById("reports-main-content").classList.remove("hidden");
      document.getElementById("reports-detail-header").classList.add("hidden");
      document.getElementById("reports-detail-content").classList.add("hidden");

      window.renderReports();
    }
  });
}

/**
 * Read cached database
 */
function getCachedDatabase() {
  const cachedRaw = localStorage.getItem("school-portal-data");
  if (!cachedRaw) return null;
  try {
    return JSON.parse(cachedRaw);
  } catch (e) {
    console.error("Failed to parse cached school portal data:", e);
    return null;
  }
}

/**
 * Exposes renderReports globally
 */
window.renderReports = function () {
  if (REPORTS_STATE.activeCategory) {
    document.getElementById("reports-main-header").classList.add("hidden");
    document.getElementById("reports-main-content").classList.add("hidden");
    document.getElementById("reports-detail-header").classList.remove("hidden");
    document.getElementById("reports-detail-content").classList.remove("hidden");
    renderActiveCategoryDetail();
    return;
  }

  const grid = document.getElementById("reports-category-grid");
  if (!grid) return;

  grid.innerHTML = "";

  const cachedData = getCachedDatabase();
  if (!cachedData) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; padding: 40px; text-align: center; background-color: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md);">
        <i data-lucide="cloud-off" class="large-icon" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 12px; margin-left: auto; margin-right: auto; display: block;"></i>
        <p style="color: var(--text-secondary); font-size: 1rem; font-weight: 500;">No school data loaded yet. Please refresh database when online.</p>
      </div>
    `;
    const summaryContainer = document.getElementById("reports-summary-cards");
    if (summaryContainer) summaryContainer.innerHTML = "";
    if (typeof lucide !== "undefined") lucide.createIcons();
    return;
  }

  const schoolData = cachedData["School Data"] || [];
  if (schoolData.length === 0) {
    grid.innerHTML = `<p style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--text-secondary);">School Data worksheet is empty.</p>`;
    const summaryContainer = document.getElementById("reports-summary-cards");
    if (summaryContainer) summaryContainer.innerHTML = "";
    return;
  }

  const schoolHeaders = Object.keys(schoolData[0] || {});

  // Reset helper caches and rebuild duplicates cache
  window._udisePensSet = null;
  window._threeSamagrasSet = null;
  window._schoolPensSet = null;
  duplicatesCache = null;
  buildDuplicatesCache(schoolData, schoolHeaders);

  // Compute stats
  let totalIssues = 0;
  const discrepancyCounts = {};

  REPORT_CATEGORIES.forEach(cat => {
    if (!cat.isChart) {
      let count = 0;
      if (cat.id === "b5") {
        const udiseData = cachedData["UDISE"] || [];
        const udiseHeaders = Object.keys(udiseData[0] || {});
        count = udiseData.filter(row => cat.filter(row, udiseHeaders, cachedData)).length;
      } else {
        count = schoolData.filter(row => cat.filter(row, schoolHeaders, cachedData, schoolData)).length;
      }
      discrepancyCounts[cat.id] = count;
      totalIssues += count;
    }
  });

  // Calculate Data Quality Score (percentage of students without a1, a2, b2, b4 issues)
  let invalidStudentsCount = 0;
  schoolData.forEach(row => {
    let hasDiscrepancy = false;
    if (isAadharMissing(row[schoolHeaders.find(h => /aadhar|adhar/i.test(h)) || "Aadhar Number"])) hasDiscrepancy = true;
    if (isPhoneMissing(row[schoolHeaders.find(h => /phone|mobile|contact/i.test(h)) || "Mobile No."])) hasDiscrepancy = true;
    if (!(row[schoolHeaders.find(h => h.trim().toUpperCase() === "PEN") || "PEN"] || "").toString().trim()) hasDiscrepancy = true;
    if (!(row[schoolHeaders.find(h => /samagra/i.test(h)) || "Samagra ID"] || "").toString().trim()) hasDiscrepancy = true;
    if (hasDiscrepancy) invalidStudentsCount++;
  });

  const perfectProfilesCount = schoolData.length - invalidStudentsCount;
  const qualityScore = schoolData.length > 0
    ? Math.max(0, Math.min(100, Math.round((perfectProfilesCount / schoolData.length) * 100)))
    : 100;

  // Render Summary Cards
  const summaryContainer = document.getElementById("reports-summary-cards");
  if (summaryContainer) {
    summaryContainer.innerHTML = `
      <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 20px; display: flex; align-items: center; gap: 16px; box-shadow: var(--shadow-sm);">
        <div style="background-color: var(--primary-light); color: var(--primary); width: 48px; height: 48px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center;">
          <i data-lucide="users" style="width: 24px; height: 24px;"></i>
        </div>
        <div>
          <h4 style="margin: 0; font-size: 0.78rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Total Enrollment</h4>
          <p style="margin: 4px 0 0 0; font-size: 1.75rem; font-weight: 800; color: var(--text-primary); line-height: 1;">${schoolData.length}</p>
          <span style="font-size: 0.72rem; color: var(--text-muted);">Registered students</span>
        </div>
      </div>

      <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 20px; display: flex; align-items: center; gap: 16px; box-shadow: var(--shadow-sm); flex: 1;">
        <div style="background-color: var(--success-light); color: var(--success); width: 48px; height: 48px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center;">
          <i data-lucide="shield-check" style="width: 24px; height: 24px;"></i>
        </div>
        <div style="flex: 1;">
          <h4 style="margin: 0; font-size: 0.78rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Data Quality Score</h4>
          <p style="margin: 4px 0 0 0; font-size: 1.75rem; font-weight: 800; color: var(--text-primary); line-height: 1;">${qualityScore}%</p>
          <div style="width: 100%; background-color: var(--bg-surface-hover); height: 6px; border-radius: var(--radius-full); margin-top: 8px; overflow: hidden;">
            <div style="width: ${qualityScore}%; background-color: var(--success); height: 100%; border-radius: var(--radius-full);"></div>
          </div>
        </div>
      </div>

      <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 20px; display: flex; align-items: center; gap: 16px; box-shadow: var(--shadow-sm);">
        <div style="background-color: var(--danger-light); color: var(--danger); width: 48px; height: 48px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center;">
          <i data-lucide="alert-triangle" style="width: 24px; height: 24px;"></i>
        </div>
        <div>
          <h4 style="margin: 0; font-size: 0.78rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Total Issues</h4>
          <p style="margin: 4px 0 0 0; font-size: 1.75rem; font-weight: 800; color: var(--text-primary); line-height: 1;">${totalIssues}</p>
          <span style="font-size: 0.72rem; color: var(--text-muted);">Discrepancies found</span>
        </div>
      </div>
    `;
  }

  // Build Dynamically Clickable Cards
  REPORT_CATEGORIES.forEach(cat => {
    let badgeText = "";
    let countBadgeColor = "var(--primary)";
    let countBadgeBg = "var(--primary-light)";

    if (cat.isChart) {
      badgeText = "View Chart & Table";
      countBadgeColor = "var(--info)";
      countBadgeBg = "var(--info-light)";
    } else {
      const count = discrepancyCounts[cat.id] || 0;
      badgeText = `${count} discrepancies`;
      if (count > 0) {
        countBadgeColor = "var(--danger)";
        countBadgeBg = "var(--danger-light)";
      } else {
        countBadgeColor = "var(--success)";
        countBadgeBg = "var(--success-light)";
      }
    }

    const card = document.createElement("div");
    card.className = "clickable-metric-card";
    card.style.cssText = "display: flex; flex-direction: column; justify-content: space-between; padding: 24px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); box-shadow: var(--shadow-sm); cursor: pointer; transition: all 0.2s ease-in-out;";

    card.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="background-color: ${countBadgeBg}; color: ${countBadgeColor}; width: 44px; height: 44px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center;">
            <i data-lucide="${cat.icon}" style="width: 22px; height: 22px;"></i>
          </div>
          <span style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 8px; border-radius: var(--radius-full); background-color: var(--bg-surface-hover); color: var(--text-secondary);">${cat.badge}</span>
        </div>
        <div>
          <h3 style="margin: 8px 0 4px 0; font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">${cat.title}</h3>
          <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">${cat.description}</p>
        </div>
      </div>
      <div style="margin-top: 16px; border-top: 1px solid var(--border-color); padding-top: 12px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.82rem; font-weight: 600; color: ${countBadgeColor};">${badgeText}</span>
        <i data-lucide="chevron-right" style="width: 16px; height: 16px; color: var(--text-muted);"></i>
      </div>
    `;

    card.addEventListener("mouseenter", () => {
      card.style.transform = "translateY(-4px)";
      card.style.boxShadow = "var(--shadow-md)";
      card.style.borderColor = "var(--primary)";
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "none";
      card.style.boxShadow = "var(--shadow-sm)";
      card.style.borderColor = "var(--border-color)";
    });

    card.addEventListener("click", () => {
      openCategoryDetail(cat.id);
    });

    grid.appendChild(card);
  });

  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
};

/**
 * Open detail category screen
 */
function openCategoryDetail(categoryId) {
  if (window.navigateState) {
    window.navigateState({
      tab: "reports",
      reportCategory: categoryId,
      reportSubset: null
    });
  } else {
    REPORTS_STATE.activeCategory = categoryId;
    REPORTS_STATE.searchQuery = "";
    REPORTS_STATE.selectedClass = "";
    REPORTS_STATE.currentPage = 1;
    REPORTS_STATE.activeSubset = null;

    // Toggle DOM Visibility
    document.getElementById("reports-main-header").classList.add("hidden");
    document.getElementById("reports-main-content").classList.add("hidden");
    document.getElementById("reports-detail-header").classList.remove("hidden");
    document.getElementById("reports-detail-content").classList.remove("hidden");

    // Reset Input elements
    const searchInput = document.getElementById("report-search-input");
    if (searchInput) searchInput.value = "";
    const classSelect = document.getElementById("report-class-select");
    if (classSelect) classSelect.value = "";

    // Prepare metadata & filter bar
    const cachedData = getCachedDatabase();
    if (cachedData) {
      const schoolData = cachedData["School Data"] || [];
      populateClassFilter(schoolData);
    }

    renderActiveCategoryDetail();
  }
}

/**
 * Populate dynamic class selection options
 */
function populateClassFilter(schoolData) {
  const select = document.getElementById("report-class-select");
  if (!select) return;

  const currentVal = select.value || REPORTS_STATE.selectedClass;

  select.innerHTML = '<option value="">All Classes</option>';

  const classesSet = new Set();
  schoolData.forEach(row => {
    const cls = (row["Class"] || "").toString().trim();
    if (cls) classesSet.add(cls);
  });

  const sortedClasses = typeof sortClasses === "function" ? sortClasses(classesSet) : Array.from(classesSet).sort();
  sortedClasses.forEach(cls => {
    const opt = document.createElement("option");
    opt.value = cls;
    opt.textContent = /^\d+$/.test(cls) ? `Class ${cls}` : cls;
    select.appendChild(opt);
  });

  select.value = currentVal;
}

/**
 * Compute all category records (before class/search filters)
 */
function getCategoryRecords(cat, cachedData) {
  const schoolData = cachedData["School Data"] || [];
  const schoolHeaders = Object.keys(schoolData[0] || {});

  if (cat.isChart) {
    const classesSet = new Set();
    schoolData.forEach(row => {
      const cls = (row["Class"] || "").toString().trim();
      if (cls) classesSet.add(cls);
    });
    const sortedClasses = typeof sortClasses === "function" ? sortClasses(classesSet) : Array.from(classesSet).sort();
    return cat.compute(schoolData, schoolHeaders, sortedClasses);
  } else if (cat.id === "b5") {
    const udiseData = cachedData["UDISE"] || [];
    const udiseHeaders = Object.keys(udiseData[0] || {});
    const filtered = udiseData.filter(row => cat.filter(row, udiseHeaders, cachedData));
    return filtered.map(row => {
      const mapped = cat.map(row, udiseHeaders);
      mapped._original = row;
      mapped._sourceSheet = "UDISE";
      return mapped;
    });
  } else {
    const filtered = schoolData.filter(row => cat.filter(row, schoolHeaders, cachedData, schoolData));
    return filtered.map(row => {
      const mapped = cat.map(row, schoolHeaders, cachedData, schoolData);
      mapped._original = row;
      mapped._sourceSheet = "School Data";
      return mapped;
    });
  }
}

/**
 * Filter students matching specific category or gender subset selection
 */
function getSubsetStudents(subset, cachedData) {
  const schoolData = cachedData["School Data"] || [];
  const schoolHeaders = Object.keys(schoolData[0] || {});
  
  const genderKey = schoolHeaders.find(h => /gender|sex/i.test(h)) || "Gender";
  const categoryKey = schoolHeaders.find(h => /category|caste|social/i.test(h)) || "Category";

  return schoolData.filter(row => {
    if (subset.class) {
      if ((row["Class"] || "").toString().trim() !== subset.class) {
        return false;
      }
    }
    if (subset.type === "gender") {
      const g = (row[genderKey] || "").toString().trim().toLowerCase();
      const isBoy = g.startsWith("b") || g === "male" || g === "m";
      const isGirl = g.startsWith("g") || g === "female" || g === "f";
      if (subset.filterName === "Boys" && !isBoy) return false;
      if (subset.filterName === "Girls" && !isGirl) return false;
    } else if (subset.type === "category") {
      const cat = (row[categoryKey] || "").toString().trim().toUpperCase();
      if (subset.filterName === "GEN" && cat !== "GEN" && cat !== "GENERAL") return false;
      if (subset.filterName === "OBC" && cat !== "OBC") return false;
      if (subset.filterName === "SC" && cat !== "SC") return false;
      if (subset.filterName === "ST" && cat !== "ST") return false;
    }
    return true;
  });
}

/**
 * Configure cell styling and click event for student breakdown grid numbers
 */
function makeCellClickable(td, type, cls, filterName, value) {
  td.innerHTML = "";
  
  const container = document.createElement("div");
  container.className = "report-badge-container";

  const badge = document.createElement("button");
  badge.textContent = value;
  
  const nameLower = filterName.toLowerCase();
  if (value === 0) {
    badge.className = "report-badge report-badge-zero";
  } else {
    badge.className = `report-badge ${nameLower}`;
    badge.title = `Click to view ${value} students`;
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      openSubsetList(type, cls, filterName);
    });
  }

  container.appendChild(badge);
  td.appendChild(container);
}

/**
 * Open subset student list and apply parameters to states
 */
function openSubsetList(type, cls, filterName) {
  if (window.navigateState) {
    window.navigateState({
      tab: "reports",
      reportCategory: REPORTS_STATE.activeCategory,
      reportSubset: {
        type: type,
        class: cls,
        filterName: filterName
      }
    });
  } else {
    REPORTS_STATE.activeSubset = {
      type: type,
      class: cls,
      filterName: filterName
    };
    REPORTS_STATE.searchQuery = "";
    REPORTS_STATE.currentPage = 1;

    const searchInput = document.getElementById("report-search-input");
    if (searchInput) searchInput.value = "";
    const classSelect = document.getElementById("report-class-select");
    if (classSelect) classSelect.value = cls || "";

    renderActiveCategoryDetail();
  }
}

/**
 * Get currently filtered categories dataset (applied query and class selector)
 */
function getFilteredCategoryData() {
  const cachedData = getCachedDatabase();
  if (!cachedData) return [];

  const catId = REPORTS_STATE.activeCategory;
  const cat = REPORT_CATEGORIES.find(c => c.id === catId);
  if (!cat) return [];

  let filtered;
  if (REPORTS_STATE.activeSubset) {
    filtered = getSubsetStudents(REPORTS_STATE.activeSubset, cachedData).map(row => {
      const schoolHeaders = Object.keys(row);
      const genderKey = schoolHeaders.find(h => /gender|sex/i.test(h)) || "Gender";
      const categoryKey = schoolHeaders.find(h => /category|caste|social/i.test(h)) || "Category";
      
      const mapped = {
        "Name": row["Name"] || "-",
        "Class": row["Class"] || "-",
        "Gender": row[genderKey] || "-",
        "Category": row[categoryKey] || "-",
        _original: row,
        _sourceSheet: "School Data"
      };
      return mapped;
    });
  } else {
    filtered = getCategoryRecords(cat, cachedData);
  }

  // Apply Class Filter
  if (REPORTS_STATE.selectedClass && (!cat.isChart || REPORTS_STATE.activeSubset)) {
    filtered = filtered.filter(row => (row["Class"] || "").toString().trim() === REPORTS_STATE.selectedClass);
  }

  // Apply Text Search Filter
  if (REPORTS_STATE.searchQuery) {
    const q = REPORTS_STATE.searchQuery.toLowerCase();
    filtered = filtered.filter(row => {
      return Object.values(row).some(val =>
        val !== undefined && val !== null && val.toString().toLowerCase().includes(q)
      );
    });
  }

  return filtered;
}

/**
 * Render detail category summary statistics cards
 */
function renderDetailSummaryCards(catId, filteredData, schoolData) {
  const container = document.getElementById("report-detail-summary-cards");
  if (!container) return;

  container.innerHTML = "";

  const totalEnrollment = schoolData.length || 1;

  if (catId === "c1") {
    let totalBoys = 0;
    let totalGirls = 0;
    filteredData.forEach(r => {
      totalBoys += r.Boys || 0;
      totalGirls += r.Girls || 0;
    });

    const ratio = totalBoys > 0 ? ((totalGirls / totalBoys) * 1000).toFixed(0) : "0";

    container.innerHTML = `
      <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; display: flex; align-items: center; gap: 12px; box-shadow: var(--shadow-sm);">
        <div style="background-color: var(--info-light); color: var(--info); width: 40px; height: 40px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center;">
          <i data-lucide="user" style="width: 20px; height: 20px;"></i>
        </div>
        <div>
          <h4 style="margin: 0; font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Total Boys</h4>
          <p style="margin: 2px 0 0 0; font-size: 1.35rem; font-weight: 700; color: var(--text-primary);">${totalBoys}</p>
        </div>
      </div>
      <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; display: flex; align-items: center; gap: 12px; box-shadow: var(--shadow-sm);">
        <div style="background-color: var(--primary-light); color: var(--primary); width: 40px; height: 40px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center;">
          <i data-lucide="user" style="width: 20px; height: 20px;"></i>
        </div>
        <div>
          <h4 style="margin: 0; font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Total Girls</h4>
          <p style="margin: 2px 0 0 0; font-size: 1.35rem; font-weight: 700; color: var(--text-primary);">${totalGirls}</p>
        </div>
      </div>
      </div>
    `;
  } else if (catId === "c2") {
    container.className = "metrics-grid c2-summary-grid";
    let gen = 0, obc = 0, sc = 0, st = 0;
    filteredData.forEach(r => {
      gen += r.GEN || 0;
      obc += r.OBC || 0;
      sc += r.SC || 0;
      st += r.ST || 0;
    });

    const categoriesList = [
      { label: "GEN", val: gen, color: "var(--primary)" },
      { label: "OBC", val: obc, color: "var(--success)" },
      { label: "SC", val: sc, color: "var(--warning)" },
      { label: "ST", val: st, color: "var(--danger)" }
    ];

    categoriesList.forEach(item => {
      const pct = totalEnrollment > 0 ? ((item.val / totalEnrollment) * 100).toFixed(1) : "0.0";
      const card = document.createElement("div");
      card.style.cssText = "background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; display: flex; align-items: center; gap: 12px; box-shadow: var(--shadow-sm);";
      card.innerHTML = `
        <div style="background-color: ${item.color}15; color: ${item.color}; width: 40px; height: 40px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem;">
          ${item.label}
        </div>
        <div>
          <h4 style="margin: 0; font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">${item.label}</h4>
          <p style="margin: 2px 0 0 0; font-size: 1.35rem; font-weight: 700; color: var(--text-primary);">${item.val} <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 500;">(${pct}%)</span></p>
        </div>
      `;
      container.appendChild(card);
    });
  } else {
    container.className = "metrics-grid";
    const count = filteredData.length;
    const prevalence = totalEnrollment > 0 ? ((count / totalEnrollment) * 100).toFixed(1) : "0.0";

    container.innerHTML = `
      <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; display: flex; align-items: center; gap: 12px; box-shadow: var(--shadow-sm);">
        <div style="background-color: var(--danger-light); color: var(--danger); width: 40px; height: 40px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center;">
          <i data-lucide="alert-circle" style="width: 20px; height: 20px;"></i>
        </div>
        <div>
          <h4 style="margin: 0; font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Issues Count</h4>
          <p style="margin: 2px 0 0 0; font-size: 1.35rem; font-weight: 700; color: var(--text-primary);">${count}</p>
        </div>
      </div>
      <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; display: flex; align-items: center; gap: 12px; box-shadow: var(--shadow-sm);">
        <div style="background-color: var(--warning-light); color: var(--warning); width: 40px; height: 40px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center;">
          <i data-lucide="trending-up" style="width: 20px; height: 20px;"></i>
        </div>
        <div>
          <h4 style="margin: 0; font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Prevalence Rate</h4>
          <p style="margin: 2px 0 0 0; font-size: 1.35rem; font-weight: 700; color: var(--text-primary);">${prevalence}%</p>
        </div>
      </div>
    `;
  }

  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
}

/**
 * Render detail category content
 */
function renderActiveCategoryDetail() {
  const catId = REPORTS_STATE.activeCategory;
  const cat = REPORT_CATEGORIES.find(c => c.id === catId);
  if (!cat) return;

  const tableEl = document.getElementById("report-detail-table");
  if (tableEl) {
    if (cat.isChart && !REPORTS_STATE.activeSubset) {
      tableEl.className = "analytics-report-table";
    } else {
      tableEl.className = "data-table student-report-table";
    }
  }

  const cachedData = getCachedDatabase();
  const schoolData = cachedData ? (cachedData["School Data"] || []) : [];

  // Update headers
  if (REPORTS_STATE.activeSubset) {
    const subset = REPORTS_STATE.activeSubset;
    const classStr = subset.class ? `Class ${subset.class}` : "All Classes";
    const filterStr = subset.filterName;
    document.getElementById("report-detail-title").textContent = `${cat.title} - ${classStr} (${filterStr})`;
    document.getElementById("report-detail-subtitle").textContent = `Detailed list of students in ${classStr} matching ${filterStr}.`;
  } else {
    document.getElementById("report-detail-title").textContent = cat.title;
    document.getElementById("report-detail-subtitle").textContent = cat.description;
  }

  // Toggle Class Filter box (hide if category is class-wise chart summary, unless viewing subset)
  const classFilterWrapper = document.getElementById("report-class-filter-wrapper");
  if (classFilterWrapper) {
    classFilterWrapper.style.display = (cat.isChart && !REPORTS_STATE.activeSubset) ? "none" : "block";
  }

  // Calculate filtered list
  const filteredData = getFilteredCategoryData();
  const totalCount = filteredData.length;
  document.getElementById("report-detail-count-badge").textContent = `Total: ${totalCount}`;

  // Render detail summary cards
  const summaryCardsContainer = document.getElementById("report-detail-summary-cards");
  if (summaryCardsContainer) {
    if (REPORTS_STATE.activeSubset) {
      summaryCardsContainer.classList.add("hidden");
    } else {
      summaryCardsContainer.classList.remove("hidden");
      renderDetailSummaryCards(catId, filteredData, schoolData);
    }
  }

  // Handle Chart.js component
  const chartCard = document.getElementById("report-chart-card");
  if (cat.isChart && !REPORTS_STATE.activeSubset) {
    chartCard.classList.remove("hidden");
    renderCategoryChartJs(cat, filteredData);
  } else {
    chartCard.classList.add("hidden");
    if (window.reportsCharts.activeDetailChart) {
      window.reportsCharts.activeDetailChart.destroy();
      window.reportsCharts.activeDetailChart = null;
    }
  }

  // Paginate
  const totalPages = Math.ceil(totalCount / REPORTS_STATE.pageSize) || 1;
  if (REPORTS_STATE.currentPage > totalPages) {
    REPORTS_STATE.currentPage = totalPages;
  }

  const startIndex = (REPORTS_STATE.currentPage - 1) * REPORTS_STATE.pageSize;
  const endIndex = Math.min(startIndex + REPORTS_STATE.pageSize, totalCount);
  const paginated = filteredData.slice(startIndex, endIndex);

  // Determine headers
  let headers = cat.headers;
  if (REPORTS_STATE.activeSubset) {
    if (REPORTS_STATE.activeSubset.type === "gender") {
      headers = ["Name", "Class", "Gender"];
    } else {
      headers = ["Name", "Class", "Category"];
    }
  }

  // Render Table Head
  const thead = document.getElementById("report-detail-thead");
  thead.innerHTML = "";
  const thr = document.createElement("tr");
  headers.forEach(h => {
    const th = document.createElement("th");
    th.textContent = h;
    if (h === "Class") {
      th.className = "col-class";
    } else if (h === "Name") {
      th.className = "col-name";
    } else {
      th.className = "col-relevant";
    }
    thr.appendChild(th);
  });
  if (!cat.isChart || REPORTS_STATE.activeSubset) {
    const th = document.createElement("th");
    th.textContent = "Actions";
    th.style.width = "80px";
    th.style.textAlign = "center";
    thr.appendChild(th);
  }
  thead.appendChild(thr);

  // Render Table Body
  const tbody = document.getElementById("report-detail-tbody");
  tbody.innerHTML = "";

  if (filteredData.length === 0) {
    const colSpan = headers.length + (!cat.isChart || REPORTS_STATE.activeSubset ? 1 : 0);
    tbody.innerHTML = `<tr><td colspan="${colSpan}" style="padding: 32px; text-align: center; color: var(--text-muted);">No matching records found.</td></tr>`;
  } else {
    if (REPORTS_STATE.activeSubset) {
      // Render subset student details table rows
      paginated.forEach(row => {
        const tr = document.createElement("tr");
        headers.forEach(h => {
          const td = document.createElement("td");
          let val = row[h];
          if (typeof formatCellValue === "function") {
            val = formatCellValue(val);
          }
          td.textContent = (val !== undefined && val !== null) ? val : "";
          if (h === "Class") {
            td.className = "col-class";
          } else if (h === "Name") {
            td.className = "col-name";
          } else {
            td.className = "col-relevant";
          }
          tr.appendChild(td);
        });

        // Add View Action Button
        const actionTd = document.createElement("td");
        actionTd.style.textAlign = "center";
        const viewBtn = document.createElement("button");
        viewBtn.className = "btn-secondary";
        viewBtn.style.padding = "4px 8px";
        viewBtn.style.fontSize = "0.75rem";
        viewBtn.style.display = "inline-flex";
        viewBtn.style.alignItems = "center";
        viewBtn.style.gap = "4px";
        viewBtn.innerHTML = `<i data-lucide="eye" style="width: 14px; height: 14px;"></i><span>View</span>`;
        viewBtn.addEventListener("click", () => {
          const targetRow = row._original || row;
          if (typeof window.openStudentDetailModal === "function") {
            window.openStudentDetailModal(targetRow, row._sourceSheet);
          }
        });
        actionTd.appendChild(viewBtn);
        tr.appendChild(actionTd);

        tbody.appendChild(tr);
      });
    } else if (cat.id === "c1") {
      // Custom table rendering for C1 with Grand Total and clickable cells
      let grandBoys = 0;
      let grandGirls = 0;
      let grandTotal = 0;

      filteredData.forEach(row => {
        const tr = document.createElement("tr");

        const classTd = document.createElement("td");
        classTd.textContent = row["Class"] || "-";
        classTd.style.fontWeight = "600";
        tr.appendChild(classTd);

        const boysTd = document.createElement("td");
        boysTd.textContent = row["Boys"] || 0;
        makeCellClickable(boysTd, "gender", row["Class"], "Boys", row["Boys"] || 0);
        tr.appendChild(boysTd);

        const girlsTd = document.createElement("td");
        girlsTd.textContent = row["Girls"] || 0;
        makeCellClickable(girlsTd, "gender", row["Class"], "Girls", row["Girls"] || 0);
        tr.appendChild(girlsTd);

        const totalTd = document.createElement("td");
        totalTd.textContent = row["Total"] || 0;
        totalTd.style.fontWeight = "600";
        makeCellClickable(totalTd, "gender", row["Class"], "Total", row["Total"] || 0);
        tr.appendChild(totalTd);

        tbody.appendChild(tr);

        grandBoys += row["Boys"] || 0;
        grandGirls += row["Girls"] || 0;
        grandTotal += row["Total"] || 0;
      });

      // Add Grand Total row
      const gTr = document.createElement("tr");
      gTr.className = "grand-total-row";

      const labelTd = document.createElement("td");
      labelTd.textContent = "Grand Total";
      gTr.appendChild(labelTd);

      const boysTd = document.createElement("td");
      boysTd.textContent = grandBoys;
      makeCellClickable(boysTd, "gender", null, "Boys", grandBoys);
      gTr.appendChild(boysTd);

      const girlsTd = document.createElement("td");
      girlsTd.textContent = grandGirls;
      makeCellClickable(girlsTd, "gender", null, "Girls", grandGirls);
      gTr.appendChild(girlsTd);

      const totalTd = document.createElement("td");
      totalTd.textContent = grandTotal;
      makeCellClickable(totalTd, "gender", null, "Total", grandTotal);
      gTr.appendChild(totalTd);

      tbody.appendChild(gTr);

    } else if (cat.id === "c2") {
      // Custom table rendering for C2 with Grand Total and clickable cells
      let grandGen = 0;
      let grandObc = 0;
      let grandSc = 0;
      let grandSt = 0;
      let grandTotal = 0;

      filteredData.forEach(row => {
        const tr = document.createElement("tr");

        const classTd = document.createElement("td");
        classTd.textContent = row["Class"] || "-";
        classTd.style.fontWeight = "600";
        tr.appendChild(classTd);

        const genTd = document.createElement("td");
        genTd.textContent = row["GEN"] || 0;
        makeCellClickable(genTd, "category", row["Class"], "GEN", row["GEN"] || 0);
        tr.appendChild(genTd);

        const obcTd = document.createElement("td");
        obcTd.textContent = row["OBC"] || 0;
        makeCellClickable(obcTd, "category", row["Class"], "OBC", row["OBC"] || 0);
        tr.appendChild(obcTd);

        const scTd = document.createElement("td");
        scTd.textContent = row["SC"] || 0;
        makeCellClickable(scTd, "category", row["Class"], "SC", row["SC"] || 0);
        tr.appendChild(scTd);

        const stTd = document.createElement("td");
        stTd.textContent = row["ST"] || 0;
        makeCellClickable(stTd, "category", row["Class"], "ST", row["ST"] || 0);
        tr.appendChild(stTd);

        const totalTd = document.createElement("td");
        totalTd.textContent = row["Total"] || 0;
        totalTd.style.fontWeight = "600";
        makeCellClickable(totalTd, "category", row["Class"], "Total", row["Total"] || 0);
        tr.appendChild(totalTd);

        tbody.appendChild(tr);

        grandGen += row["GEN"] || 0;
        grandObc += row["OBC"] || 0;
        grandSc += row["SC"] || 0;
        grandSt += row["ST"] || 0;
        grandTotal += row["Total"] || 0;
      });

      // Add Grand Total row
      const gTr = document.createElement("tr");
      gTr.className = "grand-total-row";

      const labelTd = document.createElement("td");
      labelTd.textContent = "Grand Total";
      gTr.appendChild(labelTd);

      const genTd = document.createElement("td");
      genTd.textContent = grandGen;
      makeCellClickable(genTd, "category", null, "GEN", grandGen);
      gTr.appendChild(genTd);

      const obcTd = document.createElement("td");
      obcTd.textContent = grandObc;
      makeCellClickable(obcTd, "category", null, "OBC", grandObc);
      gTr.appendChild(obcTd);

      const scTd = document.createElement("td");
      scTd.textContent = grandSc;
      makeCellClickable(scTd, "category", null, "SC", grandSc);
      gTr.appendChild(scTd);

      const stTd = document.createElement("td");
      stTd.textContent = grandSt;
      makeCellClickable(stTd, "category", null, "ST", grandSt);
      gTr.appendChild(stTd);

      const totalTd = document.createElement("td");
      totalTd.textContent = grandTotal;
      makeCellClickable(totalTd, "category", null, "Total", grandTotal);
      gTr.appendChild(totalTd);

      tbody.appendChild(gTr);

    } else {
      filteredData.forEach(row => {
        const tr = document.createElement("tr");
        cat.headers.forEach(h => {
          const td = document.createElement("td");
          let val = row[h];
          if (typeof formatCellValue === "function") {
            val = formatCellValue(val);
          }
          td.textContent = (val !== undefined && val !== null) ? val : "";
          if (h === "Class") {
            td.className = "col-class";
          } else if (h === "Name") {
            td.className = "col-name";
          } else {
            td.className = "col-relevant";
          }
          tr.appendChild(td);
        });

        // Add View Action Button
        const actionTd = document.createElement("td");
        actionTd.style.textAlign = "center";
        const viewBtn = document.createElement("button");
        viewBtn.className = "btn-secondary";
        viewBtn.style.padding = "4px 8px";
        viewBtn.style.fontSize = "0.75rem";
        viewBtn.style.display = "inline-flex";
        viewBtn.style.alignItems = "center";
        viewBtn.style.gap = "4px";
        viewBtn.innerHTML = `<i data-lucide="eye" style="width: 14px; height: 14px;"></i><span>View</span>`;
        viewBtn.addEventListener("click", () => {
          const targetRow = row._original || row;
          if (typeof window.openStudentDetailModal === "function") {
            window.openStudentDetailModal(targetRow, row._sourceSheet);
          }
        });
        actionTd.appendChild(viewBtn);
        tr.appendChild(actionTd);

        tbody.appendChild(tr);
      });
    }
  }

  // Render Pagination Info & Buttons (No pagination buttons, just total entries)
  const infoEl = document.getElementById("report-pagination-info");
  if (infoEl) {
    infoEl.textContent = `Showing all ${totalCount} entries`;
  }

  const buttonsContainer = document.getElementById("report-pagination-buttons");
  if (buttonsContainer) {
    buttonsContainer.innerHTML = "";
  }

  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
}

/**
 * Render Chart components using Chart.js
 */
function renderCategoryChartJs(cat, data) {
  if (window.reportsCharts.activeDetailChart) {
    window.reportsCharts.activeDetailChart.destroy();
  }

  const canvas = document.getElementById("report-chart-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const colors = getThemeColors();

  if (cat.id === "c1") {
    window.reportsCharts.activeDetailChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.map(r => r["Class"]),
        datasets: [
          {
            label: "Boys",
            data: data.map(r => r["Boys"]),
            backgroundColor: "#06b6d4",
            borderRadius: 4
          },
          {
            label: "Girls",
            data: data.map(r => r["Girls"]),
            backgroundColor: "#ec4899",
            borderRadius: 4
          },
          {
            label: "Total",
            data: data.map(r => r["Total"]),
            backgroundColor: "#6366f1",
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: { color: colors.text, font: { family: 'Inter', weight: 600, size: 12 } }
          }
        },
        scales: {
          x: {
            grid: { color: colors.border },
            ticks: { color: colors.text }
          },
          y: {
            grid: { color: colors.border },
            ticks: { color: colors.text, stepSize: 5 }
          }
        }
      }
    });
  } else if (cat.id === "c2") {
    window.reportsCharts.activeDetailChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.map(r => r["Class"]),
        datasets: [
          {
            label: "GEN",
            data: data.map(r => r["GEN"]),
            backgroundColor: "#4f46e5",
            borderRadius: 4
          },
          {
            label: "OBC",
            data: data.map(r => r["OBC"]),
            backgroundColor: "#0ea5e9",
            borderRadius: 4
          },
          {
            label: "SC",
            data: data.map(r => r["SC"]),
            backgroundColor: "#f59e0b",
            borderRadius: 4
          },
          {
            label: "ST",
            data: data.map(r => r["ST"]),
            backgroundColor: "#ec4899",
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: { color: colors.text, font: { family: 'Inter', weight: 600, size: 12 } }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { color: colors.border },
            ticks: { color: colors.text }
          },
          y: {
            stacked: true,
            grid: { color: colors.border },
            ticks: { color: colors.text, stepSize: 5 }
          }
        }
      }
    });
  }
}

/**
 * Bind DOM content loaded handlers
 */
document.addEventListener("DOMContentLoaded", () => {
  // Bind Back Button
  const backBtn = document.getElementById("report-back-btn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      history.back();
    });
  }

  // Bind Class filter selector
  const classSelect = document.getElementById("report-class-select");
  if (classSelect) {
    classSelect.addEventListener("change", () => {
      REPORTS_STATE.selectedClass = classSelect.value;
      REPORTS_STATE.currentPage = 1;
      renderActiveCategoryDetail();
    });
  }

  // Bind search box input (with slight debounce)
  const searchInput = document.getElementById("report-search-input");
  if (searchInput) {
    let timeout = null;
    searchInput.addEventListener("input", () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        REPORTS_STATE.searchQuery = searchInput.value;
        REPORTS_STATE.currentPage = 1;
        renderActiveCategoryDetail();
      }, 200);
    });
  }

  // Bind PDF export button (interfacing with standard pdfExport.js configuration modal)
  const exportPdfBtn = document.getElementById("report-export-pdf-btn");
  if (exportPdfBtn) {
    exportPdfBtn.addEventListener("click", () => {
      const catId = REPORTS_STATE.activeCategory;
      const cat = REPORT_CATEGORIES.find(c => c.id === catId);
      if (!cat) return;

      const data = getFilteredCategoryData();
      const formatted = data.map(r => {
        const obj = {};
        if (cat.isChart && !REPORTS_STATE.activeSubset) {
          cat.headers.forEach(h => {
            let val = r[h];
            if (typeof formatCellValue === "function") {
              val = formatCellValue(val);
            }
            obj[h] = val;
          });
        } else {
          // Copy and format all keys from the mapped record (so custom report columns exist)
          Object.keys(r).forEach(k => {
            if (k.startsWith("_")) return;
            let val = r[k];
            if (typeof formatCellValue === "function") {
              val = formatCellValue(val);
            }
            obj[k] = val;
          });
          // Copy and format all keys from the original sheet row (to get all the other columns from School Data)
          const originalRow = r._original || {};
          Object.keys(originalRow).forEach(k => {
            if (k.startsWith("_")) return;
            let val = originalRow[k];
            if (typeof formatCellValue === "function") {
              val = formatCellValue(val);
            }
            obj[k] = val;
          });
        }
        return obj;
      });

      if (!window.activeFilteredData) {
        window.activeFilteredData = {};
      }
      window.activeFilteredData[catId] = formatted;

      if (typeof openPdfModalForSheet === "function") {
        openPdfModalForSheet(catId);
      }
    });
  }

  // Bind Theme toggle click action to redraw charts
  const toggleBtn = document.getElementById("theme-toggle-btn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      if (window.currentActiveTab === "reports") {
        setTimeout(() => {
          if (REPORTS_STATE.activeCategory) {
            renderActiveCategoryDetail();
          } else {
            window.renderReports();
          }
        }, 50);
      }
    });
  }
});
