(() => {
  const storageKey = 'arcade-theme';
  const darkThemeColor = '#10171d';
  const lightThemeColor = '#e9f7ed';
  const root = document.documentElement;

  function getTheme() {
    const savedTheme = localStorage.getItem(storageKey);
    return savedTheme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    root.dataset.theme = isDark ? 'dark' : 'light';

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = isDark ? darkThemeColor : lightThemeColor;

    const toggle = document.querySelector('.theme-toggle');
    if (toggle) {
      toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      toggle.setAttribute('aria-pressed', String(isDark));
    }
  }

  applyTheme(getTheme());

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(getTheme());
    const toggle = document.querySelector('.theme-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
      const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(storageKey, nextTheme);
      applyTheme(nextTheme);
    });
  });
})();
