// Cookie DevTools — Popup Script

let currentUrl = '';
let currentDomain = '';
let allCookies = [];
let editingCookie = null; // null = adding new, object = editing existing

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Load theme
  const data = await storageGet({ theme: 'auto' });
  applyTheme(data.theme);

  // Get current tab URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url) {
    try {
      const url = new URL(tab.url);
      currentUrl = url.origin + url.pathname;
      currentDomain = url.hostname;
    } catch {
      currentDomain = '';
    }
  }

  // Setup event listeners
  setupTabs();
  setupSearch();
  setupActions();
  setupEditor();
  setupExportMenu();
  setupProfiles();

  // Load initial data
  loadCookies();
}

// --- Helpers ---

function storageGet(defaults) {
  return new Promise((resolve) => chrome.storage.local.get(defaults, resolve));
}

function sendMessage(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2100);
}

function applyTheme(theme) {
  if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add('dark');
  } else {
    document.body.classList.remove('dark');
  }
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatExpiry(cookie) {
  if (cookie.session) return 'Session';
  if (!cookie.expirationDate) return 'Session';
  const d = new Date(cookie.expirationDate * 1000);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function cookieUrl(cookie) {
  const protocol = cookie.secure ? 'https' : 'http';
  const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
  return `${protocol}://${domain}${cookie.path}`;
}

// --- Tab Navigation ---

function setupTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((tc) => tc.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');

      if (tab.dataset.tab === 'monitor') loadChangeLog();
      if (tab.dataset.tab === 'profiles') loadProfiles();
    });
  });
}

// --- Cookie List ---

function setupSearch() {
  document.getElementById('search').addEventListener('input', renderCookies);
}

async function loadCookies() {
  const domainInfo = document.getElementById('domain-info');
  if (currentDomain) {
    domainInfo.textContent = currentDomain;
    const response = await sendMessage({ action: 'getCookies', url: currentUrl });
    allCookies = response.cookies || [];
  } else {
    domainInfo.textContent = 'No active page';
    allCookies = [];
  }
  renderCookies();
}

function renderCookies() {
  const filter = document.getElementById('search').value.toLowerCase();
  const list = document.getElementById('cookie-list');
  const empty = document.getElementById('cookie-empty');

  const filtered = allCookies.filter((c) =>
    c.name.toLowerCase().includes(filter) ||
    c.value.toLowerCase().includes(filter) ||
    c.domain.toLowerCase().includes(filter)
  );

  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    document.getElementById('cookie-count').textContent = '0 cookies';
    return;
  }

  empty.style.display = 'none';
  document.getElementById('cookie-count').textContent = `${filtered.length} cookie${filtered.length !== 1 ? 's' : ''}`;

  list.innerHTML = filtered.map((cookie, i) => {
    const badges = [];
    if (cookie.secure) badges.push('<span class="badge badge-secure">S</span>');
    if (cookie.httpOnly) badges.push('<span class="badge badge-httponly">H</span>');
    if (cookie.session) badges.push('<span class="badge badge-session">Ses</span>');
    const ss = cookie.sameSite;
    if (ss && ss !== 'unspecified') {
      const label = ss === 'no_restriction' ? 'None' : ss.charAt(0).toUpperCase() + ss.slice(1);
      badges.push(`<span class="badge badge-samesite-${ss}">${label}</span>`);
    }

    return `
      <div class="cookie-item" data-index="${i}">
        <span class="cookie-name" title="${escapeHtml(cookie.name)}">${escapeHtml(cookie.name)}</span>
        <span class="cookie-value" title="${escapeHtml(cookie.value)}">${escapeHtml(cookie.value)}</span>
        <span class="cookie-badges">${badges.join('')}</span>
        <span class="cookie-actions">
          <button class="btn-edit" title="Edit">✎</button>
          <button class="btn-copy" title="Copy value">⧉</button>
          <button class="btn-delete" title="Delete">✕</button>
        </span>
      </div>
    `;
  }).join('');

  // Attach event listeners
  list.querySelectorAll('.cookie-item').forEach((item) => {
    const idx = parseInt(item.dataset.index);
    const cookie = filtered[idx];

    item.querySelector('.btn-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditor(cookie);
    });
    item.querySelector('.btn-copy').addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(cookie.value);
      toast('Copied to clipboard');
    });
    item.querySelector('.btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCookie(cookie);
    });
    item.addEventListener('click', () => openEditor(cookie));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function deleteCookie(cookie) {
  const url = cookieUrl(cookie);
  await sendMessage({ action: 'deleteCookie', name: cookie.name, url, storeId: cookie.storeId });
  toast(`Deleted "${cookie.name}"`);
  loadCookies();
}

// --- Actions ---

function setupActions() {
  document.getElementById('btn-add').addEventListener('click', () => openEditor(null));

  document.getElementById('btn-delete-all').addEventListener('click', async () => {
    if (allCookies.length === 0) return;
    const response = await sendMessage({ action: 'deleteAllCookies', url: currentUrl });
    toast(`Deleted ${response.deleted} cookies`);
    loadCookies();
  });

  // Theme toggle
  document.getElementById('btn-theme').addEventListener('click', async () => {
    const isDark = document.body.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';
    chrome.storage.local.set({ theme: newTheme });
    applyTheme(newTheme);
  });

  // Settings
  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

// --- Cookie Editor ---

function setupEditor() {
  document.getElementById('btn-editor-cancel').addEventListener('click', closeEditor);
  document.getElementById('btn-editor-save').addEventListener('click', saveEditor);

  document.getElementById('cookie-editor').addEventListener('click', (e) => {
    if (e.target.id === 'cookie-editor') closeEditor();
  });

  document.getElementById('edit-session').addEventListener('change', (e) => {
    document.getElementById('edit-expires').disabled = e.target.checked;
  });
}

function openEditor(cookie) {
  editingCookie = cookie;
  const modal = document.getElementById('cookie-editor');
  const title = document.getElementById('editor-title');

  if (cookie) {
    title.textContent = 'Edit Cookie';
    document.getElementById('edit-name').value = cookie.name;
    document.getElementById('edit-value').value = cookie.value;
    document.getElementById('edit-domain').value = cookie.domain;
    document.getElementById('edit-path').value = cookie.path;
    document.getElementById('edit-secure').checked = cookie.secure;
    document.getElementById('edit-httponly').checked = cookie.httpOnly;
    document.getElementById('edit-session').checked = cookie.session;
    document.getElementById('edit-samesite').value = cookie.sameSite || 'unspecified';

    const expiresInput = document.getElementById('edit-expires');
    if (cookie.expirationDate) {
      const d = new Date(cookie.expirationDate * 1000);
      expiresInput.value = d.toISOString().slice(0, 16);
    } else {
      expiresInput.value = '';
    }
    expiresInput.disabled = cookie.session;
  } else {
    title.textContent = 'Add Cookie';
    document.getElementById('edit-name').value = '';
    document.getElementById('edit-value').value = '';
    document.getElementById('edit-domain').value = currentDomain ? '.' + currentDomain : '';
    document.getElementById('edit-path').value = '/';
    document.getElementById('edit-secure').checked = false;
    document.getElementById('edit-httponly').checked = false;
    document.getElementById('edit-session').checked = true;
    document.getElementById('edit-samesite').value = 'lax';
    document.getElementById('edit-expires').value = '';
    document.getElementById('edit-expires').disabled = true;
  }

  modal.style.display = 'flex';
  document.getElementById('edit-name').focus();
}

function closeEditor() {
  document.getElementById('cookie-editor').style.display = 'none';
  editingCookie = null;
}

async function saveEditor() {
  const name = document.getElementById('edit-name').value.trim();
  const value = document.getElementById('edit-value').value;
  const domain = document.getElementById('edit-domain').value.trim();
  const path = document.getElementById('edit-path').value.trim() || '/';
  const secure = document.getElementById('edit-secure').checked;
  const httpOnly = document.getElementById('edit-httponly').checked;
  const session = document.getElementById('edit-session').checked;
  const sameSite = document.getElementById('edit-samesite').value;

  if (!name) {
    toast('Cookie name is required');
    return;
  }
  if (!domain) {
    toast('Domain is required');
    return;
  }

  // If editing, delete the old cookie first (in case name/domain changed)
  if (editingCookie) {
    const url = cookieUrl(editingCookie);
    await sendMessage({ action: 'deleteCookie', name: editingCookie.name, url });
  }

  let expirationDate = null;
  if (!session) {
    const expiresVal = document.getElementById('edit-expires').value;
    if (expiresVal) {
      expirationDate = new Date(expiresVal).getTime() / 1000;
    } else {
      // Default: 1 year from now
      expirationDate = Date.now() / 1000 + 365 * 24 * 60 * 60;
    }
  }

  const response = await sendMessage({
    action: 'setCookie',
    cookie: { name, value, domain, path, secure, httpOnly, session, sameSite, expirationDate },
  });

  if (response.error) {
    toast('Error: ' + response.error);
  } else {
    toast(editingCookie ? 'Cookie updated' : 'Cookie added');
    closeEditor();
    loadCookies();
  }
}

// --- Export Menu ---

function setupExportMenu() {
  const btn = document.getElementById('btn-export');
  const menu = document.getElementById('export-menu');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const rect = btn.getBoundingClientRect();
    menu.style.top = rect.bottom + 2 + 'px';
    menu.style.right = (document.body.clientWidth - rect.right) + 'px';
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  });

  document.addEventListener('click', () => {
    menu.style.display = 'none';
  });

  menu.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const format = btn.dataset.format;
      const response = await sendMessage({
        action: 'exportCookies',
        url: currentUrl,
        format,
      });
      await navigator.clipboard.writeText(response.result);
      toast(`Copied ${format.toUpperCase()} to clipboard`);
      menu.style.display = 'none';
    });
  });
}

// --- Monitor ---

async function loadChangeLog() {
  const response = await sendMessage({ action: 'getChangeLog' });
  const log = response.changeLog || [];
  const container = document.getElementById('change-log');
  const empty = document.getElementById('monitor-empty');

  if (log.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  container.innerHTML = log.map((entry) => {
    const isRemoved = entry.removed;
    const iconClass = isRemoved ? 'removed' : 'added';
    const icon = isRemoved ? '−' : '+';
    const causeMap = {
      explicit: 'Set/deleted by page or extension',
      overwrite: 'Overwritten by new value',
      expired: 'Expired',
      evicted: 'Evicted (storage limit)',
      expired_overwrite: 'Expired and overwritten',
    };
    const cause = causeMap[entry.cause] || entry.cause;

    return `
      <div class="change-entry">
        <span class="change-icon ${iconClass}">${icon}</span>
        <div class="change-details">
          <span class="change-name">${escapeHtml(entry.cookie.name)}</span>
          <span class="change-cause">${escapeHtml(entry.cookie.domain)} — ${cause}</span>
        </div>
        <span class="change-time">${formatTime(entry.timestamp)}</span>
      </div>
    `;
  }).join('');

  // Clear log button
  document.getElementById('btn-clear-log').onclick = async () => {
    await sendMessage({ action: 'clearChangeLog' });
    loadChangeLog();
  };
}

// --- Profiles ---

function setupProfiles() {
  document.getElementById('btn-save-profile').addEventListener('click', async () => {
    const name = document.getElementById('profile-name').value.trim();
    if (!name) {
      toast('Enter a profile name');
      return;
    }
    const response = await sendMessage({
      action: 'saveProfile',
      name,
      url: currentUrl,
    });
    toast(`Saved "${name}" (${response.count} cookies)`);
    document.getElementById('profile-name').value = '';
    loadProfiles();
  });
}

async function loadProfiles() {
  const response = await sendMessage({ action: 'getProfiles' });
  const profiles = response.profiles || {};
  const names = Object.keys(profiles);
  const container = document.getElementById('profile-list');
  const empty = document.getElementById('profiles-empty');

  if (names.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  container.innerHTML = names.map((name) => {
    const p = profiles[name];
    const date = formatTime(p.savedAt);
    return `
      <div class="profile-item" data-name="${escapeHtml(name)}">
        <span class="profile-name">${escapeHtml(name)}</span>
        <span class="profile-meta">${p.count} cookies · ${date}</span>
        <span class="profile-actions">
          <button class="action-btn btn-load-profile">Load</button>
          <button class="action-btn danger btn-delete-profile">✕</button>
        </span>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.profile-item').forEach((item) => {
    const name = item.dataset.name;
    item.querySelector('.btn-load-profile').addEventListener('click', async () => {
      const response = await sendMessage({ action: 'loadProfile', name, clearFirst: true });
      if (response.error) {
        toast('Error: ' + response.error);
      } else {
        toast(`Loaded "${name}" (${response.restored} cookies)`);
        loadCookies();
      }
    });
    item.querySelector('.btn-delete-profile').addEventListener('click', async () => {
      await sendMessage({ action: 'deleteProfile', name });
      toast(`Deleted profile "${name}"`);
      loadProfiles();
    });
  });
}
