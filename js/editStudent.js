/**
 * js/editStudent.js - Student Edit, Offline Queue, and Synchronization logic
 * Configured specifically for the "School Data" tab.
 */

let isSyncingEdits = false;
let syncIntervalId = null;

// Helpers to manage edit queue
function getPendingQueue() {
  const queueRaw = localStorage.getItem("sdip_pending_edits");
  if (!queueRaw) return [];
  try {
    return JSON.parse(queueRaw);
  } catch (err) {
    return [];
  }
}

function savePendingQueue(queue) {
  localStorage.setItem("sdip_pending_edits", JSON.stringify(queue));
}

// Check if a row has a pending edit (called by tabs.js and universalSearch.js)
window.hasPendingEdit = function (row_uid) {
  if (!row_uid) return false;
  const school = typeof getCurrentSchool === "function" ? getCurrentSchool() : null;
  if (!school || !window.isEditAllowed(school.editable)) return false;

  const queue = getPendingQueue();
  return queue.some(e => e.row_uid === row_uid);
};

// Queue a new edit or merge with an existing one
function queuePendingEdit(row_uid, newChangedFields, originalRowValues) {
  let queue = getPendingQueue();
  let entry = queue.find(e => e.row_uid === row_uid);
  const school = typeof getCurrentSchool === "function" ? getCurrentSchool() : null;
  const userId = school ? school.userId : "";

  if (entry) {
    // Merge changed fields
    for (const [field, diffObj] of Object.entries(newChangedFields)) {
      if (entry.changedFields[field]) {
        const originalOld = entry.changedFields[field].old;
        const latestNew = diffObj.new;

        if (originalOld === latestNew) {
          // Reverted back to the original database value
          delete entry.changedFields[field];
        } else {
          entry.changedFields[field].new = latestNew;
        }
      } else {
        entry.changedFields[field] = {
          old: diffObj.old,
          new: diffObj.new
        };
      }
    }

    entry.timestamp = Date.now();
    entry.status = "pending";

    // If no differences remain, discard the queue entry
    if (Object.keys(entry.changedFields).length === 0) {
      queue = queue.filter(e => e.row_uid !== row_uid);
    }
  } else {
    // Add new queue entry
    entry = {
      row_uid: row_uid,
      userId: userId,
      timestamp: Date.now(),
      changedFields: newChangedFields,
      status: "pending"
    };
    queue.push(entry);
  }

  savePendingQueue(queue);
}

// Inject Edit Button into Student details modal footer
window.injectEditButton = function (modal, studentData, sourcePrefix) {
  const footer = modal.querySelector(".modal-footer");
  if (!footer) return;

  // Remove any previously injected edit button immediately
  const existingBtn = document.getElementById("edit-student-btn");
  if (existingBtn) existingBtn.remove();

  if (!studentData || !studentData.row_uid) return;

  const school = typeof getCurrentSchool === "function" ? getCurrentSchool() : null;

  // Determine if this is a School Data row
  let isSchoolData = false;
  let source = "";

  if (sourcePrefix) {
    source = sourcePrefix.toLowerCase().trim();
  } else if (studentData._sourceSheet) {
    source = studentData._sourceSheet.toLowerCase().trim();
  } else if (window.currentActiveTab) {
    source = window.currentActiveTab.toLowerCase().trim();
  }

  if (source === "school-data" || source === "school data") {
    isSchoolData = true;
  }

  if (!school || !window.isEditAllowed(school.editable) || !isSchoolData) return;

  const editBtn = document.createElement("button");
  editBtn.id = "edit-student-btn";
  editBtn.className = "btn-secondary";
  editBtn.style.marginRight = "auto"; // Push it to the left side
  editBtn.style.height = "42px";
  editBtn.style.display = "inline-flex";
  editBtn.style.alignItems = "center";
  editBtn.style.gap = "8px";
  editBtn.innerHTML = `<i data-lucide="edit-3" style="width: 16px; height: 16px;"></i><span>Edit</span>`;

  editBtn.addEventListener("click", () => {
    // Hide details modal, open Edit Form
    modal.classList.add("hidden");
    openEditForm(studentData);
  });

  footer.insertBefore(editBtn, footer.firstChild);

  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
};

const CLASS_ORDER = ["Nursery", "KG1", "KG2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

// Hardcoded class lists per user ID (keys must be lowercase)
const USER_CLASS_BOUNDS = {
  "23431102408": ["Nursery", "KG1", "KG2", "1", "2", "3", "4", "5", "6", "7", "8"],
  "23431116303": ["Nursery", "KG1", "KG2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]
  // Add user ID mappings here manually (e.g., "username": ["Nursery", "KG1", "KG2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"])
};

function getClassRange(userId) {
  const userKey = (userId || "").toString().trim().toLowerCase();

  if (USER_CLASS_BOUNDS[userKey]) {
    return USER_CLASS_BOUNDS[userKey];
  }

  // Fallback: return full list if not found
  return CLASS_ORDER;
}

// Predefined options helpers
window.getPredefinedClasses = function () {
  const sessionRaw = localStorage.getItem("school-portal-session") || localStorage.getItem("sdip_session");
  let startClass = "";
  let endClass = "";
  if (sessionRaw) {
    try {
      const session = JSON.parse(sessionRaw);
      startClass = window.findValueIgnoreCaseAndSpaces(session, 'startclass') || "";
      endClass = window.findValueIgnoreCaseAndSpaces(session, 'endclass') || "";
    } catch (e) { }
  }

  const ORDER_DISPLAY = ["Nursery", "KG 1", "KG 2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
  const ORDER_NORM = ["nursery", "kg1", "kg2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

  if (!startClass || !endClass) {
    return ORDER_DISPLAY;
  }

  const cleanClass = (cls) => {
    let norm = cls.toLowerCase().trim().replace(/\s+/g, "").replace(/^class/g, "");
    norm = norm.replace(/^(\d+)(st|nd|rd|th)$/, "$1");
    norm = norm.replace(/kg-?(\d)/, "kg$1");
    return norm;
  };

  const normStart = cleanClass(startClass);
  const normEnd = cleanClass(endClass);

  let startIndex = ORDER_NORM.indexOf(normStart);
  let endIndex = ORDER_NORM.indexOf(normEnd);

  if (startIndex === -1) startIndex = 0;
  if (endIndex === -1) endIndex = ORDER_NORM.length - 1;

  if (startIndex > endIndex) {
    const temp = startIndex;
    startIndex = endIndex;
    endIndex = temp;
  }

  return ORDER_DISPLAY.slice(startIndex, endIndex + 1);
};

window.getPredefinedSubjects = function () {
  const sessionRaw = localStorage.getItem("school-portal-session") || localStorage.getItem("sdip_session");
  let subjectsStr = "";
  if (sessionRaw) {
    try {
      const session = JSON.parse(sessionRaw);
      subjectsStr = window.findValueIgnoreCaseAndSpaces(session, 'subjects') || "";
    } catch (e) { }
  }
  if (!subjectsStr) {
    return ["Arts", "Commerce", "Math", "Bio"];
  }
  return subjectsStr.split(",").map(s => s.trim()).filter(Boolean);
};

// Open Edit Form Modal and render editable inputs
let originalStudentState = null;

function openEditForm(studentData) {
  const modal = document.getElementById("student-edit-modal");
  const form = document.getElementById("student-edit-form");
  if (!modal || !form) return;

  originalStudentState = JSON.parse(JSON.stringify(studentData));
  form.innerHTML = "";

  const isUidKey = (k) => {
    const norm = k.toLowerCase().trim();
    return norm === "row_uid" || norm === "row-uid" || norm === "row uid" || norm === "rowuid" || norm.startsWith("_");
  };
  const keys = Object.keys(studentData).filter(k => !isUidKey(k));

  keys.forEach(key => {
    const formGroup = document.createElement("div");
    formGroup.style.display = "flex";
    formGroup.style.flexDirection = "column";
    formGroup.style.gap = "6px";

    const label = document.createElement("label");
    label.style.fontWeight = "500";
    label.style.fontSize = "0.85rem";
    label.style.color = "var(--text-muted)";
    label.textContent = key;

    const keyLower = key.toLowerCase().trim();
    let input;

    if (keyLower === "class") {
      input = document.createElement("select");
      input.name = key;
      input.className = "form-input";

      const dropdown = input;
      const session = JSON.parse(localStorage.getItem('sdip_session')) || {};
      const allowedClasses = getClassRange(session.username);

      allowedClasses.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls;
        opt.textContent = cls;
        dropdown.appendChild(opt);
      });

      const currentVal = (studentData[key] !== undefined && studentData[key] !== null) ? studentData[key].toString().trim() : "";
      input.value = currentVal;
    }
    else if (keyLower === "gender" || keyLower === "sex") {
      input = document.createElement("select");
      input.name = key;
      input.className = "form-input";

      const currentVal = (studentData[key] !== undefined && studentData[key] !== null) ? studentData[key].toString().trim() : "";
      const genderOptions = ["Boy", "Girl"];
      genderOptions.forEach(g => {
        const opt = document.createElement("option");
        opt.value = g;
        opt.textContent = g;
        input.appendChild(opt);
      });

      let matched = false;
      for (const opt of input.options) {
        if (opt.value.toLowerCase() === currentVal.toLowerCase()) {
          input.value = opt.value;
          matched = true;
          break;
        }
      }

      if (!matched && currentVal) {
        const opt = document.createElement("option");
        opt.value = currentVal;
        opt.textContent = currentVal;
        input.appendChild(opt);
        input.value = currentVal;
      }
    }
    else if (keyLower === "category" || keyLower === "caste") {
      input = document.createElement("select");
      input.name = key;
      input.className = "form-input";

      const currentVal = (studentData[key] !== undefined && studentData[key] !== null) ? studentData[key].toString().trim() : "";
      const catOptions = ["GEN", "OBC", "SC", "ST"];
      catOptions.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        input.appendChild(opt);
      });

      let matched = false;
      for (const opt of input.options) {
        if (opt.value.toLowerCase() === currentVal.toLowerCase()) {
          input.value = opt.value;
          matched = true;
          break;
        }
      }

      if (!matched && currentVal) {
        const opt = document.createElement("option");
        opt.value = currentVal;
        opt.textContent = currentVal;
        input.appendChild(opt);
        input.value = currentVal;
      }
    }
    else if (keyLower === "subject" || keyLower === "stream") {
      input = document.createElement("select");
      input.name = key;
      input.className = "form-input";

      const currentVal = (studentData[key] !== undefined && studentData[key] !== null) ? studentData[key].toString().trim() : "";
      const subjectOptions = window.getPredefinedSubjects();

      const blankOpt = document.createElement("option");
      blankOpt.value = "";
      blankOpt.textContent = "Select Subject/Stream";
      input.appendChild(blankOpt);

      subjectOptions.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        input.appendChild(opt);
      });

      let matched = false;
      for (const opt of input.options) {
        if (opt.value.toLowerCase() === currentVal.toLowerCase()) {
          input.value = opt.value;
          matched = true;
          break;
        }
      }

      if (!matched && currentVal) {
        const opt = document.createElement("option");
        opt.value = currentVal;
        opt.textContent = currentVal;
        input.appendChild(opt);
        input.value = currentVal;
      }
    }
    else {
      input = document.createElement("input");
      input.type = "text";
      input.name = key;
      input.className = "form-input";
      input.value = (studentData[key] !== undefined && studentData[key] !== null) ? formatCellValue(studentData[key]) : "";
    }

    input.style.padding = "10px 14px";
    input.style.border = "1px solid var(--border-color)";
    input.style.borderRadius = "var(--radius-md)";
    input.style.backgroundColor = "var(--bg-body)";
    input.style.color = "var(--text-main)";
    input.style.width = "100%";
    input.style.boxSizing = "border-box";

    formGroup.appendChild(label);
    formGroup.appendChild(input);
    form.appendChild(formGroup);
  });

  // Dynamic show/hide listener for Stream/Subject dropdown on high classes (11th & 12th)
  let classSelect = null;
  let subjectSelect = null;
  const selectElements = form.querySelectorAll("select");
  selectElements.forEach(select => {
    const nameLower = select.name.toLowerCase().trim();
    if (nameLower === "class") {
      classSelect = select;
    } else if (nameLower === "subject" || nameLower === "stream") {
      subjectSelect = select;
    }
  });

  if (classSelect && subjectSelect) {
    const updateSubjectFieldState = () => {
      const selectedClass = classSelect.value.toString().trim();
      const isHighClass = selectedClass === "11" || selectedClass === "12";
      if (isHighClass) {
        subjectSelect.disabled = false;
        subjectSelect.style.opacity = "1";
      } else {
        subjectSelect.value = "";
        subjectSelect.disabled = true;
        subjectSelect.style.opacity = "0.5";
      }
    };
    classSelect.addEventListener("change", updateSubjectFieldState);
    updateSubjectFieldState(); // Initial check
  }

  // Show edit modal
  modal.classList.remove("hidden");
}

// Close Edit Form with confirmation check
function closeEditForm(discardConfirmed = false) {
  const modal = document.getElementById("student-edit-modal");
  const form = document.getElementById("student-edit-form");
  if (!modal || !form || !originalStudentState) return;

  if (!discardConfirmed) {
    // Check if form changed
    let hasChanges = false;
    const isUidKey = (k) => {
      const norm = k.toLowerCase().trim();
      return norm === "row_uid" || norm === "row-uid" || norm === "row uid" || norm === "rowuid" || norm.startsWith("_");
    };
    const keys = Object.keys(originalStudentState).filter(k => !isUidKey(k));

    for (const key of keys) {
      const input = form.querySelector(`[name="${key}"]`);
      if (input) {
        const newVal = input.value.trim();
        const formattedOld = (originalStudentState[key] !== undefined && originalStudentState[key] !== null) ? formatCellValue(originalStudentState[key]).trim() : "";
        if (newVal !== formattedOld) {
          hasChanges = true;
          break;
        }
      }
    }

    if (hasChanges && !confirm("Discard unsaved changes?")) {
      return; // Do not close
    }
  }

  // Close edit modal, reopen details popup modal
  modal.classList.add("hidden");
  const detailModal = document.getElementById("student-detail-modal");
  if (detailModal) {
    detailModal.classList.remove("hidden");
  }
  originalStudentState = null;
}

// Save Changes Handler
function saveStudentEdit() {
  const form = document.getElementById("student-edit-form");
  if (!form || !originalStudentState) return;

  const newValues = {};
  const changedFields = {};
  let hasChanges = false;

  const isUidKey = (k) => {
    const norm = k.toLowerCase().trim();
    return norm === "row_uid" || norm === "row-uid" || norm === "row uid" || norm === "rowuid" || norm.startsWith("_");
  };
  const keys = Object.keys(originalStudentState).filter(k => !isUidKey(k));

  for (const key of keys) {
    const input = form.querySelector(`[name="${key}"]`);
    if (input) {
      const newVal = input.value.trim();
      const rawVal = originalStudentState[key];
      const oldVal = (rawVal !== undefined && rawVal !== null) ? rawVal.toString().trim() : "";
      const formattedOld = (rawVal !== undefined && rawVal !== null) ? formatCellValue(rawVal).trim() : "";

      if (newVal !== formattedOld) {
        newValues[key] = newVal;
        changedFields[key] = {
          old: oldVal,
          new: newVal
        };
        hasChanges = true;
      } else {
        newValues[key] = rawVal;
      }
    }
  }

  if (!hasChanges) {
    if (typeof showToast === "function") {
      showToast("No changes detected.", "warning");
    } else {
      alert("No changes detected.");
    }
    return;
  }

  // 1. Queue pending edit
  queuePendingEdit(originalStudentState.row_uid, changedFields, originalStudentState);

  // 2. Optimistically update local cached copy
  const cachedRaw = localStorage.getItem("school-portal-data");
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw);
      if (cached["School Data"]) {
        const idx = cached["School Data"].findIndex(row => row.row_uid === originalStudentState.row_uid);
        if (idx > -1) {
          Object.assign(cached["School Data"][idx], newValues);
          localStorage.setItem("school-portal-data", JSON.stringify(cached));
          if (window.activeOriginalData) {
            window.activeOriginalData = cached;
          }
        }
      }
    } catch (err) {
      console.error("Failed to update cached school data optimistically:", err);
    }
  }

  // 3. Hide edit modal
  const modal = document.getElementById("student-edit-modal");
  if (modal) modal.classList.add("hidden");
  if (history.state && history.state.modalOpen) {
    history.back();
  }

  // 4. Show success toast and trigger rerender
  if (typeof showToast === "function") {
    showToast("Changes saved locally. Syncing in background...", "success");
  }

  if (typeof window.renderAppComponents === "function") {
    const updatedData = JSON.parse(localStorage.getItem("school-portal-data"));
    window.renderAppComponents(updatedData);
  }

  originalStudentState = null;
}

// Background sync functions
async function syncEdits(editsToSync) {
  if (isSyncingEdits) return;
  const school = typeof getCurrentSchool === "function" ? getCurrentSchool() : null;
  if (!school || !school.sheetUrl || editsToSync.length === 0) return;

  isSyncingEdits = true;
  let queue = getPendingQueue();

  // Mark status in local storage as syncing
  queue.forEach(item => {
    if (editsToSync.some(e => e.row_uid === item.row_uid)) {
      item.status = "syncing";
    }
  });
  savePendingQueue(queue);

  try {
    const payload = {
      action: "applyEdits",
      edits: editsToSync.map(e => ({
        row_uid: e.row_uid,
        userId: e.userId,
        changedFields: e.changedFields,
        timestamp: e.timestamp
      }))
    };

    const response = await fetch(school.sheetUrl, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();
    console.log("applyEdits response data:", data);

    // Process results
    const results = data.results || [];
    queue = getPendingQueue(); // Reload from storage to ensure we don't overwrite mid-sync edits

    results.forEach(res => {
      if (res.success) {
        // Remove successful edits
        queue = queue.filter(e => e.row_uid !== res.row_uid);
      } else {
        // Mark failed edits
        const entry = queue.find(e => e.row_uid === res.row_uid);
        if (entry) {
          entry.status = "failed";
          entry.message = res.message || "Failed to apply on server";
        }
      }
    });

    savePendingQueue(queue);

    // Rerender app to update indicators
    if (typeof window.renderAppComponents === "function") {
      const currentData = JSON.parse(localStorage.getItem("school-portal-data"));
      if (currentData) {
        window.renderAppComponents(currentData);
      }
    }

  } catch (err) {
    console.error("applyEdits network/execution error:", err);
    // Restore syncing items back to pending
    queue = getPendingQueue();
    queue.forEach(item => {
      if (item.status === "syncing") {
        item.status = "pending";
      }
    });
    savePendingQueue(queue);
  } finally {
    isSyncingEdits = false;
  }
}

// Immediate manual/background sync trigger
window.syncPendingEditsImmediately = async function () {
  const school = typeof getCurrentSchool === "function" ? getCurrentSchool() : null;
  if (!school || !window.isEditAllowed(school.editable)) return;

  const queue = getPendingQueue();
  const pendingEdits = queue.filter(e => e.status === "pending" || e.status === "failed");
  if (pendingEdits.length === 0) return;

  console.log("Immediate sync: executing sync for pending items...", pendingEdits);
  await syncEdits(pendingEdits);
};

// Initialize Background Sync Timer
window.initBackgroundSyncTimer = function () {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
  }
  syncIntervalId = setInterval(async () => {
    const queue = getPendingQueue();
    const pendingEdits = queue.filter(e => e.status === "pending" || e.status === "failed");

    console.log("Background sync timer check: online =", navigator.onLine, "pending queue length =", pendingEdits.length);

    if (navigator.onLine && !isSyncingEdits && pendingEdits.length > 0) {
      await syncEdits(pendingEdits);
    }
  }, 20000); // 20s interval
};

// Setup Event listeners for Edit Form controls
document.addEventListener("DOMContentLoaded", () => {
  const cancelBtn = document.getElementById("cancel-student-edit-btn");
  const saveBtn = document.getElementById("save-student-edit-btn");
  const closeBtn = document.getElementById("close-student-edit");
  const editModal = document.getElementById("student-edit-modal");

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => closeEditForm(false));
  }
  if (saveBtn) {
    saveBtn.addEventListener("click", saveStudentEdit);
  }
  if (closeBtn) {
    closeBtn.addEventListener("click", () => closeEditForm(false));
  }
  if (editModal) {
    editModal.addEventListener("click", (e) => {
      if (e.target === editModal) {
        closeEditForm(false);
      }
    });
  }

  // Initialize auto sync if logged in and user has edit permissions
  const school = typeof getCurrentSchool === "function" ? getCurrentSchool() : null;
  if (school && window.isEditAllowed(school.editable)) {
    window.initBackgroundSyncTimer();
  }
});
