/**
 * School Portal Configuration File
 * 
 * To add a new school, add a new object to the SCHOOLS array.
 * To deactivate a school, change status to "inactive".
 * No other files need to be modified.
 */

const SCHOOLS = [
  {
    userId: "23431102408",
    password: "sun@123",
    schoolName: "Sunshine Public School Ramgarh",
    sheetUrl: "https://script.google.com/macros/s/AKfycbx4mmrKvDW2MV2Wzvo2vn4eu0Z-ze5BkH7blUpggLAvf2bz8yEC-dRK8j10gH1xjgJL6Q/exec", // Replace with actual Apps Script URL
    status: "active"
  },
  {
    userId: "school002",
    password: "password456",
    schoolName: "XYZ International Academy",
    sheetUrl: "https://script.google.com/macros/s/placeholder_xyz/exec", // Replace with actual Apps Script URL
    status: "active"
  },
  {
    userId: "inactive_school",
    password: "password789",
    schoolName: "Closed Down Academy",
    sheetUrl: "https://script.google.com/macros/s/placeholder_inactive/exec",
    status: "inactive"
  }
];
