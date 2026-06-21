/**
 * Theme Manager Module
 * Handles Light/Dark mode toggling and persistence.
 */

(function () {
  const THEME_KEY = "school-portal-theme";
  const htmlEl = document.documentElement;

  // Retrieve saved preference or default to user system preference
  const getPreferredTheme = () => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme) {
      return savedTheme;
    }
    // Check system preference
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  // Apply theme to HTML tag and update toggle button states
  const applyTheme = (theme) => {
    htmlEl.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);

    // Update icons
    const themeSun = document.getElementById("theme-sun");
    const themeMoon = document.getElementById("theme-moon");

    if (themeSun && themeMoon) {
      if (theme === "dark") {
        themeSun.classList.remove("hidden");
        themeMoon.classList.add("hidden");
      } else {
        themeSun.classList.add("hidden");
        themeMoon.classList.remove("hidden");
      }
    }
  };

  // Initialize theme immediately to prevent layout flash during loading
  const initialTheme = getPreferredTheme();
  htmlEl.setAttribute("data-theme", initialTheme);

  // Bind event listener on DOM Content Loaded
  document.addEventListener("DOMContentLoaded", () => {
    // Re-apply to ensure icons align
    applyTheme(getPreferredTheme());

    const toggleBtn = document.getElementById("theme-toggle-btn");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const currentTheme = htmlEl.getAttribute("data-theme");
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        applyTheme(newTheme);

        // Re-render dashboard charts to update label/grid colors
        const selectSource = document.getElementById("dashboard-source-select");
        if (selectSource && typeof calculateAndRenderDashboard === 'function') {
          calculateAndRenderDashboard(selectSource.value);
        }
      });
    }
  });
})();
