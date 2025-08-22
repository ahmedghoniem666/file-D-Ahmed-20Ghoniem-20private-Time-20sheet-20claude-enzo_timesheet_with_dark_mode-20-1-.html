// Google Drive Integration Setup
// Replace with your own credentials from Google Cloud Console
// 1. Create a project in https://console.cloud.google.com
// 2. Enable Drive API
// 3. Create OAuth Client ID (Web application)
// 4. Add authorized JavaScript origins (e.g., http://localhost)
// 5. Get Client ID and API Key
// 6. For Picker, get App ID (Project Number)
const clientId = '436453721202-5sla62q3831mivqsg8fi3d2ikkfn9rk2.apps.googleusercontent.com';
const apiKey = 'AIzaSyAay2U_9KPZje3lb2zZ34RBaHrnzCsx1wY';
const appId = '436453721202'; // For Google Picker
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
let tokenClient;
let accessToken;

// Dynamically reload Google API script if needed
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

// Initialize Google API client and Picker
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

// Initialize Google API client
function initializeGapiClient() {
  gapi.client.init({
    apiKey: apiKey,
    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
  }).then(() => {
    console.log('Google API client initialized successfully');
  }).catch((err) => {
    console.error('Error initializing Google API client:', err);
    showToast('Failed to initialize Google API client.');
  });
}

// Request OAuth access token
function requestAccessToken(callback) {
  if (accessToken) {
    // Verify token validity with a test request
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

// Helper to request a new access token
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
      console.log('Access token received:', accessToken);
      callback();
    }
  });
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

// Export data to Google Drive
function exportToDrive() {
  showLoading();
  if (!currentUser) {
    hideLoading();
    showToast('Please login to export data.');
    return;
  }

  // Validate data before upload
  if (!users[currentUser]?.data) {
    hideLoading();
    showToast('No data available to export.');
    return;
  }

  let data;
  try {
    data = JSON.stringify(users[currentUser].data, null, 2);
  } catch (err) {
    console.error('Error serializing data:', err);
    hideLoading();
    showToast('Error preparing data for export.');
    return;
  }

  const filename = `${currentUser}_timesheet.json`;
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

    console.log('Uploading to Google Drive:', { filename, mimeType });

    fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken
      },
      body: formData
    }).then(res => {
      if (!res.ok) {
        return res.json().then(err => {
          throw new Error(`HTTP ${res.status}: ${JSON.stringify(err)}`);
        });
      }
      return res.json();
    }).then(file => {
      hideLoading();
      showToast('Exported to Google Drive successfully!');
      console.log('File exported:', file);
    }).catch(err => {
      console.error('Error uploading to Drive:', err);
      hideLoading();
      showToast(`Error exporting to Drive: ${err.message}`);
    });
  });
}

// Import data from Google Drive using Picker
function importFromDrive() {
  showLoading();
  if (!currentUser) {
    hideLoading();
    showToast('Please login to import data.');
    return;
  }
  // Ensure gapi is loaded before attempting Picker
  if (typeof gapi === 'undefined') {
    console.warn('gapi not available, attempting to reload');
    reloadGapiScript(() => {
      loadPicker();
    });
    return;
  }
  loadPicker();
}

// Helper to load Picker
function loadPicker() {
  gapi.load('picker', {
    callback: () => {
      console.log('Picker module loaded');
      requestAccessToken(() => {
        if (typeof google === 'undefined' || typeof google.picker === 'undefined') {
          console.error('Google Picker library not loaded');
          showToast('Google Picker library failed to load.');
          hideLoading();
          return;
        }
        try {
          const view = new google.picker.View(google.picker.ViewId.DOCS);
          view.setMimeTypes('application/json,text/plain');
          console.log('Initializing Google Picker with token:', accessToken);
          const picker = new google.picker.PickerBuilder()
            .setAppId(appId)
            .setOAuthToken(accessToken)
            .addView(view)
            .setCallback(pickerCallback)
            .build();
          console.log('Setting Picker visible...');
          picker.setVisible(true);
          hideLoading();
        } catch (err) {
          console.error('Error initializing Google Picker:', err);
          hideLoading();
          showToast(`Failed to launch Google Picker: ${err.message}`);
        }
      });
    },
    onerror: () => {
      console.error('Failed to load Picker module');
      showToast('Failed to load Google Picker library.');
      hideLoading();
    }
  });
}

// Handle Picker callback
function pickerCallback(data) {
  console.log('Picker callback data:', data);
  if (data.action === google.picker.Action.PICKED) {
    showLoading();
    const fileId = data.docs[0].id;
    const fileName = data.docs[0].name;
    console.log('Selected file:', { id: fileId, name: fileName });
    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': 'Bearer ' + accessToken }
    }).then(res => {
      if (!res.ok) {
        return res.json().then(err => {
          throw new Error(`HTTP ${res.status}: ${JSON.stringify(err)}`);
        });
      }
      return res.text();
    }).then(content => {
      try {
        const importedData = JSON.parse(content);
        users[currentUser].data = importedData;
        saveUsers();
        loadUserData();
        hideLoading();
        showToast(`Imported "${fileName}" from Google Drive!`);
      } catch (err) {
        console.error('Error parsing JSON:', err);
        hideLoading();
        showToast('Invalid JSON file from Drive.');
      }
    }).catch(err => {
      console.error('Error importing from Drive:', err);
      hideLoading();
      showToast(`Error importing from Drive: ${err.message}`);
    });
  } else if (data.action === google.picker.Action.CANCEL) {
    console.log('Picker cancelled by user');
    showToast('File selection cancelled.');
  }
}