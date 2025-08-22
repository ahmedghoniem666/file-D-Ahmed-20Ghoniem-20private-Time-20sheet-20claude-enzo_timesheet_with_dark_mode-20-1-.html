function toggleTheme() {
  isDarkMode = !isDarkMode;
  const body = document.body;
  const toggleBtn = document.querySelector('.theme-toggle');
  if (isDarkMode) {
    body.classList.add('dark-mode');
    toggleBtn.innerHTML = '☀️ Light Mode';
    localStorage.setItem(THEME_KEY, 'dark');
  } else {
    body.classList.remove('dark-mode');
    toggleBtn.innerHTML = '🌙 Dark Mode';
    localStorage.setItem(THEME_KEY, 'light');
  }
}

function applyTheme() {
  const body = document.body;
  const toggleBtn = document.querySelector('.theme-toggle');
  if (isDarkMode) {
    body.classList.add('dark-mode');
    toggleBtn.innerHTML = '☀️ Light Mode';
  } else {
    body.classList.remove('dark-mode');
    toggleBtn.innerHTML = '🌙 Dark Mode';
  }
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
  return `#${(r.toString(16).padStart(2, '0'))}${(g.toString(16).padStart(2, '0'))}${(b.toString(16).padStart(2, '0'))}`;
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