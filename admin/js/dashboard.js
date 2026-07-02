/**
 * Admin Portal Dashboard Module
 * Manages stats calculation, schools listing, password resets, active sessions, and cross-school logs aggregation.
 */

// State Management
const STATE = {
  schools: [],      // From getAdminData
  sessions: [],     // From getAdminData
  detailsCache: {}, // { userId: { studentCount, editLogs, lastFetched } }
  activeTab: "dashboard",
  filters: {
    schools: { search: "", status: "all" },
    sessions: { search: "" },
    logs: { school: "all", actionType: "all" }
  },
  theme: localStorage.getItem("admin_theme") || "light",
  isFetchingDetails: false
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes admin data TTL
const DETAILS_CACHE_KEY = "admin_schools_detail_cache";

/**
 * Initialize theme
 */
function initTheme() {
  document.documentElement.setAttribute("data-theme", STATE.theme);
  updateThemeIcon();
  
  const themeBtn = document.getElementById("admin-theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      STATE.theme = STATE.theme === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", STATE.theme);
      localStorage.setItem("admin_theme", STATE.theme);
      updateThemeIcon();
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
  const navItems = document.querySelectorAll(".admin-nav-item, .admin-mobile-nav-item");
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
  document.querySelectorAll(".admin-nav-item, .admin-mobile-nav-item").forEach(item => {
    if (item.getAttribute("data-target") === tabId) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

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
  } else if (STATE.activeTab === "schools") {
    renderSchoolsList();
  } else if (STATE.activeTab === "sessions") {
    renderSessions();
  } else if (STATE.activeTab === "logs") {
    renderLogs();
  }
}

/**
 * Fetch main admin data from Apps Script (with 5 min cache)
 */
async function fetchAdminData(force = false) {
  const cacheData = localStorage.getItem("admin_schools_data_cache");
  const cacheTime = localStorage.getItem("admin_schools_data_cache_time");
  const now = Date.now();

  const loader = document.getElementById("admin-global-loader");
  if (loader) loader.classList.remove("hidden");

  // Load schools detail cache if exists
  const localDetails = localStorage.getItem(DETAILS_CACHE_KEY);
  if (localDetails) {
    try {
      STATE.detailsCache = JSON.parse(localDetails);
    } catch(e) {
      STATE.detailsCache = {};
    }
  }

  if (!force && cacheData && cacheTime && (now - parseInt(cacheTime) < CACHE_TTL_MS)) {
    try {
      const parsed = JSON.parse(cacheData);
      STATE.schools = parsed.schools || [];
      STATE.sessions = parsed.sessions || [];
      if (loader) loader.classList.add("hidden");
      renderActiveTab();
      triggerBackgroundDetailsFetch();
      return;
    } catch(e) {
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
    if (loader) loader.classList.add("hidden");
  }
}

/**
 * Fetch detail sheets (UDISE, 3.0, School Data) for student counts & logs sequentially
 */
async function triggerBackgroundDetailsFetch() {
  if (STATE.isFetchingDetails) return;
  STATE.isFetchingDetails = true;
  
  const activeSchools = STATE.schools.filter(s => s.status.toLowerCase() === "active" && s.sheetUrl);
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
      const data = await ApiService.fetchSchoolDetails(school.sheetUrl);
      
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
    } catch(err) {
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
  
  // Total Students (sum from details cache)
  let totalStudents = 0;
  let hasStudentsCache = false;
  
  STATE.schools.forEach(school => {
    const details = STATE.detailsCache[school.userId];
    if (details && typeof details.studentCount === "number") {
      totalStudents += details.studentCount;
      hasStudentsCache = true;
    }
  });

  const totalStudentsStr = hasStudentsCache ? totalStudents.toLocaleString() : (STATE.isFetchingDetails ? "Syncing..." : "—");

  document.getElementById("stat-total-schools").textContent = totalSchools;
  document.getElementById("stat-active-schools").textContent = activeSchools;
  document.getElementById("stat-inactive-schools").textContent = inactiveSchools;
  document.getElementById("stat-total-students").textContent = totalStudentsStr;
}

/**
 * Feature 2 - Schools List
 */
function renderSchoolsList() {
  const container = document.getElementById("schools-table-body");
  if (!container) return;

  const searchQuery = STATE.filters.schools.search.toLowerCase().trim();
  const statusFilter = STATE.filters.schools.status;

  const filteredSchools = STATE.schools.filter(school => {
    const nameMatch = school.schoolName.toLowerCase().includes(searchQuery) || school.userId.toLowerCase().includes(searchQuery);
    
    let statusMatch = true;
    if (statusFilter === "active") {
      statusMatch = school.status.toLowerCase() === "active";
    } else if (statusFilter === "inactive") {
      statusMatch = school.status.toLowerCase() !== "active";
    }
    
    return nameMatch && statusMatch;
  });

  container.innerHTML = "";
  
  if (filteredSchools.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="7" class="admin-empty-row">
          <i data-lucide="search" class="empty-icon"></i>
          <p>No schools matched your criteria.</p>
        </td>
      </tr>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  filteredSchools.forEach(school => {
    const tr = document.createElement("tr");
    
    // Status flag check
    const isActive = school.status.toLowerCase() === "active";
    const isEditable = school.editable.toLowerCase() === "yes";
    
    // Last login check (most recent Login Timestamp in Login_Sessions for school userId)
    let lastLoginStr = "Never";
    const schoolSessions = STATE.sessions.filter(s => s.userId === school.userId);
    if (schoolSessions.length > 0) {
      // Find latest login session
      const logins = schoolSessions
        .map(s => s.loginTimestamp ? new Date(s.loginTimestamp) : new Date(0))
        .filter(d => !isNaN(d.getTime()));
      if (logins.length > 0) {
        const latest = new Date(Math.max(...logins));
        lastLoginStr = latest.toLocaleDateString() + " " + latest.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }

    // Student counts
    const cachedDetails = STATE.detailsCache[school.userId];
    const studentCountStr = cachedDetails ? cachedDetails.studentCount.toLocaleString() : "—";

    const logoUrl = school.logoUrl ? convertDriveUrl(school.logoUrl) : null;
    tr.innerHTML = `
      <td>
        <div class="school-identity">
          ${logoUrl ? `<img class="school-logo-img" src="${logoUrl}" onerror="this.remove();" style="width:36px; height:36px; border-radius:8px; object-fit:cover; border:1px solid var(--border-color); background:#fff; flex-shrink:0;">` : ''}
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
      <td>${studentCountStr}</td>
      <td><span class="last-login-date">${lastLoginStr}</span></td>
      <td>
        <div class="table-actions">
          <button class="admin-btn-action view-school-btn" data-userid="${school.userId}" title="View as School">
            <i data-lucide="eye"></i>
          </button>
          <button class="admin-btn-action reset-pwd-btn" data-userid="${school.userId}" title="Reset Password">
            <i data-lucide="key-round"></i>
          </button>
          <button class="admin-btn-action view-sessions-btn" data-userid="${school.userId}" title="View Sessions">
            <i data-lucide="clock"></i>
          </button>
        </div>
      </td>
    `;
    
    // Bind Status optimistic toggling
    const statusCB = tr.querySelector(".status-toggle-cb");
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
      } catch (err) {
        // Revert
        school.status = oldVal;
        statusCB.checked = !isChecked;
        showToast(`Failed to update status: ${err.message}`, "error");
        renderStats();
      }
    });

    // Bind Editable optimistic toggling
    const editableCB = tr.querySelector(".editable-toggle-cb");
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
      } catch (err) {
        // Revert
        school.editable = oldVal;
        editableCB.checked = !isChecked;
        showToast(`Failed to update editable permission: ${err.message}`, "error");
      }
    });

    // Bind View
    tr.querySelector(".view-school-btn").addEventListener("click", () => {
      viewAsSchool(school);
    });

    // Bind Reset Password
    tr.querySelector(".reset-pwd-btn").addEventListener("click", () => {
      openPasswordResetModal(school.userId);
    });

    // Bind View Sessions
    tr.querySelector(".view-sessions-btn").addEventListener("click", () => {
      STATE.filters.sessions.search = school.userId;
      const sessionSearchInput = document.getElementById("sessions-search-input");
      if (sessionSearchInput) sessionSearchInput.value = school.userId;
      switchTab("sessions");
    });

    container.appendChild(tr);
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * Feature 3 — View as School
 */
function viewAsSchool(school) {
  const payload = {
    schoolName: school.schoolName,
    sheetUrl: school.sheetUrl,
    logoUrl: school.logoUrl,
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
  } catch(err) {
    showToast(`Password reset failed: ${err.message}`, "error");
  }
}

/**
 * Feature 5 — Device Sessions View
 */
function renderSessions() {
  const container = document.getElementById("sessions-table-body");
  if (!container) return;

  const searchQuery = STATE.filters.sessions.search.toLowerCase().trim();

  // Active sessions are rows from Login_Sessions where Logout Timestamp is empty
  const activeSessions = STATE.sessions.filter(sess => {
    const hasLoggedOut = sess.logoutTimestamp && sess.logoutTimestamp.toString().trim() !== "";
    return !hasLoggedOut;
  });

  const filteredSessions = activeSessions.filter(sess => {
    const schoolObj = STATE.schools.find(s => s.userId === sess.userId);
    const schoolName = schoolObj ? schoolObj.schoolName.toLowerCase() : "";
    return sess.userId.toLowerCase().includes(searchQuery) || schoolName.includes(searchQuery) || sess.deviceId.toLowerCase().includes(searchQuery);
  });

  container.innerHTML = "";

  if (filteredSessions.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="5" class="admin-empty-row">
          <i data-lucide="search" class="empty-icon"></i>
          <p>No active sessions found.</p>
        </td>
      </tr>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  filteredSessions.forEach(sess => {
    const tr = document.createElement("tr");
    
    const schoolObj = STATE.schools.find(s => s.userId === sess.userId);
    const schoolName = schoolObj ? schoolObj.schoolName : "Unknown School";
    
    let loginStr = "—";
    if (sess.loginTimestamp) {
      const d = new Date(sess.loginTimestamp);
      if (!isNaN(d.getTime())) {
        loginStr = d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }

    tr.innerHTML = `
      <td><code>${sess.userId}</code></td>
      <td><strong>${schoolName}</strong></td>
      <td><span class="device-code-txt">${sess.deviceId}</span></td>
      <td>${loginStr}</td>
      <td>
        <button class="btn-danger force-logout-btn" data-userid="${sess.userId}" data-deviceid="${sess.deviceId}">
          <i data-lucide="log-out" style="width:14px; height:14px;"></i>
          <span>Force Logout</span>
        </button>
      </td>
    `;

    // Bind Force Logout Action
    tr.querySelector(".force-logout-btn").addEventListener("click", async () => {
      if (confirm(`Are you sure you want to terminate session on device ${sess.deviceId} for school ${sess.userId}?`)) {
        showToast("Requesting session termination...", "info");
        try {
          const res = await ApiService.forceLogoutSession(sess.userId, sess.deviceId);
          if (res && res.success) {
            showToast("Session terminated", "success");
            
            // Mark session as logged out in state and cache
            sess.logoutTimestamp = new Date().toISOString();
            localStorage.setItem("admin_schools_data_cache", JSON.stringify({ schools: STATE.schools, sessions: STATE.sessions }));
            
            renderSessions();
            renderStats();
          } else {
            throw new Error(res.message || "Termination rejected.");
          }
        } catch(err) {
          showToast(`Force logout failed: ${err.message}`, "error");
        }
      }
    });

    container.appendChild(tr);
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * Feature 6 — Edit Activity Log
 */
function renderLogs() {
  const container = document.getElementById("logs-table-body");
  const schoolSelect = document.getElementById("logs-school-select");
  if (!container) return;

  // Build combined logs array from detailsCache
  let combinedLogs = [];
  
  STATE.schools.forEach(school => {
    const details = STATE.detailsCache[school.userId];
    if (details && Array.isArray(details.editLogs)) {
      details.editLogs.forEach(log => {
        combinedLogs.push({
          ...log,
          schoolName: school.schoolName,
          userId: school.userId
        });
      });
    }
  });

  // Populate school filter dropdown once if empty
  if (schoolSelect && schoolSelect.options.length <= 1) {
    STATE.schools.forEach(school => {
      const opt = document.createElement("option");
      opt.value = school.userId;
      opt.textContent = school.schoolName;
      schoolSelect.appendChild(opt);
    });
  }

  // Sort logs by timestamp descending (newest first)
  combinedLogs.sort((a, b) => {
    const dateA = parseRobustDate(a.Timestamp || a.timestamp);
    const dateB = parseRobustDate(b.Timestamp || b.timestamp);
    const timeA = dateA ? dateA.getTime() : 0;
    const timeB = dateB ? dateB.getTime() : 0;
    return timeB - timeA;
  });

  // Apply filters (only school and action type)
  const fSchool = STATE.filters.logs.school;
  const fAction = STATE.filters.logs.actionType;

  const filteredLogs = combinedLogs.filter(log => {
    // School Filter
    const logUser = log.userId || log["User_ID"] || log["User ID"] || "";
    if (fSchool !== "all" && logUser !== fSchool) return false;
    
    // Action Type Filter
    const actionType = log["Action Type"] || log["Action_Type"] || log["action"] || "Update";
    if (fAction !== "all" && actionType.toLowerCase().trim() !== fAction.toLowerCase().trim()) return false;

    return true;
  });

  container.innerHTML = "";

  // Show clear empty state message
  if (combinedLogs.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="7" class="admin-empty-row">
          <i data-lucide="file-text" class="empty-icon"></i>
          <p>No edit activity logs have been recorded yet across any schools.</p>
        </td>
      </tr>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  if (filteredLogs.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="7" class="admin-empty-row">
          <i data-lucide="filter" class="empty-icon"></i>
          <p>No activity logs match the selected filters.</p>
        </td>
      </tr>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  filteredLogs.forEach(log => {
    const tr = document.createElement("tr");
    
    let tsStr = "—";
    const logDate = parseRobustDate(log.Timestamp || log.timestamp);
    if (logDate) {
      tsStr = logDate.toLocaleDateString() + " " + logDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const schoolName = log.schoolName || "Unknown";
    const userId = log.userId || log["User_ID"] || log["User ID"] || "—";
    const studentName = log["Student Name"] || log["Student_Name"] || log["studentName"] || "—";
    const className = log["Class"] || log["class"] || "—";
    const actionType = log["Action Type"] || log["Action_Type"] || log["action"] || "Update";
    
    // Format changed fields nicely
    const changedFields = log["Changed Fields"] || log["Changed_Fields"] || log["changedFields"] || "—";

    tr.innerHTML = `
      <td><span class="log-ts">${tsStr}</span></td>
      <td><strong>${schoolName}</strong></td>
      <td><code>${userId}</code></td>
      <td>${studentName}</td>
      <td>Class ${className}</td>
      <td><span class="badge-action ${actionType.toLowerCase()}">${actionType}</span></td>
      <td><div class="fields-list" title="${changedFields}">${changedFields}</div></td>
    `;

    container.appendChild(tr);
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

  // Filter Bindings for Schools
  const schoolSearch = document.getElementById("schools-search-input");
  if (schoolSearch) {
    schoolSearch.addEventListener("input", (e) => {
      STATE.filters.schools.search = e.target.value;
      renderSchoolsList();
    });
  }

  const schoolStatusFilter = document.getElementById("schools-status-select");
  if (schoolStatusFilter) {
    schoolStatusFilter.addEventListener("change", (e) => {
      STATE.filters.schools.status = e.target.value;
      renderSchoolsList();
    });
  }

  // Filter Bindings for Sessions
  const sessionSearch = document.getElementById("sessions-search-input");
  if (sessionSearch) {
    sessionSearch.addEventListener("input", (e) => {
      STATE.filters.sessions.search = e.target.value;
      renderSessions();
    });
  }

  // Filter Bindings for Logs
  const logSchool = document.getElementById("logs-school-select");
  if (logSchool) {
    logSchool.addEventListener("change", (e) => {
      STATE.filters.logs.school = e.target.value;
      renderLogs();
    });
  }

  const logAction = document.getElementById("logs-action-select");
  if (logAction) {
    logAction.addEventListener("change", (e) => {
      STATE.filters.logs.actionType = e.target.value;
      renderLogs();
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

  // Mobile hamburger menu toggle
  const mobileToggle = document.getElementById("admin-mobile-menu-toggle");
  const sidebar = document.getElementById("admin-sidebar");
  if (mobileToggle && sidebar) {
    mobileToggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });

    // Close when clicking outside on mobile overlay
    document.addEventListener("click", (e) => {
      if (!sidebar.contains(e.target) && !mobileToggle.contains(e.target) && sidebar.classList.contains("open")) {
        sidebar.classList.remove("open");
      }
    });
  }
}

function convertDriveUrl(url) {
  if (!url) return null;
  var match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return "https://drive.google.com/uc?export=view&id=" + match[1];
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
