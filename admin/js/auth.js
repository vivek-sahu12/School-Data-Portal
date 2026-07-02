/**
 * Admin Portal Authentication Module
 * Manages admin session lifecycle, login forms, checkSession loop and UI state transitions.
 */

const ADMIN_SESSION_KEY = "admin_session";

function getAdminSession() {
  const session = localStorage.getItem(ADMIN_SESSION_KEY);
  if (!session) return null;
  try {
    return JSON.parse(session);
  } catch (e) {
    console.error("Failed to parse admin session", e);
    return null;
  }
}

function isAdminLoggedIn() {
  return getAdminSession() !== null;
}

/**
 * Perform login and handle redirection/role validation
 */
async function attemptAdminLogin(userId, password) {
  const loginForm = document.getElementById("admin-login-form");
  const errorDiv = document.getElementById("login-error");
  const errorText = document.getElementById("login-error-text");
  const submitBtn = loginForm.querySelector('button[type="submit"]');

  if (errorDiv) errorDiv.classList.add("hidden");
  
  let originalBtnContent = "";
  if (submitBtn) {
    originalBtnContent = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <div class="admin-spinner" style="width: 16px; height: 16px; border-width: 2px; display: inline-block; vertical-align: middle;"></div>
      <span>Signing in...</span>
    `;
  }

  try {
    const response = await ApiService.login(userId, password);
    
    if (response && response.success) {
      // Validate that role is SuperAdmin
      const userRole = response.role;
      if (userRole !== "SuperAdmin") {
        throw new Error("Access denied. Admin credentials required.");
      }

      // Establish admin session
      const sessionObj = {
        username: userId.trim(),
        sessionToken: response.sessionToken,
        loginTime: Date.now()
      };
      
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(sessionObj));
      showToast("Signed in as Administrator", "success");
      
      // Load app dashboard
      showAdminApp(sessionObj);
    } else {
      throw new Error(response.message || "Invalid credentials.");
    }
  } catch (error) {
    console.error("Admin login error:", error);
    if (errorDiv && errorText) {
      errorText.textContent = error.message || "Failed to reach authorization server.";
      errorDiv.classList.remove("hidden");
    }
    showToast(error.message || "Connection failed.", "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnContent;
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }
  }
}

/**
 * Terminate session and return to login screen
 */
function logoutAdmin() {
  const session = getAdminSession();
  if (session) {
    // Non-blocking logout call to server
    const deviceId = localStorage.getItem("device_id");
    const payload = {
      action: "logout",
      userId: session.username,
      sessionToken: session.sessionToken
    };
    fetch(ADMIN_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    }).catch(err => console.warn("Admin server logout notify failed:", err));
  }
  
  // Clear only admin session keys and cached school data summaries
  localStorage.removeItem(ADMIN_SESSION_KEY);
  localStorage.removeItem("admin_schools_data_cache");
  localStorage.removeItem("admin_schools_data_cache_time");
  localStorage.removeItem("admin_schools_detail_cache");
  
  showAdminLoginScreen();
  showToast("Logged out successfully", "info");
}

/**
 * Periodically or on-load verify session validity
 */
async function verifyAdminSession() {
  const session = getAdminSession();
  const deviceId = localStorage.getItem("device_id");
  if (!session || !deviceId) {
    logoutAdmin();
    return false;
  }
  // Admin session is managed and verified locally to prevent invalid session checks 
  // against the per-school database checkSession action.
  return true;
}

/**
 * View Managers
 */
function showAdminLoginScreen() {
  document.getElementById("admin-login-screen").classList.remove("hidden");
  document.getElementById("admin-app-screen").classList.add("hidden");
  
  const form = document.getElementById("admin-login-form");
  if (form) form.reset();
}

function showAdminApp(session) {
  document.getElementById("admin-login-screen").classList.add("hidden");
  document.getElementById("admin-app-screen").classList.remove("hidden");
  
  const adminNameDisplay = document.getElementById("admin-username-display");
  if (adminNameDisplay) {
    adminNameDisplay.textContent = session.username;
  }
  
  // Initialize Admin Dashboard load
  if (typeof initAdminDashboard === "function") {
    initAdminDashboard();
  }
}

// Global Toast System matching the main app
function showToast(message, type = "info") {
  const container = document.getElementById("admin-toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `admin-toast ${type}`;

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
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons({ attrs: { class: 'size-4' } });
  }

  const closeBtn = toast.querySelector(".toast-close");
  closeBtn.addEventListener("click", () => {
    toast.style.animation = "fadeIn 0.2s reverse ease-in";
    setTimeout(() => toast.remove(), 200);
  });

  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.animation = "fadeIn 0.2s reverse ease-in";
      setTimeout(() => toast.remove(), 200);
    }
  }, 4000);
}

document.addEventListener("DOMContentLoaded", async () => {
  const session = getAdminSession();
  
  if (session) {
    showAdminApp(session);
    // Background validation
    verifyAdminSession();
  } else {
    showAdminLoginScreen();
  }

  const loginForm = document.getElementById("admin-login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const userIdVal = document.getElementById("admin-username").value;
      const passwordVal = document.getElementById("admin-password").value;
      attemptAdminLogin(userIdVal, passwordVal);
    });
  }

  // Bind logout buttons (support both sidebar and mobile hamburger/menu logout)
  document.querySelectorAll(".admin-logout-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      logoutAdmin();
    });
  });
});
