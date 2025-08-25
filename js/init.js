function initializeApp() {
    applyTheme();
    initGapi();
    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            currentUser = session.user.id;
            loadUserData();
        } else {
            currentUser = null;
            document.getElementById('loginSection').classList.remove('hidden');
            document.getElementById('userInterface').classList.add('hidden');
            document.getElementById('adminPanel').classList.add('hidden');
        }
    });

    // Event Listeners
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', loginUser);
    }
    const logoutButton = document.getElementById('logout');
    if (logoutButton) {
        logoutButton.addEventListener('click', logoutUser);
    }
    const adminLogoutButton = document.getElementById('adminLogout');
    if (adminLogoutButton) {
        adminLogoutButton.addEventListener('click', logoutUser);
    }
    const addUserForm = document.getElementById('addUserForm');
    if (addUserForm) {
        addUserForm.addEventListener('submit', saveUser);
    }
    document.querySelectorAll('.nav-tab').forEach(tab => tab.addEventListener('click', switchTab));
    const addDayButton = document.getElementById('addDay');
    if (addDayButton) {
        addDayButton.addEventListener('click', addDay);
    }
    const addWeekButton = document.getElementById('addWeek');
    if (addWeekButton) {
        addWeekButton.addEventListener('click', addWeek);
    }
    const submitPayslipButton = document.getElementById('submitPayslip');
    if (submitPayslipButton) {
        submitPayslipButton.addEventListener('click', submitPayslip);
    }
    const saveHistoryButton = document.getElementById('saveHistory');
    if (saveHistoryButton) {
        saveHistoryButton.addEventListener('click', saveHistory);
    }
    const exportPdfButton = document.getElementById('exportPdf');
    if (exportPdfButton) {
        exportPdfButton.addEventListener('click', exportPdf);
    }
    const exportCsvButton = document.getElementById('exportCsv');
    if (exportCsvButton) {
        exportCsvButton.addEventListener('click', exportCsv);
    }
    const exportXlsxButton = document.getElementById('exportXlsx');
    if (exportXlsxButton) {
        exportXlsxButton.addEventListener('click', exportXlsx);
    }
    const exportJsonButton = document.getElementById('exportJson');
    if (exportJsonButton) {
        exportJsonButton.addEventListener('click', exportJson);
    }
    const importJsonButton = document.getElementById('importJson');
    if (importJsonButton) {
        importJsonButton.addEventListener('click', ()  => importJsonFile.click());
    }
    const importJsonFile = document.getElementById('importJsonFile');
    if (importJsonFile) {
        importJsonFile.addEventListener('change', handleImportJson);
    }
    const uploadInsightful = document.getElementById('uploadInsightful');
    if (uploadInsightful) {
        uploadInsightful.addEventListener('change', handleUploadInsightful);
    }
    const clearAllButton = document.getElementById('clearAll');
    if (clearAllButton) {
        clearAllButton.addEventListener('click', confirmClearAll);
    }
    const exportPendingPdfButton = document.getElementById('exportPendingPdf');
    if (exportPendingPdfButton) {
        exportPendingPdfButton.addEventListener('click', () => exportAllPayslips('pdf', 'pending'));
    }
    const exportPendingCsvButton = document.getElementById('exportPendingCsv');
    if (exportPendingCsvButton) {
        exportPendingCsvButton.addEventListener('click', () => exportAllPayslips('csv', 'pending'));
    }
    const exportPendingJsonButton = document.getElementById('exportPendingJson');
    if (exportPendingJsonButton) {
        exportPendingJsonButton.addEventListener('click', () => exportAllPayslips('json', 'pending'));
    }
    const exportPaidPdfButton = document.getElementById('exportPaidPdf');
    if (exportPaidPdfButton) {
        exportPaidPdfButton.addEventListener('click', () => exportAllPayslips('pdf', 'paid'));
    }
    const exportPaidCsvButton = document.getElementById('exportPaidCsv');
    if (exportPaidCsvButton) {
        exportPaidCsvButton.addEventListener('click', () => exportAllPayslips('csv', 'paid'));
    }
    const exportPaidJsonButton = document.getElementById('exportPaidJson');
    if (exportPaidJsonButton) {
        exportPaidJsonButton.addEventListener('click', () => exportAllPayslips('json', 'paid'));
    }
    const toggleDarkModeButton = document.getElementById('toggleDarkMode');
    if (toggleDarkModeButton) {
        toggleDarkModeButton.addEventListener('click', toggleDarkMode);
    }
    const toggleDarkModeAdminButton = document.getElementById('toggleDarkModeAdmin');
    if (toggleDarkModeAdminButton) {
        toggleDarkModeAdminButton.addEventListener('click', toggleDarkMode);
    }
    const detailsModalClose = document.querySelector('#detailsModal .close');
    if (detailsModalClose) {
        detailsModalClose.addEventListener('click', () => document.getElementById('detailsModal').style.display = 'none');
    }
    const cancelActionButton = document.getElementById('cancelAction');
    if (cancelActionButton) {
        cancelActionButton.addEventListener('click', () => document.getElementById('confirmModal').style.display = 'none');
    }
    const confirmActionButton = document.getElementById('confirmAction');
    if (confirmActionButton) {
        confirmActionButton.addEventListener('click', confirmAction);
    }

    
    // Load saved theme
    const savedColor = localStorage.getItem('enzo_timesheet_color');
    if (savedColor) {
        document.documentElement.style.setProperty('--primary', savedColor);
        document.documentElement.style.setProperty('--secondary', darkenColor(savedColor, 10));
    }
}

// Add to your switchTab function
function switchTab(e) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    document.getElementById(`${e.target.dataset.tab}Tab`).classList.add('active');
    
    // Load admin activity log when that tab is selected
    if (e.target.dataset.tab === 'activity') {
        renderAdminActivityLog();
    }
}

function confirmAction() {
    // Placeholder function to be overridden by specific actions
    document.getElementById('confirmModal').style.display = 'none';
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', initializeApp);

