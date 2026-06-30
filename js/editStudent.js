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
window.injectEditButton = function (modal, studentData) {
  const footer = modal.querySelector(".modal-footer");
  if (!footer || !studentData || !studentData.row_uid) return;

  // Remove any previously injected edit button
  const existingBtn = document.getElementById("edit-student-btn");
  if (existingBtn) existingBtn.remove();

  const school = typeof getCurrentSchool === "function" ? getCurrentSchool() : null;
  const isSchoolDataRow = (window.currentActiveTab === "school-data") || 
                          (window.currentActiveTab === "universal-search" && studentData._sourceSheet === "School Data");
  if (!school || !window.isEditAllowed(school.editable) || !isSchoolDataRow) return;

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

// Open Edit Form Modal and render editable inputs
let originalStudentState = null;

function openEditForm(studentData) {
  const modal = document.getElementById("student-edit-modal");
  const form = document.getElementById("student-edit-form");
  if (!modal || !form) return;

  originalStudentState = JSON.parse(JSON.stringify(studentData));
  form.innerHTML = "";

  const keys = Object.keys(studentData).filter(k => !k.startsWith("_") && k !== "row_uid");

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

    const input = document.createElement("input");
    input.type = "text";
    input.name = key;
    input.className = "form-input";
    input.value = (studentData[key] !== undefined && studentData[key] !== null) ? studentData[key].toString() : "";
    input.style.padding = "10px 14px";
    input.style.border = "1px solid var(--border-color)";
    input.style.borderRadius = "var(--radius-md)";
    input.style.backgroundColor = "var(--bg-body)";
    input.style.color = "var(--text-main)";

    formGroup.appendChild(label);
    formGroup.appendChild(input);
    form.appendChild(formGroup);
  });

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
    const keys = Object.keys(originalStudentState).filter(k => !k.startsWith("_") && k !== "row_uid");

    for (const key of keys) {
      const input = form.querySelector(`[name="${key}"]`);
      if (input) {
        const newVal = input.value.trim();
        const oldVal = (originalStudentState[key] !== undefined && originalStudentState[key] !== null) ? originalStudentState[key].toString().trim() : "";
        if (newVal !== oldVal) {
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

  const keys = Object.keys(originalStudentState).filter(k => !k.startsWith("_") && k !== "row_uid");

  for (const key of keys) {
    const input = form.querySelector(`[name="${key}"]`);
    if (input) {
      const newVal = input.value.trim();
      const oldVal = (originalStudentState[key] !== undefined && originalStudentState[key] !== null) ? originalStudentState[key].toString().trim() : "";

      newValues[key] = newVal;
      if (newVal !== oldVal) {
        changedFields[key] = {
          old: oldVal,
          new: newVal
        };
        hasChanges = true;
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
window.initBackgroundSyncTimer = function() {
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
