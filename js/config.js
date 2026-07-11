/**
 * School Portal Configuration File
 * Contains global config variables for endpoint URLs.
 */

const ADMIN_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwWAgTor7dm1UafhkpypOcbp_udczQHkAXNAsAVATXC3cFnnvGPP2FjHJXfB5OQFkS7/exec";

/**
 * Debounce helper function to delay execution of callbacks
 * @param {Function} func 
 * @param {number} wait 
 * @returns {Function}
 */
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

/**
 * Normalize class names for resilient matching (removes spaces, lowercases, strips 'class' prefix)
 * @param {string} cls 
 * @returns {string}
 */
function normalizeClassName(cls) {
  if (!cls) return "";
  return cls.toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "") // Remove all spaces
    .replace(/^class/g, ""); // Strip leading 'class' prefix
}

/**
 * Sort classes in the order: Nursery, KG1, KG2, 1-12, and unknown at the end
 * @param {Array|Set} classList 
 * @returns {Array}
 */
function sortClasses(classList) {
  const ORDER = ["nursery", "kg1", "kg2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
  return Array.from(classList).sort((a, b) => {
    const normA = normalizeClassName(a);
    const normB = normalizeClassName(b);

    const indexA = ORDER.indexOf(normA);
    const indexB = ORDER.indexOf(normB);

    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;

    // Fallback natural sort for unknown classes
    return a.toString().localeCompare(b.toString(), undefined, { numeric: true, sensitivity: 'base' });
  });
}

/**
 * Converts a Google Drive share URL to a direct viewable image link
 * @param {string} url 
 * @returns {string}
 */
function convertDriveUrl(url) {
  if (!url) return "";
  const str = url.toString().trim();

  // Extract file ID from various Google Drive URL formats
  let fileId = null;

  // Match standard /file/d/FILE_ID/ format
  const fileDMatch = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileDMatch && fileDMatch[1]) fileId = fileDMatch[1];

  // Match id=FILE_ID query parameter format (e.g. open?id=FILE_ID or uc?id=FILE_ID)
  if (!fileId) {
    const idQueryMatch = str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idQueryMatch && idQueryMatch[1]) fileId = idQueryMatch[1];
  }

  // Match general /d/FILE_ID format
  if (!fileId) {
    const dMatch = str.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (dMatch && dMatch[1]) fileId = dMatch[1];
  }

  // Use lh3.googleusercontent.com for reliable direct image serving (no CORS/redirect issues)
  if (fileId) {
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  }

  return str;
}

/**
 * Format ISO dates for India locale display
 */
function formatCellValue(value) {
  if (value === undefined || value === null || value === '') return '';

  if (value instanceof Date) {
    if (!isNaN(value)) {
      return value.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return '';
  }

  const str = String(value).trim();
  // Detect ISO date string (with T) or plain YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}(T|$|\s)/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d)) {
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
  }
  return str;
}

/**
 * Normalizes keys to locate values case/space-insensitively
 */
window.findValueIgnoreCaseAndSpaces = function (obj, searchKey) {
  if (!obj || typeof obj !== 'object') return undefined;
  const cleanSearch = searchKey.toLowerCase().replace(/[\s_-]/g, '');
  for (const key in obj) {
    const cleanKey = key.toLowerCase().replace(/[\s_-]/g, '');
    if (cleanKey === cleanSearch) {
      return obj[key];
    }
  }
  return undefined;
};

/**
 * Shared utility function to check if a key is an internal system column.
 * Internal columns like row_uid, Status, and Added_Date should never be displayed in the UI.
 * @param {string} k 
 * @returns {boolean}
 */
window.isSystemColumn = function (k) {
  if (!k) return false;
  const norm = k.toString().toLowerCase().trim();
  return norm === "row_uid" || norm === "row-uid" || norm === "row uid" || norm === "rowuid" ||
    norm === "status" || norm === "added_date" || norm === "added-date" || norm === "added date" ||
    norm.startsWith("_");
};
