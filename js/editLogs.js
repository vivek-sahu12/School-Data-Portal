/**
 * School Edit History Logs Module
 * Handles loading, parsing, and rendering of audit edit history,
 * with search and filtering, and detailed change comparisons.
 */
(function () {
  "use strict";

  // State variables
  let currentLogs = [];
  let filteredLogs = [];

  let activeFilters = {
    search: "",
    class: "",
    action: "",
    startDate: "",
    endDate: ""
  };

  let startPicker = null;
  let endPicker = null;
  let totalCard = null;
  let todayCard = null;
  let weekCard = null;

  function setActiveCard(activeId) {
    if (totalCard) totalCard.classList.remove("active-total");
    if (todayCard) todayCard.classList.remove("active-today");
    if (weekCard) weekCard.classList.remove("active-week");

    if (activeId === "total") {
      if (totalCard) totalCard.classList.add("active-total");
    } else if (activeId === "today") {
      if (todayCard) todayCard.classList.add("active-today");
    } else if (activeId === "week") {
      if (weekCard) weekCard.classList.add("active-week");
    }
  }

  // Custom debounce helper to guarantee self-containment
  const debounce = (func, delay) => {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => func.apply(this, args), delay);
    };
  };

  // Safe JSON Parser
  function parseJSONField(val) {
    if (!val) return null;
    if (typeof val === "object") return val;
    try {
      return JSON.parse(val.trim());
    } catch (e) {
      return null;
    }
  }

  // Format date helper
  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Toggle Edit Logs navigation based on current school permissions
  window.updateEditLogsVisibility = function () {
    const school = typeof getCurrentSchool === "function" ? getCurrentSchool() : null;
    const isEditable = school && window.isEditAllowed(school.editable);

    const navBtn = document.getElementById("nav-edit-logs");
    const drawerBtn = document.getElementById("drawer-edit-logs");

    if (isEditable) {
      if (navBtn) navBtn.classList.remove("hidden");
      if (drawerBtn) drawerBtn.classList.remove("hidden");
    } else {
      if (navBtn) navBtn.classList.add("hidden");
      if (drawerBtn) drawerBtn.classList.add("hidden");

      // Redirect to dashboard if trying to access unauthorized
      if (window.currentActiveTab === "edit-logs") {
        setTimeout(() => {
          if (typeof window.navigateToTab === "function") {
            window.navigateToTab("dashboard");
          }
        }, 0);
      }
    }

    // Toggle Add Student navigation based on current school permissions
    const isAddAllowed = school && (typeof window.isAdminViewingSession === "function" && window.isAdminViewingSession() || String(window.findValueIgnoreCaseAndSpaces(school, "add") || "").trim() === "Yes");
    const addNavBtn = document.getElementById("nav-add-student");
    const addDrawerBtn = document.getElementById("drawer-add-student");

    if (isAddAllowed) {
      if (addNavBtn) addNavBtn.classList.remove("hidden");
      if (addDrawerBtn) addDrawerBtn.classList.remove("hidden");
    } else {
      if (addNavBtn) addNavBtn.classList.add("hidden");
      if (addDrawerBtn) addDrawerBtn.classList.add("hidden");

      // Redirect to dashboard if trying to access unauthorized Add Student tab
      if (window.currentActiveTab === "add-student") {
        setTimeout(() => {
          if (typeof window.navigateToTab === "function") {
            window.navigateToTab("dashboard");
          }
        }, 0);
      }
    }
  };

  // Look up student PEN from all worksheets
  function findStudentPen(data, rowUid, scholarNo, classVal, studentName) {
    const allStudents = [];
    const sheetKeys = ["School Data"];
    sheetKeys.forEach(key => {
      if (Array.isArray(data[key])) {
        allStudents.push(...data[key]);
      }
    });

    // 1. Try matching by rowUid first
    if (rowUid) {
      const student = allStudents.find(s => {
        const sUid = window.findValueIgnoreCaseAndSpaces(s, 'row_uid') || window.findValueIgnoreCaseAndSpaces(s, 'rowuid');
        return sUid && String(sUid).trim() === String(rowUid).trim();
      });
      if (student) {
        const pen = window.findValueIgnoreCaseAndSpaces(student, 'pen');
        if (pen !== undefined && pen !== null) return String(pen).trim();
      }
    }
    // 2. Fallback to matching by Scholar No and Class
    if (scholarNo || classVal || studentName) {
      const student = allStudents.find(s => {
        const sSch = window.findValueIgnoreCaseAndSpaces(s, 'scholar_no') || window.findValueIgnoreCaseAndSpaces(s, 'scholarno') || window.findValueIgnoreCaseAndSpaces(s, 'scholar no');
        const sCls = window.findValueIgnoreCaseAndSpaces(s, 'class');
        const sName = window.findValueIgnoreCaseAndSpaces(s, 'name') || window.findValueIgnoreCaseAndSpaces(s, 'student_name') || window.findValueIgnoreCaseAndSpaces(s, 'studentname') || window.findValueIgnoreCaseAndSpaces(s, 'student name');

        let match = true;
        if (scholarNo && sSch && String(sSch).trim() !== String(scholarNo).trim()) match = false;
        if (classVal && sCls && String(sCls).trim().toLowerCase() !== String(classVal).trim().toLowerCase()) match = false;
        if (studentName && sName && String(sName).trim().toLowerCase() !== String(studentName).trim().toLowerCase()) match = false;
        return match;
      });
      if (student) {
        const pen = window.findValueIgnoreCaseAndSpaces(student, 'pen');
        if (pen !== undefined && pen !== null) return String(pen).trim();
      }
    }
    return "";
  }

  // Initialization: Called by renderAppComponents in dataFetch.js
  window.initEditLogs = function (data) {
    if (!data) return;

    // Read Edit_log from fetched sheet dataset
    const rawLogs = data["Edit_log"] || data["Edit_logs"] || [];

    try {
      currentLogs = rawLogs.map(log => {
        const parsedFields = parseJSONField(log.Changed_Fields || log.changed_fields);
        const parsedPrev = parseJSONField(log.Previous_Values || log.previous_values);
        const parsedNew = parseJSONField(log.New_Values || log.new_values);

        const rUid = log.Row_UID || log.Row_uid || log.row_uid || log.rowUid || "";
        const sNo = log["Scholar No"] || log["Scholar NO"] || log.Scholar_No || log.scholar_no || log.Scholar_no || "";
        const cVal = log.Class || log.class || "";
        const sName = log.Student_Name || log.student_name || log.Student_name || "";

        const penVal = findStudentPen(data, rUid, sNo, cVal, sName);

        return {
          timestamp: log.Timestamp || log.timestamp || "",
          userId: log.User_ID || log.User_id || log.user_id || log.userId || "",
          rowUid: rUid,
          classVal: cVal,
          scholarNo: sNo,
          studentName: sName,
          actionType: log.Action_Type || log.action_type || log.Action_type || "",
          changedFields: parsedFields,
          previousValues: parsedPrev,
          newValues: parsedNew,
          pen: penVal,
          raw: log
        };
      });

      // Merge with pending local queue
      if (typeof getPendingQueue === "function") {
        const queue = getPendingQueue();
        if (queue && queue.length > 0) {
          queue.forEach(qItem => {
            let sName = "", cVal = "", sNo = "", parsedFields = [], parsedPrev = {}, parsedNew = {};
            
            if (qItem.action === "add" && qItem.data) {
              sName = qItem.data["Student Name"] || qItem.data["Name"] || "";
              cVal = qItem.data["Class"] || "";
              sNo = qItem.data["Scholar No"] || qItem.data["Scholar NO"] || "";
              parsedFields = Object.keys(qItem.data);
              parsedNew = qItem.data;
            } else {
              const sd = data["School Data"] || [];
              const student = sd.find(r => r.row_uid === qItem.row_uid);
              if (student) {
                sName = student["Student Name"] || student["Name"] || "";
                cVal = student["Class"] || "";
                sNo = student["Scholar No"] || student["Scholar NO"] || "";
              }
              if (qItem.action === "edit" && qItem.changedFields) {
                parsedFields = Object.keys(qItem.changedFields);
                for (const k in qItem.changedFields) {
                  parsedPrev[k] = qItem.changedFields[k].old;
                  parsedNew[k] = qItem.changedFields[k].new;
                }
              }
            }

            let actionLabel = "EDIT";
            if (qItem.action === "add") actionLabel = "ADD";
            if (qItem.action === "delete") actionLabel = "DELETE";

            currentLogs.push({
              timestamp: new Date(qItem.timestamp).toISOString(),
              userId: qItem.userId || "",
              rowUid: qItem.row_uid,
              classVal: cVal,
              scholarNo: sNo,
              studentName: sName,
              actionType: actionLabel,
              changedFields: parsedFields,
              previousValues: parsedPrev,
              newValues: parsedNew,
              pen: findStudentPen(data, qItem.row_uid, sNo, cVal, sName),
              raw: qItem,
              isPending: true
            });
          });
        }
      }

      // Sort by timestamp descending (newest changes first)
      currentLogs.sort((a, b) => {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      });
    } catch (err) {
      console.error("Error processing edit logs:", err);
      currentLogs = [];
    }

    populateClassFilter();
    applyFilters();
    renderStats();
  };

  // Populate Class filter dropdown dynamically based on logged data classes
  function populateClassFilter() {
    const classSelect = document.getElementById("edit-logs-class-select");
    if (!classSelect) return;

    const prevVal = classSelect.value;
    const classes = new Set();

    currentLogs.forEach(log => {
      if (log.classVal) {
        classes.add(log.classVal.toString().trim());
      }
    });

    classSelect.innerHTML = '<option value="">All Classes</option>';
    const sorted = typeof window.sortClasses === "function"
      ? window.sortClasses(Array.from(classes))
      : Array.from(classes).sort();

    sorted.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = /^\d+$/.test(c) ? `Class ${c}` : c;
      classSelect.appendChild(opt);
    });

    if (prevVal && Array.from(classSelect.options).some(o => o.value === prevVal)) {
      classSelect.value = prevVal;
    }
  }

  // Calculate and populate overview stat cards
  function renderStats() {
    const totalEl = document.getElementById("edit-logs-total-count");
    const todayEl = document.getElementById("edit-logs-today-count");
    const weekEl = document.getElementById("edit-logs-week-count");

    const total = currentLogs.length;
    let todayCount = 0;
    let weekCount = 0;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

    currentLogs.forEach(log => {
      if (!log.timestamp) return;
      const time = new Date(log.timestamp).getTime();
      if (isNaN(time)) return;

      if (time >= startOfToday) {
        todayCount++;
      }
      if (time >= sevenDaysAgo) {
        weekCount++;
      }
    });

    if (totalEl) totalEl.textContent = total;
    if (todayEl) todayEl.textContent = todayCount;
    if (weekEl) weekEl.textContent = weekCount;
  }

  // Combine and apply search, class, action, and date filters client-side
  function applyFilters() {
    const loader = document.getElementById("edit-logs-loading");
    const tableCard = document.getElementById("edit-logs-table-card");

    if (loader) loader.classList.remove("hidden");

    setTimeout(() => {
      const search = activeFilters.search.toLowerCase().trim();
      const classVal = activeFilters.class;
      const action = activeFilters.action;
      const startDate = activeFilters.startDate;
      const endDate = activeFilters.endDate;

      const startMs = startDate ? new Date(startDate + "T00:00:00").getTime() : null;
      const endMs = endDate ? new Date(endDate + "T23:59:59").getTime() : null;

      filteredLogs = currentLogs.filter(log => {
        // 1. Class Filter
        if (classVal && log.classVal !== classVal) return false;

        // 2. Action Type Filter
        if (action && log.actionType !== action) return false;

        // 3. Search Filter (Name, Scholar No, User ID)
        if (search) {
          const name = log.studentName.toLowerCase();
          const scholar = log.scholarNo.toString().toLowerCase();
          const user = log.userId.toLowerCase();
          if (!name.includes(search) && !scholar.includes(search) && !user.includes(search)) {
            return false;
          }
        }

        // 4. Date Range Filters
        if (log.timestamp) {
          const logTime = new Date(log.timestamp).getTime();
          if (!isNaN(logTime)) {
            if (startMs && logTime < startMs) return false;
            if (endMs && logTime > endMs) return false;
          } else {
            if (startMs || endMs) return false;
          }
        } else if (startMs || endMs) {
          return false;
        }

        return true;
      });

      renderTable();
      if (loader) loader.classList.add("hidden");
    }, 50);
  }

  // Render Table content dynamically
  function renderTable() {
    const tbody = document.getElementById("edit-logs-table-body");
    const emptyState = document.getElementById("edit-logs-empty-state");
    const rowCountEl = document.getElementById("edit-logs-row-count");

    if (!tbody) return;
    tbody.innerHTML = "";

    if (rowCountEl) {
      rowCountEl.textContent = `Showing ${filteredLogs.length} rows`;
    }

    if (filteredLogs.length === 0) {
      if (emptyState) emptyState.classList.remove("hidden");
      return;
    } else {
      if (emptyState) emptyState.classList.add("hidden");
    }

    filteredLogs.forEach(log => {
      const tr = document.createElement("tr");

      // Format Timestamp
      let formattedTime = log.timestamp;
      try {
        const d = new Date(log.timestamp);
        if (!isNaN(d.getTime())) {
          const pad = (n) => String(n).padStart(2, "0");
          formattedTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
      } catch (e) { }

      // Action badges with modern styling colors
      let badgeStyle = "background-color: rgba(59, 130, 246, 0.15); color: #3b82f6;"; // default EDIT
      if (log.actionType === "ADD") {
        badgeStyle = "background-color: rgba(16, 185, 129, 0.15); color: #10b981;";
      } else if (log.actionType === "DELETE") {
        badgeStyle = "background-color: rgba(239, 68, 68, 0.15); color: #ef4444;";
      }

      const actionText = log.actionType
        ? `<span style="padding: 4px 8px; border-radius: var(--radius-sm); font-size: 0.75rem; font-weight: 700; ${badgeStyle}">${log.actionType}</span>`
        : "-";

      let pendingBadge = "";
      if (log.isPending) {
        pendingBadge = `<span class="pending-sync-badge" style="display: inline-flex; align-items: center; margin-left: 8px; padding: 2px 6px; font-size: 10px; font-weight: bold; background-color: var(--warning); color: var(--bg-surface); border-radius: 4px;"><i data-lucide="refresh-cw" style="width: 10px; height: 10px; margin-right: 3px;"></i>Pending Sync</span>`;
      }

      tr.innerHTML = `
        <td>${formattedTime || "-"}</td>
        <td class="hide-on-mobile">${log.pen || "-"}</td>
        <td class="hide-on-mobile">${log.classVal || "-"}</td>
        <td class="hide-on-mobile">${log.scholarNo || "-"}</td>
        <td style="font-weight: 600; color: var(--text-primary);">${log.studentName || "-"}${pendingBadge}</td>
        <td class="hide-on-mobile">${actionText}</td>
        <td style="text-align: center;">
          <button type="button" class="btn-secondary view-detail-btn" style="height: 32px; padding: 0 12px; font-size: 0.8rem;">View</button>
        </td>
      `;

      const viewBtn = tr.querySelector(".view-detail-btn");
      if (viewBtn) {
        viewBtn.addEventListener("click", () => showDetailModal(log));
      }

      tbody.appendChild(tr);
    });

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // Open Edit Log Details Modal showing comparison grids
  function showDetailModal(log) {
    const modal = document.getElementById("edit-log-detail-modal");
    const body = document.getElementById("edit-log-modal-body");
    if (!modal || !body) return;

    // Build header metadata info (No Row_UID rendered anywhere)
    let metaHtml = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; padding: 14px; background-color: var(--bg-surface-hover); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
        <div><span style="color: var(--text-muted); font-size: 0.8rem; font-weight: 600; text-transform: uppercase; display: block; margin-bottom: 2px;">Student Name</span><strong style="color: var(--text-primary);">${log.studentName || "-"}</strong></div>
        <div><span style="color: var(--text-muted); font-size: 0.8rem; font-weight: 600; text-transform: uppercase; display: block; margin-bottom: 2px;">Scholar No</span><strong style="color: var(--text-primary);">${log.scholarNo || "-"}</strong></div>
        <div><span style="color: var(--text-muted); font-size: 0.8rem; font-weight: 600; text-transform: uppercase; display: block; margin-bottom: 2px;">Class</span><strong style="color: var(--text-primary);">${log.classVal || "-"}</strong></div>
        <div><span style="color: var(--text-muted); font-size: 0.8rem; font-weight: 600; text-transform: uppercase; display: block; margin-bottom: 2px;">PEN</span><strong style="color: var(--text-primary);">${log.pen || "-"}</strong></div>
      </div>
    `;

    // Process and compare changes
    let keys = [];
    if (Array.isArray(log.changedFields)) {
      keys = log.changedFields;
    } else if (log.changedFields && typeof log.changedFields === "object") {
      keys = Object.keys(log.changedFields);
    }

    if (keys.length === 0) {
      const prevKeys = log.previousValues && typeof log.previousValues === "object" ? Object.keys(log.previousValues) : [];
      const newKeys = log.newValues && typeof log.newValues === "object" ? Object.keys(log.newValues) : [];
      keys = Array.from(new Set([...prevKeys, ...newKeys]));
    }

    // Filter out internal Row_UID from keys entirely
    keys = keys.filter(k => {
      const norm = k.toLowerCase().trim();
      return norm !== "row_uid" && norm !== "row-uid" && norm !== "row uid" && norm !== "rowuid";
    });

    let changesHtml = "";
    if (keys.length > 0) {
      const isMobile = window.innerWidth <= 768;

      if (!isMobile) {
        // Desktop version: Table format
        changesHtml = `
          <h4 style="margin-bottom: 10px; font-weight: 700; color: var(--text-primary);">Field Modifications</h4>
          <div class="desktop-only-modifications table-responsive" style="border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden;">
            <table class="data-table" style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: var(--bg-surface-hover); border-bottom: 1px solid var(--border-color);">
                  <th style="text-align: left; padding: 10px 12px; font-size: 0.85rem; color: var(--text-muted);">Field</th>
                  <th style="text-align: left; padding: 10px 12px; font-size: 0.85rem; color: var(--text-muted);">Previous Value</th>
                  <th style="text-align: left; padding: 10px 12px; font-size: 0.85rem; color: var(--text-muted);">New Value</th>
                </tr>
              </thead>
              <tbody>
        `;

        keys.forEach(k => {
          const oldVal = (log.previousValues && log.previousValues[k] !== undefined) ? log.previousValues[k] : "-";
          const newVal = (log.newValues && log.newValues[k] !== undefined) ? log.newValues[k] : "-";

          changesHtml += `
            <tr style="border-bottom: 1px solid var(--border-color);">
              <td style="padding: 12px; font-weight: 600; font-size: 0.85rem; color: var(--text-primary);">${k}</td>
              <td style="padding: 12px; font-size: 0.85rem; color: #ef4444; background-color: rgba(239, 68, 68, 0.04);">${oldVal}</td>
              <td style="padding: 12px; font-size: 0.85rem; color: #10b981; background-color: rgba(16, 185, 129, 0.04);">${newVal}</td>
            </tr>
          `;
        });

        changesHtml += `
              </tbody>
            </table>
          </div>
        `;
      } else {
        // Mobile version: Stacked list format
        changesHtml = `
          <h4 style="margin-bottom: 10px; font-weight: 700; color: var(--text-primary);">Field Modifications</h4>
          <div class="mobile-only-modifications" style="display: flex; flex-direction: column; gap: 12px;">
        `;

        keys.forEach(k => {
          const oldVal = (log.previousValues && log.previousValues[k] !== undefined) ? log.previousValues[k] : "-";
          const newVal = (log.newValues && log.newValues[k] !== undefined) ? log.newValues[k] : "-";

          changesHtml += `
            <div style="background-color: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px; display: flex; flex-direction: column; gap: 8px;">
              <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 6px; margin-bottom: 4px;">
                ${k}
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8rem;">
                <div style="background-color: rgba(239, 68, 68, 0.06); border: 1px dashed rgba(239, 68, 68, 0.3); border-radius: var(--radius-sm); padding: 6px 8px; color: #ef4444;">
                  <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); display: block; margin-bottom: 2px;">Before</span>
                  <strong style="word-break: break-word;">${oldVal}</strong>
                </div>
                <div style="background-color: rgba(16, 185, 129, 0.06); border: 1px dashed rgba(16, 185, 129, 0.3); border-radius: var(--radius-sm); padding: 6px 8px; color: #10b981;">
                  <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); display: block; margin-bottom: 2px;">After</span>
                  <strong style="word-break: break-word;">${newVal}</strong>
                </div>
              </div>
            </div>
          `;
        });

        changesHtml += `
          </div>
        `;
      }
    } else {
      changesHtml = `
        <div style="padding: 16px; background-color: var(--bg-surface-hover); border-radius: var(--radius-md); border: 1px solid var(--border-color); text-align: center; color: var(--text-secondary); font-size: 0.9rem;">
          <i data-lucide="info" style="width: 24px; height: 24px; margin-bottom: 6px; color: var(--text-muted);"></i>
          <p>No structured field level changes were recorded for this log entry.</p>
        </div>
      `;
    }

    body.innerHTML = metaHtml + changesHtml;

    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }

    modal.classList.remove("hidden");
  }

  // Bind dropdowns, reset button, search filter inputs, and detail modal clicks
  function bindFilterEvents() {
    const searchInput = document.getElementById("edit-logs-search-input");
    const classSelect = document.getElementById("edit-logs-class-select");
    const actionSelect = document.getElementById("edit-logs-action-select");
    const startDateInput = document.getElementById("edit-logs-start-date");
    const endDateInput = document.getElementById("edit-logs-end-date");
    const resetBtn = document.getElementById("edit-logs-reset-btn");

    if (searchInput) {
      searchInput.addEventListener("input", debounce((e) => {
        activeFilters.search = e.target.value;
        applyFilters();
      }, 250));
    }

    if (classSelect) {
      classSelect.addEventListener("change", (e) => {
        activeFilters.class = e.target.value;
        applyFilters();
      });
    }

    if (actionSelect) {
      classSelect.value = "";
      actionSelect.addEventListener("change", (e) => {
        activeFilters.action = e.target.value;
        applyFilters();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        if (classSelect) classSelect.value = "";
        if (actionSelect) actionSelect.value = "";
        if (startDateInput) startDateInput.value = "";
        if (endDateInput) endDateInput.value = "";

        if (startPicker) startPicker.selectedDate = null;
        if (endPicker) endPicker.selectedDate = null;

        activeFilters = {
          search: "",
          class: "",
          action: "",
          startDate: "",
          endDate: ""
        };

        setActiveCard(null);
        applyFilters();
      });
    }

    // Clickable Overview Metric Cards
    totalCard = document.getElementById("edit-logs-total-card");
    todayCard = document.getElementById("edit-logs-today-card");
    weekCard = document.getElementById("edit-logs-week-card");

    if (totalCard) {
      totalCard.addEventListener("click", () => {
        if (startDateInput) startDateInput.value = "";
        if (endDateInput) endDateInput.value = "";

        activeFilters.startDate = "";
        activeFilters.endDate = "";

        if (startPicker) {
          startPicker.selectedDate = null;
          startPicker.clearError();
        }
        if (endPicker) {
          endPicker.selectedDate = null;
          endPicker.clearError();
        }

        setActiveCard("total");
        applyFilters();
      });
    }

    if (todayCard) {
      todayCard.addEventListener("click", () => {
        const todayStr = formatDate(new Date());
        if (startDateInput) startDateInput.value = todayStr;
        if (endDateInput) endDateInput.value = todayStr;

        activeFilters.startDate = todayStr;
        activeFilters.endDate = todayStr;

        if (startPicker) {
          startPicker.selectedDate = new Date();
          startPicker.clearError();
        }
        if (endPicker) {
          endPicker.selectedDate = new Date();
          endPicker.clearError();
        }

        setActiveCard("today");
        applyFilters();
      });
    }

    if (weekCard) {
      weekCard.addEventListener("click", () => {
        const today = new Date();
        const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const todayStr = formatDate(today);
        const weekStr = formatDate(sevenDaysAgo);

        if (startDateInput) startDateInput.value = weekStr;
        if (endDateInput) endDateInput.value = todayStr;

        activeFilters.startDate = weekStr;
        activeFilters.endDate = todayStr;

        if (startPicker) {
          startPicker.selectedDate = sevenDaysAgo;
          startPicker.clearError();
        }
        if (endPicker) {
          endPicker.selectedDate = today;
          endPicker.clearError();
        }

        setActiveCard("week");
        applyFilters();
      });
    }

    // Modal close listeners
    const modal = document.getElementById("edit-log-detail-modal");
    const closeBtn = document.getElementById("close-edit-log-modal");
    const closeBtn2 = document.getElementById("close-edit-log-modal-btn");

    const closeModal = () => {
      if (modal) modal.classList.add("hidden");
    };

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (closeBtn2) closeBtn2.addEventListener("click", closeModal);
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
      });
    }
  }

  // Initialize CustomDatePicker instances for date range filtering
  function initDatePickers() {
    const startDateInput = document.getElementById("edit-logs-start-date");
    const endDateInput = document.getElementById("edit-logs-end-date");

    if (startDateInput && window.CustomDatePicker) {
      startPicker = new window.CustomDatePicker(startDateInput, {
        icon: "calendar",
        minYear: 2020,
        maxYear: 2035,
        noFuture: true,
        onSelect: function (date) {
          activeFilters.startDate = date ? formatDate(date) : "";
          setActiveCard(null);
          applyFilters();
        }
      });
    }

    if (endDateInput && window.CustomDatePicker) {
      endPicker = new window.CustomDatePicker(endDateInput, {
        icon: "calendar",
        minYear: 2020,
        maxYear: 2035,
        noFuture: true,
        onSelect: function (date) {
          activeFilters.endDate = date ? formatDate(date) : "";
          setActiveCard(null);
          applyFilters();
        }
      });
    }
  }

  // Bind initial DOM hooks
  document.addEventListener("DOMContentLoaded", () => {
    initDatePickers();
    bindFilterEvents();
    window.updateEditLogsVisibility();
  });
})();
