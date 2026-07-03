/**
 * Authentication Module
 * Manages school login sessions and login/logout screens transitions.
 */

const SESSION_KEY = "school-portal-session";

function convertDriveUrl(url) {
  if (!url) return "";
  const str = url.toString().trim();
  
  // Extract file ID from various Google Drive URL formats
  let fileId = null;

  // Match standard /file/d/FILE_ID/ format
  const fileDMatch = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileDMatch && fileDMatch[1]) fileId = fileDMatch[1];
  
  // Match id=FILE_ID query parameter format (e.g. open?id=FILE_ID or uc?id=FILE_ID)
  if (!fileId) {
    const idQueryMatch = str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idQueryMatch && idQueryMatch[1]) fileId = idQueryMatch[1];
  }

  // Match general /d/FILE_ID format
  if (!fileId) {
    const dMatch = str.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (dMatch && dMatch[1]) fileId = dMatch[1];
  }

  // Use lh3.googleusercontent.com for reliable direct image serving (no CORS/redirect issues)
  if (fileId) {
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  }
  
  return str;
}


/**
 * Helper to check if we are in a secure admin viewing session
 */
function isAdminViewingSession() {
  const adminViewing = localStorage.getItem("admin_viewing_school");
  const adminSession = localStorage.getItem("admin_session");
  if (adminViewing && adminSession) {
    try {
      const sess = JSON.parse(adminSession);
      return sess && sess.sessionToken;
    } catch (e) {
      return false;
    }
  }
  return false;
}

/**
 * Check if a user is currently logged in
 */
function isLoggedIn() {
  return localStorage.getItem(SESSION_KEY) !== null;
}

/**
 * Retrieve current logged-in school metadata
 */
function getCurrentSchool() {
  if (isAdminViewingSession()) {
    const adminViewing = localStorage.getItem("admin_viewing_school");
    try {
      const data = JSON.parse(adminViewing);
      return {
        userId: data.userId || "admin_viewing",
        sessionToken: "admin_token",
        schoolName: data.schoolName,
        sheetUrl: data.sheetUrl,
        logoUrl: data.logoUrl || "",
        editable: "Yes"
      };
    } catch(e) {
      console.error("Error parsing admin_viewing_school:", e);
    }
  }
  const sessionData = localStorage.getItem(SESSION_KEY);
  return sessionData ? JSON.parse(sessionData) : null;
}

window.isEditAllowed = function(editableValue) {
  if (isAdminViewingSession()) {
    return true;
  }
  return (editableValue || "").toString().trim().toLowerCase() === "yes";
};

/**
 * Validate credentials and establish session
 * @param {string} userId 
 * @param {string} password 
 * @returns {object} { success: boolean, message: string }
 */
/**
 * Retrieve Device ID from localStorage or generate a new one
 */
function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem("device_id");
  if (!deviceId) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      deviceId = crypto.randomUUID();
    } else {
      deviceId = 'device-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now().toString(36);
    }
    localStorage.setItem("device_id", deviceId);
  }
  return deviceId;
}

/**
 * Fetch school logo and convert to Base64 to cache in localStorage
 */
async function fetchAndCacheLogo(logoUrl) {
  if (!logoUrl) {
    localStorage.removeItem("school-portal-logo-base64");
    return null;
  }
  const targetUrl = typeof convertDriveUrl === "function" ? convertDriveUrl(logoUrl) : logoUrl;
  try {
    const response = await fetch(targetUrl);
    if (!response.ok) throw new Error("Failed to fetch logo image");
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result;
        localStorage.setItem("school-portal-logo-base64", base64data);
        resolve(base64data);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("Failed to convert logo to base64, using direct URL instead:", error);
    return null;
  }
}

/**
 * Validate credentials and establish session
 * @param {string} userId 
 * @param {string} password 
 * @returns {object} { success: boolean, message: string }
 */
async function attemptLogin(userId, password) {
  const deviceId = getOrCreateDeviceId();
  const payload = {
    action: "login",
    userId: userId.trim(),
    password: password,
    deviceId: deviceId
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch(ADMIN_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data && data.success) {
      if (data.role && data.role.toString().trim() === "SuperAdmin") {
        const errTextEl = document.getElementById("login-error-text");
        const errDivEl = document.getElementById("login-error");
        if (errTextEl && errDivEl) {
          errTextEl.textContent = "Access denied. Please use the Admin Panel to login.";
          errDivEl.classList.remove("hidden");
        }
        return { success: false, message: "Access denied. Please use the Admin Panel to login." };
      }
      const schoolNameVal = data.schoolName || data.school_name || data['School Name'] || '';
      const sheetUrlVal = data.sheetUrl || data.sheet_url || data['Sheet URL'] || '';
      const logoUrlVal = data.logoUrl || data.logo_url || data['Logo URL'] || '';
      const editableVal = data.editable !== undefined ? data.editable : (data.Editable !== undefined ? data.Editable : 'No');
      const reportVal = data.report !== undefined ? data.report : (data.Report !== undefined ? data.Report : 'No');

      // Set session (store session token, school name, sheet url, logo url, editable, and userId)
      const sessionObj = {
        userId: userId.trim(),
        sessionToken: data.sessionToken,
        schoolName: schoolNameVal,
        sheetUrl: sheetUrlVal,
        logoUrl: logoUrlVal,
        editable: editableVal
      };
      
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionObj));
      localStorage.setItem('sdip_session', JSON.stringify({
        username: userId.trim(),
        loginTime: Date.now(),
        sessionToken: data.sessionToken,
        schoolName: schoolNameVal,
        logoUrl: logoUrlVal,
        editable: editableVal,
        role: data.role,
        report: reportVal
      }));
      localStorage.setItem('skip_session_check', 'true');
      console.log('Saved session & set skip_session_check flag:', {
        username: userId.trim(),
        loginTime: Date.now(),
        sessionToken: data.sessionToken
      });
      
      // Fetch and cache school logo for offline use
      if (data.logoUrl) {
        await fetchAndCacheLogo(data.logoUrl);
      } else {
        localStorage.removeItem("school-portal-logo-base64");
      }
      
      if (typeof updateReportsNavVisibility === "function") {
        updateReportsNavVisibility();
      }
      return { success: true, school: sessionObj };
    } else {
      return { success: false, message: data.message || "Invalid User ID or Password." };
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("Login request failed: ", error);
    return { 
      success: false, 
      message: "Could not reach the login server. Please check your connection and try again." 
    };
  }
}

/**
 * Log out user and purge cache
 */
async function logout() {
  // Check for pending edits in queue
  const queueRaw = localStorage.getItem("sdip_pending_edits");
  let hasPending = false;
  if (queueRaw) {
    try {
      const queue = JSON.parse(queueRaw);
      hasPending = queue.some(e => e.status === "pending" || e.status === "failed" || e.status === "syncing");
    } catch (e) {}
  }

  if (hasPending && navigator.onLine && typeof window.syncPendingEditsImmediately === "function") {
    showToast("Syncing pending changes...", "info");
    try {
      await window.syncPendingEditsImmediately();
    } catch (syncErr) {
      console.warn("Logout sync failed:", syncErr);
    }
  }

  const sessionRaw = localStorage.getItem('sdip_session');
  if (sessionRaw) {
    try {
      const session = JSON.parse(sessionRaw);
      const userId = session.username;
      const sessionToken = session.sessionToken;
      
      if (userId && sessionToken) {
        const payload = {
          action: "logout",
          userId: userId,
          sessionToken: sessionToken
        };
        
        // Attempt to notify the admin server of the logout (non-blocking)
        fetch(ADMIN_SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify(payload)
        }).catch(err => console.warn("Logout notification failed:", err));
      }
    } catch (e) {
      console.warn("Logout notification error:", e);
    }
  }

  // Clear all localStorage
  localStorage.clear();
  
  if (typeof updateReportsNavVisibility === "function") {
    updateReportsNavVisibility();
  }
  
  // Reset UI back to login screen
  showLoginScreen();
  
  // Display a feedback toast
  showToast("Logged out successfully.", "info");
}

async function verifySessionStillValid() {
  if (isAdminViewingSession()) {
    console.log("Admin viewing school session, skipping session validity check.");
    return true;
  }

  const sessionRaw = localStorage.getItem('sdip_session');
  const deviceId = localStorage.getItem('device_id');

  if (!sessionRaw || !deviceId) {
    console.warn('Missing session data, skipping check');
    return true;
  }

  const session = JSON.parse(sessionRaw);
  const userId = session.username;

  console.log('verifySessionStillValid - checking:', { userId, deviceId });

  try {
    const res = await fetch(ADMIN_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'checkSession', userId, deviceId })
    });
    const data = await res.json();
    console.log('verifySessionStillValid - server response:', data);

    if (!data.valid) {
      localStorage.clear();
      alert(data.message || 'Your session has ended. Please log in again.');
      window.location.reload();
      return false;
    }
    
    const serverEditable = data.editable !== undefined ? data.editable : data.Editable;
    if (serverEditable !== undefined) {
      session.editable = serverEditable;
      localStorage.setItem('sdip_session', JSON.stringify(session));
      const sessionRaw2 = localStorage.getItem("school-portal-session");
      if (sessionRaw2) {
        const session2 = JSON.parse(sessionRaw2);
        session2.editable = serverEditable;
        localStorage.setItem("school-portal-session", JSON.stringify(session2));
      }
    }
    
    const serverReport = data.report !== undefined ? data.report : data.Report;
    if (serverReport !== undefined) {
      session.report = serverReport;
      localStorage.setItem('sdip_session', JSON.stringify(session));
    }
    
    if (typeof updateReportsNavVisibility === "function") {
      updateReportsNavVisibility();
    }
    
    return true;
  } catch (err) {
    console.error('verifySessionStillValid - network error, skipping check:', err);
    return true;
  }
}


/**
 * Transition UI to Login view
 */
function showLoginScreen() {
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("app-screen").classList.add("hidden");
  
  // Reset logo back to default
  const logoEl = document.querySelector(".header-logo");
  if (logoEl) {
    logoEl.src = "assets/icon.svg";
  }
  
  // Clear input fields
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
  document.getElementById("login-error").classList.add("hidden");
}

/**
 * Transition UI to Dashboard / App view
 */
function showAppScreen(school) {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app-screen").classList.remove("hidden");
  
  document.getElementById("school-name-display").textContent = school.schoolName;
  
  // Display cached or online school logo
  const logoEl = document.querySelector(".header-logo");
  const logoWrapper = document.querySelector(".logo-wrapper");
  if (logoEl) {
    try {
      const sessionRaw = localStorage.getItem("sdip_session");
      if (sessionRaw) {
        const session = JSON.parse(sessionRaw);
        const logoUrl = session.logoUrl;
        const convertedUrl = convertDriveUrl(logoUrl);
        if (convertedUrl) {
          logoEl.src = convertedUrl;
          logoEl.style.display = 'block';
          // Remove SVG-style padding so the photo fills the wrapper
          if (logoWrapper) {
            logoWrapper.style.padding = '0';
            logoWrapper.style.overflow = 'hidden';
          }
          logoEl.onerror = function() {
            // Revert to default icon on failure
            logoEl.src = 'assets/icon.svg';
            logoEl.style.display = 'block';
            if (logoWrapper) {
              logoWrapper.style.padding = '6px';
              logoWrapper.style.overflow = '';
            }
          };
        } else {
          logoEl.src = 'assets/icon.svg';
          logoEl.style.display = 'block';
        }
      } else {
        logoEl.src = 'assets/icon.svg';
        logoEl.style.display = 'block';
      }
    } catch (e) {
      console.error("Failed to read logoUrl from sdip_session:", e);
      logoEl.src = 'assets/icon.svg';
      logoEl.style.display = 'block';
    }
  }
  
  // Inject Admin View Banner if viewing as admin
  if (isAdminViewingSession()) {
    if (!document.getElementById("admin-view-banner")) {
      const banner = document.createElement("div");
      banner.id = "admin-view-banner";
      banner.style.backgroundColor = "#dc2626";
      banner.style.color = "#ffffff";
      banner.style.padding = "10px 16px";
      banner.style.display = "flex";
      banner.style.justifyContent = "space-between";
      banner.style.alignItems = "center";
      banner.style.fontWeight = "600";
      banner.style.fontSize = "14px";
      banner.style.fontFamily = "'Inter', sans-serif";
      banner.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
      banner.style.position = "sticky";
      banner.style.top = "0";
      banner.style.zIndex = "10000";
      
      banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 8px; height: 8px; background-color: #ffffff; border-radius: 50%; animation: pulse 1.5s infinite;"></span>
          <span>Admin View — ${school.schoolName}</span>
        </div>
        <button id="exit-admin-view-btn" style="background-color: #ffffff; color: #dc2626; border: none; padding: 6px 12px; border-radius: 4px; font-weight: 700; cursor: pointer; font-size: 12px; transition: all 0.2s ease; outline: none; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
          Exit Admin View
        </button>
      `;
      
      if (!document.getElementById("admin-banner-styles")) {
        const style = document.createElement("style");
        style.id = "admin-banner-styles";
        style.textContent = `
          @keyframes pulse {
            0% { transform: scale(0.95); opacity: 0.5; }
            50% { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(0.95); opacity: 0.5; }
          }
          #exit-admin-view-btn:hover {
            background-color: #f3f4f6 !important;
            transform: translateY(-1px);
          }
          #exit-admin-view-btn:active {
            transform: translateY(0);
          }
        `;
        document.head.appendChild(style);
      }

      document.getElementById("app-screen").prepend(banner);
      
      document.getElementById("exit-admin-view-btn").addEventListener("click", () => {
        const adminSession = localStorage.getItem("admin_session");
        const deviceId = localStorage.getItem("device_id");
        localStorage.clear();
        if (adminSession) {
          localStorage.setItem("admin_session", adminSession);
        }
        if (deviceId) {
          localStorage.setItem("device_id", deviceId);
        }
        window.location.href = "admin/index.html";
      });
    }
  } else {
    const banner = document.getElementById("admin-view-banner");
    if (banner) {
      banner.remove();
    }
  }
  
  // Trigger data fetching workflow
  initializeDataFetchWorkflow();
}

/**
 * Toast helper (defined globally or lazy loaded)
 * Creates a toast overlay to give users feedback.
 */
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  let iconName = "info";
  if (type === "success") iconName = "check-circle";
  if (type === "warning") iconName = "alert-triangle";
  if (type === "error") iconName = "alert-circle";

  toast.innerHTML = `
    <i data-lucide="${iconName}" class="toast-icon"></i>
    <span class="toast-message">${message}</span>
    <button class="toast-close">
      <i data-lucide="x"></i>
    </button>
  `;

  container.appendChild(toast);
  
  // Initialize dynamic icons inside the toast
  if (typeof lucide !== 'undefined') {
    lucide.createIcons({ attrs: { class: 'size-4' } });
  }

  // Handle toast close
  const closeBtn = toast.querySelector(".toast-close");
  closeBtn.addEventListener("click", () => {
    toast.style.animation = "fadeIn 0.2s reverse ease-in";
    setTimeout(() => toast.remove(), 200);
  });

  // Auto-remove toast after 4 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.animation = "fadeIn 0.2s reverse ease-in";
      setTimeout(() => toast.remove(), 200);
    }
  }, 4000);
}

// Check session on page load
document.addEventListener("DOMContentLoaded", () => {
  if (isAdminViewingSession()) {
    const adminViewing = localStorage.getItem("admin_viewing_school");
    try {
      const data = JSON.parse(adminViewing);
      const url = (data.sheetUrl || "").toString().trim();
      if (!url || !url.startsWith("http")) {
        localStorage.removeItem("admin_viewing_school");
        showToast("Invalid School Sheet URL. Redirecting to admin...", "error");
        setTimeout(() => {
          window.location.href = "admin/index.html";
        }, 2000);
        return;
      }
      // Create a simulated school session using the school's actual userId if available
      const targetUserId = data.userId || "admin_viewing";
      const simSchool = {
        userId: targetUserId,
        sessionToken: "admin_token",
        schoolName: data.schoolName,
        sheetUrl: url,
        logoUrl: data.logoUrl || "",
        editable: "Yes" // Set editable = true always
      };
      
      // Store in standard session keys so the app uses them
      localStorage.setItem(SESSION_KEY, JSON.stringify(simSchool));
      localStorage.setItem('sdip_session', JSON.stringify({
        username: targetUserId,
        loginTime: Date.now(),
        sessionToken: "admin_token",
        schoolName: data.schoolName,
        logoUrl: data.logoUrl || "",
        editable: "Yes",
        role: "Admin"
      }));
      
      // Ensure we clear any cached data from previous schools so we fetch it fresh
      localStorage.removeItem("school-portal-data");
      localStorage.removeItem("school-portal-last-fetch");
      
      showAppScreen(simSchool);
    } catch (e) {
      console.error("Failed to parse admin_viewing_school:", e);
      showLoginScreen();
    }
  } else {
    // If admin_viewing_school is in localStorage but no valid admin session exists, clean it up
    if (localStorage.getItem("admin_viewing_school")) {
      localStorage.removeItem("admin_viewing_school");
    }
    const school = getCurrentSchool();
    if (school) {
      showAppScreen(school);
    } else {
      showLoginScreen();
    }
  }

  if (typeof updateReportsNavVisibility === "function") {
    updateReportsNavVisibility();
  }

  // Bind Login Form submission
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const userIdVal = document.getElementById("username").value;
      const passwordVal = document.getElementById("password").value;
      const errorDiv = document.getElementById("login-error");
      const errorText = document.getElementById("login-error-text");
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      errorDiv.classList.add("hidden");

      // Show loading indicator
      let originalBtnContent = "";
      if (submitBtn) {
        originalBtnContent = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          <div class="loading-spinner" style="width: 16px; height: 16px; border-width: 2px; border-top-color: #ffffff; display: inline-block; vertical-align: middle;"></div>
          <span>Signing in...</span>
        `;
      }

      try {
        const result = await attemptLogin(userIdVal, passwordVal);

        if (result.success) {
          showAppScreen(result.school);
          showToast(`Welcome back, ${result.school.schoolName}!`, "success");
          if (window.isEditAllowed(result.school.editable) && typeof window.initBackgroundSyncTimer === "function") {
            window.initBackgroundSyncTimer();
          }
        } else {
          errorText.textContent = result.message;
          errorDiv.classList.remove("hidden");
          showToast(result.message, "error");
        }
      } catch (err) {
        console.error("Login submit error:", err);
        errorText.textContent = "An unexpected error occurred. Please try again.";
        errorDiv.classList.remove("hidden");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnContent;
          // Re-create icons inside the button
          if (typeof lucide !== 'undefined') {
            lucide.createIcons();
          }
        }
      }
    });
  }

  // Bind Logout Button
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      logout();
    });
  }
});
