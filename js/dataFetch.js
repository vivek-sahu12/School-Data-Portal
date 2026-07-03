/**
 * Data Fetching and Caching Module
 * Connects to Google Apps Script Web Apps and manages localStorage sync.
 */

const DATA_KEY = "school-portal-data";
const TIMEOUT_KEY = "school-portal-last-fetch";
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Global flag — prevents concurrent sync runs
let isSyncInProgress = false;

/**
 * Check if school data is loaded in the cache
 */
function isDataLoaded() {
  return localStorage.getItem(DATA_KEY) !== null;
}

/**
 * Get the cached school data
 */
function getCachedData() {
  const data = localStorage.getItem(DATA_KEY);
  return data ? JSON.parse(data) : null;
}

/**
 * Save data to local cache with timestamp
 */
function cacheSchoolData(data) {
  // Normalize worksheet keys by trimming whitespace
  const normalizedData = {};
  for (const key in data) {
    normalizedData[key.trim()] = data[key];
  }
  localStorage.setItem(DATA_KEY, JSON.stringify(normalizedData));
  localStorage.setItem(TIMEOUT_KEY, Date.now().toString());
}

/**
 * Helper to fetch logo and immediately update the UI logo source
 */
async function refreshCachedLogo() {
  const school = getCurrentSchool();
  if (school && school.logoUrl && typeof fetchAndCacheLogo === "function") {
    const base64 = await fetchAndCacheLogo(school.logoUrl);
    if (base64) {
      const logoEl = document.querySelector(".header-logo");
      if (logoEl) {
        logoEl.src = base64;
      }
    }
  }
}

/**
 * Initialize data loading workflow on page transition or load
 */
function initializeDataFetchWorkflow() {
  const cached = getCachedData();
  const retryContainer = document.getElementById("retry-container");
  if (retryContainer) retryContainer.classList.add("hidden");

  if (cached) {
    // Render UI immediately with cache to keep page load fast
    updateSyncTimeText();
    renderAppComponents(cached);
    updateEditButtonVisibility();

    // Check if cache is older than 24 hours
    const lastFetch = localStorage.getItem(TIMEOUT_KEY);
    const age = lastFetch ? Date.now() - parseInt(lastFetch) : Infinity;

    if (age > REFRESH_INTERVAL_MS) {
      console.log("[Sync] Cached data is older than 24 hours. Triggering runSyncPipeline('pageload').");
      runSyncPipeline('pageload');
    }
  } else {
    // First time login - no cached data exists. Must run sync pipeline now.
    console.log("[Sync] No cached data exists. Triggering runSyncPipeline('pageload').");
    runSyncPipeline('pageload');
  }
}

// Helper functions for Sync Pipeline
function getStoredUserId() {
  const sessionRaw = localStorage.getItem("sdip_session");
  if (sessionRaw) {
    try {
      const session = JSON.parse(sessionRaw);
      return session.username || "";
    } catch (e) { }
  }
  return "";
}

function getStoredDeviceId() {
  return localStorage.getItem("device_id") || "";
}

function getStoredSheetUrl() {
  const sessionRaw = localStorage.getItem("school-portal-session");
  if (sessionRaw) {
    try {
      const session = JSON.parse(sessionRaw);
      if (session.sheetUrl) return session.sheetUrl;
    } catch (e) { }
  }
  const sdipRaw = localStorage.getItem("sdip_session");
  if (sdipRaw) {
    try {
      const session = JSON.parse(sdipRaw);
      if (session.sheetUrl) return session.sheetUrl;
    } catch (e) { }
  }
  return "";
}

function updateStoredEditable(value) {
  // Update sdip_session
  const sdipRaw = localStorage.getItem("sdip_session");
  if (sdipRaw) {
    try {
      const session = JSON.parse(sdipRaw);
      session.editable = value;
      localStorage.setItem("sdip_session", JSON.stringify(session));
    } catch (e) { }
  }
  // Update school-portal-session
  const sessionRaw = localStorage.getItem("school-portal-session");
  if (sessionRaw) {
    try {
      const session = JSON.parse(sessionRaw);
      session.editable = value;
      localStorage.setItem("school-portal-session", JSON.stringify(session));
    } catch (e) { }
  }
  // Immediately re-evaluate edit button visibility
  updateEditButtonVisibility();
}

function updateEditButtonVisibility() {
  const sdipRaw = localStorage.getItem("sdip_session");
  let editable = "";
  if (sdipRaw) {
    try {
      const session = JSON.parse(sdipRaw);
      editable = session.editable || "";
    } catch (e) { }
  }

  const allowed = window.isEditAllowed(editable);
  if (!allowed) {
    // Close open edit modals gracefully
    const editModal = document.getElementById("student-edit-modal");
    if (editModal && !editModal.classList.contains("hidden")) {
      editModal.classList.add("hidden");
      if (typeof showToast === "function") {
        showToast("Editing permission has been revoked by the administrator.", "warning");
      }
    }

    // Remove any visible edit buttons from detail popups
    const editBtn = document.getElementById("edit-student-btn");
    if (editBtn) editBtn.remove();
  } else {
    // Permission GRANTED — start background sync timer if not already running
    if (typeof window.initBackgroundSyncTimer === "function") {
      window.initBackgroundSyncTimer();
    }
  }
}

function saveDataToCache(data) {
  cacheSchoolData(data);
}

function refreshUIWithCachedData() {
  const cached = getCachedData();
  if (cached) {
    renderAppComponents(cached);
  }
}

function showSyncFailedNotice() {
  if (typeof showToast === "function") {
    showToast("Update failed, showing last saved data", "warning");
  }
}

function forceLogout(message) {
  localStorage.clear();
  if (message) {
    alert(message);
  }
  window.location.reload();
}

async function pushPendingEdits() {
  if (typeof window.syncPendingEditsImmediately === "function") {
    await window.syncPendingEditsImmediately();
  }
}

// Timeout wrapper for all fetch calls
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function runSyncPipeline(triggeredBy = 'auto') {
  // Guard: never run two syncs simultaneously
  if (isSyncInProgress) {
    console.log('[Sync] Already in progress, skipping.');
    return;
  }

  isSyncInProgress = true;
  console.log('[Sync] Pipeline started. Trigger:', triggeredBy);

  // Set UI state to fetching
  setRefreshSpinner(true);
  const hasCached = isDataLoaded();
  const appLoading = document.getElementById("app-loading-bar");
  const skeletonLoader = document.getElementById("skeleton-loader");
  const retryContainer = document.getElementById("retry-container");

  if (retryContainer) retryContainer.classList.add("hidden");

  if (!hasCached) {
    // Hide view sections only if no cached data is available to display
    document.querySelectorAll(".view-section").forEach(sec => sec.classList.add("hidden"));
    if (skeletonLoader) skeletonLoader.classList.remove("hidden");
  } else {
    // Show lightweight top loading bar if we have cached data to display
    if (appLoading) appLoading.classList.remove("hidden");
  }

  if (triggeredBy === 'manual') {
    if (typeof showToast === "function") {
      showToast("Synchronizing with cloud server...", "info");
    }
  }

  try {
    // ── STEP 1: Push pending edit queue ──────────────────────────
    console.log('[Sync] Step 1: Pushing pending edits...');
    try {
      await pushPendingEdits();
      console.log('[Sync] Step 1: Done.');
    } catch (err) {
      // Non-fatal: log and continue — edits stay in queue for next sync
      console.warn('[Sync] Step 1: Edit push failed (non-fatal):', err.message);
    }

    // Delay 2 seconds
    console.log('[Sync] Waiting 2 seconds for sheet writes to commit...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // ── STEP 2: checkSession (Active/Inactive + session validity) ─
    console.log('[Sync] Step 2: Checking session validity...');
    let isAdminViewing = false;
    const adminViewing = localStorage.getItem("admin_viewing_school");
    const adminSession = localStorage.getItem("admin_session");
    if (adminViewing && adminSession) {
      try {
        const sess = JSON.parse(adminSession);
        if (sess && sess.sessionToken) {
          isAdminViewing = true;
        }
      } catch (e) {}
    }

    if (isAdminViewing) {
      console.log("[Sync] Step 2: Admin viewing school, skipping session validity check.");
    } else {
      let sessionResult;
      try {
        sessionResult = await fetchWithTimeout(ADMIN_SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({
            action: 'checkSession',
            userId: getStoredUserId(),
            deviceId: getStoredDeviceId()
          })
        }, 10000); // 10 second timeout

        const sessionData = await sessionResult.json();
        console.log('[Sync] Step 2: Response:', sessionData);

        // ONLY force logout on explicit valid:false — never on network error
        if (sessionData && sessionData.valid === false) {
          console.warn('[Sync] Step 2: Session invalid —', sessionData.message);
          isSyncInProgress = false;
          forceLogout(sessionData.message || 'Your session has ended. Please log in again.');
          return; // STOP pipeline
        }

        // Step 2b: Update editable in session if returned
        if (sessionData && sessionData.valid === true) {
          if (sessionData.editable !== undefined) {
            updateStoredEditable(sessionData.editable);
            console.log('[Sync] Step 2b: Editable updated to:', sessionData.editable);
          }
          if (sessionData.report !== undefined) {
            const sdipRaw = localStorage.getItem("sdip_session");
            if (sdipRaw) {
              try {
                const session = JSON.parse(sdipRaw);
                session.report = sessionData.report;
                localStorage.setItem("sdip_session", JSON.stringify(session));
              } catch (e) { }
            }
          }
          if (typeof updateReportsNavVisibility === "function") {
            updateReportsNavVisibility();
          }
        }

      } catch (err) {
        // Network error — do NOT force logout, just skip and continue
        console.warn('[Sync] Step 2: Network error (non-fatal, skipping session check):', err.message);
      }
    }

    // ── STEP 3: Fetch fresh school data ──────────────────────────
    console.log('[Sync] Step 3: Fetching fresh school data...');
    try {
      let sheetUrl = getStoredSheetUrl();
      if (!sheetUrl) throw new Error('No sheetUrl in session');

      // Add a cache-busting timestamp to bypass Google's network caches
      sheetUrl = `${sheetUrl}${sheetUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;

      const dataResult = await fetchWithTimeout(sheetUrl, {}, 45000);
      const freshData = await dataResult.json();

      // Validate response has expected structure
      if (!freshData || typeof freshData !== 'object') {
        throw new Error('Invalid data structure received');
      }

      // Save to localStorage with new timestamp
      saveDataToCache(freshData);
      console.log('[Sync] Step 3: Data fetched and cached successfully.');

      // Refresh cached logo as well
      await refreshCachedLogo();

      if (triggeredBy === 'manual') {
        if (typeof showToast === "function") {
          showToast("Sync complete. Fresh data loaded.", "success");
        }
      } else if (triggeredBy === 'auto') {
        if (typeof showToast === "function") {
          showToast("Database auto-updated in background.", "success");
        }
      }

    } catch (err) {
      // Non-fatal: keep showing existing cached data
      console.warn('[Sync] Step 3: Data fetch failed (showing cached data):', err.message);
      showSyncFailedNotice(); // small non-blocking toast

      if (!isDataLoaded() && retryContainer) {
        retryContainer.classList.remove("hidden");
      }
    }

    // ── STEP 4: Re-render UI with latest data + permissions ──────
    console.log('[Sync] Step 4: Updating UI...');
    try {
      refreshUIWithCachedData(); // re-render tables/dashboard from cache
      updateEditButtonVisibility(); // show/hide edit based on current editable value
      console.log('[Sync] Step 4: UI updated.');
    } catch (err) {
      console.error('[Sync] Step 4: UI update error:', err.message);
    }

  } finally {
    // ALWAYS release the lock, even if something unexpected throws
    isSyncInProgress = false;

    // Hide loading indicators
    if (skeletonLoader) skeletonLoader.classList.add("hidden");
    if (appLoading) appLoading.classList.add("hidden");
    setRefreshSpinner(false);

    // Restore active view if we hid it
    if (isDataLoaded()) {
      const activeTab = window.currentActiveTab || "dashboard";
      let activeViewId = "dashboard-view";
      if (activeTab === "udise") activeViewId = "udise-view";
      else if (activeTab === "three-point-zero") activeViewId = "three-point-zero-view";
      else if (activeTab === "school-data") activeViewId = "school-data-view";
      else if (activeTab === "universal-search") activeViewId = "universal-search-view";
      const activeSec = document.getElementById(activeViewId);
      if (activeSec) activeSec.classList.remove("hidden");
    } else {
      if (retryContainer) retryContainer.classList.remove("hidden");
    }

    console.log('[Sync] Pipeline complete.');
  }
}

/**
 * Update the Last Sync text inside Header
 */
function updateSyncTimeText() {
  const lastFetch = localStorage.getItem(TIMEOUT_KEY);
  const textEl = document.getElementById("sync-time-text");

  if (!textEl) return;

  if (!lastFetch) {
    textEl.textContent = "Never Synced";
    return;
  }

  const date = new Date(parseInt(lastFetch));

  // Clean formatting: e.g. "Synced 10:15 AM"
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;

  textEl.textContent = `Synced ${displayHours}:${minutes} ${ampm}`;
  textEl.parentElement.title = `Last successful sync: ${date.toLocaleString()}`;
}

/**
 * Handle spinning animation on refresh button
 */
function setRefreshSpinner(spinning) {
  const icon = document.getElementById("refresh-icon-spin");
  if (!icon) return;

  if (spinning) {
    icon.style.animation = "spin 1s linear infinite";
  } else {
    icon.style.animation = "none";
  }
}

/**
 * Orchestrate rendering of all components when data is loaded/updated
 */
function renderAppComponents(data) {
  // Render Dashboard
  initDashboard(data);

  // Render Tabs (UDISE, 3.0, School Data)
  initTabs(data);

  // Render Universal Search
  initUniversalSearch(data);

  // Setup PDF configuration module
  initPdfExport(data);
}

window.renderAppComponents = renderAppComponents;

// Bind UI actions
document.addEventListener("DOMContentLoaded", () => {
  const refreshBtn = document.getElementById("manual-refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      runSyncPipeline('manual');
    });
  }

  const retryBtn = document.getElementById("retry-fetch-btn");
  if (retryBtn) {
    retryBtn.addEventListener("click", () => {
      runSyncPipeline('manual');
    });
  }

  // Set up periodic background auto-refresh check every 5 minutes
  setInterval(() => {
    const lastFetch = localStorage.getItem("school-portal-last-fetch");
    const age = lastFetch ? Date.now() - parseInt(lastFetch) : Infinity;
    if (age > 24 * 60 * 60 * 1000) {
      console.log('[Sync] Cache expired during periodic check. Triggering auto-refresh.');
      runSyncPipeline('auto');
    }
  }, 5 * 60 * 1000); // 5 minutes
});
