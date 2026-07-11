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
  "23431102408": ["Nursery", "KG1", "KG2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
  "23431116303": ["Nursery", "KG1", "KG2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]
  // Add user ID mappings here manually (e.g., "username": ["Nursery", "KG1", "KG2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"])
};

// Hardcoded subject lists per user ID (keys must be lowercase)
const USER_SUBJECTS = {
  "23431102408": ["Arts", "Bio", "Commerce", "Math"],
  "23431116303": ["Commerce", "Math", "Accountancy"]
  // Add user ID -> subjects mapping manually here
};

function getCurrentUserId() {
  const sessionRaw = localStorage.getItem("sdip_session") || localStorage.getItem("school-portal-session");
  if (!sessionRaw) return "";
  try {
    const session = JSON.parse(sessionRaw);
    return (session.username || session.userId || "").toString().trim();
  } catch (e) {
    return "";
  }
}

function getUserSubjects(userId) {
  const userKey = (userId || "").toString().trim().toLowerCase();
  if (USER_SUBJECTS[userKey]) {
    return USER_SUBJECTS[userKey];
  }
  const keys = Object.keys(USER_SUBJECTS);
  for (const k of keys) {
    if (k.toLowerCase().trim() === userKey) {
      return USER_SUBJECTS[k];
    }
  }
  return [];
}

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

window.generateStudentFormFields = function (form, studentData, isAddFlow) {
  form.innerHTML = "";
  const isUidKey = window.isSystemColumn;
  const keys = Object.keys(studentData).filter(k => !isUidKey(k));

  const currentUserId = getCurrentUserId();
  const userSubjects = getUserSubjects(currentUserId);

  const subjectKey = Object.keys(studentData).find(k => {
    const norm = k.toLowerCase().trim();
    return norm === "subject" || norm === "stream";
  }) || "Subject";

  keys.forEach(key => {
    const keyLower = key.toLowerCase().trim();

    // If user has configured subjects, we skip rendering the standard subject/stream input here
    // since we will render it dynamically right under Class
    if (userSubjects.length > 0 && (keyLower === "subject" || keyLower === "stream")) {
      return;
    }

    const formGroup = document.createElement("div");
    formGroup.style.display = "flex";
    formGroup.style.flexDirection = "column";
    formGroup.style.gap = "6px";

    const label = document.createElement("label");
    label.style.fontWeight = "500";
    label.style.fontSize = "0.85rem";
    label.style.color = "var(--text-muted)";
    label.textContent = key;

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

    // If key is Class and user has configured subjects, inject the dynamic subject select right below it
    if (keyLower === "class" && userSubjects.length > 0) {
      const dynamicSubjectGroup = document.createElement("div");
      dynamicSubjectGroup.id = isAddFlow ? "add-dynamic-subject-group" : "dynamic-subject-group";
      dynamicSubjectGroup.style.display = "none";
      dynamicSubjectGroup.style.flexDirection = "column";
      dynamicSubjectGroup.style.gap = "6px";
      dynamicSubjectGroup.style.opacity = "0";
      dynamicSubjectGroup.style.maxHeight = "0px";
      dynamicSubjectGroup.style.overflow = "hidden";
      dynamicSubjectGroup.style.transition = "opacity 0.2s ease, max-height 0.2s ease";

      const dynamicLabel = document.createElement("label");
      dynamicLabel.style.fontWeight = "500";
      dynamicLabel.style.fontSize = "0.85rem";
      dynamicLabel.style.color = "var(--text-muted)";
      dynamicLabel.textContent = subjectKey;

      const dynamicSelect = document.createElement("select");
      dynamicSelect.name = subjectKey;
      dynamicSelect.className = "form-input";
      dynamicSelect.style.padding = "10px 14px";
      dynamicSelect.style.border = "1px solid var(--border-color)";
      dynamicSelect.style.borderRadius = "var(--radius-md)";
      dynamicSelect.style.backgroundColor = "var(--bg-body)";
      dynamicSelect.style.color = "var(--text-main)";
      dynamicSelect.style.width = "100%";
      dynamicSelect.style.boxSizing = "border-box";

      const blankOpt = document.createElement("option");
      blankOpt.value = "";
      blankOpt.textContent = "Select Subject";
      dynamicSelect.appendChild(blankOpt);

      userSubjects.forEach(sub => {
        const opt = document.createElement("option");
        opt.value = sub;
        opt.textContent = sub;
        dynamicSelect.appendChild(opt);
      });

      // Pre-select if there is an initial value and it's allowed
      const initialVal = (studentData[subjectKey] !== undefined && studentData[subjectKey] !== null) ? studentData[subjectKey].toString().trim() : "";
      if (userSubjects.some(sub => sub.toLowerCase() === initialVal.toLowerCase())) {
        const matchedSub = userSubjects.find(sub => sub.toLowerCase() === initialVal.toLowerCase());
        dynamicSelect.value = matchedSub;
      } else {
        dynamicSelect.value = "";
      }

      dynamicSubjectGroup.appendChild(dynamicLabel);
      dynamicSubjectGroup.appendChild(dynamicSelect);
      form.appendChild(dynamicSubjectGroup);

      // Listen for Class change to show/hide dynamic subject group
      const classSelect = input;
      const updateDynamicSubjectState = () => {
        const selectedClass = classSelect.value.toString().trim();
        const isHighClass = selectedClass === "11" || selectedClass === "12";
        if (isHighClass) {
          dynamicSubjectGroup.style.display = "flex";
          // Force layout reflow
          dynamicSubjectGroup.offsetHeight;
          dynamicSubjectGroup.style.opacity = "1";
          dynamicSubjectGroup.style.maxHeight = "100px";
        } else {
          dynamicSelect.value = "";
          dynamicSubjectGroup.style.opacity = "0";
          dynamicSubjectGroup.style.maxHeight = "0px";
          setTimeout(() => {
            if (classSelect.value.toString().trim() !== "11" && classSelect.value.toString().trim() !== "12") {
              dynamicSubjectGroup.style.display = "none";
            }
          }, 200);
        }
      };

      classSelect.addEventListener("change", updateDynamicSubjectState);
      // Wait for layout/DOM injection, then trigger initial state
      setTimeout(updateDynamicSubjectState, 0);
    }
  });

  // Dynamic show/hide listener for Stream/Subject dropdown on high classes (11th & 12th)
  // Only sets up if the standard subject/stream field was rendered (fallback/backwards compatibility)
  let classSelect = null;
  let subjectSelect = null;
  const selectElements = form.querySelectorAll("select");
  selectElements.forEach(select => {
    const nameLower = select.name.toLowerCase().trim();
    if (nameLower === "class") {
      classSelect = select;
    } else if (nameLower === "subject" || nameLower === "stream") {
      const parentId = select.parentElement ? select.parentElement.id : "";
      if (parentId !== "dynamic-subject-group" && parentId !== "add-dynamic-subject-group") {
        subjectSelect = select;
      }
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
};

function openEditForm(studentData) {
  const modal = document.getElementById("student-edit-modal");
  const form = document.getElementById("student-edit-form");
  if (!modal || !form) return;

  originalStudentState = JSON.parse(JSON.stringify(studentData));
  window.generateStudentFormFields(form, studentData, false);

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
    const isUidKey = window.isSystemColumn;
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

  // Validation for user-based subject configuration (Class 11/12 only)
  const classInput = form.querySelector('[name="Class"]');
  if (classInput) {
    const selectedClass = classInput.value.toString().trim();
    const currentUserId = getCurrentUserId();
    const userSubjects = getUserSubjects(currentUserId);
    if (userSubjects.length > 0 && (selectedClass === "11" || selectedClass === "12")) {
      const subjectInput = form.querySelector('[name="Subject"]') || form.querySelector('[name="subject"]') || form.querySelector('[name="Stream"]') || form.querySelector('[name="stream"]');
      if (subjectInput && !subjectInput.value.trim()) {
        if (typeof showToast === "function") {
          showToast("Subject is required for Class 11 and 12.", "error");
        } else {
          alert("Subject is required for Class 11 and 12.");
        }
        return; // Block save/submit
      }
    }
  }

  const newValues = {};
  const changedFields = {};
  let hasChanges = false;

  const isUidKey = window.isSystemColumn;
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
      edits: editsToSync.map(e => {
        const item = {
          action: e.action || "edit",
          userId: e.userId,
          timestamp: e.timestamp
        };
        if (e.row_uid) {
          item.row_uid = e.row_uid;
        }
        if (e.changedFields) {
          item.changedFields = e.changedFields;
        }
        if (e.data) {
          item.data = e.data;
        }
        return item;
      })
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

// Stop Background Sync Timer
window.stopBackgroundSyncTimer = function () {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
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

  // Bind Add Student controls
  const submitAddBtn = document.getElementById("submit-add-student-btn");
  if (submitAddBtn) {
    submitAddBtn.addEventListener("click", () => {
      if (typeof window.submitAddStudent === "function") {
        window.submitAddStudent();
      }
    });
  }

  const resetAddBtn = document.getElementById("reset-add-student-btn");
  if (resetAddBtn) {
    resetAddBtn.addEventListener("click", () => {
      if (typeof window.resetAddStudentForm === "function") {
        window.resetAddStudentForm();
      }
    });
  }

  // Bind Delete Student controls
  const confirmDeleteBtn = document.getElementById("confirm-delete-student-btn");
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", () => {
      if (typeof window.executeDeleteStudent === "function") {
        window.executeDeleteStudent();
      }
    });
  }

  const cancelDeleteBtn = document.getElementById("cancel-delete-student-btn");
  if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener("click", () => {
      if (typeof window.cancelDeleteStudent === "function") {
        window.cancelDeleteStudent();
      }
    });
  }

  const closeDeleteBtn = document.getElementById("close-delete-modal");
  if (closeDeleteBtn) {
    closeDeleteBtn.addEventListener("click", () => {
      if (typeof window.cancelDeleteStudent === "function") {
        window.cancelDeleteStudent();
      }
    });
  }

  const deleteModal = document.getElementById("delete-student-modal");
  if (deleteModal) {
    deleteModal.addEventListener("click", (e) => {
      if (e.target === deleteModal) {
        if (typeof window.cancelDeleteStudent === "function") {
          window.cancelDeleteStudent();
        }
      }
    });
  }

  // Bind Recover Student controls
  const confirmRecoverBtn = document.getElementById("confirm-recover-student-btn");
  if (confirmRecoverBtn) {
    confirmRecoverBtn.addEventListener("click", () => {
      if (typeof window.executeRecoverStudent === "function") {
        window.executeRecoverStudent();
      }
    });
  }

  const cancelRecoverBtn = document.getElementById("cancel-recover-student-btn");
  if (cancelRecoverBtn) {
    cancelRecoverBtn.addEventListener("click", () => {
      if (typeof window.cancelRecoverStudent === "function") {
        window.cancelRecoverStudent();
      }
    });
  }

  const closeRecoverBtn = document.getElementById("close-recover-modal");
  if (closeRecoverBtn) {
    closeRecoverBtn.addEventListener("click", () => {
      if (typeof window.cancelRecoverStudent === "function") {
        window.cancelRecoverStudent();
      }
    });
  }

  const recoverModal = document.getElementById("recover-student-modal");
  if (recoverModal) {
    recoverModal.addEventListener("click", (e) => {
      if (e.target === recoverModal) {
        if (typeof window.cancelRecoverStudent === "function") {
          window.cancelRecoverStudent();
        }
      }
    });
  }

  // Initialize auto sync if logged in and user has edit permissions
  const school = typeof getCurrentSchool === "function" ? getCurrentSchool() : null;
  if (school && window.isEditAllowed(school.editable)) {
    window.initBackgroundSyncTimer();
  }
});

// Add Student logic
window.initAddStudentView = function () {
  const form = document.getElementById("add-student-form");
  if (!form) return;

  // Let's only initialize if it's currently empty
  if (form.children.length > 0) return;

  // Get headers from first row of school data
  let headers = [];
  const cachedRaw = localStorage.getItem("school-portal-data");
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw);
      if (cached["School Data"] && cached["School Data"].length > 0) {
        headers = Object.keys(cached["School Data"][0]);
      }
    } catch (e) {
      console.error("Failed to read school data headers:", e);
    }
  }

  if (headers.length === 0) {
    headers = ["Class", "Section", "Roll No", "Scholar No", "Student Name", "Father Name", "Mother Name", "Gender", "Category", "Mobile No", "Aadhar No", "PEN", "Samagra ID", "Subject"];
  }

  // Create empty template
  const template = {};
  headers.forEach(h => {
    template[h] = "";
  });

  window.generateStudentFormFields(form, template, true);
};

window.submitAddStudent = function () {
  const form = document.getElementById("add-student-form");
  if (!form) return;

  // Validate Name/Student Name
  const nameInput = form.querySelector('[name*="name" i]') || form.querySelector('[name*="Name" i]');
  if (nameInput && !nameInput.value.trim()) {
    if (typeof showToast === "function") showToast("Student Name is required.", "error");
    else alert("Student Name is required.");
    return;
  }

  // Validate Class
  const classInput = form.querySelector('[name="Class"]') || form.querySelector('[name="class"]');
  if (classInput && !classInput.value.trim()) {
    if (typeof showToast === "function") showToast("Class is required.", "error");
    else alert("Class is required.");
    return;
  }

  // Validate Subject (if Class 11/12 and user has configured subjects)
  if (classInput) {
    const selectedClass = classInput.value.toString().trim();
    const currentUserId = getCurrentUserId();
    const userSubjects = getUserSubjects(currentUserId);
    if (userSubjects.length > 0 && (selectedClass === "11" || selectedClass === "12")) {
      const subjectInput = form.querySelector('[name="Subject"]') || form.querySelector('[name="subject"]') || form.querySelector('[name="Stream"]') || form.querySelector('[name="stream"]');
      if (subjectInput && !subjectInput.value.trim()) {
        if (typeof showToast === "function") showToast("Subject is required for Class 11 and 12.", "error");
        else alert("Subject is required for Class 11 and 12.");
        return;
      }
    }
  }

  // Extract all values
  const formValues = {};
  const inputs = form.querySelectorAll("input, select");
  inputs.forEach(input => {
    if (input.name) {
      formValues[input.name] = input.value.trim();
    }
  });

  // Display processing state
  const submitBtn = document.getElementById("submit-add-student-btn");
  const spinnerIcon = document.getElementById("add-student-spinner-icon");
  const submitText = document.getElementById("add-student-submit-text");

  if (submitBtn) submitBtn.disabled = true;
  if (spinnerIcon) spinnerIcon.classList.add("refresh-icon-spin");
  if (submitText) submitText.textContent = "Adding...";

  setTimeout(() => {
    const school = typeof getCurrentSchool === "function" ? getCurrentSchool() : null;
    const userId = school ? school.userId : "";
    const tempUid = `add_temp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const newRecord = {
      row_uid: tempUid,
      Status: "Active",
      Added_Date: new Date().toISOString(),
      ...formValues
    };

    // 1. Optimistically update local cached copy
    const cachedRaw = localStorage.getItem("school-portal-data");
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw);
        if (!cached["School Data"]) cached["School Data"] = [];
        cached["School Data"].push(newRecord);
        localStorage.setItem("school-portal-data", JSON.stringify(cached));
        if (window.activeOriginalData) {
          window.activeOriginalData = cached;
        }
      } catch (err) {
        console.error("Failed to update cached school data optimistically for add:", err);
      }
    }

    // 2. Push to pending queue
    let queue = getPendingQueue();
    queue.push({
      action: "add",
      row_uid: tempUid,
      userId: userId,
      timestamp: Date.now(),
      data: formValues,
      status: "pending"
    });
    savePendingQueue(queue);

    // 3. Reset processing state
    if (submitBtn) submitBtn.disabled = false;
    if (spinnerIcon) spinnerIcon.classList.remove("refresh-icon-spin");
    if (submitText) submitText.textContent = "Add Student";

    // 4. Reset form
    form.reset();
    if (classInput) {
      classInput.dispatchEvent(new Event("change"));
    }

    // 5. Toast notification
    if (typeof showToast === "function") {
      showToast("Student added locally. Syncing in background...", "success");
    }

    // 6. Rerender table
    if (typeof window.renderAppComponents === "function") {
      const updatedData = JSON.parse(localStorage.getItem("school-portal-data"));
      window.renderAppComponents(updatedData);
    }

    // 7. Trigger sync immediately
    if (typeof window.syncPendingEditsImmediately === "function") {
      window.syncPendingEditsImmediately();
    }
  }, 500);
};

window.resetAddStudentForm = function () {
  const form = document.getElementById("add-student-form");
  if (form && confirm("Are you sure you want to reset the form?")) {
    form.reset();
    const classInput = form.querySelector('[name="Class"]') || form.querySelector('[name="class"]');
    if (classInput) {
      classInput.dispatchEvent(new Event("change"));
    }
  }
};

// Delete Student logic
let studentToDelete = null;

window.confirmDeleteStudent = function (studentData) {
  studentToDelete = studentData;
  const modal = document.getElementById("delete-student-modal");
  const msgEl = document.getElementById("delete-student-message");
  if (!modal || !msgEl) return;

  const nameVal = studentData["Student Name"] || studentData["Name"] || "Student";
  const classVal = studentData["Class"] || "";
  msgEl.textContent = `Are you sure you want to delete ${nameVal} (Class ${classVal})? This action cannot be undone from this screen.`;

  modal.classList.remove("hidden");
};

window.executeDeleteStudent = function () {
  if (!studentToDelete || !studentToDelete.row_uid) return;

  const school = typeof getCurrentSchool === "function" ? getCurrentSchool() : null;
  const userId = school ? school.userId : "";
  const targetUid = studentToDelete.row_uid;

  // 1. Optimistically remove from caches & add to Deleted_Students
  const cachedRaw = localStorage.getItem("school-portal-data");
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw);
      if (cached["School Data"]) {
        const deletedRow = cached["School Data"].find(row => row.row_uid === targetUid);
        if (deletedRow) {
          Object.keys(deletedRow).forEach(k => {
            if (k.toLowerCase() === "status") {
              deletedRow[k] = "Deleted";
            }
          });
          deletedRow["Status"] = "Deleted";
          if (!cached["Deleted_Students"]) cached["Deleted_Students"] = [];
          if (!cached["Deleted_Students"].some(row => row.row_uid === targetUid)) {
            cached["Deleted_Students"].push(deletedRow);
          }
        }
        cached["School Data"] = cached["School Data"].filter(row => row.row_uid !== targetUid);
        localStorage.setItem("school-portal-data", JSON.stringify(cached));
        if (window.activeOriginalData) {
          window.activeOriginalData = cached;
        }
      }
    } catch (err) {
      console.error("Failed to update cache optimistically for delete:", err);
    }
  }

  if (window.activeFilteredData && window.activeFilteredData["School Data"]) {
    window.activeFilteredData["School Data"] = window.activeFilteredData["School Data"].filter(row => row.row_uid !== targetUid);
  }

  // 2. Queue delete action
  let queue = getPendingQueue();
  queue.push({
    action: "delete",
    row_uid: targetUid,
    userId: userId,
    timestamp: Date.now(),
    status: "pending"
  });
  savePendingQueue(queue);

  // 3. Close modals
  const deleteModal = document.getElementById("delete-student-modal");
  if (deleteModal) deleteModal.classList.add("hidden");

  const detailModal = document.getElementById("student-detail-modal");
  if (detailModal) detailModal.classList.add("hidden");

  if (history.state && history.state.modalOpen) {
    history.back();
  }

  // 4. Toast notification
  if (typeof showToast === "function") {
    showToast("Student deleted locally. Syncing in background...", "success");
  }

  // 5. Trigger rerender
  if (typeof window.renderAppComponents === "function") {
    const updatedData = JSON.parse(localStorage.getItem("school-portal-data"));
    window.renderAppComponents(updatedData);
  }

  // 6. Trigger sync immediately
  if (typeof window.syncPendingEditsImmediately === "function") {
    window.syncPendingEditsImmediately();
  }

  studentToDelete = null;
};

window.cancelDeleteStudent = function () {
  const modal = document.getElementById("delete-student-modal");
  if (modal) modal.classList.add("hidden");
  studentToDelete = null;
};

// Recover Student logic
let studentToRecover = null;

window.confirmRecoverStudent = function (studentData) {
  studentToRecover = studentData;
  const modal = document.getElementById("recover-student-modal");
  const msgEl = document.getElementById("recover-student-message");
  if (!modal || !msgEl) return;

  const nameVal = studentData["Student Name"] || studentData["Name"] || "Student";
  const classVal = studentData["Class"] || "";
  msgEl.textContent = `Are you sure you want to recover ${nameVal} (Class ${classVal}) and restore them to active status?`;

  modal.classList.remove("hidden");
};

window.executeRecoverStudent = function () {
  if (!studentToRecover || !studentToRecover.row_uid) return;

  const school = typeof getCurrentSchool === "function" ? getCurrentSchool() : null;
  const userId = school ? school.userId : "";
  const targetUid = studentToRecover.row_uid;

  // 1. Optimistically update cached data
  const cachedRaw = localStorage.getItem("school-portal-data");
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw);

      // Ensure we have School Data array
      if (!cached["School Data"]) cached["School Data"] = [];

      // Update student record status in all case variants
      const updatedStudent = { ...studentToRecover };
      Object.keys(updatedStudent).forEach(k => {
        if (k.toLowerCase() === "status") {
          updatedStudent[k] = "Active";
        }
      });
      updatedStudent["Status"] = "Active";

      // Remove from Deleted_Students if present
      if (cached["Deleted_Students"]) {
        cached["Deleted_Students"] = cached["Deleted_Students"].filter(row => row.row_uid !== targetUid);
      }

      // Add to School Data (avoiding duplicates)
      const idx = cached["School Data"].findIndex(row => row.row_uid === targetUid);
      if (idx > -1) {
        const item = cached["School Data"][idx];
        Object.keys(item).forEach(k => {
          if (k.toLowerCase() === "status") {
            item[k] = "Active";
          }
        });
        item["Status"] = "Active";
      } else {
        cached["School Data"].push(updatedStudent);
      }

      localStorage.setItem("school-portal-data", JSON.stringify(cached));
      if (window.activeOriginalData) {
        window.activeOriginalData = cached;
      }
    } catch (err) {
      console.error("Failed to update cache optimistically for recovery:", err);
    }
  }

  // 2. Queue recovery action
  let queue = getPendingQueue();
  queue.push({
    action: "edit",
    row_uid: targetUid,
    userId: userId,
    timestamp: Date.now(),
    changedFields: {
      Status: {
        old: "Deleted",
        new: "Active"
      }
    },
    status: "pending"
  });
  savePendingQueue(queue);

  // 3. Close recover modal
  const recoverModal = document.getElementById("recover-student-modal");
  if (recoverModal) recoverModal.classList.add("hidden");

  // 4. Toast notification
  if (typeof showToast === "function") {
    showToast("Student recovery scheduled. Syncing in background...", "success");
  }

  // 5. Trigger rerender & update active category details if viewing Reports detail
  if (typeof window.renderAppComponents === "function") {
    const updatedData = JSON.parse(localStorage.getItem("school-portal-data"));
    window.renderAppComponents(updatedData);
  }

  // If reports tab is active, re-render it
  if (window.currentActiveTab === "reports" && typeof window.renderActiveCategoryDetail === "function" && window.REPORTS_STATE && window.REPORTS_STATE.activeCategory === "deleted-students") {
    window.renderActiveCategoryDetail();
  }

  // 6. Trigger sync immediately
  if (typeof window.syncPendingEditsImmediately === "function") {
    window.syncPendingEditsImmediately();
  }

  studentToRecover = null;
};

window.cancelRecoverStudent = function () {
  const modal = document.getElementById("recover-student-modal");
  if (modal) modal.classList.add("hidden");
  studentToRecover = null;
};
