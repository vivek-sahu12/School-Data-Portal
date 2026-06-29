/**
 * Authentication Module
 * Manages school login sessions and login/logout screens transitions.
 */

const SESSION_KEY = "school-portal-session";

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
  const sessionData = localStorage.getItem(SESSION_KEY);
  return sessionData ? JSON.parse(sessionData) : null;
}

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
  try {
    const response = await fetch(logoUrl);
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
      // Set session (store session token, school name, sheet url, logo url, editable, and userId)
      const sessionObj = {
        userId: userId.trim(),
        sessionToken: data.sessionToken,
        schoolName: data.schoolName,
        sheetUrl: data.sheetUrl,
        logoUrl: data.logoUrl,
        editable: data.editable
      };
      
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionObj));
      
      // Fetch and cache school logo for offline use
      if (data.logoUrl) {
        await fetchAndCacheLogo(data.logoUrl);
      } else {
        localStorage.removeItem("school-portal-logo-base64");
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
  const school = getCurrentSchool();
  if (school && school.userId && school.sessionToken) {
    const payload = {
      action: "logout",
      userId: school.userId,
      sessionToken: school.sessionToken
    };
    
    // Attempt to notify the admin server of the logout (non-blocking)
    try {
      fetch(ADMIN_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      }).catch(err => console.warn("Logout notification failed:", err));
    } catch (e) {
      console.warn("Logout notification error:", e);
    }
  }

  // Clear auth session
  localStorage.removeItem(SESSION_KEY);
  
  // Clear cached school data & timestamps
  localStorage.removeItem("school-portal-data");
  localStorage.removeItem("school-portal-last-fetch");
  localStorage.removeItem("school-portal-logo-base64");
  
  // Reset UI back to login screen
  showLoginScreen();
  
  // Display a feedback toast
  showToast("Logged out successfully.", "info");
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
  if (logoEl) {
    const cachedLogo = localStorage.getItem("school-portal-logo-base64");
    if (cachedLogo) {
      logoEl.src = cachedLogo;
    } else if (school.logoUrl) {
      logoEl.src = school.logoUrl;
      logoEl.onerror = () => {
        logoEl.src = "assets/icon.svg";
      };
    } else {
      logoEl.src = "assets/icon.svg";
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
  const school = getCurrentSchool();
  if (school) {
    showAppScreen(school);
  } else {
    showLoginScreen();
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
        } else {
          errorText.textContent = result.message;
          errorDiv.classList.remove("hidden");
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
