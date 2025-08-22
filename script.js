
var gk_isXlsx = false;
var gk_xlsxFileLookup = {};
var gk_fileData = {};
function filledCell(cell) {
  return cell !== '' && cell != null;
}
function loadFileData(filename) {
  if (gk_isXlsx && gk_xlsxFileLookup[filename]) {
    try {
      var workbook = XLSX.read(gk_fileData[filename], { type: 'base64' });
      var firstSheetName = workbook.SheetNames[0];
      var worksheet = workbook.Sheets[firstSheetName];
      var jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false, defval: '' });
      var filteredData = jsonData.filter(row => row.some(filledCell));
      var headerRowIndex = filteredData.findIndex((row, index) =>
        row.filter(filledCell).length >= (filteredData[index + 1]?.filter(filledCell).length || 0)
      );
      if (headerRowIndex === -1 || headerRowIndex > 25) headerRowIndex = 0;
      var csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(filteredData.slice(headerRowIndex)));
      return csv;
    } catch (e) {
      console.error('Error processing file:', e);
      showToast('Failed to process file data.');
      return "";
    }
  }
  return gk_fileData[filename] || "";
}

const THEME_KEY = 'enzo_timesheet_theme';
const COLOR_KEY = 'enzo_timesheet_color';
let currentUser = null;
let historyData = [];
let isDarkMode = localStorage.getItem(THEME_KEY) === 'dark';

// Supabase setup (Replace with your credentials)
const supabaseUrl = 'YOUR_SUPABASE_URL'; // e.g., 'https://your-project-id.supabase.co'
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY'; // Your Supabase anonymous key
const supabase = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

// Google Drive setup (Replace with your credentials)
let clientId = 'YOUR_GOOGLE_CLIENT_ID'; // e.g., '1234567890-abc123.apps.googleusercontent.com'
let apiKey = 'YOUR_GOOGLE_API_KEY'; // Your Google API key
let appId = 'YOUR_GOOGLE_PROJECT_NUMBER'; // Your Google Cloud project number
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
let tokenClient;
let accessToken;

function initGapi() {
  if (!window.gapi) {
    showToast('Google API library failed to load.');
    return;
  }
  gapi.load('client:picker', () => {
    gapi.client.init({
      apiKey: apiKey,
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    }).then(() => {
      console.log('Google API initialized');
    }).catch(err => {
      console.error('Google API init error:', err);
      showToast('Failed to initialize Google API. Check credentials.');
    });
  });
}

function requestAccessToken(callback) {
  if (!window.google) {
    showToast('Google Accounts library not loaded.');
    return;
  }
  if (accessToken) {
    callback();
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: (resp) => {
      if (resp.error) {
        console.error('Google auth error:', resp);
        showToast('Google authentication failed.');
        return;
      }
      accessToken = resp.access_token;
      callback();
    }
  });
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

function showLoginModal() {
  document.getElementById('loginModal').style.display = 'flex';
}

function showColorPicker() {
  document.getElementById('colorPickerModal').style.display = 'flex';
  document.getElementById('colorPicker').value = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();
}

function closeColorPicker() {
  document.getElementById('colorPickerModal').style.display = 'none';
}

function applyCustomColor() {
  showLoading();
  const color = document.getElementById('colorPicker').value;
  document.documentElement.style.setProperty('--primary-color', color);
  document.documentElement.style.setProperty('--primary-gradient', `linear-gradient(135deg, ${color} 0%, ${lightenColor(color, 20)} 100%)`);
  document.documentElement.style.setProperty('--primary-dark', lightenColor(color, 20));
  localStorage.setItem(COLOR_KEY, JSON.stringify({ primary: color }));
  closeColorPicker();
  hideLoading();
  showToast('Theme color updated!');
}

function lightenColor(hex, percent) {
  hex = hex.replace(/^#/, '');
  let r = parseInt(hex.substr(0, 2), 16);
  let g = parseInt(hex.substr(2, 2), 16);
  let b = parseInt(hex.substr(4, 2), 16);
  r = Math.min(255, Math.round(r + (255 - r) * (percent / 100)));
  g = Math.min(255, Math.round(g + (255 - g) * (percent / 100)));
  b = Math.min(255, Math.round(b + (255 - b) * (percent / 100)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

async function register() {
  if (!supabase) {
    showToast('Supabase not initialized.');
    return;
  }
  showLoading();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setMessage('Please enter a valid email address.');
    hideLoading();
    return;
  }
  if (password.length < 6) {
    setMessage('Password must be at least 6 characters.');
    hideLoading();
    return;
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    setMessage(error.message);
    hideLoading();
    return;
  }
  const user = data.user;
  const defaultData = {
    settings: { employeeName: email.split('@')[0], employeeRole: 'Employee', hourlyRate: 0, bonus: 0, includeBreaks: false },
    rows: [],
    history: []
  };
  await supabase.from('user_data').insert({ id: user.id, data: defaultData });
  login();
  hideLoading();
}

async function login() {
  if (!supabase) {
    showToast('Supabase not initialized.');
    return;
  }
  showLoading();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setMessage('Please enter a valid email address.');
    hideLoading();
    return;
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setMessage(error.message);
    hideLoading();
    return;
  }
  currentUser = data.user.id;
  await loadUserData();
  document.getElementById('loginModal').style.display = 'none';
  document.getElementById('loginBtn').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'block';
  setMessage('');
  hideLoading();
  showToast('Logged in successfully!');
}

function setMessage(msg) {
  document.getElementById('message').innerText = msg;
}

async function loadUserData() {
  if (!currentUser || !supabase) return;
  const { data: dbData, error } = await supabase.from('user_data').select('data').eq('id', currentUser).single();
  if (error || !dbData) {
    console.error('Error loading user data:', error);
    showToast('Failed to load user data.');
    return;
  }
  const userData = dbData.data;
  document.getElementById('employeeName').value = userData.settings?.employeeName || 'Guest';
  document.getElementById('employeeRole').value = userData.settings?.employeeRole || 'Employee';
  document.getElementById('hourlyRate').value = userData.settings?.hourlyRate || 0;
  document.getElementById('bonus').value = userData.settings?.bonus || 0;
  document.getElementById('includeBreaks').checked = userData.settings?.includeBreaks || false;
  historyData = userData.history || [];
  displayHistory();
  const tbody = document.querySelector('#timeSheet tbody');
  tbody.innerHTML = '';
  (userData.rows || []).forEach(rowData => {
    addDay(rowData.date, rowData.workHours, rowData.breakHours, rowData.dayOff);
  });
  updateTotals();
}

async function saveUserData() {
  if (!currentUser || !supabase) return;
  const userData = {
    settings: {
      employeeName: document.getElementById('employeeName').value || 'Guest',
      employeeRole: document.getElementById('employeeRole').value || 'Employee',
      hourlyRate: parseFloat(document.getElementById('hourlyRate').value) || 0,
      bonus: parseFloat(document.getElementById('bonus').value) || 0,
      includeBreaks: document.getElementById('includeBreaks').checked
    },
    rows: [],
    history: historyData
  };
  document.querySelectorAll('#timeSheet tbody tr').forEach(row => {
    userData.rows.push({
      date: row.cells[0].querySelector('input').value,
      dayOff: row.cells[1].querySelector('input').checked,
      workHours: parseFloat(row.cells[2].querySelector('input').value) || 0,
      breakHours: parseFloat(row.cells[3].querySelector('input').value) || 0
    });
  });
  const { error } = await supabase.from('user_data').upsert({ id: currentUser, data: userData });
  if (error) {
    console.error('Error saving user data:', error);
    showToast('Failed to save data.');
  } else {
    updateLastModified();
  }
}

async function logout() {
  if (!supabase) {
    showToast('Supabase not initialized.');
    return;
  }
  showLoading();
  if (currentUser) await saveUserData();
  await supabase.auth.signOut();
  currentUser = null;
  document.getElementById('loginModal').style.display = 'none';
  document.getElementById('loginBtn').style.display = 'block';
  document.getElementById('logoutBtn').style.display = 'none';
  document.querySelector('#timeSheet tbody').innerHTML = '';
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

function toggleTheme() {
  isDarkMode = !isDarkMode;
  document.body.classList.toggle('dark-mode', isDarkMode);
  document.querySelector('.theme-toggle').innerHTML = isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode';
  localStorage.setItem(THEME_KEY, isDarkMode ? 'dark' : 'light');
}

function applyTheme() {
  document.body.classList.toggle('dark-mode', isDarkMode);
  document.querySelector('.theme-toggle').innerHTML = isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode';
}

function applyCustomTheme() {
  const savedColor = localStorage.getItem(COLOR_KEY);
  if (savedColor) {
    const { primary } = JSON.parse(savedColor);
    document.documentElement.style.setProperty('--primary-color', primary);
    document.documentElement.style.setProperty('--primary-gradient', `linear-gradient(135deg, ${primary} 0%, ${lightenColor(primary, 20)} 100%)`);
    document.documentElement.style.setProperty('--primary-dark', lightenColor(primary, 20));
  }
}

function updateLastModified() {
  document.getElementById('lastUpdated').innerText = new Date().toLocaleString();
}

function showLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.style.display = 'flex';
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.style.display = 'none';
}

function showConfirmDialog(action, message) {
  const dialog = document.getElementById('confirmDialog');
  if (dialog) {
    document.getElementById('confirmMessage').innerText = message;
    dialog.style.display = 'flex';
    lastAction = action;
  }
}

function confirmAction() {
  const dialog = document.getElementById('confirmDialog');
  if (dialog) dialog.style.display = 'none';
  if (lastAction === 'clearAll') {
    clearAll();
  } else if (lastAction.startsWith('deleteHistory')) {
    const id = parseInt(lastAction.split('-')[1]);
    deleteHistory(id);
  }
  lastAction = null;
}

function cancelAction() {
  const dialog = document.getElementById('confirmDialog');
  if (dialog) dialog.style.display = 'none';
  lastAction = null;
}

function getYearWeek(dateStr) {
  const date = new Date(dateStr);
  if (isNaN(date)) return { year: new Date().getFullYear(), week: 1 };
  const year = date.getFullYear();
  let d = new Date(Date.UTC(year, date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year, week: weekNo };
}

function getWeekStr(rows) {
  if (rows.length === 0) {
    const today = new Date().toISOString().split('T')[0];
    const yw = getYearWeek(today);
    return `Week ${yw.week} ${yw.year}`;
  }
  let yearWeeks = [];
  rows.forEach(row => {
    let dateStr = row.cells[0].querySelector('input').value;
    if (dateStr) yearWeeks.push(getYearWeek(dateStr));
  });
  if (yearWeeks.length === 0) return 'No Dates';
  yearWeeks.sort((a, b) => a.year - b.year || a.week - b.week);
  const unique = [...new Set(yearWeeks.map(yw => `${yw.year}-${yw.week}`))].map(s => s.split('-').map(Number)).map(([y, w]) => ({ year: y, week: w }));
  const allYears = new Set(unique.map(u => u.year));
  if (allYears.size > 1) return 'Weeks across multiple years';
  const year = Array.from(allYears)[0];
  const uniqueWeeks = [...new Set(unique.map(u => u.week))].sort((a, b) => a - b);
  return uniqueWeeks.length === 1 ? `Week ${uniqueWeeks[0]} ${year}` : `Weeks ${uniqueWeeks.join(', ')} ${year}`;
}

function addDay(dateStr = "", workHours = 0, breakHours = 1, isDayOff = false) {
  showLoading();
  const tbody = document.querySelector("#timeSheet tbody");
  const selectedDate = document.getElementById("selectedDate")?.value;
  const today = selectedDate || dateStr || new Date().toISOString().split("T")[0];

  const row = document.createElement("tr");
  row.innerHTML = `
    <td><input type="date" value="${today}"></td>
    <td><input type="checkbox" class="day-off" ${isDayOff ? 'checked' : ''}></td>
    <td><input type="number" step="0.01" value="${workHours.toFixed(2)}" min="0" placeholder="0.00" ${isDayOff ? 'disabled' : ''}></td>
    <td><input type="number" step="0.01" value="${breakHours.toFixed(2)}" min="0" placeholder="0.00" ${isDayOff ? 'disabled' : ''}></td>
    <td class="totalHours">0.00</td>
    <td class="amount">$0.00</td>
    <td><button class="delete-btn" onclick="deleteRow(this)">🗑️</button></td>
  `;
  tbody.appendChild(row);
  updateTotals();

  row.querySelectorAll("input").forEach(input => {
    if (input.type === "checkbox") {
      input.addEventListener("change", function() {
        const workInput = row.cells[2].querySelector("input");
        const breakInput = row.cells[3].querySelector("input");
        workInput.disabled = this.checked;
        breakInput.disabled = this.checked;
        if (this.checked) {
          workInput.value = "0.00";
          breakInput.value = "0.00";
        }
        updateTotals();
      });
    } else {
      input.addEventListener("input", updateTotals);
      input.addEventListener("focus", () => input.select());
    }
  });

  row.style.opacity = '0';
  row.style.transform = 'translateY(-20px)';
  setTimeout(() => {
    row.style.transition = 'all 0.3s ease';
    row.style.opacity = '1';
    row.style.transform = 'translateY(0)';
    hideLoading();
    showToast('Day added!');
  }, 100);
}

function addWeek() {
  showLoading();
  const weekStartDate = document.getElementById("weekStartDate")?.value;
  let startDate = weekStartDate ? new Date(weekStartDate) : new Date();
  if (isNaN(startDate)) {
    hideLoading();
    showToast('Please select a valid start date.');
    return;
  }
  for (let i = 0; i < 7; i++) {
    let currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);
    let dateStr = currentDate.toISOString().split("T")[0];
    setTimeout(() => {
      addDay(dateStr, 0, 1, false);
      if (i === 6) {
        hideLoading();
        showToast('Week added!');
      }
    }, i * 100);
  }
}

function deleteRow(btn) {
  showLoading();
  const row = btn.closest('tr');
  row.style.transition = 'all 0.3s ease';
  row.style.opacity = '0';
  row.style.transform = 'translateX(-100px)';
  setTimeout(() => {
    row.remove();
    updateTotals();
    hideLoading();
    showToast('Row deleted!');
  }, 300);
}

function updateTotals() {
  let rate = parseFloat(document.getElementById("hourlyRate")?.value) || 0;
  let bonus = parseFloat(document.getElementById("bonus")?.value) || 0;
  let includeBreaks = document.getElementById("includeBreaks")?.checked || false;
  let totalWorkingHours = 0;
  let totalBreakHours = 0;
  let totalHours = 0;
  let basePay = 0;

  document.querySelectorAll("#timeSheet tbody tr").forEach(row => {
    let isDayOff = row.cells[1].querySelector("input").checked;
    let work = isDayOff ? 0 : parseFloat(row.cells[2].querySelector("input").value) || 0;
    let brk = isDayOff ? 0 : parseFloat(row.cells[3].querySelector("input").value) || 0;
    let hours = work + brk;
    let amount = includeBreaks ? (work + brk) * rate : work * rate;
    
    row.querySelector(".totalHours").innerText = hours.toFixed(2);
    row.querySelector(".amount").innerText = `$${amount.toFixed(2)}`;
    
    totalWorkingHours += work;
    totalBreakHours += brk;
    totalHours += hours;
    basePay += amount;
  });

  const totalWorking = document.getElementById("totalWorkingHours");
  const totalBreak = document.getElementById("totalBreakHours");
  const totalHrs = document.getElementById("totalHours");
  const basePayEl = document.getElementById("basePay");
  const totalValue = document.getElementById("totalValue");
  if (totalWorking) totalWorking.innerText = totalWorkingHours.toFixed(2);
  if (totalBreak) totalBreak.innerText = totalBreakHours.toFixed(2);
  if (totalHrs) totalHrs.innerText = totalHours.toFixed(2);
  if (basePayEl) basePayEl.innerText = `$${basePay.toFixed(2)}`;
  if (totalValue) totalValue.innerText = (basePay + bonus).toFixed(2);
  if (currentUser) saveUserData();
}

async function saveHistory() {
  if (!currentUser) {
    showToast('Please login to save history.');
    return;
  }
  showLoading();
  const rows = document.querySelectorAll("#timeSheet tbody tr");
  if (rows.length === 0) {
    hideLoading();
    showToast('No data to save.');
    return;
  }
  const weekStr = getWeekStr(rows);
  const employeeName = document.getElementById("employeeName")?.value || "Unknown";
  const historyItem = {
    id: Date.now(),
    employee: employeeName,
    weekStr: weekStr,
    totalPayment: document.getElementById("totalValue")?.innerText || "0.00",
    workingHours: document.getElementById("totalWorkingHours")?.innerText || "0.00",
    breakHours: document.getElementById("totalBreakHours")?.innerText || "0.00",
    totalHours: document.getElementById("totalHours")?.innerText || "0.00"
  };
  historyData.push(historyItem);
  await saveUserData();
  displayHistory();
  hideLoading();
  showToast('History saved!');
}

function displayHistory() {
  const historyContainer = document.getElementById("history");
  if (!historyContainer) return;
  historyContainer.innerHTML = historyData.length === 0
    ? '<p style="text-align: center; color: #6b7280;">No history items saved yet.</p>'
    : [...historyData].reverse().map(item => `
      <div class="history-item">
        <div>
          <strong>${item.employee}</strong><br>
          <small>${item.weekStr} | Working: ${item.workingHours} h | Break: ${item.breakHours} h | Total: ${item.totalHours} h | Total Payment: $${item.totalPayment}</small>
        </div>
        <div>
          <strong style="font-size: 1.2em;">$${item.totalPayment}</strong><br>
          <button class="delete-btn" onclick="showConfirmDialog('deleteHistory-${item.id}', 'Are you sure you want to delete this history item?')">Delete</button>
        </div>
      </div>
    `).join('');
}

async function deleteHistory(id) {
  if (!currentUser) return;
  showLoading();
  historyData = historyData.filter(item => item.id !== id);
  await saveUserData();
  displayHistory();
  hideLoading();
  showToast('History item deleted!');
}

function clearAll() {
  showLoading();
  const tbody = document.querySelector("#timeSheet tbody");
  const rows = tbody.querySelectorAll('tr');
  if (rows.length === 0) {
    hideLoading();
    showToast('No entries to clear.');
    return;
  }
  rows.forEach((row, index) => {
    setTimeout(() => {
      row.style.transition = 'all 0.3s ease';
      row.style.opacity = '0';
      row.style.transform = 'translateX(-100px)';
      setTimeout(() => {
        if (row.parentNode) row.remove();
        if (index === rows.length - 1) {
          updateTotals();
          hideLoading();
          showToast('All entries cleared!');
        }
      }, 300);
    }, index * 100);
  });
}

function downloadPDF() {
  if (!window.jspdf) {
    showToast('PDF library not loaded.');
    return;
  }
  showLoading();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const employeeName = document.getElementById("employeeName")?.value || "Unknown";
  const employeeRole = document.getElementById("employeeRole")?.value || "Employee";
  const rows = document.querySelectorAll("#timeSheet tbody tr");
  const weekStr = getWeekStr(rows);

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("Enzo Dialer Time Sheet", 20, 20);
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text(`Employee: ${employeeName}`, 20, 30);
  doc.text(`Role: ${employeeRole}`, 20, 40);
  doc.text(`Payslip for ${weekStr}`, 20, 50);
  doc.setLineWidth(0.5);
  doc.line(20, 55, 190, 55);

  let y = 70;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Date", 20, y);
  doc.text("Day Off", 50, y);
  doc.text("Work Hrs", 80, y);
  doc.text("Break Hrs", 110, y);
  doc.text("Total Hrs", 140, y);
  doc.text("Amount", 170, y);
  y += 10;
  doc.setFont("helvetica", "normal");

  rows.forEach(row => {
    let date = row.cells[0].querySelector("input").value || 'N/A';
    let isDayOff = row.cells[1].querySelector("input").checked ? 'Yes' : 'No';
    let work = row.cells[2].querySelector("input").value || '0';
    let brk = row.cells[3].querySelector("input").value || '0';
    let total = row.querySelector(".totalHours").innerText;
    let amount = row.querySelector(".amount").innerText;
    doc.text(date, 20, y);
    doc.text(isDayOff, 50, y);
    doc.text(work, 80, y);
    doc.text(brk, 110, y);
    doc.text(total, 140, y);
    doc.text(amount, 170, y);
    y += 10;
  });

  y += 10;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`Grand Total: $${document.getElementById("totalValue")?.innerText || "0.00"}`, 20, y);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Enzo Dialer | support@enzodialer.com", 20, 280);

  doc.save(`${employeeName}_timesheet_${new Date().toISOString().split('T')[0]}.pdf`);
  hideLoading();
  showToast('PDF exported!');
}

function generatePDFBase64() {
  if (!window.jspdf) {
    showToast('PDF library not loaded.');
    return '';
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const employeeName = document.getElementById("employeeName")?.value || "Unknown";
  const employeeRole = document.getElementById("employeeRole")?.value || "Employee";
  const rows = document.querySelectorAll("#timeSheet tbody tr");
  const weekStr = getWeekStr(rows);

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("Enzo Dialer Time Sheet", 20, 20);
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text(`Employee: ${employeeName}`, 20, 30);
  doc.text(`Role: ${employeeRole}`, 20, 40);
  doc.text(`Payslip for ${weekStr}`, 20, 50);
  doc.setLineWidth(0.5);
  doc.line(20, 55, 190, 55);

  let y = 70;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Date", 20, y);
  doc.text("Day Off", 50, y);
  doc.text("Work Hrs", 80, y);
  doc.text("Break Hrs", 110, y);
  doc.text("Total Hrs", 140, y);
  doc.text("Amount", 170, y);
  y += 10;
  doc.setFont("helvetica", "normal");

  rows.forEach(row => {
    let date = row.cells[0].querySelector("input").value || 'N/A';
    let isDayOff = row.cells[1].querySelector("input").checked ? 'Yes' : 'No';
    let work = row.cells[2].querySelector("input").value || '0';
    let brk = row.cells[3].querySelector("input").value || '0';
    let total = row.querySelector(".totalHours").innerText;
    let amount = row.querySelector(".amount").innerText;
    doc.text(date, 20, y);
    doc.text(isDayOff, 50, y);
    doc.text(work, 80, y);
    doc.text(brk, 110, y);
    doc.text(total, 140, y);
    doc.text(amount, 170, y);
    y += 10;
  });

  y += 10;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`Grand Total: $${document.getElementById("totalValue")?.innerText || "0.00"}`, 20, y);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Enzo Dialer | support@enzodialer.com", 20, 280);

  return doc.output('datauristring').split(',')[1];
}

function downloadCSV() {
  showLoading();
  const employeeName = document.getElementById("employeeName")?.value || "Unknown";
  let csvContent = "data:text/csv;charset=utf-8,Employee,Date,Day Off,Working Hours,Break Hours,Total Hours,Amount\n";

  document.querySelectorAll("#timeSheet tbody tr").forEach(row => {
    let date = row.cells[0].querySelector("input").value || '';
    let isDayOff = row.cells[1].querySelector("input").checked ? 'Yes' : 'No';
    let work = row.cells[2].querySelector("input").value || '0';
    let brk = row.cells[3].querySelector("input").value || '0';
    let total = row.querySelector(".totalHours").innerText;
    let amt = row.querySelector(".amount").innerText.replace('$', '');
    csvContent += `"${employeeName}","${date}","${isDayOff}","${work}","${brk}","${total}","${amt}"\n`;
  });

  csvContent += `"","","","","","Grand Total:","${document.getElementById("totalValue")?.innerText || "0.00"}"\n`;
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${employeeName}_timesheet_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  hideLoading();
  showToast('CSV exported!');
}

function downloadXLSX() {
  if (!window.XLSX) {
    showToast('XLSX library not loaded.');
    return;
  }
  showLoading();
  const employeeName = document.getElementById("employeeName")?.value || "Unknown";
  let wb = XLSX.utils.book_new();
  let ws_data = [["Employee", "Date", "Day Off", "Working Hours", "Break Hours", "Total Hours", "Amount"]];

  document.querySelectorAll("#timeSheet tbody tr").forEach(row => {
    let date = row.cells[0].querySelector("input").value || '';
    let isDayOff = row.cells[1].querySelector("input").checked ? 'Yes' : 'No';
    let work = row.cells[2].querySelector("input").value || '0';
    let brk = row.cells[3].querySelector("input").value || '0';
    let total = row.querySelector(".totalHours").innerText;
    let amt = row.querySelector(".amount").innerText.replace('$', '');
    ws_data.push([employeeName, date, isDayOff, work, brk, total, amt]);
  });

  ws_data.push(['', '', '', '', '', 'Grand Total:', document.getElementById("totalValue")?.innerText || "0.00"]);
  let ws = XLSX.utils.aoa_to_sheet(ws_data);
  XLSX.utils.book_append_sheet(wb, ws, "Timesheet");
  XLSX.writeFile(wb, `${employeeName}_timesheet_${new Date().toISOString().split('T')[0]}.xlsx`);
  hideLoading();
  showToast('XLSX exported!');
}

function emailData() {
  showLoading();
  const employeeName = document.getElementById("employeeName")?.value || "Unknown";
  const weekStr = getWeekStr(document.querySelectorAll("#timeSheet tbody tr"));
  const pdfBase64 = generatePDFBase64();
  if (!pdfBase64) {
    hideLoading();
    return;
  }
  const filename = `${employeeName}_timesheet_${new Date().toISOString().split('T')[0]}.pdf`;
  const subject = `${employeeName} Timesheet ${new Date().toISOString().split('T')[0]}`;
  const body = `Attached is the timesheet for ${employeeName} for ${weekStr}.\n\nGenerated by Enzo Dialer Time Sheet`;

  const pdfBlob = new Blob([atob(pdfBase64)], { type: 'application/pdf' });
  const pdfUrl = URL.createObjectURL(pdfBlob);
  const tempLink = document.createElement("a");
  tempLink.href = pdfUrl;
  tempLink.download = filename;
  document.body.appendChild(tempLink);
  tempLink.click();
  document.body.removeChild(tempLink);
  URL.revokeObjectURL(pdfUrl);

  const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailtoLink;
  hideLoading();
  showToast('PDF downloaded. Attach it to your email.');
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
      if (document.body.contains(toast)) document.body.removeChild(toast);
    }, 400);
  }, 3000);
}

function exportJSON() {
  if (!currentUser) {
    showToast('Please login to export data.');
    return;
  }
  showLoading();
  const data = {
    settings: {
      employeeName: document.getElementById('employeeName')?.value || 'Guest',
      employeeRole: document.getElementById('employeeRole')?.value || 'Employee',
      hourlyRate: parseFloat(document.getElementById('hourlyRate')?.value) || 0,
      bonus: parseFloat(document.getElementById('bonus')?.value) || 0,
      includeBreaks: document.getElementById('includeBreaks')?.checked || false
    },
    rows: Array.from(document.querySelectorAll('#timeSheet tbody tr')).map(row => ({
      date: row.cells[0].querySelector('input').value,
      dayOff: row.cells[1].querySelector('input').checked,
      workHours: parseFloat(row.cells[2].querySelector('input').value) || 0,
      breakHours: parseFloat(row.cells[3].querySelector('input').value) || 0
    })),
    history: historyData
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `timesheet_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  hideLoading();
  showToast('JSON exported!');
}

function importJSON(file) {
  if (!currentUser) {
    showToast('Please login to import data.');
    return;
  }
  showLoading();
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const importedData = JSON.parse(e.target.result);
      if (!importedData.settings || !importedData.rows) throw new Error('Invalid JSON structure');
      document.getElementById('employeeName').value = importedData.settings.employeeName || 'Guest';
      document.getElementById('employeeRole').value = importedData.settings.employeeRole || 'Employee';
      document.getElementById('hourlyRate').value = importedData.settings.hourlyRate || 0;
      document.getElementById('bonus').value = importedData.settings.bonus || 0;
      document.getElementById('includeBreaks').checked = importedData.settings.includeBreaks || false;
      const tbody = document.querySelector('#timeSheet tbody');
      tbody.innerHTML = '';
      importedData.rows.forEach(rowData => {
        addDay(rowData.date, rowData.workHours, rowData.breakHours, rowData.dayOff);
      });
      historyData = importedData.history || [];
      await saveUserData();
      displayHistory();
      updateTotals();
      hideLoading();
      showToast('JSON imported!');
    } catch (err) {
      console.error('JSON import error:', err);
      hideLoading();
      showToast('Invalid JSON file.');
    }
  };
  reader.onerror = () => {
    hideLoading();
    showToast('Error reading file.');
  };
  reader.readAsText(file);
}

function exportToDrive() {
  if (!currentUser) {
    showToast('Please login to export data.');
    return;
  }
  showLoading();
  const data = JSON.stringify({
    settings: {
      employeeName: document.getElementById('employeeName')?.value || 'Guest',
      employeeRole: document.getElementById('employeeRole')?.value || 'Employee',
      hourlyRate: parseFloat(document.getElementById('hourlyRate')?.value) || 0,
      bonus: parseFloat(document.getElementById('bonus')?.value) || 0,
      includeBreaks: document.getElementById('includeBreaks')?.checked || false
    },
    rows: Array.from(document.querySelectorAll('#timeSheet tbody tr')).map(row => ({
      date: row.cells[0].querySelector('input').value,
      dayOff: row.cells[1].querySelector('input').checked,
      workHours: parseFloat(row.cells[2].querySelector('input').value) || 0,
      breakHours: parseFloat(row.cells[3].querySelector('input').value) || 0
    })),
    history: historyData
  }, null, 2);
  const filename = `timesheet_${new Date().toISOString().split('T')[0]}.json`;
  requestAccessToken(() => {
    const metadata = { name: filename, mimeType: 'application/json' };
    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', new Blob([data], { type: 'application/json' }));
    fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
      body: formData
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
      return res.json();
    }).then(() => {
      hideLoading();
      showToast('Exported to Google Drive!');
    }).catch(err => {
      console.error('Error uploading to Drive:', err);
      hideLoading();
      showToast('Failed to export to Drive. Check API credentials.');
    });
  });
}

function importFromDrive() {
  if (!currentUser) {
    showToast('Please login to import data.');
    return;
  }
  showLoading();
  requestAccessToken(() => {
    if (!window.google?.picker) {
      hideLoading();
      showToast('Google Picker library not loaded.');
      return;
    }
    const view = new google.picker.View(google.picker.ViewId.DOCS);
    view.setMimeTypes('application/json');
    const picker = new google.picker.PickerBuilder()
      .enableFeature(google.picker.Feature.NAV_HIDDEN)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setOAuthToken(accessToken)
      .addView(view)
      .setCallback(pickerCallback)
      .build();
    picker.setVisible(true);
    hideLoading();
  });
}

function pickerCallback(data) {
  if (data.action !== google.picker.Action.PICKED) return;
  showLoading();
  const fileId = data.docs[0].id;
  fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: new Headers({ 'Authorization': 'Bearer ' + accessToken })
  }).then(res => {
    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
    return res.text();
  }).then(async content => {
    try {
      const importedData = JSON.parse(content);
      if (!importedData.settings || !importedData.rows) throw new Error('Invalid JSON structure');
      document.getElementById('employeeName').value = importedData.settings.employeeName || 'Guest';
      document.getElementById('employeeRole').value = importedData.settings.employeeRole || 'Employee';
      document.getElementById('hourlyRate').value = importedData.settings.hourlyRate || 0;
      document.getElementById('bonus').value = importedData.settings.bonus || 0;
      document.getElementById('includeBreaks').checked = importedData.settings.includeBreaks || false;
      const tbody = document.querySelector('#timeSheet tbody');
      tbody.innerHTML = '';
      importedData.rows.forEach(rowData => {
        addDay(rowData.date, rowData.workHours, rowData.breakHours, rowData.dayOff);
      });
      historyData = importedData.history || [];
      await saveUserData();
      displayHistory();
      updateTotals();
      hideLoading();
      showToast('Imported from Google Drive!');
    } catch (err) {
      console.error('Error parsing Drive file:', err);
      hideLoading();
      showToast('Invalid JSON file from Drive.');
    }
  }).catch(err => {
    console.error('Error importing from Drive:', err);
    hideLoading();
    showToast('Failed to import from Drive. Check permissions.');
  });
}

function processInsightfulFile(file) {
  showLoading();
  const reader = new FileReader();
  reader.onload = function(e) {
    let data = e.target.result;
    const possibleDateHeaders = ['date', 'day', 'start', 'end', 'worked date'];
    const possibleHoursHeaders = ['duration', 'hours', 'time', 'worked', 'work hours'];

    if (file.name.endsWith('.csv')) {
      let lines = data.split('\n').filter(line => line.trim());
      if (lines.length < 1) {
        hideLoading();
        showToast('Empty CSV file.');
        return;
      }
      let headers = lines[0].split(',').map(h => h.toLowerCase().trim());
      let dateIdx = headers.findIndex(h => possibleDateHeaders.some(ph => h.includes(ph)));
      let hoursIdx = headers.findIndex(h => possibleHoursHeaders.some(ph => h.includes(ph)));
      if (dateIdx === -1 || hoursIdx === -1) {
        hideLoading();
        showToast('Invalid CSV format: Missing Date or Hours column.');
        return;
      }
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        let cols = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(col => col.replace(/^"|"$/g, '').trim());
        let date = cols[dateIdx];
        if (date) {
          let parsedDate = new Date(date);
          if (isNaN(parsedDate)) {
            let parts = date.split(/[-\/]/);
            if (parts.length === 3) {
              parsedDate = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`) || new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            }
          }
          if (!isNaN(parsedDate)) {
            date = parsedDate.toISOString().split('T')[0];
            let hoursStr = cols[hoursIdx];
            let hours = parseFloat(hoursStr) || 0;
            if (hoursStr && hoursStr.includes(':')) {
              let [h, m] = hoursStr.split(':').map(Number);
              hours = h + (m / 60);
            }
            addDay(date, hours, 1, false);
          }
        }
      }
    } else if (file.name.endsWith('.xlsx')) {
      let workbook = XLSX.read(data, { type: 'binary' });
      let sheetName = workbook.SheetNames[0];
      let sheet = workbook.Sheets[sheetName];
      let json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (json.length < 1) {
        hideLoading();
        showToast('Empty XLSX file.');
        return;
      }
      let headers = json[0].map(h => (h || '').toLowerCase().trim());
      let dateIdx = headers.findIndex(h => possibleDateHeaders.some(ph => h.includes(ph)));
      let hoursIdx = headers.findIndex(h => possibleHoursHeaders.some(ph => h.includes(ph)));
      if (dateIdx === -1 || hoursIdx === -1) {
        hideLoading();
        showToast('Invalid XLSX format: Missing Date or Hours column.');
        return;
      }
      for (let i = 1; i < json.length; i++) {
        let row = json[i];
        let date = row[dateIdx];
        if (date) {
          if (typeof date === 'number') {
            let dateObj = XLSX.SSF.parse_date_code(date);
            date = `${dateObj.y}-${String(dateObj.m).padStart(2, '0')}-${String(dateObj.d).padStart(2, '0')}`;
          }
          let parsedDate = new Date(date);
          if (!isNaN(parsedDate)) {
            date = parsedDate.toISOString().split('T')[0];
            let hours = parseFloat(row[hoursIdx]) || 0;
            addDay(date, hours, 1, false);
          }
        }
      }
    }
    updateTotals();
    hideLoading();
    showToast('Insightful data imported!');
  };
  reader.onerror = () => {
    hideLoading();
    showToast('Error reading file.');
  };
  reader.readAsBinaryString(file);
}

// Event Listeners
function setupEventListeners() {
  const elements = {
    employeeName: document.getElementById("employeeName"),
    employeeRole: document.getElementById("employeeRole"),
    hourlyRate: document.getElementById("hourlyRate"),
    bonus: document.getElementById("bonus"),
    includeBreaks: document.getElementById("includeBreaks"),
    addDayBtn: document.getElementById("addDayBtn"),
    addWeekBtn: document.getElementById("addWeekBtn"),
    saveHistoryBtn: document.getElementById("saveHistoryBtn"),
    clearAllBtn: document.getElementById("clearAllBtn"),
    exportPDFBtn: document.getElementById("exportPDFBtn"),
    exportCSVBtn: document.getElementById("exportCSVBtn"),
    exportXLSXBtn: document.getElementById("exportXLSXBtn"),
    emailDataBtn: document.getElementById("emailDataBtn"),
    exportJSONBtn: document.getElementById("exportJSONBtn"),
    importJSONBtn: document.getElementById("importJSONBtn"),
    exportDriveBtn: document.getElementById("exportDriveBtn"),
    importDriveBtn: document.getElementById("importDriveBtn"),
    importInsightfulBtn: document.getElementById("importInsightfulBtn"),
    loginBtn: document.getElementById("loginBtn"),
    logoutBtn: document.getElementById("logoutBtn"),
    themeToggle: document.querySelector(".theme-toggle"),
    applyColorBtn: document.getElementById("applyColorBtn"),
    cancelColorBtn: document.getElementById("cancelColorBtn"),
    confirmBtn: document.getElementById("confirmBtn"),
    cancelBtn: document.getElementById("cancelBtn"),
    loginSubmitBtn: document.getElementById("loginSubmitBtn"),
    registerBtn: document.getElementById("registerBtn")
  };

  if (elements.employeeName) elements.employeeName.addEventListener("input", () => currentUser && saveUserData());
  if (elements.employeeRole) elements.employeeRole.addEventListener("input", () => currentUser && saveUserData());
  if (elements.hourlyRate) elements.hourlyRate.addEventListener("input", updateTotals);
  if (elements.bonus) elements.bonus.addEventListener("input", updateTotals);
  if (elements.includeBreaks) elements.includeBreaks.addEventListener("change", updateTotals);
  if (elements.addDayBtn) elements.addDayBtn.addEventListener("click", addDay);
  if (elements.addWeekBtn) elements.addWeekBtn.addEventListener("click", addWeek);
  if (elements.saveHistoryBtn) elements.saveHistoryBtn.addEventListener("click", saveHistory);
  if (elements.clearAllBtn) elements.clearAllBtn.addEventListener("click", () => showConfirmDialog('clearAll', 'Are you sure you want to clear all entries?'));
  if (elements.exportPDFBtn) elements.exportPDFBtn.addEventListener("click", downloadPDF);
  if (elements.exportCSVBtn) elements.exportCSVBtn.addEventListener("click", downloadCSV);
  if (elements.exportXLSXBtn) elements.exportXLSXBtn.addEventListener("click", downloadXLSX);
  if (elements.emailDataBtn) elements.emailDataBtn.addEventListener("click", emailData);
  if (elements.exportJSONBtn) elements.exportJSONBtn.addEventListener("click", exportJSON);
  if (elements.importJSONBtn) elements.importJSONBtn.addEventListener("change", e => e.target.files[0] && importJSON(e.target.files[0]));
  if (elements.exportDriveBtn) elements.exportDriveBtn.addEventListener("click", exportToDrive);
  if (elements.importDriveBtn) elements.importDriveBtn.addEventListener("click", importFromDrive);
  if (elements.importInsightfulBtn) elements.importInsightfulBtn.addEventListener("change", e => e.target.files[0] && processInsightfulFile(e.target.files[0]));
  if (elements.loginBtn) elements.loginBtn.addEventListener("click", showLoginModal);
  if (elements.logoutBtn) elements.logoutBtn.addEventListener("click", logout);
  if (elements.themeToggle) elements.themeToggle.addEventListener("click", toggleTheme);
  if (elements.applyColorBtn) elements.applyColorBtn.addEventListener("click", applyCustomColor);
  if (elements.cancelColorBtn) elements.cancelColorBtn.addEventListener("click", closeColorPicker);
  if (elements.confirmBtn) elements.confirmBtn.addEventListener("click", confirmAction);
  if (elements.cancelBtn) elements.cancelBtn.addEventListener("click", cancelAction);
  if (elements.loginSubmitBtn) elements.loginSubmitBtn.addEventListener("click", login);
  if (elements.registerBtn) elements.registerBtn.addEventListener("click", register);
}

document.addEventListener('DOMContentLoaded', async function() {
  applyTheme();
  applyCustomTheme();
  setupEventListeners();
  if (window.gapi) initGapi();
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      currentUser = session.user.id;
      await loadUserData();
      document.getElementById('loginBtn').style.display = 'none';
      document.getElementById('logoutBtn').style.display = 'block';
    } else {
      document.getElementById('loginBtn').style.display = 'block';
      document.getElementById('logoutBtn').style.display = 'none';
      document.getElementById('employeeName').value = 'Guest';
      document.getElementById('employeeRole').value = 'Employee';
      document.getElementById('hourlyRate').value = 0;
    }
  }
  displayHistory();
  updateLastModified();
});

document.addEventListener('keydown', function(e) {
  if (e.ctrlKey) {
    switch(e.key) {
      case 'd': e.preventDefault(); addDay(); break;
      case 's': e.preventDefault(); saveHistory(); break;
    }
  }
});
