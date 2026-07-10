/**
 * Age Calculator Module
 * Calculates precise chronological age and determines admission eligibility.
 * Integrates with custom premium CustomDatePicker instances.
 */
(function () {
  "use strict";

  // Admission cutoff dates
  const ADMISSION_CUTOFF_NURSERY_KG = new Date(2026, 6, 31); // 31 July 2026
  const ADMISSION_CUTOFF_CLASS1 = new Date(2026, 8, 30); // 30 September 2026

  // Calculate precise age in years, months, and days from Date objects
  function calculateExactAge(dobDate, asOnDate) {
    const dob = {
      year: dobDate.getFullYear(),
      month: dobDate.getMonth(),
      day: dobDate.getDate()
    };

    const asOn = {
      year: asOnDate.getFullYear(),
      month: asOnDate.getMonth(),
      day: asOnDate.getDate()
    };

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

  // Evaluate admission eligibility based on Date of Birth
  function checkAdmissionEligibility(dobDate) {
    const ageNurseryKG = calculateExactAge(dobDate, ADMISSION_CUTOFF_NURSERY_KG);
    const ageClass1 = calculateExactAge(dobDate, ADMISSION_CUTOFF_CLASS1);

    function isWithin(age, minY, minM, maxY, maxM) {
      // Check lower bound
      if (age.years < minY) return false;
      if (age.years === minY && age.months < minM) return false;

      // Check upper bound
      if (age.years > maxY) return false;
      if (age.years === maxY && age.months > maxM) return false;
      if (age.years === maxY && age.months === maxM && age.days > 0) return false;

      return true;
    }

    const eligibleClasses = [];

    // Class ranges
    if (isWithin(ageClass1, 6, 0, 7, 6)) eligibleClasses.push("Class 1");
    if (isWithin(ageNurseryKG, 5, 0, 6, 6)) eligibleClasses.push("KG2");
    if (isWithin(ageNurseryKG, 4, 0, 5, 6)) eligibleClasses.push("KG1");
    if (isWithin(ageNurseryKG, 3, 0, 4, 6)) eligibleClasses.push("Nursery");

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

    calcBtn.addEventListener("click", function () {
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

      // Calculate age
      const age = calculateExactAge(dobDate, asOnDate);

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
      const eligibleClasses = checkAdmissionEligibility(dobDate);

      if (eligibleClasses.length === 0) {
        eligibilityCard.classList.add("hidden");
        eligibilityText.innerHTML = "";
      } else {
        const recommended = eligibleClasses[0];
        const alsoEligible = eligibleClasses.slice(1);

        const ageNurseryKG = calculateExactAge(dobDate, ADMISSION_CUTOFF_NURSERY_KG);
        const ageClass1 = calculateExactAge(dobDate, ADMISSION_CUTOFF_CLASS1);

        const recommendedAge = recommended === "Class 1" ? ageClass1 : ageNurseryKG;
        const recommendedCutoffStr = recommended === "Class 1" ? "30 September 2026" : "31 July 2026";

        let alsoEligibleText = "";
        if (alsoEligible.length > 0) {
          const items = alsoEligible.map(cls => {
            const clsAge = cls === "Class 1" ? ageClass1 : ageNurseryKG;
            const clsCutoff = cls === "Class 1" ? "30 September 2026" : "31 July 2026";
            return `<span style="color: var(--primary); font-weight: 700;">${cls}</span> <span style="font-size: 0.85rem; color: var(--text-muted);">(${clsAge.years}y ${clsAge.months}m ${clsAge.days}d as on ${clsCutoff})</span>`;
          });
          alsoEligibleText = `<p style="margin-top: 8px; font-size: 0.95rem; font-weight: 600; color: var(--text-secondary);">
            Also Eligible: ${items.join(", ")}
          </p>`;
        }

        const eligibilityHtml = `
          <div class="eligibility-banner success" style="padding: 14px; border-radius: var(--radius-md); background-color: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2);">
            <div class="eligibility-title-wrapper" style="display: flex; align-items: flex-start; gap: 8px; flex-direction: column;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <i data-lucide="check-circle" style="color: var(--success); width: 20px; height: 20px;"></i>
                <span class="eligibility-badge" style="color: var(--success); font-weight: 700; font-size: 1rem;">Recommended Admission: ${recommended}</span>
              </div>
              <div style="font-size: 0.85rem; color: var(--text-muted); margin-left: 28px; margin-top: -2px;">
                Age: <strong>${recommendedAge.years} Years, ${recommendedAge.months} Months, ${recommendedAge.days} Days</strong> (calculated as on <strong>${recommendedCutoffStr}</strong>)
              </div>
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
    calculateAge: function (dobStr, asOnStr) {
      const dobParts = dobStr.split("-").map(Number);
      const asOnParts = asOnStr.split("-").map(Number);
      return calculateExactAge(
        new Date(dobParts[0], dobParts[1] - 1, dobParts[2]),
        new Date(asOnParts[0], asOnParts[1] - 1, asOnParts[2])
      );
    },
    checkEligibility: function (dob) {
      if (dob instanceof Date) {
        return checkAdmissionEligibility(dob);
      }
      if (typeof dob === "string") {
        const parts = dob.split("-").map(Number);
        return checkAdmissionEligibility(new Date(parts[0], parts[1] - 1, parts[2]));
      }
      return [];
    }
  };
})();
