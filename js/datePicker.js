/**
 * Premium Custom Date Picker Component
 * Supports manual entry auto-formatting, calendar popups (popover on desktop, bottom sheet on mobile),
 * month/year selects, previous/next buttons, escape/outside click closing, dark mode, PWA offline safety.
 */
(function() {
  "use strict";

  const MONTHS_FULL = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const WEEKDAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  class CustomDatePicker {
    constructor(inputElement, options = {}) {
      if (!inputElement) return;
      this.input = inputElement;
      
      // Merge options
      this.options = Object.assign({
        icon: "calendar",
        minYear: 1950,
        maxYear: 2035,
        noFuture: false,
        onSelect: null
      }, options);

      // State variables
      this.selectedDate = null; // Date object representing the picked date
      this.currentViewDate = new Date(); // Month/Year currently viewed in the calendar popup
      this.isOpen = false;

      this.popup = null;
      this.backdrop = null;

      this.init();
    }

    init() {
      this.buildWrapper();
      this.bindInputEvents();
      this.parseInitialValue();
    }

    // Wrap the target input with premium datepicker container controls
    buildWrapper() {
      // 1. Create Wrapper
      const wrapper = document.createElement("div");
      wrapper.className = "custom-datepicker-wrapper";
      
      // Place wrapper in same position as input
      this.input.parentNode.insertBefore(wrapper, this.input);
      wrapper.appendChild(this.input);
      
      // Style original input
      this.input.classList.add("custom-datepicker-input");
      this.input.setAttribute("placeholder", "YYYY-MM-DD");
      this.input.setAttribute("autocomplete", "off");
      this.input.setAttribute("type", "text"); // Force text input type for manual typing
      
      // 2. Calendar Trigger Icon Button
      const iconBtn = document.createElement("button");
      iconBtn.type = "button";
      iconBtn.className = "custom-datepicker-icon-btn";
      iconBtn.setAttribute("aria-label", "Open calendar");
      iconBtn.innerHTML = `<i data-lucide="${this.options.icon}"></i>`;
      wrapper.appendChild(iconBtn);

      // 3. Error Container
      const errorDiv = document.createElement("div");
      errorDiv.className = "custom-datepicker-error hidden";
      wrapper.appendChild(errorDiv);

      this.wrapper = wrapper;
      this.iconBtn = iconBtn;
      this.errorDiv = errorDiv;

      // Update newly appended lucide icon if present
      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
      }
    }

    // Auto-formats input content as user types YYYY-MM-DD
    formatInput(val) {
      // Extract numbers only
      const digits = val.replace(/\D/g, "").slice(0, 8);
      let formatted = "";
      
      if (digits.length > 0) {
        formatted += digits.slice(0, 4);
      }
      if (digits.length > 4) {
        formatted += "-" + digits.slice(4, 6);
      }
      if (digits.length > 6) {
        formatted += "-" + digits.slice(6, 8);
      }
      return formatted;
    }

    // Hard/Soft Validation of manual string entry
    validateInput(showError = true) {
      const val = this.input.value.trim();
      
      if (!val) {
        this.selectedDate = null;
        this.clearError();
        if (this.options.onSelect) {
          this.options.onSelect(null);
        }
        return true;
      }

      // Check YYYY-MM-DD format strictly
      const formatRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!formatRegex.test(val)) {
        this.selectedDate = null;
        if (showError) {
          this.showError("Format must be YYYY-MM-DD.");
        }
        return false;
      }

      const parts = val.split("-").map(Number);
      const year = parts[0];
      const monthIdx = parts[1] - 1;
      const day = parts[2];

      const testDate = new Date(year, monthIdx, day);
      if (!this.isDateAllowed(testDate) || testDate.getFullYear() !== year || testDate.getMonth() !== monthIdx || testDate.getDate() !== day) {
        this.selectedDate = null;
        if (showError) {
          if (year < this.options.minYear || year > this.options.maxYear) {
            this.showError(`Year must be between ${this.options.minYear} and ${this.options.maxYear}.`);
          } else if (this.options.noFuture && testDate > new Date()) {
            this.showError("Date cannot be in the future.");
          } else {
            this.showError("Invalid calendar date.");
          }
        }
        return false;
      }

      // Successful validation
      this.selectedDate = testDate;
      this.clearError();
      if (this.options.onSelect) {
        this.options.onSelect(this.selectedDate);
      }
      return true;
    }

    isDateAllowed(dateObj) {
      const y = dateObj.getFullYear();
      if (y < this.options.minYear || y > this.options.maxYear) return false;
      
      if (this.options.noFuture) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (dateObj > today) return false;
      }
      
      return true;
    }

    showError(msg) {
      this.errorDiv.innerHTML = `<i data-lucide="alert-circle" style="width: 14px; height: 14px;"></i><span>${msg}</span>`;
      this.errorDiv.classList.remove("hidden");
      this.input.style.borderColor = "var(--danger)";
      
      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
      }
    }

    clearError() {
      this.errorDiv.innerHTML = "";
      this.errorDiv.classList.add("hidden");
      this.input.style.borderColor = "";
    }

    parseInitialValue() {
      if (this.input.value) {
        this.validateInput(false);
      }
    }

    bindInputEvents() {
      // 1. Format input on typing
      this.input.addEventListener("input", (e) => {
        if (e.inputType === "deleteContentBackward") {
          this.validateInput(false); // Validate silently on deletion
          return;
        }

        const cursor = this.input.selectionStart;
        const oldLen = this.input.value.length;
        
        const formatted = this.formatInput(this.input.value);
        this.input.value = formatted;
        
        const newLen = formatted.length;
        this.input.setSelectionRange(cursor + (newLen - oldLen), cursor + (newLen - oldLen));
        
        this.validateInput(false); // Validate silently as they type
      });

      // 2. Validate strictly on blur
      this.input.addEventListener("blur", () => {
        this.validateInput(true);
      });

      // 3. Open calendar on clicking anywhere in wrapper, input, or icon
      this.input.addEventListener("click", (e) => {
        e.stopPropagation();
        this.open();
      });

      this.iconBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.open();
      });

      // Keyboard navigation - Tab out, Escape to close, Enter to submit
      this.input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          this.close();
        }
      });
    }

    // Open datepicker popup
    open() {
      if (this.isOpen) return;
      this.isOpen = true;

      // Sync calendar view month with selected date, or today
      this.currentViewDate = this.selectedDate ? new Date(this.selectedDate) : new Date();

      this.buildPopup();
      this.render();

      // Click outside listener
      this.clickOutsideHandler = (e) => {
        if (this.popup && !this.wrapper.contains(e.target) && !this.popup.contains(e.target)) {
          this.close();
        }
      };
      document.addEventListener("click", this.clickOutsideHandler);

      // Escape key listener
      this.escKeyHandler = (e) => {
        if (e.key === "Escape") this.close();
      };
      document.addEventListener("keydown", this.escKeyHandler);
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;

      document.removeEventListener("click", this.clickOutsideHandler);
      document.removeEventListener("keydown", this.escKeyHandler);

      // Restore scroll bars on mobile
      if (this.isMobile()) {
        document.body.style.overflow = "";
      }

      if (this.popup) {
        if (this.isMobile()) {
          this.popup.classList.remove("active");
          if (this.backdrop) this.backdrop.classList.remove("active");
          
          setTimeout(() => {
            if (this.popup && this.popup.parentNode) this.popup.parentNode.removeChild(this.popup);
            if (this.backdrop && this.backdrop.parentNode) this.backdrop.parentNode.removeChild(this.backdrop);
            this.popup = null;
            this.backdrop = null;
          }, 350); // slide out animation duration
        } else {
          if (this.popup.parentNode) this.popup.parentNode.removeChild(this.popup);
          this.popup = null;
        }
      }
    }

    isMobile() {
      return window.innerWidth <= 600;
    }

    // Construct popup elements in DOM (relative popover on desktop, bottom sheet on mobile)
    buildPopup() {
      const isMob = this.isMobile();
      
      const popup = document.createElement("div");
      popup.className = `custom-datepicker-popup ${isMob ? 'mobile-sheet' : 'desktop-popup'}`;
      
      if (isMob) {
        // Prevent background page movement during mobile display
        document.body.style.overflow = "hidden";

        // Create backdrop lock
        const backdrop = document.createElement("div");
        backdrop.className = "custom-datepicker-backdrop";
        document.body.appendChild(backdrop);
        document.body.appendChild(popup);
        
        // Trigger reflow for slide animations
        void backdrop.offsetWidth;
        void popup.offsetWidth;
        
        backdrop.classList.add("active");
        popup.classList.add("active");

        backdrop.addEventListener("click", () => this.close());
        backdrop.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

        this.backdrop = backdrop;
      } else {
        this.wrapper.appendChild(popup);
      }

      this.popup = popup;
      this.popup.addEventListener("click", (e) => e.stopPropagation()); // prevent immediate wrapper closing
    }

    // Render entire calendar structure
    render() {
      if (!this.popup) return;

      this.popup.innerHTML = `
        <div class="picker-header">
          <button type="button" class="picker-nav-btn prev-month" aria-label="Previous Month">
            <i data-lucide="chevron-left"></i>
          </button>
          <div class="picker-dropdowns">
            <select class="picker-select select-month" aria-label="Select Month"></select>
            <select class="picker-select select-year" aria-label="Select Year"></select>
          </div>
          <button type="button" class="picker-nav-btn next-month" aria-label="Next Month">
            <i data-lucide="chevron-right"></i>
          </button>
        </div>
        <div class="picker-weekdays">
          ${WEEKDAYS_SHORT.map(wd => `<div class="picker-weekday">${wd}</div>`).join("")}
        </div>
        <div class="picker-days"></div>
        <div class="picker-footer">
          <button type="button" class="picker-footer-btn btn-today">Today</button>
          <button type="button" class="picker-footer-btn btn-clear">Clear</button>
        </div>
      `;

      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
      }

      this.daysContainer = this.popup.querySelector(".picker-days");
      this.bindPopupControls();
      this.populateDropdowns();
      this.renderDays();
    }

    bindPopupControls() {
      const prevBtn = this.popup.querySelector(".prev-month");
      const nextBtn = this.popup.querySelector(".next-month");
      const monthSelect = this.popup.querySelector(".select-month");
      const yearSelect = this.popup.querySelector(".select-year");
      const todayBtn = this.popup.querySelector(".btn-today");
      const clearBtn = this.popup.querySelector(".btn-clear");

      prevBtn.addEventListener("click", () => this.changeMonth(-1));
      nextBtn.addEventListener("click", () => this.changeMonth(1));

      monthSelect.addEventListener("change", (e) => {
        const newMonth = parseInt(e.target.value, 10);
        this.changeViewMonth(newMonth);
      });

      yearSelect.addEventListener("change", (e) => {
        const newYear = parseInt(e.target.value, 10);
        this.changeViewYear(newYear);
      });

      todayBtn.addEventListener("click", () => {
        const today = new Date();
        this.selectDate(today);
      });

      clearBtn.addEventListener("click", () => {
        this.input.value = "";
        this.selectedDate = null;
        this.clearError();
        if (this.options.onSelect) {
          this.options.onSelect(null);
        }
        this.close();
      });
    }

    populateDropdowns() {
      const monthSelect = this.popup.querySelector(".select-month");
      const yearSelect = this.popup.querySelector(".select-year");

      // Months dropdown
      monthSelect.innerHTML = MONTHS_FULL.map((m, idx) => 
        `<option value="${idx}">${m.slice(0, 3)}</option>`
      ).join("");
      monthSelect.value = this.currentViewDate.getMonth();

      // Years dropdown
      let yearOptions = "";
      for (let y = this.options.minYear; y <= this.options.maxYear; y++) {
        yearOptions += `<option value="${y}">${y}</option>`;
      }
      yearSelect.innerHTML = yearOptions;
      yearSelect.value = this.currentViewDate.getFullYear();
    }

    // Preserve Date when Year is changed independently
    changeViewYear(newYear) {
      this.currentViewDate.setFullYear(newYear);
      
      if (this.selectedDate) {
        let y = newYear;
        let m = this.selectedDate.getMonth();
        let d = this.selectedDate.getDate();

        // Cap day at max days for that specific month and year
        const maxDays = new Date(y, m + 1, 0).getDate();
        if (d > maxDays) {
          d = maxDays;
        }

        const newDate = new Date(y, m, d);
        if (this.isDateAllowed(newDate)) {
          this.selectedDate = newDate;
          this.updateInputValue(newDate);
        }
      }

      const yearSelect = this.popup.querySelector(".select-year");
      if (yearSelect) yearSelect.value = this.currentViewDate.getFullYear();

      this.renderDays();
    }

    // Preserve Date when Month is changed independently
    changeViewMonth(newMonthIdx) {
      this.currentViewDate.setMonth(newMonthIdx);

      if (this.selectedDate) {
        let y = this.selectedDate.getFullYear();
        let m = newMonthIdx;
        let d = this.selectedDate.getDate();

        // Cap day at max days for that specific month and year
        const maxDays = new Date(y, m + 1, 0).getDate();
        if (d > maxDays) {
          d = maxDays;
        }

        const newDate = new Date(y, m, d);
        if (this.isDateAllowed(newDate)) {
          this.selectedDate = newDate;
          this.updateInputValue(newDate);
        }
      }

      const monthSelect = this.popup.querySelector(".select-month");
      if (monthSelect) monthSelect.value = this.currentViewDate.getMonth();

      this.renderDays();
    }

    // Preserve Date when clicking left/right navigation arrows
    changeMonth(delta) {
      const currentY = this.currentViewDate.getFullYear();
      const currentM = this.currentViewDate.getMonth();
      
      const targetDate = new Date(currentY, currentM + delta, 1);
      const targetYear = targetDate.getFullYear();
      const targetMonth = targetDate.getMonth();

      if (targetYear < this.options.minYear || targetYear > this.options.maxYear) return;

      this.currentViewDate.setFullYear(targetYear);
      this.currentViewDate.setMonth(targetMonth);

      if (this.selectedDate) {
        let y = targetYear;
        let m = targetMonth;
        let d = this.selectedDate.getDate();

        const maxDays = new Date(y, m + 1, 0).getDate();
        if (d > maxDays) {
          d = maxDays;
        }

        const newDate = new Date(y, m, d);
        if (this.isDateAllowed(newDate)) {
          this.selectedDate = newDate;
          this.updateInputValue(newDate);
        }
      }

      const monthSelect = this.popup.querySelector(".select-month");
      const yearSelect = this.popup.querySelector(".select-year");
      if (monthSelect) monthSelect.value = this.currentViewDate.getMonth();
      if (yearSelect) yearSelect.value = this.currentViewDate.getFullYear();

      this.renderDays();
    }

    // Render cells of calendar grid
    renderDays() {
      const year = this.currentViewDate.getFullYear();
      const month = this.currentViewDate.getMonth();

      this.daysContainer.innerHTML = "";

      // Day Index of 1st day (0=Sunday ... 6=Saturday)
      const firstDayIndex = new Date(year, month, 1).getDay();
      
      // Total days in current month
      const totalDays = new Date(year, month + 1, 0).getDate();
      
      // Total days in previous month
      const prevMonthTotalDays = new Date(year, month, 0).getDate();

      // 1. Render Previous Month Days (Grayed out)
      for (let i = firstDayIndex - 1; i >= 0; i--) {
        const dayNum = prevMonthTotalDays - i;
        const cellDate = new Date(year, month - 1, dayNum);
        const cell = this.createDayCell(dayNum, "other-month", cellDate);
        this.daysContainer.appendChild(cell);
      }

      // 2. Render Current Month Days
      const today = new Date();
      for (let i = 1; i <= totalDays; i++) {
        let className = "";
        const cellDate = new Date(year, month, i);

        // Check if date is today
        if (cellDate.getFullYear() === today.getFullYear() &&
            cellDate.getMonth() === today.getMonth() &&
            cellDate.getDate() === today.getDate()) {
          className += " today";
        }

        // Check if date is selected
        if (this.selectedDate &&
            cellDate.getFullYear() === this.selectedDate.getFullYear() &&
            cellDate.getMonth() === this.selectedDate.getMonth() &&
            cellDate.getDate() === this.selectedDate.getDate()) {
          className += " selected";
        }

        const cell = this.createDayCell(i, className, cellDate);
        this.daysContainer.appendChild(cell);
      }

      // 3. Render Next Month Days (Grayed out)
      const totalRendered = firstDayIndex + totalDays;
      const remainingCells = totalRendered <= 35 ? 35 - totalRendered : 42 - totalRendered;
      
      for (let i = 1; i <= remainingCells; i++) {
        const cellDate = new Date(year, month + 1, i);
        const cell = this.createDayCell(i, "other-month", cellDate);
        this.daysContainer.appendChild(cell);
      }
    }

    createDayCell(dayNum, className, dateObj) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `picker-day ${className}`;
      cell.textContent = dayNum;

      // Handle disabled bounds
      const isPastMin = dateObj.getFullYear() > this.options.minYear || 
                        (dateObj.getFullYear() === this.options.minYear && dateObj.getMonth() >= 0);
      const isFutureMax = dateObj.getFullYear() < this.options.maxYear || 
                         (dateObj.getFullYear() === this.options.maxYear && dateObj.getMonth() <= 11);
      
      let isDisabled = !isPastMin || !isFutureMax;
      
      if (this.options.noFuture) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (dateObj > today) isDisabled = true;
      }

      if (isDisabled) {
        cell.classList.add("disabled");
        cell.setAttribute("disabled", "true");
      } else {
        cell.addEventListener("click", () => this.selectDate(dateObj));
      }

      return cell;
    }

    selectDate(dateObj) {
      this.selectedDate = dateObj;
      this.updateInputValue(dateObj);
      this.close();
    }

    updateInputValue(dateObj) {
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, "0");
      const d = String(dateObj.getDate()).padStart(2, "0");
      
      this.input.value = `${y}-${m}-${d}`;
      this.clearError();

      if (this.options.onSelect) {
        this.options.onSelect(dateObj);
      }
    }
  }

  // Export to global namespace
  window.CustomDatePicker = CustomDatePicker;
})();
