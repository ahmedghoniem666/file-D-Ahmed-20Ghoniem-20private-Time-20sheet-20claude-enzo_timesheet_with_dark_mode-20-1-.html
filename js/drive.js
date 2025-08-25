//drive.js
const clientId = '436453721202-5sla62q3831mivqsg8fi3d2ikkfn9rk2.apps.googleusercontent.com';
const apiKey = 'AIzaSyAay2U_9KPZje3lb2zZ34RBaHrnzCsx1wY';
const appId = '436453721202';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
let tokenClient;
let accessToken;

function reloadGapiScript(callback) {
  console.log('Reloading Google API script...');
  const existingScript = document.querySelector('script[src="https://apis.google.com/js/api.js"]');
  if (existingScript) {
    existingScript.remove();
  }
  const script = document.createElement('script');
  script.src = 'https://apis.google.com/js/api.js';
  script.async = true;
  script.defer = true;
  script.onload = () => {
    console.log('Google API script loaded');
    callback();
  };
  script.onerror = () => {
    console.error('Failed to load Google API script');
    showToast('Failed to load Google API script.');
  };
  document.head.appendChild(script);
}

function initGapi() {
  if (typeof gapi === 'undefined') {
    console.warn('gapi not available, attempting to reload');
    reloadGapiScript(() => {
      gapi.load('client:picker', {
        callback: initializeGapiClient,
        onerror: () => {
          console.error('Failed to load gapi client:picker');
          showToast('Failed to load Google Picker library.');
        }
      });
    });
    return;
  }
  gapi.load('client:picker', {
    callback: initializeGapiClient,
    onerror: () => {
      console.error('Failed to load gapi client:picker');
      showToast('Failed to load Google Picker library.');
    }
  });
}

function initializeGapiClient() {
  gapi.client.init({
    apiKey: apiKey,
    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
  }).then(() => {
    console.log('Google API client initialized successfully');
    const exportToDriveButton = document.getElementById('exportToDrive');
    if (exportToDriveButton) {
      exportToDriveButton.addEventListener('click', exportToDrive);
    }
    const importFromDriveButton = document.getElementById('importFromDrive');
    if (importFromDriveButton) {
      importFromDriveButton.addEventListener('click', importFromDrive);
    }
  }).catch((err) => {
    console.error('Error initializing Google API client:', err);
    showToast('Failed to initialize Google API client.');
  });
}

function requestAccessToken(callback) {
  if (accessToken) {
    fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { 'Authorization': 'Bearer ' + accessToken }
    }).then(res => {
      if (res.ok) {
        callback();
      } else {
        console.warn('Access token invalid, requesting new one');
        accessToken = null;
        requestNewToken(callback);
      }
    }).catch(err => {
      console.error('Token validation error:', err);
      requestNewToken(callback);
    });
    return;
  }
  requestNewToken(callback);
}

function requestNewToken(callback) {
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    console.error('Google Identity Services script not loaded');
    showToast('Google authentication script failed to load.');
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: (resp) => {
      if (resp.error) {
        console.error('OAuth error:', resp);
        showToast('Google authentication failed: ' + resp.error);
        return;
      }
      accessToken = resp.access_token;
      console.log('Access token received');
      callback();
    }
  });
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

async function exportToDrive() {
  showLoading();
  if (!currentUser) {
    hideLoading();
    showToast('Please login to export data.');
    return;
  }

  const payslipData = getPayslipData();
  if (!payslipData.days.length) {
    hideLoading();
    showToast('No timesheet data to export.');
    return;
  }

  let data;
  try {
    data = JSON.stringify(payslipData, null, 2);
  } catch (err) {
    hideLoading();
    showToast('Error preparing data for export.');
    return;
  }

  const filename = `EnzoPay_Timesheet_${new Date().toISOString().split('T')[0]}.json`;
  const mimeType = 'application/json';

  requestAccessToken(() => {
    const metadata = {
      name: filename,
      mimeType: mimeType,
      parents: ['root']
    };

    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', new Blob([data], { type: mimeType }));

    fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + accessToken },
      body: formData
    }).then(res => res.json()).then(file => {
      hideLoading();
      showToast('Exported to Google Drive successfully!');
    }).catch(err => {
      hideLoading();
      showToast(`Error exporting to Drive: ${err.message}`);
    });
  });
}

async function importFromDrive() {
  showLoading();
  if (!currentUser) {
    hideLoading();
    showToast('Please login to import data.');
    return;
  }
  if (typeof gapi === 'undefined') {
    reloadGapiScript(() => loadPicker());
    return;
  }
  loadPicker();
}

function loadPicker() {
  gapi.load('picker', {
    callback: () => {
      requestAccessToken(() => {
        if (typeof google === 'undefined' || typeof google.picker === 'undefined') {
          showToast('Google Picker library failed to load.');
          hideLoading();
          return;
        }
        const view = new google.picker.View(google.picker.ViewId.DOCS);
        view.setMimeTypes('application/json');
        const picker = new google.picker.PickerBuilder()
          .setAppId(appId)
          .setOAuthToken(accessToken)
          .addView(view)
          .setCallback(pickerCallback)
          .build();
        picker.setVisible(true);
        hideLoading();
      });
    },
    onerror: () => {
      showToast('Failed to load Google Picker library.');
      hideLoading();
    }
  });
}

async function pickerCallback(data) {
  if (data.action === google.picker.Action.PICKED) {
    showLoading();
    const fileId = data.docs[0].id;
    const fileName = data.docs[0].name;
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const content = await res.text();
      const importedData = JSON.parse(content);
      if (!importedData.days || !Array.isArray(importedData.days)) {
        showToast('Invalid timesheet data format.');
        hideLoading();
        return;
      }
      document.getElementById('timesheetBody').innerHTML = '';
      importedData.days.forEach(day => addDay(day.date, day.workHours || 0, day.breakHours || 0, day.dayOff || false));
      document.getElementById('employeeName').value = importedData.employeeName || '';
      document.getElementById('employeeRole').value = importedData.employeeRole || '';
      document.getElementById('hourlyRate').value = importedData.hourlyRate || 0;
      document.getElementById('bonus').value = importedData.bonus || 0;
      document.getElementById('includeBreaks').checked = importedData.includeBreaks || false;
      updateRowAndTotals();
      saveDraft();
      hideLoading();
      showToast(`Imported "${fileName}" from Google Drive!`);
    } catch (err) {
      hideLoading();
      showToast(`Error importing from Drive: ${err.message}`);
    }
  } else if (data.action === google.picker.Action.CANCEL) {
    showToast('File selection cancelled.');
    hideLoading();
  }
}