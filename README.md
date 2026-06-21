# School Portal — Static PWA Web App

A pure frontend, static Progressive Web App (PWA) called **"School Portal"** designed to display school student data fetched from Google Sheets (via Google Apps Script Web App endpoints). It features per-school login, dashboards, search/filter, and PDF report export.

## Table of Contents
1. [Project Overview](#project-overview)
2. [File Structure & Responsibilities](#file-structure--responsibilities)
3. [Setup Instructions for a New School](#setup-instructions-for-a-new-school)
   - [Google Sheet & Apps Script Setup](#1-google-sheet--apps-script-setup)
   - [Credentials Configuration](#2-credentials-configuration)
4. [Safely Adding Future Features](#safely-adding-future-features)
5. [PWA & Offline Behavior](#pwa--offline-behavior)

---

## Project Overview

The School Portal is a lightweight, mobile-first web app that does not require any backend server. Everything runs directly in the client browser, making it easy to deploy on static hosting platforms like **GitHub Pages**.

- **Authentication**: Done locally by matching inputs against a hardcoded array in `js/config.js`. Once validated, the session persists in `localStorage` until the user manually logs out.
- **Data Synced from Cloud**: Student worksheets (`UDISE`, `3.0`, `School Data`) are retrieved on login and stored in `localStorage` to reduce network requests.
- **Cache Refreshing**: Features a 24-hour auto-update mechanism. On app startup, cached records load immediately. If cached data is older than 24 hours, the app performs a silent background fetch to sync the database.
- **Universal Search**: Allows querying columns across all worksheets.
- **PDF Export**: Generates reports containing only the currently filtered students, with user-configured column selection and ordering.

---

## File Structure & Responsibilities

The codebase is organized modularly so that modifications can be made in isolated modules without breaking unrelated workflows:

```text
├── index.html            # Main application structure, tab viewport shells, and CDN scripts
├── css/
│   └── styles.css        # Core styling, Light/Dark theme properties, desktop sidebar, mobile bottom-bar
├── js/
│   ├── config.js         # User credentials database (the ONLY file edited to add/remove schools)
│   ├── theme.js          # Light/Dark mode toggler logic and localStorage theme saver
│   ├── auth.js           # Login validation, session management, and global toast notifications
│   ├── dataFetch.js      # Apps Script AJAX queries, data caching, auto-refresh and connection retries
│   ├── dashboard.js      # Metric summarizers and Chart.js rendering
│   ├── tabs.js           # Sheet-specific tab navigation, filters, dynamic tables, and state caching
│   ├── universalSearch.js# Combined cross-sheet searches and common column selectors
│   └── pdfExport.js      # PDF column config checklists, moveUp/down position swappers, and jsPDF compiler
├── assets/
│   └── icon.svg          # High-resolution vector brand logo / PWA launcher icon
├── manifest.json         # PWA installation parameters (short-name, theme colors, etc.)
└── service-worker.js     # App shell caching code enabling offline capability
```

---

## Setup Instructions for a New School

### 1. Google Sheet & Apps Script Setup

To hook up a school to the portal, the school's Google Sheet must meet these schema rules:

1. **Worksheets**: The sheet must contain exactly three worksheets named:
   - `UDISE`
   - `3.0`
   - `School Data`
2. **First Row (Headers)**: Row 1 in every worksheet is treated as the column names. These can vary between sheets and schools.
3. **Core Columns**: Every worksheet **MUST** include columns spelled and cased exactly as:
   - `Name` (Used for student search)
   - `Class` (Used for dropdown filtering)
   - `Section` (Used for dropdown filtering)
   
   *Any other columns are completely dynamic and can be added, removed, or re-arranged as desired.*

#### Deploying the Apps Script:
In the Google Sheet, navigate to **Extensions > Apps Script** and deploy the following script as a **Web App** (configured to execute as "Me" and be accessible by "Anyone"):

```javascript
function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var result = {};

  sheets.forEach(function(sheet) {
    var sheetName = sheet.getName();
    var data = sheet.getDataRange().getValues();

    if (data.length === 0) {
      result[sheetName] = [];
      return;
    }

    var headers = data[0];
    var rows = [];

    for (var i = 1; i < data.length; i++) {
      var rowData = {};
      for (var j = 0; j < headers.length; j++) {
        var key = headers[j] ? headers[j].toString().trim() : "Column_" + j;
        rowData[key] = data[i][j];
      }
      rows.push(rowData);
    }

    result[sheetName] = rows;
  });

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Copy the generated **Web App URL** (e.g. `https://script.google.com/macros/s/.../exec`).

---

### 2. Credentials Configuration

To add the new school to the authentication list:
1. Open `js/config.js`.
2. Append a new object to the `SCHOOLS` array with the school's credentials and Web App URL:

```javascript
const SCHOOLS = [
  // ... existing schools ...
  {
    userId: "school003",
    password: "securepassword99",
    schoolName: "Greenwood Public School",
    sheetUrl: "https://script.google.com/macros/s/NEW_DEPLOYED_MACRO_ID/exec", // Paste Apps Script URL here
    status: "active" // Set to "inactive" to suspend access immediately
  }
];
```

3. Commit and push the changes to your GitHub Repository. The changes will go live on your GitHub Pages deployment. No other files need to be modified.

---

## Safely Adding Future Features

To avoid breaking existing functionality and keep the codebase easy to maintain, follow these integration guidelines:

* **Altering UI Structure**: If you need to add header elements, sidebar tabs, or layout boxes, modify `index.html`. Write the styles in `css/styles.css` matching your theme's variables.
* **Adding an Analytics Chart**: Do not clutter other files. Define a new chart rendering method in `js/dashboard.js`, append your canvas selector inside `index.html`'s dashboard view-section, and call your new method inside `calculateAndRenderDashboard()`.
* **Adding a 5th Tab**:
  1. Add a new `<button>` with a unique `data-target` in the `<nav>` inside `index.html`.
  2. Create a matching `<section>` view inside `index.html` viewport containing a `hidden` class.
  3. Create a dedicated JS file for the new tab (e.g. `js/reports.js`) and link it at the bottom of `index.html`.
  4. Listen for changes in `js/tabs.js`'s navigation click handler to trigger any initialization functions.
* **Modifying CSS Classes**: Do not rename utility rules. Adjust CSS custom properties inside `[data-theme="light"]` and `[data-theme="dark"]` to tweak global palettes.

---

## PWA & Offline Behavior

* **Offline Loading**: The service worker caches all JS, CSS, and HTML resources. When running offline, the page loads successfully and the app reads from `localStorage`.
* **Syncing Offline**: If a manual refresh is triggered while offline, the browser fails to fetch and displays a toast message: *"Sync failed. Displaying cached records."* Already-loaded dashboards and search tables remain interactive.
