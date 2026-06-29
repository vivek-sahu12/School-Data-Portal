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
  return function(...args) {
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
  
  // Match standard file/d/FILE_ID/ format
  const fileDMatch = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileDMatch && fileDMatch[1]) {
    return `https://drive.google.com/uc?export=view&id=${fileDMatch[1]}`;
  }
  
  // Match id=FILE_ID query parameter format (e.g. open?id=FILE_ID or uc?id=FILE_ID)
  const idQueryMatch = str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idQueryMatch && idQueryMatch[1]) {
    return `https://drive.google.com/uc?export=view&id=${idQueryMatch[1]}`;
  }
  
  return str;
}
