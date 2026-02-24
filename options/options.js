// Cookie DevTools — Options Script

document.addEventListener('DOMContentLoaded', () => {
  const themeSelect = document.getElementById('theme');
  const maxLogSelect = document.getElementById('max-log');

  // Load saved settings
  chrome.storage.local.get({ theme: 'auto', maxLog: 500 }, (data) => {
    themeSelect.value = data.theme;
    maxLogSelect.value = String(data.maxLog);
  });

  themeSelect.addEventListener('change', () => {
    chrome.storage.local.set({ theme: themeSelect.value });
  });

  maxLogSelect.addEventListener('change', () => {
    chrome.storage.local.set({ maxLog: parseInt(maxLogSelect.value) });
  });

  document.getElementById('btn-clear-data').addEventListener('click', () => {
    if (confirm('This will delete all saved profiles and the change log. Continue?')) {
      chrome.storage.local.set({ profiles: {}, changeLog: [] }, () => {
        alert('All data cleared.');
      });
    }
  });
});
