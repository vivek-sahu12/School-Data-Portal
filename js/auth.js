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
function attemptLogin(userId, password) {
  const school = SCHOOLS.find(s => s.userId.trim() === userId.trim());

  if (!school) {
    return { success: false, message: "Invalid User ID or Password." };
  }

  if (school.password !== password) {
    return { success: false, message: "Invalid User ID or Password." };
  }

  if (school.status !== "active") {
    return { success: false, message: "Your account has been deactivated. Contact admin." };
  }

  // Set session (store metadata only, omit password)
  const sessionObj = {
    userId: school.userId,
    schoolName: school.schoolName,
    sheetUrl: school.sheetUrl
  };
  
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionObj));
  return { success: true, school: sessionObj };
}

/**
 * Log out user and purge cache
 */
function logout() {
  // Clear auth session
  localStorage.removeItem(SESSION_KEY);
  
  // Clear cached school data & timestamps
  localStorage.removeItem("school-portal-data");
  localStorage.removeItem("school-portal-last-fetch");
  
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
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      
      const userIdVal = document.getElementById("username").value;
      const passwordVal = document.getElementById("password").value;
      const errorDiv = document.getElementById("login-error");
      const errorText = document.getElementById("login-error-text");

      errorDiv.classList.add("hidden");

      const result = attemptLogin(userIdVal, passwordVal);

      if (result.success) {
        showAppScreen(result.school);
        showToast(`Welcome back, ${result.school.schoolName}!`, "success");
      } else {
        errorText.textContent = result.message;
        errorDiv.classList.remove("hidden");
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
