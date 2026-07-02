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
  
  // Update browser bar theme-color
  const isDark = STATE.theme === "dark";
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', isDark ? '#0b0f19' : '#ffffff');
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
    } catch(e) {
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
    setLoaderState(false);
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
  
  if (STATE.isFetchingDetails && !hasStudentsCache) {
    document.getElementById("stat-total-students").innerHTML = `<span class="skeleton-pulse" style="width: 80px; height: 32px; display: inline-block; border-radius: 4px;"></span>`;
  } else {
    document.getElementById("stat-total-students").textContent = totalStudentsStr;
  }
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
    let studentCountStr = "—";
    if (cachedDetails) {
      studentCountStr = cachedDetails.studentCount.toLocaleString();
    } else if (STATE.isFetchingDetails && isActive) {
      studentCountStr = `<span class="skeleton-pulse" style="width: 50px; height: 18px; display: inline-block; border-radius: 4px;"></span>`;
    }

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
  const url = (school.sheetUrl || "").toString().trim();
  if (!url || !url.startsWith("http")) {
    showToast(`Failed: No valid Sheet URL is configured for ${school.schoolName}`, "error");
    return;
  }

  const payload = {
    schoolName: school.schoolName,
    sheetUrl: url,
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
  const container = document.getElementById("sessions-container");
  if (!container) return;

  const searchQuery = STATE.filters.sessions.search.toLowerCase().trim();
  const statusFilter = STATE.filters.sessions.status || "active";

  // Filter sessions by search query and active status
  const filteredSessions = STATE.sessions.filter(sess => {
    const schoolObj = STATE.schools.find(s => s.userId === sess.userId);
    const schoolName = schoolObj ? schoolObj.schoolName.toLowerCase() : "";
    const matchesSearch = sess.userId.toLowerCase().includes(searchQuery) ||
                          schoolName.includes(searchQuery) ||
                          sess.deviceId.toLowerCase().includes(searchQuery);

    const hasLoggedOut = sess.logoutTimestamp && sess.logoutTimestamp.toString().trim() !== "";
    let matchesStatus = true;
    if (statusFilter === "active") {
      matchesStatus = !hasLoggedOut;
    } else if (statusFilter === "inactive") {
      matchesStatus = hasLoggedOut;
    }

    return matchesSearch && matchesStatus;
  });

  container.innerHTML = "";

  if (filteredSessions.length === 0) {
    container.innerHTML = `
      <div class="session-empty-state">
        <i data-lucide="shield-alert"></i>
        <h3>No sessions found</h3>
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

    const titleH3 = document.createElement("h3");
    titleH3.className = "session-group-title";
    titleH3.textContent = schoolName;
    groupDiv.appendChild(titleH3);

    const cardsList = document.createElement("div");
    cardsList.className = "session-cards-list";

    sessionsInGroup.forEach(sess => {
      const hasLoggedOut = sess.logoutTimestamp && sess.logoutTimestamp.toString().trim() !== "";
      const isActive = !hasLoggedOut;

      let loginStr = "—";
      if (sess.loginTimestamp) {
        const d = parseRobustDate(sess.loginTimestamp);
        if (d) {
          loginStr = d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      }

      // Truncate Device ID
      const devId = sess.deviceId || "—";
      const displayDevId = devId.length > 12 ? devId.slice(0, 8) + "..." : devId;

      const card = document.createElement("div");
      card.className = "session-card";

      // Card Content matching: School Name, User ID, Device ID (truncated), Login Time, Status, force logout
      card.innerHTML = `
        <div class="session-card-row">
          <span class="session-card-label">User ID</span>
          <span class="session-card-value"><code>${userId}</code></span>
        </div>
        <div class="session-card-row">
          <span class="session-card-label">Device ID</span>
          <span class="session-card-value" title="${devId}">${displayDevId}</span>
        </div>
        <div class="session-card-row">
          <span class="session-card-label">Login Time</span>
          <span class="session-card-value">${loginStr}</span>
        </div>
        <div class="session-card-row">
          <span class="session-card-label">Status</span>
          <span class="session-card-value">
            <span class="badge-status ${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Logged Out'}</span>
          </span>
        </div>
        <div class="session-card-row">
          <span class="session-card-label">Action</span>
          <span class="session-card-value">
            ${isActive ? `
              <button class="btn-danger force-logout-btn" data-userid="${userId}" data-deviceid="${devId}">
                <i data-lucide="log-out" style="width:14px; height:14px;"></i>
                <span>Force Logout</span>
              </button>
            ` : '—'}
          </span>
        </div>
      `;

      // Bind force logout
      if (isActive) {
        const forceBtn = card.querySelector(".force-logout-btn");
        forceBtn.addEventListener("click", async () => {
          if (confirm(`Are you sure you want to terminate session on device ${devId} for school ${schoolName}?`)) {
            showToast("Requesting session termination...", "info");
            try {
              const res = await ApiService.forceLogoutSession(userId, devId);
              if (res && res.success) {
                showToast("Session terminated", "success");
                sess.logoutTimestamp = new Date().toISOString();
                // Update local storage cache
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
            } catch(err) {
              showToast(`Force logout failed: ${err.message}`, "error");
            }
          }
        });
      }

      cardsList.appendChild(card);
    });

    groupDiv.appendChild(cardsList);
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

  const sessionStatusFilter = document.getElementById("sessions-status-filter");
  if (sessionStatusFilter) {
    sessionStatusFilter.addEventListener("change", (e) => {
      STATE.filters.sessions.status = e.target.value;
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
      document.querySelectorAll(".admin-nav-item, .admin-mobile-nav-item").forEach(item => {
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
