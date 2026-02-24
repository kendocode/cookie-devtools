// Cookie DevTools — Node.js unit tests for core logic
// Run: node tests/test-core.mjs

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.error(`  FAIL: ${name}`);
  }
}

function assertEq(name, actual, expected) {
  if (actual === expected) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(`    Expected: ${JSON.stringify(expected)}`);
    console.error(`    Actual:   ${JSON.stringify(actual)}`);
  }
}

// ========== Netscape Cookie Format ==========
console.log('\n--- Netscape Cookie Format ---');

function toNetscape(cookies) {
  const lines = ['# Netscape HTTP Cookie File', '# https://curl.se/docs/http-cookies.html', ''];
  for (const c of cookies) {
    const domain = c.domain;
    const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
    const path = c.path;
    const secure = c.secure ? 'TRUE' : 'FALSE';
    const expiry = c.expirationDate ? Math.floor(c.expirationDate) : 0;
    lines.push(`${domain}\t${flag}\t${path}\t${secure}\t${expiry}\t${c.name}\t${c.value}`);
  }
  return lines.join('\n');
}

// Single cookie
{
  const result = toNetscape([{
    domain: '.example.com', path: '/', secure: true,
    expirationDate: 1700000000, name: 'session', value: 'abc123',
  }]);
  assert('Netscape: contains header', result.startsWith('# Netscape HTTP Cookie File'));
  assert('Netscape: domain with dot gets TRUE flag', result.includes('.example.com\tTRUE'));
  assert('Netscape: secure is TRUE', result.includes('\tTRUE\t1700000000'));
  assert('Netscape: name and value', result.includes('session\tabc123'));
}

// Domain without dot
{
  const result = toNetscape([{
    domain: 'example.com', path: '/', secure: false,
    expirationDate: 0, name: 'test', value: 'val',
  }]);
  assert('Netscape: domain without dot gets FALSE flag', result.includes('example.com\tFALSE'));
  assert('Netscape: not secure is FALSE', result.includes('\tFALSE\t0'));
}

// Multiple cookies
{
  const result = toNetscape([
    { domain: '.a.com', path: '/', secure: true, expirationDate: 100, name: 'a', value: '1' },
    { domain: '.b.com', path: '/api', secure: false, expirationDate: 200, name: 'b', value: '2' },
  ]);
  assert('Netscape: multiple cookies both present', result.includes('a\t1') && result.includes('b\t2'));
  assert('Netscape: paths preserved', result.includes('/api'));
}

// Empty array
{
  const result = toNetscape([]);
  assert('Netscape: empty produces only header', result.split('\n').length === 3);
}

// Session cookie (no expiration)
{
  const result = toNetscape([{
    domain: '.example.com', path: '/', secure: false,
    expirationDate: null, name: 'sess', value: 'x',
  }]);
  assert('Netscape: null expiration becomes 0', result.includes('\t0\tsess'));
}

// Cookie with special characters in value
{
  const result = toNetscape([{
    domain: '.example.com', path: '/', secure: false,
    expirationDate: 100, name: 'token', value: 'abc=def;ghi',
  }]);
  assert('Netscape: special chars in value preserved', result.includes('abc=def;ghi'));
}

// ========== curl Export Format ==========
console.log('\n--- curl Export Format ---');

function toCurl(cookies, url) {
  if (cookies.length === 0) return '# No cookies found';
  const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const targetUrl = url || 'https://example.com';
  return `curl -b '${cookieStr}' '${targetUrl}'`;
}

// Single cookie with URL
{
  const result = toCurl([{ name: 'sid', value: '123' }], 'https://api.example.com/v1');
  assertEq('curl: single cookie', result, "curl -b 'sid=123' 'https://api.example.com/v1'");
}

// Multiple cookies
{
  const result = toCurl([
    { name: 'a', value: '1' },
    { name: 'b', value: '2' },
    { name: 'c', value: '3' },
  ], 'https://test.com');
  assertEq('curl: multiple cookies joined with semicolon', result, "curl -b 'a=1; b=2; c=3' 'https://test.com'");
}

// Empty cookies
{
  const result = toCurl([], 'https://test.com');
  assertEq('curl: empty returns comment', result, '# No cookies found');
}

// No URL provided
{
  const result = toCurl([{ name: 'x', value: 'y' }], null);
  assert('curl: null URL uses default', result.includes('https://example.com'));
}

// Cookie with equals in value
{
  const result = toCurl([{ name: 'token', value: 'abc=def' }], 'https://test.com');
  assert('curl: equals in value preserved', result.includes('token=abc=def'));
}

// ========== Cookie Header String ==========
console.log('\n--- Cookie Header String ---');

function toHeaderString(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

assertEq('Header: single cookie', toHeaderString([{ name: 'a', value: '1' }]), 'a=1');
assertEq('Header: multiple cookies', toHeaderString([
  { name: 'a', value: '1' },
  { name: 'b', value: '2' },
]), 'a=1; b=2');
assertEq('Header: empty', toHeaderString([]), '');
assertEq('Header: preserves special chars', toHeaderString([{ name: 'tok', value: 'a=b;c' }]), 'tok=a=b;c');

// ========== Cookie URL Construction ==========
console.log('\n--- Cookie URL Construction ---');

function cookieUrl(cookie) {
  const protocol = cookie.secure ? 'https' : 'http';
  const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
  return `${protocol}://${domain}${cookie.path}`;
}

assertEq('URL: secure + dot domain', cookieUrl({ secure: true, domain: '.example.com', path: '/' }), 'https://example.com/');
assertEq('URL: insecure + no dot', cookieUrl({ secure: false, domain: 'example.com', path: '/' }), 'http://example.com/');
assertEq('URL: with path', cookieUrl({ secure: true, domain: '.api.example.com', path: '/v1' }), 'https://api.example.com/v1');
assertEq('URL: subdomain', cookieUrl({ secure: false, domain: '.sub.domain.com', path: '/a/b' }), 'http://sub.domain.com/a/b');

// ========== HTML Escaping ==========
console.log('\n--- HTML Escaping ---');

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

assertEq('Escape: angle brackets', escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
assertEq('Escape: ampersand', escapeHtml('a&b'), 'a&amp;b');
assertEq('Escape: quotes', escapeHtml('a"b'), 'a&quot;b');
assertEq('Escape: no change for safe text', escapeHtml('hello world'), 'hello world');
assertEq('Escape: empty string', escapeHtml(''), '');
assertEq('Escape: multiple entities', escapeHtml('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');

// ========== Time Formatting ==========
console.log('\n--- Time Formatting ---');

function formatExpiry(cookie) {
  if (cookie.session) return 'Session';
  if (!cookie.expirationDate) return 'Session';
  const d = new Date(cookie.expirationDate * 1000);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

assertEq('Expiry: session cookie', formatExpiry({ session: true }), 'Session');
assertEq('Expiry: no expirationDate', formatExpiry({ session: false, expirationDate: null }), 'Session');
assertEq('Expiry: no expirationDate undefined', formatExpiry({ session: false }), 'Session');
assert('Expiry: valid date formats', formatExpiry({ session: false, expirationDate: 1700000000 }).length > 0);

// ========== Cookie Filtering ==========
console.log('\n--- Cookie Filtering ---');

function filterCookies(cookies, filter) {
  const f = filter.toLowerCase();
  return cookies.filter((c) =>
    c.name.toLowerCase().includes(f) ||
    c.value.toLowerCase().includes(f) ||
    c.domain.toLowerCase().includes(f)
  );
}

const testCookies = [
  { name: 'session_id', value: 'abc123', domain: '.example.com' },
  { name: 'theme', value: 'dark', domain: '.example.com' },
  { name: 'auth_token', value: 'xyz789', domain: '.api.example.com' },
  { name: 'tracker', value: 'ga_123', domain: '.analytics.com' },
];

assertEq('Filter: by name', filterCookies(testCookies, 'session').length, 1);
assertEq('Filter: by value', filterCookies(testCookies, 'dark').length, 1);
assertEq('Filter: by domain', filterCookies(testCookies, 'analytics').length, 1);
assertEq('Filter: partial match', filterCookies(testCookies, 'auth').length, 1);
assertEq('Filter: case insensitive', filterCookies(testCookies, 'THEME').length, 1);
assertEq('Filter: multiple matches', filterCookies(testCookies, 'example').length, 3);
assertEq('Filter: empty returns all', filterCookies(testCookies, '').length, 4);
assertEq('Filter: no match returns empty', filterCookies(testCookies, 'nonexistent').length, 0);

// ========== Badge Generation ==========
console.log('\n--- Badge Generation ---');

function getBadges(cookie) {
  const badges = [];
  if (cookie.secure) badges.push('S');
  if (cookie.httpOnly) badges.push('H');
  if (cookie.session) badges.push('Ses');
  const ss = cookie.sameSite;
  if (ss && ss !== 'unspecified') {
    const label = ss === 'no_restriction' ? 'None' : ss.charAt(0).toUpperCase() + ss.slice(1);
    badges.push(label);
  }
  return badges;
}

{
  const b = getBadges({ secure: true, httpOnly: true, session: false, sameSite: 'strict' });
  assertEq('Badges: secure+httpOnly+strict count', b.length, 3);
  assert('Badges: includes S', b.includes('S'));
  assert('Badges: includes H', b.includes('H'));
  assert('Badges: includes Strict', b.includes('Strict'));
}

{
  const b = getBadges({ secure: false, httpOnly: false, session: true, sameSite: 'lax' });
  assertEq('Badges: session+lax count', b.length, 2);
  assert('Badges: includes Ses', b.includes('Ses'));
  assert('Badges: includes Lax', b.includes('Lax'));
}

{
  const b = getBadges({ secure: false, httpOnly: false, session: false, sameSite: 'no_restriction' });
  assertEq('Badges: no_restriction shows None', b.length, 1);
  assertEq('Badges: None label', b[0], 'None');
}

{
  const b = getBadges({ secure: false, httpOnly: false, session: false, sameSite: 'unspecified' });
  assertEq('Badges: unspecified generates nothing', b.length, 0);
}

{
  const b = getBadges({ secure: true, httpOnly: true, session: true, sameSite: 'strict' });
  assertEq('Badges: all flags', b.length, 4);
}

// ========== Profile Data Structure ==========
console.log('\n--- Profile Data Structure ---');

function createProfile(name, cookies, url) {
  return {
    cookies,
    url: url || null,
    savedAt: Date.now(),
    count: cookies.length,
  };
}

{
  const p = createProfile('test', [{ name: 'a' }, { name: 'b' }], 'https://example.com');
  assertEq('Profile: count matches cookies', p.count, 2);
  assertEq('Profile: URL stored', p.url, 'https://example.com');
  assert('Profile: savedAt is number', typeof p.savedAt === 'number');
  assert('Profile: savedAt is recent', p.savedAt > Date.now() - 1000);
}

{
  const p = createProfile('empty', [], null);
  assertEq('Profile: empty count', p.count, 0);
  assertEq('Profile: null URL', p.url, null);
}

// ========== Change Log Entry Structure ==========
console.log('\n--- Change Log Entry ---');

function createChangeEntry(removed, cookie, cause) {
  return {
    timestamp: Date.now(),
    removed,
    cookie: {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      expirationDate: cookie.expirationDate,
      session: cookie.session,
      storeId: cookie.storeId,
    },
    cause,
  };
}

{
  const e = createChangeEntry(false, {
    name: 'test', value: 'val', domain: '.example.com', path: '/',
    secure: true, httpOnly: false, sameSite: 'lax',
    expirationDate: 1700000000, session: false, storeId: '0',
  }, 'explicit');
  assertEq('ChangeEntry: removed false for add', e.removed, false);
  assertEq('ChangeEntry: name preserved', e.cookie.name, 'test');
  assertEq('ChangeEntry: domain preserved', e.cookie.domain, '.example.com');
  assertEq('ChangeEntry: cause preserved', e.cause, 'explicit');
  assert('ChangeEntry: timestamp is number', typeof e.timestamp === 'number');
}

{
  const e = createChangeEntry(true, {
    name: 'old', value: '', domain: '.x.com', path: '/',
    secure: false, httpOnly: false, sameSite: 'unspecified',
    expirationDate: null, session: true, storeId: '0',
  }, 'expired');
  assertEq('ChangeEntry: removed true for deletion', e.removed, true);
  assertEq('ChangeEntry: expired cause', e.cause, 'expired');
  assertEq('ChangeEntry: session preserved', e.cookie.session, true);
}

// ========== Cause Description Map ==========
console.log('\n--- Cause Descriptions ---');

const causeMap = {
  explicit: 'Set/deleted by page or extension',
  overwrite: 'Overwritten by new value',
  expired: 'Expired',
  evicted: 'Evicted (storage limit)',
  expired_overwrite: 'Expired and overwritten',
};

assertEq('Cause: explicit', causeMap['explicit'], 'Set/deleted by page or extension');
assertEq('Cause: overwrite', causeMap['overwrite'], 'Overwritten by new value');
assertEq('Cause: expired', causeMap['expired'], 'Expired');
assertEq('Cause: evicted', causeMap['evicted'], 'Evicted (storage limit)');
assertEq('Cause: expired_overwrite', causeMap['expired_overwrite'], 'Expired and overwritten');
assert('Cause: all 5 causes covered', Object.keys(causeMap).length === 5);

// ========== Cookie Set Data Construction ==========
console.log('\n--- Cookie Set Data ---');

function buildCookieData(details) {
  const protocol = details.secure ? 'https' : 'http';
  const domain = details.domain.startsWith('.') ? details.domain.slice(1) : details.domain;
  const url = `${protocol}://${domain}${details.path || '/'}`;

  const cookieData = {
    url,
    name: details.name,
    value: details.value,
    domain: details.domain,
    path: details.path || '/',
    secure: !!details.secure,
    httpOnly: !!details.httpOnly,
    sameSite: details.sameSite || 'unspecified',
  };

  if (details.expirationDate && !details.session) {
    cookieData.expirationDate = details.expirationDate;
  }
  return cookieData;
}

{
  const d = buildCookieData({
    name: 'test', value: 'val', domain: '.example.com', path: '/api',
    secure: true, httpOnly: true, sameSite: 'strict',
    expirationDate: 1700000000, session: false,
  });
  assertEq('CookieData: URL construction', d.url, 'https://example.com/api');
  assertEq('CookieData: name', d.name, 'test');
  assertEq('CookieData: domain kept with dot', d.domain, '.example.com');
  assertEq('CookieData: secure true', d.secure, true);
  assertEq('CookieData: httpOnly true', d.httpOnly, true);
  assertEq('CookieData: sameSite strict', d.sameSite, 'strict');
  assertEq('CookieData: expiration included', d.expirationDate, 1700000000);
}

{
  const d = buildCookieData({
    name: 'sess', value: 'x', domain: 'example.com', path: null,
    secure: false, httpOnly: false, sameSite: null,
    expirationDate: 1700000000, session: true,
  });
  assertEq('CookieData: http for non-secure', d.url, 'http://example.com/');
  assertEq('CookieData: default path', d.path, '/');
  assertEq('CookieData: default sameSite', d.sameSite, 'unspecified');
  assert('CookieData: no expiration for session cookie', !d.expirationDate);
}

{
  const d = buildCookieData({
    name: 'a', value: 'b', domain: '.sub.example.com', path: '/deep/path',
    secure: true, httpOnly: false, sameSite: 'lax',
    session: false,
  });
  assertEq('CookieData: subdomain URL', d.url, 'https://sub.example.com/deep/path');
  assert('CookieData: no expiration if undefined', !d.expirationDate);
}

// ========== Change Log Truncation ==========
console.log('\n--- Change Log Truncation ---');

{
  const MAX_CHANGE_LOG = 500;
  const log = [];
  for (let i = 0; i < 600; i++) {
    log.unshift({ timestamp: i, removed: false, cookie: { name: `c${i}` }, cause: 'explicit' });
    if (log.length > MAX_CHANGE_LOG) log.length = MAX_CHANGE_LOG;
  }
  assertEq('Truncation: log capped at MAX', log.length, 500);
  assertEq('Truncation: newest is first', log[0].timestamp, 599);
  assertEq('Truncation: oldest surviving', log[499].timestamp, 100);
}

// ========== Domain Extraction ==========
console.log('\n--- Domain Extraction ---');

function extractDomain(urlStr) {
  try {
    const url = new URL(urlStr);
    return url.hostname;
  } catch {
    return '';
  }
}

assertEq('Domain: simple', extractDomain('https://example.com/path'), 'example.com');
assertEq('Domain: subdomain', extractDomain('https://api.example.com/v1'), 'api.example.com');
assertEq('Domain: with port', extractDomain('http://localhost:3000/'), 'localhost');
assertEq('Domain: invalid URL', extractDomain('not-a-url'), '');
assertEq('Domain: empty string', extractDomain(''), '');

// ========== SameSite Label Formatting ==========
console.log('\n--- SameSite Labels ---');

function sameSiteLabel(value) {
  if (!value || value === 'unspecified') return null;
  return value === 'no_restriction' ? 'None' : value.charAt(0).toUpperCase() + value.slice(1);
}

assertEq('SameSite: strict', sameSiteLabel('strict'), 'Strict');
assertEq('SameSite: lax', sameSiteLabel('lax'), 'Lax');
assertEq('SameSite: no_restriction', sameSiteLabel('no_restriction'), 'None');
assertEq('SameSite: unspecified returns null', sameSiteLabel('unspecified'), null);
assertEq('SameSite: null returns null', sameSiteLabel(null), null);
assertEq('SameSite: undefined returns null', sameSiteLabel(undefined), null);

// ========== Manifest Validation ==========
console.log('\n--- Manifest Validation ---');

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(__dirname, '..', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

assertEq('Manifest: version is 3', manifest.manifest_version, 3);
assert('Manifest: has name', typeof manifest.name === 'string' && manifest.name.length > 0);
assert('Manifest: has description', typeof manifest.description === 'string' && manifest.description.length > 0);
assert('Manifest: description under 132 chars', manifest.description.length <= 132);
assert('Manifest: valid version format', /^\d+\.\d+\.\d+$/.test(manifest.version));
assert('Manifest: has cookies permission', manifest.permissions.includes('cookies'));
assert('Manifest: has storage permission', manifest.permissions.includes('storage'));
assert('Manifest: has tabs permission', manifest.permissions.includes('tabs'));
assert('Manifest: has activeTab permission', manifest.permissions.includes('activeTab'));
assert('Manifest: has host_permissions', Array.isArray(manifest.host_permissions));
assert('Manifest: host_permissions includes all_urls', manifest.host_permissions.includes('<all_urls>'));
assert('Manifest: has action with popup', manifest.action && manifest.action.default_popup);
assertEq('Manifest: popup path', manifest.action.default_popup, 'popup/popup.html');
assert('Manifest: has icons', manifest.icons && manifest.icons['128'] && manifest.icons['48'] && manifest.icons['16']);
assert('Manifest: has background service_worker', manifest.background && manifest.background.service_worker === 'background.js');
assert('Manifest: has options_page', manifest.options_page === 'options/options.html');
assert('Manifest: no content_scripts (cookie manager doesn\'t need them)', !manifest.content_scripts);

// ========== File Existence ==========
console.log('\n--- File Existence ---');

const requiredFiles = [
  'background.js', 'manifest.json',
  'popup/popup.html', 'popup/popup.js', 'popup/popup.css',
  'options/options.html', 'options/options.js', 'options/options.css',
  'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png',
  'PRIVACY_POLICY.md', 'README.md',
];

for (const file of requiredFiles) {
  const fullPath = join(__dirname, '..', file);
  assert(`File exists: ${file}`, existsSync(fullPath));
}

// ========== HTML Content Validation ==========
console.log('\n--- HTML Content ---');

const popupHtml = readFileSync(join(__dirname, '..', 'popup', 'popup.html'), 'utf8');
assert('HTML: has DOCTYPE', popupHtml.includes('<!DOCTYPE html>'));
assert('HTML: has charset', popupHtml.includes('charset="UTF-8"'));
assert('HTML: links popup.css', popupHtml.includes('popup.css'));
assert('HTML: links popup.js', popupHtml.includes('popup.js'));
assert('HTML: has search input', popupHtml.includes('id="search"'));
assert('HTML: has cookie list container', popupHtml.includes('id="cookie-list"'));
assert('HTML: has change log container', popupHtml.includes('id="change-log"'));
assert('HTML: has profile list container', popupHtml.includes('id="profile-list"'));
assert('HTML: has cookie editor modal', popupHtml.includes('id="cookie-editor"'));
assert('HTML: has export menu', popupHtml.includes('id="export-menu"'));
assert('HTML: has tabs', popupHtml.includes('data-tab="cookies"'));
assert('HTML: has monitor tab', popupHtml.includes('data-tab="monitor"'));
assert('HTML: has profiles tab', popupHtml.includes('data-tab="profiles"'));
assert('HTML: has add button', popupHtml.includes('id="btn-add"'));
assert('HTML: has delete all button', popupHtml.includes('id="btn-delete-all"'));
assert('HTML: has theme toggle', popupHtml.includes('id="btn-theme"'));

const optionsHtml = readFileSync(join(__dirname, '..', 'options', 'options.html'), 'utf8');
assert('Options HTML: has theme selector', optionsHtml.includes('id="theme"'));
assert('Options HTML: has max log selector', optionsHtml.includes('id="max-log"'));
assert('Options HTML: has clear data button', optionsHtml.includes('id="btn-clear-data"'));

// ========== CSS Content Validation ==========
console.log('\n--- CSS Content ---');

const popupCss = readFileSync(join(__dirname, '..', 'popup', 'popup.css'), 'utf8');
assert('CSS: has dark mode variables', popupCss.includes('body.dark'));
assert('CSS: has cookie-item style', popupCss.includes('.cookie-item'));
assert('CSS: has badge styles', popupCss.includes('.badge-secure'));
assert('CSS: has badge-httponly', popupCss.includes('.badge-httponly'));
assert('CSS: has badge-session', popupCss.includes('.badge-session'));
assert('CSS: has badge-samesite-strict', popupCss.includes('.badge-samesite-strict'));
assert('CSS: has badge-samesite-lax', popupCss.includes('.badge-samesite-lax'));
assert('CSS: has badge-samesite-none', popupCss.includes('.badge-samesite-none'));
assert('CSS: has modal styles', popupCss.includes('.modal'));
assert('CSS: has toast animation', popupCss.includes('@keyframes fadeInOut'));
assert('CSS: has tab styles', popupCss.includes('.tab.active'));
assert('CSS: has change-log styles', popupCss.includes('.change-log'));
assert('CSS: has profile styles', popupCss.includes('.profile-item'));
assert('CSS: body width set', popupCss.includes('width: 520px'));
assert('CSS: has dropdown-menu', popupCss.includes('.dropdown-menu'));

// ========== JS Content Validation ==========
console.log('\n--- JS Content ---');

const popupJs = readFileSync(join(__dirname, '..', 'popup', 'popup.js'), 'utf8');
assert('JS: handles getCookies message', popupJs.includes('getCookies'));
assert('JS: handles setCookie message', popupJs.includes('setCookie'));
assert('JS: handles deleteCookie message', popupJs.includes('deleteCookie'));
assert('JS: handles export', popupJs.includes('exportCookies'));
assert('JS: handles profiles', popupJs.includes('saveProfile'));
assert('JS: handles loadProfile', popupJs.includes('loadProfile'));
assert('JS: has escapeHtml function', popupJs.includes('escapeHtml'));
assert('JS: has toast function', popupJs.includes('function toast'));
assert('JS: has theme toggle', popupJs.includes('applyTheme'));
assert('JS: uses chrome.tabs.query', popupJs.includes('chrome.tabs.query'));
assert('JS: uses chrome.runtime.sendMessage', popupJs.includes('chrome.runtime.sendMessage'));
assert('JS: uses chrome.storage.local', popupJs.includes('chrome.storage.local'));
assert('JS: has tab navigation', popupJs.includes('setupTabs'));

const backgroundJs = readFileSync(join(__dirname, '..', 'background.js'), 'utf8');
assert('BG: listens to cookies.onChanged', backgroundJs.includes('chrome.cookies.onChanged'));
assert('BG: listens to runtime.onMessage', backgroundJs.includes('chrome.runtime.onMessage'));
assert('BG: handles getCookies', backgroundJs.includes('handleGetCookies'));
assert('BG: handles setCookie', backgroundJs.includes('handleSetCookie'));
assert('BG: handles deleteCookie', backgroundJs.includes('handleDeleteCookie'));
assert('BG: handles deleteAllCookies', backgroundJs.includes('handleDeleteAllCookies'));
assert('BG: handles getChangeLog', backgroundJs.includes('handleGetChangeLog'));
assert('BG: handles clearChangeLog', backgroundJs.includes('handleClearChangeLog'));
assert('BG: handles saveProfile', backgroundJs.includes('handleSaveProfile'));
assert('BG: handles loadProfile', backgroundJs.includes('handleLoadProfile'));
assert('BG: handles deleteProfile', backgroundJs.includes('handleDeleteProfile'));
assert('BG: handles getProfiles', backgroundJs.includes('handleGetProfiles'));
assert('BG: handles exportCookies', backgroundJs.includes('handleExportCookies'));
assert('BG: has toNetscape function', backgroundJs.includes('function toNetscape'));
assert('BG: has toCurl function', backgroundJs.includes('function toCurl'));
assert('BG: has toHeaderString function', backgroundJs.includes('function toHeaderString'));
assert('BG: MAX_CHANGE_LOG defined', backgroundJs.includes('MAX_CHANGE_LOG'));
assert('BG: returns true for async', backgroundJs.includes('return true'));

// ========== Security Checks ==========
console.log('\n--- Security Checks ---');

assert('Security: popup uses escapeHtml for cookie names', popupJs.includes('escapeHtml(cookie.name)'));
assert('Security: popup uses escapeHtml for cookie values', popupJs.includes('escapeHtml(cookie.value)'));
assert('Security: no eval in popup', !popupJs.includes('eval('));
assert('Security: no eval in background', !backgroundJs.includes('eval('));
assert('Security: no innerHTML with raw input in popup', !popupJs.match(/innerHTML\s*=\s*[^'"`]*\+\s*(?:cookie|msg|data)\./));
assert('Security: no document.write', !popupJs.includes('document.write('));

// ========== Edge Cases ==========
console.log('\n--- Edge Cases ---');

// Netscape with empty name/value
{
  const result = toNetscape([{
    domain: '.example.com', path: '/', secure: false,
    expirationDate: 100, name: '', value: '',
  }]);
  assert('Edge: empty name/value in Netscape', result.includes('\t\t'));
}

// curl with unicode cookie value
{
  const result = toCurl([{ name: 'lang', value: '日本語' }], 'https://test.com');
  assert('Edge: unicode in curl', result.includes('日本語'));
}

// Cookie URL with root path
{
  const url = cookieUrl({ secure: true, domain: '.example.com', path: '/' });
  assert('Edge: root path ends with /', url.endsWith('/'));
}

// Header string with single cookie
{
  const result = toHeaderString([{ name: 'only', value: 'one' }]);
  assert('Edge: single cookie no semicolons', !result.includes(';'));
}

// Filter with special regex chars (should not crash)
{
  const result = filterCookies(testCookies, '.*+?^${}()|[]\\');
  assert('Edge: special chars in filter does not crash', Array.isArray(result));
}

// ========== Summary ==========
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) {
  process.exit(1);
}
