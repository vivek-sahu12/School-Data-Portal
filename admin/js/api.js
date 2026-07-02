/**
 * Admin Portal API Service
 * Handles communication with the Google Apps Script backend.
 */

const ADMIN_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwWAgTor7dm1UafhkpypOcbp_udczQHkAXNAsAVATXC3cFnnvGPP2FjHJXfB5OQFkS7/exec";

function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem("device_id");
  if (!deviceId) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      deviceId = crypto.randomUUID();
    } else {
      deviceId = 'device-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now().toString(36);
    }
    localStorage.setItem("device_id", deviceId);
  }
  return deviceId;
}

/**
 * Common POST request wrapper with abort controller timeout
 */
async function postRequest(payload, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(ADMIN_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("API request failed:", error);
    throw error;
  }
}


const ApiService = {
  /**
   * Admin Login
   */
  async login(userId, password) {
    const deviceId = getOrCreateDeviceId();
    const payload = {
      action: "login",
      userId: userId.trim(),
      password: password,
      deviceId: deviceId
    };
    return postRequest(payload);
  },

  /**
   * Fetch All Schools and Session Logs
   */
  async getAdminData(adminUserId) {
    const payload = {
      action: "getAdminData",
      adminUserId: adminUserId
    };
    return postRequest(payload);
  },

  /**
   * Update User Credentials status/editable/password fields
   */
  async updateField(userId, field, value) {
    const payload = {
      action: "updateField",
      userId: userId,
      field: field,
      value: value
    };
    return postRequest(payload);
  },

  /**
   * Terminate active user device session
   */
  async forceLogoutSession(userId, deviceId) {
    const payload = {
      action: "forceLogoutSession",
      userId: userId,
      deviceId: deviceId
    };
    return postRequest(payload);
  },

  /**
   * Fetch school detail worksheets (UDISE, 3.0, School Data, Edit_log) from school's sheetUrl
   */
  async fetchSchoolDetails(sheetUrl) {
    const cacheBustUrl = `${sheetUrl}${sheetUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(cacheBustUrl, {
        method: "GET",
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error fetching school sheet: ${response.status}`);
      }

      const json = await response.json();
      const normalizedData = {};
      for (const key in json) {
        normalizedData[key.trim()] = json[key];
      }
      return normalizedData;
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`Failed to fetch school details from ${sheetUrl}:`, err);
      throw err;
    }
  }
};
