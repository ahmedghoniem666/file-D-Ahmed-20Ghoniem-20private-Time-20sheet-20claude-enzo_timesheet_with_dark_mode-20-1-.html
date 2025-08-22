const STORAGE_KEY = 'enzo_timesheet_users';
const THEME_KEY = 'enzo_timesheet_theme';
const COLOR_KEY = 'enzo_timesheet_color';
let users = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
let currentUser = null;
let historyData = [];
let isDarkMode = localStorage.getItem(THEME_KEY) === 'dark';
let lastAction = null;

function updateLastModified() {
  document.getElementById('lastUpdated').innerText = new Date().toLocaleString();
}

function showLoading() {
  document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 100);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 400);
  }, 3000);
}

document.addEventListener('DOMContentLoaded', function() {
  applyTheme();
  applyCustomTheme();
  const storedUser = localStorage.getItem('currentUser');
  if (storedUser && users[storedUser]) {
    currentUser = storedUser;
    loadUserData();
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'block';
  } else {
    document.getElementById('loginBtn').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'none';
    document.getElementById('employeeName').value = 'Guest';
    document.getElementById('employeeRole').value = 'Employee';
    document.getElementById('hourlyRate').value = 0;
  }
  displayHistory();
  updateLastModified();
});

document.addEventListener('keydown', function(e) {
  if (e.ctrlKey) {
    switch(e.key) {
      case 'd':
        e.preventDefault();
        addDay();
        break;
      case 's':
        e.preventDefault();
        saveHistory();
        break;
    }
  }
});