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

// Initialize Google API client and Picker
function initGapi() {
  gapi.load('client:picker', initializeGapiClient);
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
      parents: ['root'] // Optional: specify folder, 'root' is default
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
  requestAccessToken(() => {
    const view = new google.picker.View(google.picker.ViewId.DOCS);
    view.setMimeTypes('application/json');
    const picker = new google.picker.PickerBuilder()
      .enableFeature(google.picker.Feature.NAV_HIDDEN)
      .setAppId(appId)
      .setOAuthToken(accessToken)
      .addView(view)
      .setCallback(pickerCallback)
      .build();
    picker.setVisible(true);
    hideLoading();
  });
}

// Handle Picker callback
function pickerCallback(data) {
  if (data.action === google.picker.Action.PICKED) {
    showLoading();
    const fileId = data.docs[0].id;
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
        showToast('Imported from Google Drive!');
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
  }
}