const THEMES = {
  '1. RED THEME': {
    '--primary-green': '#D32F2F',
    '--primary-green-light': '#E53935',
    '--badge-green-bg': '#FFEBEE',
    '--badge-green-text': '#C62828',
    '--nav-active': '#D32F2F',
    '--accent-orange': '#FF5252',
    '--bg-color': '#F8F6F0',
    '--card-bg': '#FFFFFF',
    '--text-dark': '#1A2E20',
  },
  '2. GREEN THEME': {
    '--primary-green': '#14492A',
    '--primary-green-light': '#25663F',
    '--badge-green-bg': '#D4EEDB',
    '--badge-green-text': '#1B6535',
    '--nav-active': '#14492A',
    '--accent-orange': '#E87A13',
    '--bg-color': '#F8F6F0',
    '--card-bg': '#FFFFFF',
    '--text-dark': '#1A2E20',
  },
  '3. BLUE THEME': {
    '--primary-green': '#1565C0',
    '--primary-green-light': '#1E88E5',
    '--badge-green-bg': '#E3F2FD',
    '--badge-green-text': '#0D47A1',
    '--nav-active': '#1565C0',
    '--accent-orange': '#29B6F6',
    '--bg-color': '#F8F6F0',
    '--card-bg': '#FFFFFF',
    '--text-dark': '#1A2E20',
  },
  '4. PURPLE THEME': {
    '--primary-green': '#6A1B9A',
    '--primary-green-light': '#8E24AA',
    '--badge-green-bg': '#F3E5F5',
    '--badge-green-text': '#4A148C',
    '--nav-active': '#6A1B9A',
    '--accent-orange': '#AB47BC',
    '--bg-color': '#F8F6F0',
    '--card-bg': '#FFFFFF',
    '--text-dark': '#1A2E20',
  },
  '5. ORANGE THEME': {
    '--primary-green': '#E65100',
    '--primary-green-light': '#F57C00',
    '--badge-green-bg': '#FFF3E0',
    '--badge-green-text': '#BF360C',
    '--nav-active': '#E65100',
    '--accent-orange': '#FF9800',
    '--bg-color': '#F8F6F0',
    '--card-bg': '#FFFFFF',
    '--text-dark': '#1A2E20',
  },
  '6. TEAL THEME': {
    '--primary-green': '#00695C',
    '--primary-green-light': '#00897B',
    '--badge-green-bg': '#E0F2F1',
    '--badge-green-text': '#004D40',
    '--nav-active': '#00695C',
    '--accent-orange': '#26A69A',
    '--bg-color': '#F8F6F0',
    '--card-bg': '#FFFFFF',
    '--text-dark': '#1A2E20',
  },
  '7. DARK THEME': {
    '--primary-green': '#1E1E1E',
    '--primary-green-light': '#333333',
    '--badge-green-bg': '#303030',
    '--badge-green-text': '#E0E0E0',
    '--nav-active': '#FFFFFF',
    '--accent-orange': '#FFB300',
    '--bg-color': '#121212',
    '--card-bg': '#1E1E1E',
    '--text-dark': '#FFFFFF',
    '--text-gray': '#AAAAAA',
    '--border-color': '#333333'
  },
  '8. PINK THEME': {
    '--primary-green': '#C2185B',
    '--primary-green-light': '#D81B60',
    '--badge-green-bg': '#FCE4EC',
    '--badge-green-text': '#880E4F',
    '--nav-active': '#C2185B',
    '--accent-orange': '#F06292',
    '--bg-color': '#F8F6F0',
    '--card-bg': '#FFFFFF',
    '--text-dark': '#1A2E20',
  },
};

function applyTheme(themeName) {
  const theme = THEMES[themeName];
  if (!theme) return;
  
  for (const [key, value] of Object.entries(theme)) {
    document.documentElement.style.setProperty(key, value);
  }
  // Cache it for instant loading next time
  localStorage.setItem('activeTheme', themeName);
}

async function initTheme() {
  // 1. Apply cached theme instantly to prevent FOUC
  const cachedTheme = localStorage.getItem('activeTheme');
  if (cachedTheme) {
    applyTheme(cachedTheme);
  } else {
    applyTheme('2. GREEN THEME'); // Fallback
  }

  // 2. Fetch the latest from server in the background
  try {
    const res = await fetch(`/api/settings`);
    const settings = await res.json();
    if (settings.theme && settings.theme !== cachedTheme) {
      applyTheme(settings.theme);
    }
  } catch (err) {
    console.error('Failed to load theme settings:', err);
  }
}

// Check if socket is already defined (e.g. from api.js or admin.js)
// If not, we connect it here for the theme updates.
let themeSocket = typeof socket !== 'undefined' ? socket : null;

if (!themeSocket && typeof io !== 'undefined') {
  themeSocket = io(``);
}

if (themeSocket) {
  themeSocket.on('refresh_theme', (newTheme) => {
    applyTheme(newTheme);
  });
}

// Apply theme as early as possible
initTheme();
