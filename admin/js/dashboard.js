/**
 * Admin Portal Dashboard Module
 * Manages stats calculation, schools listing, password resets, active sessions, and cross-school logs aggregation.
 */

// State Management
const STATE = {
  schools: [],
  sessions: [],
  detailsCache: {}, // keyed by school userId: { studentCount: N, editLogs: [...] }
  activeTab: "dashboard",
  filters: {
    schools: { search: "", status: "all" },
    sessions: { search: "", status: "active" }
  },
  theme: localStorage.getItem("admin_theme") || "light",
  isFetchingDetails: false
};

let isDrawerOpen = false;

function setDrawerOpen(open) {
  isDrawerOpen = !!open;
  const sidebar = document.getElementById("admin-sidebar");
  const backdrop = document.getElementById("admin-sidebar-backdrop");

  if (sidebar) {
    if (isDrawerOpen) {
      sidebar.classList.add("open");
      document.body.classList.add("drawer-open-lock");
    } else {
      sidebar.classList.remove("open");
      document.body.classList.remove("drawer-open-lock");
    }
  }

  if (backdrop) {
    if (isDrawerOpen) {
      backdrop.classList.add("open");
    } else {
      backdrop.classList.remove("open");
    }
  }
}

function setLoaderState(isLoading) {
  const skeleton = document.getElementById("admin-skeleton-loader");
  const globalLoader = document.getElementById("admin-global-loader");

  if (skeleton) {
    if (isLoading) {
      skeleton.classList.remove("hidden");
      // Hide all view sections
      document.querySelectorAll(".admin-view-section").forEach(sec => sec.classList.add("hidden"));
    } else {
      skeleton.classList.add("hidden");
      // Restore the current active view section
      const activeTab = STATE.activeTab || "dashboard";
      document.querySelectorAll(".admin-view-section").forEach(sec => {
        if (sec.id === `admin-${activeTab}-view`) {
          sec.classList.remove("hidden");
        } else {
          sec.classList.add("hidden");
        }
      });
      renderActiveTab();
    }
  } else if (globalLoader) {
    if (isLoading) {
      globalLoader.classList.remove("hidden");
    } else {
      globalLoader.classList.add("hidden");
    }
  }
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes admin data TTL
const DETAILS_CACHE_KEY = "admin_schools_detail_cache";

function applyTheme(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  const themeMeta = document.getElementById('admin-theme-color');
  if (themeMeta) {
    themeMeta.content = isDark ? '#0a0f1e' : '#ffffff';
  }
  localStorage.setItem('admin_theme', isDark ? 'dark' : 'light');
  STATE.theme = isDark ? 'dark' : 'light';
  updateThemeIcon();
}

function initTheme() {
  const savedTheme = localStorage.getItem('admin_theme') || 'light';
  applyTheme(savedTheme === 'dark');

  const themeBtn = document.getElementById("admin-theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const isDark = STATE.theme === "light";
      applyTheme(isDark);
    });
  }
}

function updateThemeIcon() {
  const sunIcon = document.getElementById("admin-theme-sun");
  const moonIcon = document.getElementById("admin-theme-moon");
  if (sunIcon && moonIcon) {
    if (STATE.theme === "light") {
      sunIcon.classList.add("hidden");
      moonIcon.classList.remove("hidden");
    } else {
      sunIcon.classList.remove("hidden");
      moonIcon.classList.add("hidden");
    }
  }
}

/**
 * Navigation handler
 */
function initNavigation() {
  const navItems = document.querySelectorAll(".admin-nav-item");
  navItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const target = item.getAttribute("data-target");
      if (target) {
        switchTab(target);
      }
    });
  });
}

function switchTab(tabId) {
  STATE.activeTab = tabId;

  // Update nav item active states
  document.querySelectorAll(".admin-nav-item").forEach(item => {
    if (item.getAttribute("data-target") === tabId) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // Update header section title
  const headerTitle = document.getElementById("admin-header-title");
  if (headerTitle) {
    if (tabId === "dashboard") {
      headerTitle.textContent = "Dashboard";
    } else if (tabId === "schools") {
      headerTitle.textContent = "Schools";
    } else if (tabId === "sessions") {
      headerTitle.textContent = "Sessions";
    }
  }

  // Toggle view sections
  document.querySelectorAll(".admin-view-section").forEach(sec => {
    if (sec.id === `admin-${tabId}-view`) {
      sec.classList.remove("hidden");
    } else {
      sec.classList.add("hidden");
    }
  });

  // Render specific tab content
  renderActiveTab();
}

function renderActiveTab() {
  if (STATE.activeTab === "dashboard") {
    renderStats();
    renderSchoolsList();
  } else if (STATE.activeTab === "schools") {
    renderSchoolsList();
  } else if (STATE.activeTab === "sessions") {
    renderSessions();
  }
}

/**
 * Fetch main admin data from Apps Script (with 5 min cache)
 */
async function fetchAdminData(force = false) {
  const cacheData = localStorage.getItem("admin_schools_data_cache");
  const cacheTime = localStorage.getItem("admin_schools_data_cache_time");
  const now = Date.now();

  setLoaderState(true);

  // Load schools detail cache if exists
  const localDetails = localStorage.getItem(DETAILS_CACHE_KEY);
  if (localDetails) {
    try {
      STATE.detailsCache = JSON.parse(localDetails);
    } catch (e) {
      STATE.detailsCache = {};
    }
  }

  if (!force && cacheData && cacheTime && (now - parseInt(cacheTime) < CACHE_TTL_MS)) {
    try {
      const parsed = JSON.parse(cacheData);
      STATE.schools = parsed.schools || [];
      STATE.sessions = parsed.sessions || [];
      setLoaderState(false);
      renderActiveTab();
      triggerBackgroundDetailsFetch();
      return;
    } catch (e) {
      console.warn("Error parsing cached admin data, refetching...", e);
    }
  }

  const session = getAdminSession();
  if (!session) return;

  try {
    const res = await ApiService.getAdminData(session.username);
    if (res && res.success) {
      STATE.schools = res.schools || [];
      STATE.sessions = res.sessions || [];

      // Save cache
      localStorage.setItem("admin_schools_data_cache", JSON.stringify({ schools: STATE.schools, sessions: STATE.sessions }));
      localStorage.setItem("admin_schools_data_cache_time", now.toString());

      showToast("Data synced with server", "success");
      renderActiveTab();
      triggerBackgroundDetailsFetch();
    } else {
      throw new Error(res.message || "Failed to load admin data.");
    }
  } catch (error) {
    showToast(error.message || "Could not retrieve admin data.", "error");
  } finally {
    setLoaderState(false);
  }
}

/**
 * Fetch detail sheets (UDISE, 3.0, School Data) for student counts & logs sequentially
 */
async function triggerBackgroundDetailsFetch() {
  if (STATE.isFetchingDetails) return;
  STATE.isFetchingDetails = true;

  const activeSchools = STATE.schools.filter(s => {
    const url = (s.sheetUrl || s.sheet_url || s["Sheet URL"] || "").toString().trim();
    return s.status.toLowerCase() === "active" && url && url.startsWith("http");
  });
  if (activeSchools.length === 0) {
    STATE.isFetchingDetails = false;
    return;
  }

  const progressContainer = document.getElementById("admin-sync-progress");
  const progressBar = document.getElementById("admin-sync-progress-bar");
  const progressText = document.getElementById("admin-sync-progress-text");

  if (progressContainer) progressContainer.classList.remove("hidden");

  let successCount = 0;
  for (let i = 0; i < activeSchools.length; i++) {
    const school = activeSchools[i];

    // Update progress bar
    const percent = Math.round(((i) / activeSchools.length) * 100);
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `Syncing school details: ${school.schoolName}...`;

    // Only refetch if not cached or cache is older than 1 hour (details are less volatile)
    const cached = STATE.detailsCache[school.userId];
    const cacheAge = cached ? Date.now() - cached.lastFetched : Infinity;

    if (cacheAge < 60 * 60 * 1000) {
      successCount++;
      continue;
    }

    try {
      const url = (school.sheetUrl || school.sheet_url || school["Sheet URL"] || "").toString().trim();
      const data = await ApiService.fetchSchoolDetails(url);

      // Calculate total students across School Data, UDISE, 3.0
      let totalStudents = 0;
      const studentWorksheets = ["School Data", "UDISE", "3.0"];
      studentWorksheets.forEach(wsName => {
        if (data[wsName] && Array.isArray(data[wsName])) {
          totalStudents += data[wsName].length;
        }
      });

      // Extract edit logs (case-insensitive check for edit_log worksheet name)
      let editLogs = [];
      const logKey = Object.keys(data).find(k => k.toLowerCase() === "edit_log" || k.toLowerCase() === "edit log");
      if (logKey && Array.isArray(data[logKey])) {
        editLogs = data[logKey];
      }

      // Cache details
      STATE.detailsCache[school.userId] = {
        studentCount: totalStudents,
        editLogs: editLogs,
        lastFetched: Date.now()
      };

      localStorage.setItem(DETAILS_CACHE_KEY, JSON.stringify(STATE.detailsCache));
      successCount++;

      // Update displays if current tab is active
      if (STATE.activeTab === "dashboard") renderStats();
      if (STATE.activeTab === "schools") renderSchoolsList();
    } catch (err) {
      console.warn(`Failed to sync details for ${school.schoolName}:`, err);
    }
  }

  if (progressBar) progressBar.style.width = "100%";
  if (progressText) progressText.textContent = `Sync complete. ${successCount}/${activeSchools.length} schools updated.`;

  setTimeout(() => {
    if (progressContainer) progressContainer.classList.add("hidden");
  }, 3000);

  STATE.isFetchingDetails = false;

  // Final render updates
  renderActiveTab();
}

/**
 * Feature 1 - Quick Stats Overview
 */
function renderStats() {
  const totalSchools = STATE.schools.length;
  const activeSchools = STATE.schools.filter(s => s.status.toLowerCase() === "active").length;
  const inactiveSchools = totalSchools - activeSchools;

  // Active Sessions
  const activeSessions = STATE.sessions.filter(sess => !sess.logoutTimestamp || sess.logoutTimestamp.toString().trim() === "").length;

  document.getElementById("stat-total-schools").textContent = totalSchools;
  document.getElementById("stat-active-schools").textContent = activeSchools;
  document.getElementById("stat-inactive-schools").textContent = inactiveSchools;

  const sessionsEl = document.getElementById("stat-active-sessions");
  if (sessionsEl) {
    sessionsEl.textContent = activeSessions;
  }
}

/**
 * Populate Schools Container Helper for Card and Table layout
 */
function populateSchoolsContainer(tableBody, cardsContainer, filteredSchools) {
  if (tableBody) tableBody.innerHTML = "";
  if (cardsContainer) cardsContainer.innerHTML = "";

  if (filteredSchools.length === 0) {
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="admin-empty-row" style="text-align: center; padding: 32px; color: var(--text-muted);">
            <i data-lucide="search" class="empty-icon" style="margin: 0 auto 12px auto; display: block; opacity: 0.5;"></i>
            <p>No schools matched your criteria.</p>
          </td>
        </tr>
      `;
    }
    if (cardsContainer) {
      cardsContainer.innerHTML = `
        <div class="admin-empty-card" style="text-align: center; padding: 32px; background: var(--surface); border-radius: 12px; border: 1px dashed var(--border-color); color: var(--text-muted);">
          <i data-lucide="search" class="empty-icon" style="margin: 0 auto 12px auto; display: block; opacity: 0.5;"></i>
          <p>No schools matched your criteria.</p>
        </div>
      `;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  filteredSchools.forEach(school => {
    const isActive = school.status.toLowerCase() === "active";
    const isEditable = school.editable.toLowerCase() === "yes";
    const isReportEnabled = (school.report || "").toLowerCase() === "yes";

    // Last login check
    let lastLoginStr = "Never";
    const schoolSessions = STATE.sessions.filter(s => s.userId === school.userId);
    if (schoolSessions.length > 0) {
      const logins = schoolSessions
        .map(s => s.loginTimestamp ? new Date(s.loginTimestamp) : new Date(0))
        .filter(d => !isNaN(d.getTime()));
      if (logins.length > 0) {
        const latest = new Date(Math.max(...logins));
        lastLoginStr = latest.toLocaleDateString() + " " + latest.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }

    const logoUrl = school.logoUrl ? convertDriveUrl(school.logoUrl) : null;

    // 1. Create table row (Desktop)
    let tr = null;
    if (tableBody) {
      tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="school-identity">
            ${logoUrl ? `<img class="school-logo-img" src="${logoUrl}" onerror="this.remove();" style="width:36px; height:36px; border-radius:8px; object-fit:cover; border:1px solid var(--border); background:#fff; flex-shrink:0;">` : ''}
            <div>
              <div class="school-name-text">${school.schoolName}</div>
              <div class="school-id-sub">ID: ${school.userId}</div>
            </div>
          </div>
        </td>
        <td><code>${school.userId}</code></td>
        <td>
          <label class="switch-toggle">
            <input type="checkbox" class="status-toggle-cb" data-userid="${school.userId}" ${isActive ? 'checked' : ''}>
            <span class="switch-slider"></span>
          </label>
        </td>
        <td>
          <label class="switch-toggle">
            <input type="checkbox" class="editable-toggle-cb" data-userid="${school.userId}" ${isEditable ? 'checked' : ''}>
            <span class="switch-slider"></span>
          </label>
        </td>
        <td>
          <label class="switch-toggle">
            <input type="checkbox" class="report-toggle-cb" data-userid="${school.userId}" ${isReportEnabled ? 'checked' : ''}>
            <span class="switch-slider"></span>
          </label>
        </td>
        <td>
          <button class="device-badge-btn" data-userid="${school.userId}" title="Click to edit device limit">
            <i data-lucide="smartphone"></i>
            <span>${parseInt(school.devices || school.Devices) || 1}</span>
          </button>
        </td>
        <td><span class="last-login-date">${lastLoginStr}</span></td>
        <td>
          <div class="table-actions">
            <button class="btn-action-text reset-btn reset-pwd-btn" data-userid="${school.userId}">
              <i data-lucide="key-round"></i><span>Reset</span>
            </button>
            <button class="btn-action-text sessions-btn view-sessions-btn" data-userid="${school.userId}">
              <i data-lucide="monitor"></i><span>Sessions</span>
            </button>
          </div>
        </td>
      `;
      tableBody.appendChild(tr);
    }

    // 2. Create card (Mobile)
    let card = null;
    if (cardsContainer) {
      card = document.createElement("div");
      card.className = "school-mobile-card";
      card.innerHTML = `
        <div class="school-card-header">
          <div class="school-identity">
            ${logoUrl ? `<img class="school-logo-img" src="${logoUrl}" onerror="this.remove();" style="width:40px; height:40px; border-radius:10px; object-fit:cover; border:1px solid var(--border); background:#fff; flex-shrink:0;">` : ''}
            <div>
              <div class="school-card-title">${school.schoolName}</div>
              <div class="school-card-id">ID: <code>${school.userId}</code></div>
            </div>
          </div>
        </div>
        
        <div class="school-card-toggles">
          <div class="toggle-group">
            <span>Status</span>
            <label class="switch-toggle">
              <input type="checkbox" class="status-toggle-cb" data-userid="${school.userId}" ${isActive ? 'checked' : ''}>
              <span class="switch-slider"></span>
            </label>
          </div>
          <div class="toggle-group">
            <span>Editable</span>
            <label class="switch-toggle">
              <input type="checkbox" class="editable-toggle-cb" data-userid="${school.userId}" ${isEditable ? 'checked' : ''}>
              <span class="switch-slider"></span>
            </label>
          </div>
          <div class="toggle-group">
            <span>Report</span>
            <label class="switch-toggle">
              <input type="checkbox" class="report-toggle-cb" data-userid="${school.userId}" ${isReportEnabled ? 'checked' : ''}>
              <span class="switch-slider"></span>
            </label>
          </div>
          <div class="toggle-group devices-group">
            <span>Devices</span>
            <button class="device-badge-btn" data-userid="${school.userId}" title="Click to edit device limit" style="padding: 2px 6px; font-size: 11px; height: 26px;">
              <i data-lucide="smartphone" style="width: 12px; height: 12px;"></i>
              <span>${parseInt(school.devices || school.Devices) || 1}</span>
            </button>
          </div>
        </div>
        
        <div class="school-card-info-row">
          <div class="info-item">
            <span class="info-label">Last Login:</span>
            <span class="info-value">${lastLoginStr}</span>
          </div>
        </div>
        
        <div class="school-card-actions">
          <button class="btn-action-text reset-btn reset-pwd-btn" data-userid="${school.userId}">
            <i data-lucide="key-round"></i><span>Reset</span>
          </button>
          <button class="btn-action-text sessions-btn view-sessions-btn" data-userid="${school.userId}">
            <i data-lucide="monitor"></i><span>Sessions</span>
          </button>
        </div>
      `;
      cardsContainer.appendChild(card);
    }

    // Helper to bind status toggle event
    const bindStatusToggle = (element) => {
      const statusCB = element.querySelector(".status-toggle-cb");
      if (statusCB) {
        statusCB.addEventListener("change", async () => {
          const isChecked = statusCB.checked;
          const nextStatus = isChecked ? "Active" : "Inactive";
          const oldVal = school.status;

          // Optimistic update state
          school.status = nextStatus;
          showToast(`${school.schoolName} status toggling to ${nextStatus}`, "info");

          try {
            const res = await ApiService.updateField(school.userId, "Status", nextStatus);
            if (!res || !res.success) {
              throw new Error(res.message || "Failed to update Status.");
            }
            showToast(`${school.schoolName} updated successfully`, "success");
            // Update caches
            localStorage.setItem("admin_schools_data_cache", JSON.stringify({ schools: STATE.schools, sessions: STATE.sessions }));
            renderStats();
            renderSchoolsList();
          } catch (err) {
            // Revert
            school.status = oldVal;
            statusCB.checked = !isChecked;
            showToast(`Failed to update status: ${err.message}`, "error");
            renderStats();
            renderSchoolsList();
          }
        });
      }
    };

    // Helper to bind editable toggle event
    const bindEditableToggle = (element) => {
      const editableCB = element.querySelector(".editable-toggle-cb");
      if (editableCB) {
        editableCB.addEventListener("change", async () => {
          const isChecked = editableCB.checked;
          const nextEditable = isChecked ? "Yes" : "No";
          const oldVal = school.editable;

          // Optimistic update state
          school.editable = nextEditable;
          showToast(`Setting editing permission to ${isChecked ? 'Allowed' : 'Disabled'}`, "info");

          try {
            const res = await ApiService.updateField(school.userId, "Editable", nextEditable);
            if (!res || !res.success) {
              throw new Error(res.message || "Failed to update Editable field.");
            }
            showToast(`${school.schoolName} permissions updated`, "success");
            localStorage.setItem("admin_schools_data_cache", JSON.stringify({ schools: STATE.schools, sessions: STATE.sessions }));
            renderSchoolsList();
          } catch (err) {
            // Revert
            school.editable = oldVal;
            editableCB.checked = !isChecked;
            showToast(`Failed to update editable permission: ${err.message}`, "error");
            renderSchoolsList();
          }
        });
      }
    };

    // Helper to bind report toggle event
    const bindReportToggle = (element) => {
      const reportCB = element.querySelector(".report-toggle-cb");
      if (reportCB) {
        reportCB.addEventListener("change", async () => {
          const isChecked = reportCB.checked;
          const nextReport = isChecked ? "Yes" : "No";
          const oldVal = school.report;

          // Optimistic update state
          school.report = nextReport;
          showToast(`Setting report permission to ${isChecked ? 'Allowed' : 'Disabled'}`, "info");

          try {
            const res = await ApiService.updateField(school.userId, "Report", nextReport);
            if (!res || !res.success) {
              throw new Error(res.message || "Failed to update Report field.");
            }
            showToast(`${school.schoolName} reports permission updated`, "success");
            localStorage.setItem("admin_schools_data_cache", JSON.stringify({ schools: STATE.schools, sessions: STATE.sessions }));
            renderSchoolsList();
          } catch (err) {
            // Revert
            school.report = oldVal;
            reportCB.checked = !isChecked;
            showToast(`Failed to update report permission: ${err.message}`, "error");
            renderSchoolsList();
          }
        });
      }
    };

    // Helper to bind devices input click event
    const bindDevicesInput = (element) => {
      const devicesBtn = element.querySelector(".device-badge-btn");
      if (devicesBtn) {
        devicesBtn.addEventListener("click", () => {
          openDevicesLimitModal(school.userId);
        });
      }
    };

    // Bind other actions
    const bindActions = (element) => {
      const resetBtn = element.querySelector(".reset-pwd-btn");
      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          openPasswordResetModal(school.userId);
        });
      }

      const sessionsBtn = element.querySelector(".view-sessions-btn");
      if (sessionsBtn) {
        sessionsBtn.addEventListener("click", () => {
          STATE.filters.sessions.search = school.userId;
          const sessionSearchInput = document.getElementById("sessions-search-input");
          if (sessionSearchInput) sessionSearchInput.value = school.userId;
          switchTab("sessions");
        });
      }
    };

    if (tr) {
      bindStatusToggle(tr);
      bindEditableToggle(tr);
      bindReportToggle(tr);
      bindDevicesInput(tr);
      bindActions(tr);
    }
    if (card) {
      bindStatusToggle(card);
      bindEditableToggle(card);
      bindReportToggle(card);
      bindDevicesInput(card);
      bindActions(card);
    }
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * Feature 2 - Schools List
 */
function renderSchoolsList() {
  // Let's filter schools for Schools view:
  const schoolsSearchVal = (document.getElementById("schools-search-input")?.value || "").toLowerCase().trim();
  const schoolsStatusVal = document.getElementById("schools-status-select")?.value || "all";

  const filteredForSchoolsView = STATE.schools.filter(school => {
    const nameMatch = school.schoolName.toLowerCase().includes(schoolsSearchVal) || school.userId.toLowerCase().includes(schoolsSearchVal);
    let statusMatch = true;
    if (schoolsStatusVal === "active") {
      statusMatch = school.status.toLowerCase() === "active";
    } else if (schoolsStatusVal === "inactive") {
      statusMatch = school.status.toLowerCase() !== "active";
    }
    return nameMatch && statusMatch;
  });

  populateSchoolsContainer(
    document.getElementById("schools-table-body"),
    document.getElementById("schools-mobile-cards"),
    filteredForSchoolsView
  );

  // Let's filter schools for Dashboard view:
  const dbSearchVal = (document.getElementById("dashboard-schools-search-input")?.value || "").toLowerCase().trim();
  const filteredForDbView = STATE.schools.filter(school => {
    return school.schoolName.toLowerCase().includes(dbSearchVal) || school.userId.toLowerCase().includes(dbSearchVal);
  });

  populateSchoolsContainer(
    document.getElementById("dashboard-schools-table-body"),
    document.getElementById("dashboard-schools-mobile-cards"),
    filteredForDbView
  );
}

/**
 * Feature 3 — View as School
 */
function viewAsSchool(school) {
  const url = (school.sheetUrl || school.sheet_url || school["Sheet URL"] || "").toString().trim();
  if (!url || !url.startsWith("http")) {
    showToast(`Failed: No valid Sheet URL is configured for ${school.schoolName}. Current value: "${url || 'empty'}"`, "error");
    return;
  }

  const payload = {
    schoolName: school.schoolName,
    sheetUrl: url,
    logoUrl: school.logoUrl,
    userId: school.userId,
    adminSession: true
  };
  localStorage.setItem("admin_viewing_school", JSON.stringify(payload));
  showToast(`Bypassing auth and loading School View for ${school.schoolName}`, "success");

  // Open main app in new tab
  window.open("../index.html", "_blank");
}

/**
 * Feature 4 — Password Reset Modal
 */
let resetUserId = "";

function openPasswordResetModal(userId) {
  resetUserId = userId;
  document.getElementById("modal-reset-username").textContent = userId;
  document.getElementById("new-password").value = "";
  document.getElementById("confirm-password").value = "";
  document.getElementById("password-reset-modal").classList.remove("hidden");
}

function closePasswordResetModal() {
  document.getElementById("password-reset-modal").classList.add("hidden");
  resetUserId = "";
}

async function submitPasswordReset() {
  const newPass = document.getElementById("new-password").value;
  const confirmPass = document.getElementById("confirm-password").value;

  if (!newPass) {
    showToast("Password cannot be empty", "warning");
    return;
  }
  if (newPass !== confirmPass) {
    showToast("Passwords do not match", "error");
    return;
  }

  showToast("Updating password...", "info");

  try {
    const res = await ApiService.updateField(resetUserId, "Password", newPass);
    if (res && res.success) {
      showToast("Password updated successfully.", "success");
      closePasswordResetModal();
    } else {
      throw new Error(res.message || "Backend rejected update.");
    }
  } catch (err) {
    showToast(`Password reset failed: ${err.message}`, "error");
  }
}

/**
 * Feature 4.5 — Devices Limit Modal
 */
let editDevicesUserId = "";

function openDevicesLimitModal(userId) {
  editDevicesUserId = userId;
  const school = STATE.schools.find(s => s.userId === userId);
  const currentLimit = school ? (parseInt(school.devices || school.Devices) || 1) : 1;
  const schoolName = school ? school.schoolName : userId;

  document.getElementById("modal-devices-username").textContent = `${schoolName} (${userId})`;
  document.getElementById("devices-limit-input").value = currentLimit;
  document.getElementById("devices-limit-modal").classList.remove("hidden");
}

function closeDevicesLimitModal() {
  document.getElementById("devices-limit-modal").classList.add("hidden");
  editDevicesUserId = "";
}

async function submitDevicesLimit() {
  if (!editDevicesUserId) return;
  const valInput = document.getElementById("devices-limit-input").value;
  let val = parseInt(valInput);
  if (isNaN(val) || val < 1) {
    showToast("Please enter a valid number (minimum 1)", "warning");
    return;
  }

  const school = STATE.schools.find(s => s.userId === editDevicesUserId);
  const schoolName = school ? school.schoolName : editDevicesUserId;

  // Confirm dialog
  if (!confirm(`Are you sure you want to update the device limit for ${schoolName} to ${val}?`)) {
    return;
  }

  const oldVal = school ? (parseInt(school.devices || school.Devices) || 1) : 1;
  if (val === oldVal) {
    closeDevicesLimitModal();
    return;
  }

  showToast(`Updating device limit for ${schoolName} to ${val}...`, "info");

  try {
    const res = await ApiService.updateField(editDevicesUserId, "Devices", val);
    if (!res || !res.success) {
      throw new Error(res.message || "Failed to update Devices field.");
    }
    
    if (school) {
      school.devices = val;
      school.Devices = val;
    }
    
    showToast(`${schoolName} device limit updated to ${val}`, "success");
    localStorage.setItem("admin_schools_data_cache", JSON.stringify({ schools: STATE.schools, sessions: STATE.sessions }));
    
    closeDevicesLimitModal();
    renderSchoolsList();
  } catch (err) {
    showToast(`Failed to update device limit: ${err.message}`, "error");
  }
}

/**
 * Feature 5 — Device Sessions View
 */
/**
 * Helper to format session date consistently as: "30 Jun 2026, 10:45 AM"
 */
function formatSessionDate(dateVal) {
  if (!dateVal) return "—";
  const d = parseRobustDate(dateVal);
  if (!d) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
}

/**
 * Feature 5 — Device Sessions View Grouped by School
 */
function renderSessions() {
  const container = document.getElementById("sessions-container");
  if (!container) return;

  const searchQuery = (document.getElementById("sessions-search-input")?.value || "").toLowerCase().trim();
  const showInactive = document.getElementById("sessions-status-toggle")?.checked || false;

  // Filter sessions by search query and active status
  const filteredSessions = STATE.sessions.filter(sess => {
    const schoolObj = STATE.schools.find(s => s.userId === sess.userId);
    const schoolName = schoolObj ? schoolObj.schoolName.toLowerCase() : "";
    const matchesSearch = sess.userId.toLowerCase().includes(searchQuery) ||
      schoolName.includes(searchQuery) ||
      sess.deviceId.toLowerCase().includes(searchQuery);

    const hasLoggedOut = sess.logoutTimestamp && sess.logoutTimestamp.toString().trim() !== "";
    const matchesStatus = showInactive ? true : !hasLoggedOut;

    return matchesSearch && matchesStatus;
  });

  container.innerHTML = "";

  if (filteredSessions.length === 0) {
    container.innerHTML = `
      <div class="session-empty-state">
        <i data-lucide="shield-alert"></i>
        <h3>No active sessions</h3>
        <p>No device sessions match the selected filters or search terms.</p>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  // Group filteredSessions by school (userId)
  const grouped = {};
  filteredSessions.forEach(sess => {
    if (!grouped[sess.userId]) {
      grouped[sess.userId] = [];
    }
    grouped[sess.userId].push(sess);
  });

  // Render group by group
  Object.keys(grouped).forEach(userId => {
    const sessionsInGroup = grouped[userId];
    const schoolObj = STATE.schools.find(s => s.userId === userId);
    const schoolName = schoolObj ? schoolObj.schoolName : "Unknown School";

    const groupDiv = document.createElement("div");
    groupDiv.className = "session-group";

    const groupHeader = document.createElement("div");
    groupHeader.className = "session-group-header";
    groupHeader.innerHTML = `
      <h3>${schoolName}</h3>
      <span class="session-count-badge">${sessionsInGroup.length} sessions</span>
    `;
    groupDiv.appendChild(groupHeader);

    // 1. Mobile cards container (hidden on desktop)
    const mobileCardsList = document.createElement("div");
    mobileCardsList.className = "session-cards-list mobile-only";

    // 2. Desktop table container (hidden on mobile)
    const desktopTableWrapper = document.createElement("div");
    desktopTableWrapper.className = "desktop-only admin-table-card";

    const desktopTable = document.createElement("table");
    desktopTable.className = "admin-table";
    desktopTable.innerHTML = `
      <thead>
        <tr>
          <th>Device ID</th>
          <th>Login Time</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const desktopTbody = desktopTable.querySelector("tbody");
    desktopTableWrapper.appendChild(desktopTable);

    sessionsInGroup.forEach(sess => {
      const hasLoggedOut = sess.logoutTimestamp && sess.logoutTimestamp.toString().trim() !== "";
      const isActive = !hasLoggedOut;

      const loginStr = formatSessionDate(sess.loginTimestamp);

      // Truncate Device ID to 12 chars
      const devId = sess.deviceId || "—";
      const displayDevId = devId.length > 12 ? devId.slice(0, 12) + "..." : devId;

      // Mobile Card HTML
      const card = document.createElement("div");
      card.className = `session-card ${isActive ? 'active' : 'inactive'}`;
      card.innerHTML = `
        <div class="session-card-header">
          <span class="session-school-name">${schoolName}</span>
          <span class="badge-status-pill ${isActive ? 'active' : 'inactive'}">
            ${isActive ? 'Active' : 'Logged Out'}
          </span>
        </div>
        <div class="session-card-details">
          <div class="detail-row">
            <span class="detail-label">Device ID:</span>
            <code class="detail-value">${displayDevId}</code>
          </div>
          <div class="detail-row">
            <span class="detail-label">Login Time:</span>
            <span class="detail-value">${loginStr}</span>
          </div>
        </div>
        ${isActive ? `
          <button class="btn-danger force-logout-btn" data-userid="${userId}" data-deviceid="${devId}">
            <i data-lucide="log-out"></i>
            <span>Force Logout</span>
          </button>
        ` : ''}
      `;
      mobileCardsList.appendChild(card);

      // Desktop Table Row HTML
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><code class="monospace-dev-id">${displayDevId}</code></td>
        <td>${loginStr}</td>
        <td>
          <span class="badge-status-pill ${isActive ? 'active' : 'inactive'}">
            ${isActive ? 'Active' : 'Logged Out'}
          </span>
        </td>
        <td>
          ${isActive ? `
            <button class="btn-danger force-logout-btn" data-userid="${userId}" data-deviceid="${devId}">
              <i data-lucide="log-out"></i>
              <span>Force Logout</span>
            </button>
          ` : '—'}
        </td>
      `;
      desktopTbody.appendChild(tr);

      // Bind force logout helper
      const bindForceLogout = (element) => {
        const forceBtn = element.querySelector(".force-logout-btn");
        if (forceBtn) {
          forceBtn.addEventListener("click", async () => {
            if (confirm(`Are you sure you want to terminate session on device ${devId} for school ${schoolName}?`)) {
              showToast("Requesting session termination...", "info");
              try {
                const res = await ApiService.forceLogoutSession(userId, devId);
                if (res && res.success) {
                  showToast("Session terminated", "success");
                  sess.logoutTimestamp = new Date().toISOString();
                  // Update cache
                  const cacheData = localStorage.getItem("admin_schools_data_cache");
                  if (cacheData) {
                    const parsed = JSON.parse(cacheData);
                    const sessInCache = parsed.sessions.find(s => s.userId === userId && s.deviceId === devId);
                    if (sessInCache) {
                      sessInCache.logoutTimestamp = sess.logoutTimestamp;
                      localStorage.setItem("admin_schools_data_cache", JSON.stringify(parsed));
                    }
                  }
                  renderSessions();
                  renderStats();
                } else {
                  throw new Error(res.message || "Termination rejected.");
                }
              } catch (err) {
                showToast(`Force logout failed: ${err.message}`, "error");
              }
            }
          });
        }
      };

      bindForceLogout(card);
      bindForceLogout(tr);
    });

    groupDiv.appendChild(mobileCardsList);
    groupDiv.appendChild(desktopTableWrapper);
    container.appendChild(groupDiv);
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * Initialize dashboard modules, bindings, theme on load
 */
function initAdminDashboard() {
  initTheme();
  initNavigation();
  fetchAdminData();

  // Manual Refresh Button
  const refreshBtn = document.getElementById("admin-refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      fetchAdminData(true);
    });
  }

  // Filter Bindings for Schools Section
  const schoolSearch = document.getElementById("schools-search-input");
  if (schoolSearch) {
    schoolSearch.addEventListener("input", () => {
      renderSchoolsList();
    });
  }

  const schoolStatusFilter = document.getElementById("schools-status-select");
  if (schoolStatusFilter) {
    schoolStatusFilter.addEventListener("change", () => {
      renderSchoolsList();
    });
  }

  // Filter Bindings for Dashboard Section
  const dbSchoolSearch = document.getElementById("dashboard-schools-search-input");
  if (dbSchoolSearch) {
    dbSchoolSearch.addEventListener("input", () => {
      renderSchoolsList();
    });
  }

  // Filter Bindings for Sessions Section
  const sessionSearch = document.getElementById("sessions-search-input");
  if (sessionSearch) {
    sessionSearch.addEventListener("input", () => {
      renderSessions();
    });
  }

  const sessionStatusToggle = document.getElementById("sessions-status-toggle");
  if (sessionStatusToggle) {
    sessionStatusToggle.addEventListener("change", () => {
      renderSessions();
    });
  }

  // Password reset modal close and submit
  const cancelResetBtn = document.getElementById("cancel-reset-btn");
  if (cancelResetBtn) {
    cancelResetBtn.addEventListener("click", closePasswordResetModal);
  }

  const submitResetBtn = document.getElementById("submit-reset-btn");
  if (submitResetBtn) {
    submitResetBtn.addEventListener("click", submitPasswordReset);
  }

  // Close password reset modal on overlay click
  const passwordResetModal = document.getElementById("password-reset-modal");
  if (passwordResetModal) {
    passwordResetModal.addEventListener("click", (e) => {
      if (e.target === passwordResetModal) {
        closePasswordResetModal();
      }
    });
  }

  // Devices limit modal close and submit
  const cancelDevicesBtn = document.getElementById("cancel-devices-btn");
  if (cancelDevicesBtn) {
    cancelDevicesBtn.addEventListener("click", closeDevicesLimitModal);
  }

  const submitDevicesBtn = document.getElementById("submit-devices-btn");
  if (submitDevicesBtn) {
    submitDevicesBtn.addEventListener("click", submitDevicesLimit);
  }

  // Close devices limit modal on overlay click
  const devicesLimitModal = document.getElementById("devices-limit-modal");
  if (devicesLimitModal) {
    devicesLimitModal.addEventListener("click", (e) => {
      if (e.target === devicesLimitModal) {
        closeDevicesLimitModal();
      }
    });
  }

  // Password visibility toggle helper
  document.querySelectorAll(".toggle-password-visibility").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const wrapper = btn.parentElement;
      const input = wrapper.querySelector("input");
      const icon = btn.querySelector("i");
      if (input.type === "password") {
        input.type = "text";
        icon.setAttribute("data-lucide", "eye-off");
      } else {
        input.type = "password";
        icon.setAttribute("data-lucide", "eye");
      }
      if (typeof lucide !== 'undefined') lucide.createIcons();
    });
  });

  // Mobile hamburger menu toggle with backdrop drawer lock
  const mobileToggle = document.getElementById("admin-mobile-menu-toggle");
  const backdrop = document.getElementById("admin-sidebar-backdrop");
  if (mobileToggle) {
    if (!window.adminSidebarListenersBound) {
      mobileToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        setDrawerOpen(!isDrawerOpen);
      });

      if (backdrop) {
        backdrop.addEventListener("click", () => {
          setDrawerOpen(false);
        });
      }

      // Close drawer when sidebar nav item is clicked
      document.querySelectorAll(".admin-nav-item").forEach(item => {
        item.addEventListener("click", () => {
          setDrawerOpen(false);
        });
      });

      window.adminSidebarListenersBound = true;
    }
  }
}

function convertDriveUrl(url) {
  if (!url) return null;
  const str = url.toString().trim();

  let fileId = null;

  const fileDMatch = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileDMatch && fileDMatch[1]) fileId = fileDMatch[1];

  if (!fileId) {
    const idQueryMatch = str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idQueryMatch && idQueryMatch[1]) fileId = idQueryMatch[1];
  }

  if (!fileId) {
    const dMatch = str.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (dMatch && dMatch[1]) fileId = dMatch[1];
  }

  if (fileId) {
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  }

  return url;
}

function parseRobustDate(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date) {
    return isNaN(dateVal.getTime()) ? null : dateVal;
  }
  if (typeof dateVal === 'number') {
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof dateVal === 'string') {
    var trimmed = dateVal.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const d = new Date(parseInt(trimmed, 10));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return d;
    }
    // Try parsing DD/MM/YYYY or MM/DD/YYYY formats if standard fails
    var parts = trimmed.split(/[\s,]+/);
    var datePart = parts[0];
    var timePart = parts[1] || "";
    var dateSegments = datePart.split(/[-/]/);
    if (dateSegments.length === 3) {
      var seg0 = parseInt(dateSegments[0], 10);
      var seg1 = parseInt(dateSegments[1], 10);
      var seg2 = parseInt(dateSegments[2], 10);
      var y = seg2;
      var m = seg1;
      var dVal = seg0;
      if (seg2 > 99) {
        const tryDate = new Date(y, m - 1, dVal);
        if (!isNaN(tryDate.getTime())) {
          if (timePart) {
            var timeSegments = timePart.split(":");
            if (timeSegments.length >= 2) {
              tryDate.setHours(parseInt(timeSegments[0], 10));
              tryDate.setMinutes(parseInt(timeSegments[1], 10));
              if (timeSegments[2]) {
                tryDate.setSeconds(parseInt(timeSegments[2], 10));
              }
            }
          }
          return tryDate;
        }
      }
    }
  }
  return null;
}

window.initAdminDashboard = initAdminDashboard;
