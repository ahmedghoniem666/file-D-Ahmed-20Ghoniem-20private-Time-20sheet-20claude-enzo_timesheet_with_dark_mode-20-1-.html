function cleanupUsers() {
  const now = Date.now();
  const sixMonthsMs = 180 * 24 * 60 * 60 * 1000;
  Object.keys(users).forEach(username => {
    if (now - users[username].lastLogin > sixMonthsMs) {
      delete users[username];
    }
  });
  saveUsers();
}

function saveUsers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  updateLastModified();
}

function register() {
  showLoading();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if (!username || password.length < 6) {
    setMessage('Username required, password must be at least 6 characters.');
    hideLoading();
    return;
  }
  if (users[username]) {
    setMessage('Username already taken.');
    hideLoading();
    return;
  }
  users[username] = {
    password: password,
    lastLogin: Date.now(),
    data: {
      settings: { employeeName: username, employeeRole: 'Employee', hourlyRate: 0, bonus: 0, includeBreaks: false },
      rows: [],
      history: []
    }
  };
  saveUsers();
  login();
  hideLoading();
}

function login() {
  showLoading();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if (!users[username] || users[username].password !== password) {
    setMessage('Invalid username or password.');
    hideLoading();
    return;
  }
  currentUser = username;
  users[username].lastLogin = Date.now();
  saveUsers();
  localStorage.setItem('currentUser', username);
  loadUserData();
  document.getElementById('loginModal').style.display = 'none';
  document.getElementById('loginBtn').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'block';
  setMessage('');
  hideLoading();
}

function setMessage(msg) {
  document.getElementById('message').innerText = msg;
}

function loadUserData() {
  if (!currentUser) return;
  const data = users[currentUser].data;
  document.getElementById('employeeName').value = data.settings.employeeName;
  document.getElementById('employeeRole').value = data.settings.employeeRole || 'Employee';
  document.getElementById('hourlyRate').value = data.settings.hourlyRate;
  document.getElementById('bonus').value = data.settings.bonus;
  document.getElementById('includeBreaks').checked = data.settings.includeBreaks;
  historyData = data.history || [];
  displayHistory();
  const tbody = document.querySelector('#timeSheet tbody');
  tbody.innerHTML = '';
  data.rows.forEach(rowData => {
    addDay(rowData.date, rowData.workHours, rowData.breakHours, rowData.dayOff);
  });
  updateTotals();
}

function saveUserData() {
  if (!currentUser) return;
  const data = users[currentUser].data;
  data.settings = {
    employeeName: document.getElementById('employeeName').value,
    employeeRole: document.getElementById('employeeRole').value,
    hourlyRate: parseFloat(document.getElementById('hourlyRate').value) || 0,
    bonus: parseFloat(document.getElementById('bonus').value) || 0,
    includeBreaks: document.getElementById('includeBreaks').checked
  };
  data.rows = [];
  document.querySelectorAll('#timeSheet tbody tr').forEach(row => {
    data.rows.push({
      date: row.cells[0].querySelector('input').value,
      dayOff: row.cells[1].querySelector('input').checked,
      workHours: parseFloat(row.cells[2].querySelector('input').value) || 0,
      breakHours: parseFloat(row.cells[3].querySelector('input').value) || 0
    });
  });
  data.history = historyData;
  saveUsers();
}

function logout() {
  showLoading();
  if (currentUser) saveUserData();
  localStorage.removeItem('currentUser');
  currentUser = null;
  document.getElementById('loginModal').style.display = 'none';
  document.getElementById('loginBtn').style.display = 'block';
  document.getElementById('logoutBtn').style.display = 'none';
  const tbody = document.querySelector('#timeSheet tbody');
  tbody.innerHTML = '';
  historyData = [];
  displayHistory();
  document.getElementById('employeeName').value = 'Guest';
  document.getElementById('employeeRole').value = 'Employee';
  document.getElementById('hourlyRate').value = 0;
  document.getElementById('bonus').value = 0;
  document.getElementById('includeBreaks').checked = false;
  updateTotals();
  hideLoading();
  showToast('Logged out successfully!');
}

function showLoginModal() {
  document.getElementById('loginModal').style.display = 'flex';
}