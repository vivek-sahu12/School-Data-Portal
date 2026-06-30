/**
 * Data Fetching and Caching Module
 * Connects to Google Apps Script Web Apps and manages localStorage sync.
 */

const DATA_KEY = "school-portal-data";
const TIMEOUT_KEY = "school-portal-last-fetch";
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

let isFetching = false;

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
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
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
  const appLoading = document.getElementById("app-loading-bar");
  
  if (retryContainer) retryContainer.classList.add("hidden");

  if (cached) {
    // We have cached data! Render UI immediately with cache.
    updateSyncTimeText();
    renderAppComponents(cached);
    
    // Check if cache is older than 24 hours
    const lastFetch = localStorage.getItem(TIMEOUT_KEY);
    const age = lastFetch ? Date.now() - parseInt(lastFetch) : Infinity;
    
    if (age > REFRESH_INTERVAL_MS) {
      console.log("Cached data is older than 24 hours. Triggering background refresh.");
      triggerBackgroundFetch();
    }
  } else {
    // First time login - no cached data exists. Must load now.
    triggerInitialFetch();
  }
}

/**
 * Initial fetch (blocks screen with centered loader)
 */
async function triggerInitialFetch() {
  const school = getCurrentSchool();
  if (!school) return;

  const appLoading = document.getElementById("app-loading-bar");
  const retryContainer = document.getElementById("retry-container");
  const skeletonLoader = document.getElementById("skeleton-loader");
  
  // Hide all view sections
  document.querySelectorAll(".view-section").forEach(sec => sec.classList.add("hidden"));
  if (skeletonLoader) skeletonLoader.classList.remove("hidden");
  
  appLoading.classList.add("hidden");
  retryContainer.classList.add("hidden");
  setRefreshSpinner(true);
  isFetching = true;

  try {
    const data = await fetchFromGoogleSheets(school.sheetUrl);
    cacheSchoolData(data);
    await refreshCachedLogo();
    updateSyncTimeText();
    renderAppComponents(data);
    showToast("Data loaded successfully.", "success");
  } catch (error) {
    console.error("Initial fetch failed: ", error);
    retryContainer.classList.remove("hidden");
    showToast("Connection failed. Unable to fetch initial data.", "error");
  } finally {
    if (skeletonLoader) skeletonLoader.classList.add("hidden");
    
    // Restore active view
    const activeTab = window.currentActiveTab || "dashboard";
    let activeViewId = "dashboard-view";
    if (activeTab === "udise") activeViewId = "udise-view";
    else if (activeTab === "three-point-zero") activeViewId = "three-point-zero-view";
    else if (activeTab === "school-data") activeViewId = "school-data-view";
    else if (activeTab === "universal-search") activeViewId = "universal-search-view";
    const activeSec = document.getElementById(activeViewId);
    if (activeSec) activeSec.classList.remove("hidden");

    appLoading.classList.add("hidden");
    setRefreshSpinner(false);
    isFetching = false;
  }
}

/**
 * Silent background fetch (does not block user interaction)
 */
async function triggerBackgroundFetch() {
  const school = getCurrentSchool();
  if (!school || isFetching) return;

  isFetching = true;
  setRefreshSpinner(true);

  try {
    // Verify session validity sequentially first
    const sessionOk = await verifySessionStillValid();
    if (!sessionOk) {
      setRefreshSpinner(false);
      isFetching = false;
      return;
    }

    const data = await fetchFromGoogleSheets(school.sheetUrl);
    cacheSchoolData(data);
    await refreshCachedLogo();
    updateSyncTimeText();
    renderAppComponents(data);
    showToast("Database auto-updated in background.", "success");
  } catch (error) {
    console.warn("Background auto-update failed: ", error);
    showToast("Auto-update failed. Showing cached data.", "warning");
  } finally {
    setRefreshSpinner(false);
    isFetching = false;
  }
}

/**
 * Manual refresh (triggered by header sync button)
 */
async function forceRefreshData() {
  const school = getCurrentSchool();
  if (!school) return;
  
  if (isFetching) {
    showToast("Sync already in progress.", "info");
    return;
  }

  isFetching = true;
  setRefreshSpinner(true);
  
  const hasCached = isDataLoaded();
  const appLoading = document.getElementById("app-loading-bar");
  const skeletonLoader = document.getElementById("skeleton-loader");
  
  if (!hasCached) {
    // Hide view sections only if no cached data is available to display
    document.querySelectorAll(".view-section").forEach(sec => sec.classList.add("hidden"));
    if (skeletonLoader) skeletonLoader.classList.remove("hidden");
  } else {
    // Show lightweight top loading bar if we have cached data to display
    if (appLoading) appLoading.classList.remove("hidden");
  }

  showToast("Synchronizing with cloud server...", "info");

  try {
    // Verify session validity sequentially first
    const sessionOk = await verifySessionStillValid();
    if (!sessionOk) {
      if (skeletonLoader) skeletonLoader.classList.add("hidden");
      setRefreshSpinner(false);
      isFetching = false;
      return;
    }

    const data = await fetchFromGoogleSheets(school.sheetUrl);
    cacheSchoolData(data);
    await refreshCachedLogo();
    updateSyncTimeText();
    renderAppComponents(data);
    showToast("Sync complete. Fresh data loaded.", "success");
  } catch (error) {
    console.error("Manual refresh failed: ", error);
    if (hasCached) {
      showToast("Sync failed. Displaying cached records.", "warning");
    } else {
      document.getElementById("retry-container").classList.remove("hidden");
      showToast("Sync failed. Check connection.", "error");
    }
  } finally {
    if (skeletonLoader) skeletonLoader.classList.add("hidden");
    
    if (!hasCached) {
      // Restore active view only if we originally hid it
      const activeTab = window.currentActiveTab || "dashboard";
      let activeViewId = "dashboard-view";
      if (activeTab === "udise") activeViewId = "udise-view";
      else if (activeTab === "three-point-zero") activeViewId = "three-point-zero-view";
      else if (activeTab === "school-data") activeViewId = "school-data-view";
      else if (activeTab === "universal-search") activeViewId = "universal-search-view";
      const activeSec = document.getElementById(activeViewId);
      if (activeSec) activeSec.classList.remove("hidden");
    }

    if (appLoading) appLoading.classList.add("hidden");
    setRefreshSpinner(false);
    isFetching = false;
  }
}

/**
 * Low-level fetch command with timeout
 */
async function fetchFromGoogleSheets(url) {
  // Add a cache-busting timestamp to bypass Google's network caches
  const cacheBustUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
  
  // Set up fetch abort controller for 15s timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 18000);

  try {
    const response = await fetch(cacheBustUrl, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    
    // Validate schema - must contain the worksheets
    const sheets = Object.keys(json);
    if (!json || sheets.length === 0) {
      throw new Error("Empty spreadsheet JSON returned.");
    }
    
    // Normalize worksheet keys by trimming whitespace
    const normalizedData = {};
    for (const key in json) {
      normalizedData[key.trim()] = json[key];
    }

    return normalizedData;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
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

// Bind UI actions
document.addEventListener("DOMContentLoaded", () => {
  const refreshBtn = document.getElementById("manual-refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      forceRefreshData();
    });
  }

  const retryBtn = document.getElementById("retry-fetch-btn");
  if (retryBtn) {
    retryBtn.addEventListener("click", () => {
      triggerInitialFetch();
    });
  }
});
