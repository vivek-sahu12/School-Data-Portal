/**
 * Age Calculator Module
 * Calculates precise chronological age and determines admission eligibility.
 * Integrates with custom premium CustomDatePicker instances.
 */
(function() {
  "use strict";

  // Calculate precise age in years, months, and days
  function calculateExactAge(dob, asOn) {
    let years = asOn.year - dob.year;
    let months = asOn.month - dob.month;
    let days = asOn.day - dob.day;
    
    if (days < 0) {
      // Get the last day of the previous month of the as-on month
      const prevMonthDate = new Date(asOn.year, asOn.month, 0);
      days += prevMonthDate.getDate();
      months--;
    }
    
    if (months < 0) {
      months += 12;
      years--;
    }
    
    return { years, months, days };
  }

  // Evaluate admission eligibility based on years, months, and days
  function checkAdmissionEligibility(years, months, days) {
    function isWithin(minY, minM, maxY, maxM) {
      // Check lower bound
      if (years < minY) return false;
      if (years === minY && months < minM) return false;
      
      // Check upper bound
      if (years > maxY) return false;
      if (years === maxY && months > maxM) return false;
      if (years === maxY && months === maxM && days > 0) return false;
      
      return true;
    }

    const eligibleClasses = [];
    
    // Class ranges
    if (isWithin(6, 0, 7, 6)) eligibleClasses.push("Class 1");
    if (isWithin(5, 0, 6, 6)) eligibleClasses.push("KG2");
    if (isWithin(4, 0, 5, 6)) eligibleClasses.push("KG1");
    if (isWithin(3, 0, 4, 6)) eligibleClasses.push("Nursery");

    return eligibleClasses;
  }

  // Bind the DOM controls and logic
  function initAgeCalculator() {
    const dobInput = document.getElementById("age-calc-dob");
    const asOnInput = document.getElementById("age-calc-ason");

    if (!dobInput || !asOnInput) return;

    // Instantiate premium CustomDatePickers
    const dobPicker = new window.CustomDatePicker(dobInput, {
      icon: "calendar",
      minYear: 1990,
      maxYear: 2030,
      noFuture: true
    });

    const asOnPicker = new window.CustomDatePicker(asOnInput, {
      icon: "calendar-clock",
      minYear: 2020,
      maxYear: 2035,
      noFuture: false
    });

    const calcBtn = document.getElementById("btn-calculate-age");
    const resultCard = document.getElementById("age-result-card");
    const resultText = document.getElementById("age-result-text");
    const eligibilityCard = document.getElementById("age-eligibility-card");
    const eligibilityText = document.getElementById("age-eligibility-text");

    if (!calcBtn) return;

    calcBtn.addEventListener("click", function() {
      // Force validate both fields first
      const dobValid = dobPicker.validateInput(true);
      const asOnValid = asOnPicker.validateInput(true);

      if (!dobValid || !asOnValid) return;

      const dobDate = dobPicker.selectedDate;
      const asOnDate = asOnPicker.selectedDate;

      if (!dobDate || !asOnDate) {
        if (typeof showToast === "function") {
          showToast("Please enter both Date of Birth and Calculate As On date.", "warning");
        }
        return;
      }

      // Check chronologically
      if (dobDate > asOnDate) {
        if (typeof showToast === "function") {
          showToast("Date of Birth cannot be after the Calculate As On date.", "warning");
        } else {
          alert("Date of Birth cannot be after the Calculate As On date.");
        }
        return;
      }

      // Convert Date objects to parts
      const dobVal = {
        year: dobDate.getFullYear(),
        month: dobDate.getMonth(),
        day: dobDate.getDate()
      };
      
      const asOnVal = {
        year: asOnDate.getFullYear(),
        month: asOnDate.getMonth(),
        day: asOnDate.getDate()
      };

      // Calculate age
      const age = calculateExactAge(dobVal, asOnVal);

      // Render Age Details
      resultText.innerHTML = `
        <div class="age-result-grid">
          <div class="age-result-tile years">
            <span class="age-result-number">${age.years}</span>
            <span class="age-result-label">Years</span>
          </div>
          <div class="age-result-tile months">
            <span class="age-result-number">${age.months}</span>
            <span class="age-result-label">Months</span>
          </div>
          <div class="age-result-tile days">
            <span class="age-result-number">${age.days}</span>
            <span class="age-result-label">Days</span>
          </div>
        </div>
      `;
      resultCard.classList.remove("hidden");

      // Render Eligibility Details
      const eligibleClasses = checkAdmissionEligibility(age.years, age.months, age.days);

      if (eligibleClasses.length === 0) {
        eligibilityCard.classList.add("hidden");
        eligibilityText.innerHTML = "";
      } else {
        const recommended = eligibleClasses[0];
        const alsoEligible = eligibleClasses.slice(1);

        let alsoEligibleText = "";
        if (alsoEligible.length > 0) {
          alsoEligibleText = `<p style="margin-top: 8px; font-size: 0.95rem; font-weight: 600; color: var(--text-secondary);">
            Also Eligible: <span style="color: var(--primary); font-weight: 700;">${alsoEligible.join(", ")}</span>
          </p>`;
        }

        const eligibilityHtml = `
          <div class="eligibility-banner success">
            <div class="eligibility-title-wrapper">
              <i data-lucide="check-circle" style="color: var(--success);"></i>
              <span class="eligibility-badge" style="color: var(--success);">Recommended Admission: ${recommended}</span>
            </div>
            ${alsoEligibleText}
          </div>
        `;
        eligibilityText.innerHTML = eligibilityHtml;
        eligibilityCard.classList.remove("hidden");
      }

      // Render any dynamically added icons
      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
      }
    });
  }

  // Initialize on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAgeCalculator);
  } else {
    initAgeCalculator();
  }

  // Namespace globally
  window.AgeCalculator = {
    calculateAge: function(dobStr, asOnStr) {
      const dobParts = dobStr.split("-").map(Number);
      const asOnParts = asOnStr.split("-").map(Number);
      return calculateExactAge(
        { year: dobParts[0], month: dobParts[1] - 1, day: dobParts[2] },
        { year: asOnParts[0], month: asOnParts[1] - 1, day: asOnParts[2] }
      );
    },
    checkEligibility: checkAdmissionEligibility
  };
})();
