let isDarkMode = localStorage.getItem('enzo_timesheet_theme') === 'dark';

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    isDarkMode = document.body.classList.contains('dark-mode');
    localStorage.setItem('enzo_timesheet_theme', isDarkMode ? 'dark' : 'light');
}

function applyTheme() {
    if (isDarkMode) document.body.classList.add('dark-mode');
}

function showColorPicker() {
    document.getElementById('colorPickerModal').style.display = 'flex';
    document.getElementById('colorPicker').value = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#4361ee';
}

function closeColorPicker() {
    document.getElementById('colorPickerModal').style.display = 'none';
}

function applyCustomColor() {
    const color = document.getElementById('colorPicker').value;
    document.documentElement.style.setProperty('--primary', color);
    document.documentElement.style.setProperty('--secondary', darkenColor(color, 10));
    localStorage.setItem('enzo_timesheet_color', color);
    closeColorPicker();
    showToast('Theme color applied!');
}

function darkenColor(hex, percent) {
    hex = hex.replace('#', '');
    let r = parseInt(hex.substr(0,2), 16);
    let g = parseInt(hex.substr(2,2), 16);
    let b = parseInt(hex.substr(4,2), 16);
    r = Math.max(0, Math.round(r * (1 - percent/100)));
    g = Math.max(0, Math.round(g * (1 - percent/100)));
    b = Math.max(0, Math.round(b * (1 - percent/100)));
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}