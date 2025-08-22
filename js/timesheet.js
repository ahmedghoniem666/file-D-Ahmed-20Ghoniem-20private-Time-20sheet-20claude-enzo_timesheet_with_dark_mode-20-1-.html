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
        row.filter(filledCell).length >= filteredData[index + 1]?.filter(filledCell).length
      );
      if (headerRowIndex === -1 || headerRowIndex > 25) {
        headerRowIndex = 0;
      }
      var csv = XLSX.utils.aoa_to_sheet(filteredData.slice(headerRowIndex));
      csv = XLSX.utils.sheet_to_csv(csv, { header: 1 });
      return csv;
    } catch (e) {
      console.error(e);
      return "";
    }
  }
  return gk_fileData[filename] || "";
}

var gk_isXlsx = false;
var gk_xlsxFileLookup = {};
var gk_fileData = {};

function showConfirmDialog(action, message) {
  lastAction = action;
  document.getElementById('confirmMessage').innerText = message;
  document.getElementById('confirmDialog').style.display = 'flex';
}

function confirmAction() {
  document.getElementById('confirmDialog').style.display = 'none';
  if (lastAction === 'clearAll') {
    clearAll();
  } else if (lastAction.startsWith('deleteHistory')) {
    const id = parseInt(lastAction.split('-')[1]);
    deleteHistory(id);
  }
  lastAction = null;
}

function cancelAction() {
  document.getElementById('confirmDialog').style.display = 'none';
  lastAction = null;
}

function getYearWeek(dateStr) {
  const date = new Date(dateStr);
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
    if (dateStr) {
      yearWeeks.push(getYearWeek(dateStr));
    }
  });

  if (yearWeeks.length === 0) {
    return 'No Dates';
  }

  yearWeeks.sort((a, b) => a.year - b.year || a.week - b.week);
  const unique = [...new Set(yearWeeks.map(yw => `${yw.year}-${yw.week}`))].map(s => s.split('-').map(Number)).map(([y, w]) => ({year: y, week: w}));

  const allYears = new Set(unique.map(u => u.year));
  if (allYears.size > 1) {
    return 'Weeks across multiple years';
  } else {
    const year = Array.from(allYears)[0];
    const uniqueWeeks = [...new Set(unique.map(u => u.week))].sort((a, b) => a - b);
    if (uniqueWeeks.length === 1) {
      return `Week ${uniqueWeeks[0]} ${year}`;
    } else if (uniqueWeeks.length === 2) {
      return `Week ${uniqueWeeks[0]} and ${uniqueWeeks[1]} ${year}`;
    } else {
      return `Weeks ${uniqueWeeks.join(', ')} ${year}`;
    }
  }
}

function addDay(dateStr = "", workHours = 0, breakHours = 0, isDayOff = false) {
  showLoading();
  const tbody = document.querySelector("#timeSheet tbody");
  const row = document.createElement("tr");
  const selectedDate = document.getElementById("selectedDate").value;
  const today = selectedDate || dateStr || new Date().toISOString().split("T")[0];

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
      input.addEventListener("focus", function() {
        this.select();
      });
    }
  });

  row.style.opacity = '0';
  row.style.transform = 'translateY(-20px)';
  setTimeout(() => {
    row.style.transition = 'all 0.3s ease';
    row.style.opacity = '1';
    row.style.transform = 'translateY(0)';
    hideLoading();
    showToast('Day added successfully!');
  }, 100);
}

function addWeek() {
  showLoading();
  const weekStartDate = document.getElementById("weekStartDate").value;
  let startDate = weekStartDate ? new Date(weekStartDate) : new Date();
  for (let i = 0; i < 7; i++) {
    let currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);
    let dateStr = currentDate.toISOString().split("T")[0];
    setTimeout(() => {
      addDay(dateStr);
      if (i === 6) {
        hideLoading();
        showToast('Week added successfully!');
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
    showToast('Row deleted successfully!');
  }, 300);
}

function updateTotals() {
  let rate = parseFloat(document.getElementById("hourlyRate").value) || 0;
  let bonus = parseFloat(document.getElementById("bonus").value) || 0;
  let includeBreaks = document.getElementById("includeBreaks").checked;
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

  document.getElementById("totalWorkingHours").innerText = totalWorkingHours.toFixed(2);
  document.getElementById("totalBreakHours").innerText = totalBreakHours.toFixed(2);
  document.getElementById("totalHours").innerText = totalHours.toFixed(2);
  document.getElementById("basePay").innerText = `$${basePay.toFixed(2)}`;
  document.getElementById("totalValue").innerText = (basePay + bonus).toFixed(2);
  if (currentUser) saveUserData();
}

function saveHistory() {
  showLoading();
  const rows = document.querySelectorAll("#timeSheet tbody tr");
  const weekStr = getWeekStr(rows);
  const employeeName = document.getElementById("employeeName").value || "Unknown";
  const totalPayment = document.getElementById("totalValue").innerText;
  const workingHours = document.getElementById("totalWorkingHours").innerText;
  const breakHours = document.getElementById("totalBreakHours").innerText;
  const totalHours = document.getElementById("totalHours").innerText;

  const historyItem = {
    id: Date.now(),
    employee: employeeName,
    weekStr: weekStr,
    totalPayment: totalPayment,
    workingHours: workingHours,
    breakHours: breakHours,
    totalHours: totalHours
  };

  historyData.push(historyItem);
  displayHistory();
  if (currentUser) saveUserData();
  hideLoading();
  showToast('History saved successfully!');
}

function displayHistory() {
  const historyContainer = document.getElementById("history");
  historyContainer.innerHTML = '';

  if (historyData.length === 0) {
    historyContainer.innerHTML = '<p style="text-align: center; color: #6b7280;">No history items saved yet.</p>';
    return;
  }

  const displayData = [...historyData].reverse();
  displayData.forEach(item => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerHTML = `
      <div>
        <strong>${item.employee}</strong><br>
        <small>${item.weekStr} Working: ${item.workingHours} h | Break: ${item.breakHours} h | Total: ${item.totalHours} h | Total Payment: ${item.totalPayment}</small>
      </div>
      <div>
        <strong style="font-size: 1.2em;">$${item.totalPayment}</strong><br>
        <button class="delete-btn" onclick="showConfirmDialog('deleteHistory-${item.id}', 'Are you sure you want to delete this history item?')" style="font-size: 0.85em; padding: 8px 14px;">Delete</button>
      </div>
    `;
    historyContainer.appendChild(div);
  });
}

function deleteHistory(id) {
  showLoading();
  historyData = historyData.filter(item => item.id !== id);
  displayHistory();
  if (currentUser) saveUserData();
  hideLoading();
  showToast('History item deleted!');
}

function clearAll() {
  showLoading();
  const tbody = document.querySelector("#timeSheet tbody");
  const rows = tbody.querySelectorAll('tr');

  rows.forEach((row, index) => {
    setTimeout(() => {
      row.style.transition = 'all 0.3s ease';
      row.style.opacity = '0';
      row.style.transform = 'translateX(-100px)';
      setTimeout(() => {
        if (row.parentNode) {
          row.remove();
        }
        if (index === rows.length - 1) {
          updateTotals();
          hideLoading();
          showToast('All entries cleared!');
        }
      }, 300);
    }, index * 100);
  });
}

function processInsightfulFile(file) {
  showLoading();
  const reader = new FileReader();
  reader.onload = function(e) {
    let data = e.target.result;
    let dateIdx, hoursIdx;
    if (file.name.endsWith('.csv')) {
      let csv = data;
      let lines = csv.split('\n');
      let headers = lines[0].split(',').map(h => h.toLowerCase().trim());
      dateIdx = headers.findIndex(h => h.includes('date'));
      hoursIdx = headers.findIndex(h => h.includes('duration') || h.includes('hours') || h.includes('time'));
      if (dateIdx === -1 || hoursIdx === -1) {
        hideLoading();
        showToast('Invalid CSV format: Missing Date or Hours column.');
        return;
      }
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue;
        let cols = lines[i].split(',');
        let date = cols[dateIdx]?.trim();
        if (date) {
          let parsedDate = new Date(date);
          if (isNaN(parsedDate)) {
            let parts = date.split(/[-\/]/);
            if (parts.length === 3) {
              parsedDate = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
              if (isNaN(parsedDate)) {
                parsedDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
              }
            }
          }
          if (!isNaN(parsedDate)) {
            date = parsedDate.toISOString().split('T')[0];
            let hoursStr = cols[hoursIdx]?.trim();
            let hours = parseFloat(hoursStr) || 0;
            if (hoursStr && hoursStr.includes(':')) {
              let [h, m] = hoursStr.split(':').map(Number);
              hours = h + (m / 60);
            }
            addDay(date, hours, 0, false);
          }
        }
      }
    } else {
      let workbook = XLSX.read(data, {type: 'binary'});
      let sheetName = workbook.SheetNames[0];
      let sheet = workbook.Sheets[sheetName];
      let json = XLSX.utils.sheet_to_json(sheet, {header: 1});
      let headers = json[0].map(h => (h || '').toLowerCase().trim());
      dateIdx = headers.findIndex(h => h.includes('date'));
      hoursIdx = headers.findIndex(h => h.includes('duration') || h.includes('hours') || h.includes('time'));
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
            addDay(date, hours, 0, false);
          }
        }
      }
    }
    updateTotals();
    hideLoading();
    showToast('Insightful data imported successfully!');
  };
  if (file.name.endsWith('.csv')) {
    reader.readAsText(file);
  } else {
    reader.readAsBinaryString(file);
  }
}

document.getElementById("hourlyRate").addEventListener("input", updateTotals);
document.getElementById("bonus").addEventListener("input", updateTotals);
document.getElementById("employeeRole").addEventListener("input", () => { if (currentUser) saveUserData(); });