// Cookie DevTools — Background Service Worker
// Handles cookie monitoring, profile management, and message passing

const MAX_CHANGE_LOG = 500;

// --- Cookie Change Monitor ---
chrome.cookies.onChanged.addListener((changeInfo) => {
  const entry = {
    timestamp: Date.now(),
    removed: changeInfo.removed,
    cookie: {
      name: changeInfo.cookie.name,
      value: changeInfo.cookie.value,
      domain: changeInfo.cookie.domain,
      path: changeInfo.cookie.path,
      secure: changeInfo.cookie.secure,
      httpOnly: changeInfo.cookie.httpOnly,
      sameSite: changeInfo.cookie.sameSite,
      expirationDate: changeInfo.cookie.expirationDate,
      session: changeInfo.cookie.session,
      storeId: changeInfo.cookie.storeId,
    },
    cause: changeInfo.cause,
  };

  chrome.storage.local.get({ changeLog: [] }, (data) => {
    const log = data.changeLog;
    log.unshift(entry);
    if (log.length > MAX_CHANGE_LOG) log.length = MAX_CHANGE_LOG;
    chrome.storage.local.set({ changeLog: log });
  });
});

// --- Message Handler ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handlers = {
    getCookies: handleGetCookies,
    setCookie: handleSetCookie,
    deleteCookie: handleDeleteCookie,
    deleteAllCookies: handleDeleteAllCookies,
    getChangeLog: handleGetChangeLog,
    clearChangeLog: handleClearChangeLog,
    saveProfile: handleSaveProfile,
    loadProfile: handleLoadProfile,
    deleteProfile: handleDeleteProfile,
    getProfiles: handleGetProfiles,
    exportCookies: handleExportCookies,
  };

  const handler = handlers[msg.action];
  if (handler) {
    handler(msg, sendResponse);
    return true; // async response
  }
});

// --- Cookie CRUD ---

function handleGetCookies(msg, sendResponse) {
  const url = msg.url;
  if (url) {
    chrome.cookies.getAll({ url }, (cookies) => {
      sendResponse({ cookies: cookies || [] });
    });
  } else if (msg.domain) {
    chrome.cookies.getAll({ domain: msg.domain }, (cookies) => {
      sendResponse({ cookies: cookies || [] });
    });
  } else {
    chrome.cookies.getAll({}, (cookies) => {
      sendResponse({ cookies: cookies || [] });
    });
  }
}

function handleSetCookie(msg, sendResponse) {
  const details = msg.cookie;
  // chrome.cookies.set requires a url
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

  chrome.cookies.set(cookieData, (cookie) => {
    if (chrome.runtime.lastError) {
      sendResponse({ error: chrome.runtime.lastError.message });
    } else {
      sendResponse({ cookie });
    }
  });
}

function handleDeleteCookie(msg, sendResponse) {
  const { name, url, storeId } = msg;
  const details = { name, url };
  if (storeId) details.storeId = storeId;

  chrome.cookies.remove(details, (removed) => {
    if (chrome.runtime.lastError) {
      sendResponse({ error: chrome.runtime.lastError.message });
    } else {
      sendResponse({ removed });
    }
  });
}

function handleDeleteAllCookies(msg, sendResponse) {
  const url = msg.url;
  chrome.cookies.getAll(url ? { url } : {}, (cookies) => {
    let remaining = cookies.length;
    if (remaining === 0) {
      sendResponse({ deleted: 0 });
      return;
    }

    let deleted = 0;
    for (const cookie of cookies) {
      const protocol = cookie.secure ? 'https' : 'http';
      const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
      const cookieUrl = `${protocol}://${domain}${cookie.path}`;
      chrome.cookies.remove({ url: cookieUrl, name: cookie.name }, () => {
        deleted++;
        remaining--;
        if (remaining === 0) {
          sendResponse({ deleted });
        }
      });
    }
  });
}

// --- Change Log ---

function handleGetChangeLog(msg, sendResponse) {
  chrome.storage.local.get({ changeLog: [] }, (data) => {
    sendResponse({ changeLog: data.changeLog });
  });
}

function handleClearChangeLog(msg, sendResponse) {
  chrome.storage.local.set({ changeLog: [] }, () => {
    sendResponse({ success: true });
  });
}

// --- Profiles ---

function handleSaveProfile(msg, sendResponse) {
  const { name, url } = msg;
  chrome.cookies.getAll(url ? { url } : {}, (cookies) => {
    chrome.storage.local.get({ profiles: {} }, (data) => {
      const profiles = data.profiles;
      profiles[name] = {
        cookies,
        url: url || null,
        savedAt: Date.now(),
        count: cookies.length,
      };
      chrome.storage.local.set({ profiles }, () => {
        sendResponse({ success: true, count: cookies.length });
      });
    });
  });
}

function handleLoadProfile(msg, sendResponse) {
  const { name, clearFirst } = msg;
  chrome.storage.local.get({ profiles: {} }, (data) => {
    const profile = data.profiles[name];
    if (!profile) {
      sendResponse({ error: 'Profile not found' });
      return;
    }

    function restoreCookies() {
      let remaining = profile.cookies.length;
      if (remaining === 0) {
        sendResponse({ restored: 0 });
        return;
      }

      let restored = 0;
      for (const cookie of profile.cookies) {
        const protocol = cookie.secure ? 'https' : 'http';
        const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
        const url = `${protocol}://${domain}${cookie.path}`;

        const cookieData = {
          url,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite || 'unspecified',
        };

        if (cookie.expirationDate && !cookie.session) {
          cookieData.expirationDate = cookie.expirationDate;
        }

        chrome.cookies.set(cookieData, () => {
          restored++;
          remaining--;
          if (remaining === 0) {
            sendResponse({ restored });
          }
        });
      }
    }

    if (clearFirst && profile.url) {
      // Delete existing cookies for the URL first
      chrome.cookies.getAll({ url: profile.url }, (existing) => {
        let toDelete = existing.length;
        if (toDelete === 0) {
          restoreCookies();
          return;
        }
        for (const cookie of existing) {
          const protocol = cookie.secure ? 'https' : 'http';
          const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
          const cookieUrl = `${protocol}://${domain}${cookie.path}`;
          chrome.cookies.remove({ url: cookieUrl, name: cookie.name }, () => {
            toDelete--;
            if (toDelete === 0) restoreCookies();
          });
        }
      });
    } else {
      restoreCookies();
    }
  });
}

function handleDeleteProfile(msg, sendResponse) {
  chrome.storage.local.get({ profiles: {} }, (data) => {
    const profiles = data.profiles;
    delete profiles[msg.name];
    chrome.storage.local.set({ profiles }, () => {
      sendResponse({ success: true });
    });
  });
}

function handleGetProfiles(msg, sendResponse) {
  chrome.storage.local.get({ profiles: {} }, (data) => {
    const summary = {};
    for (const [name, profile] of Object.entries(data.profiles)) {
      summary[name] = {
        savedAt: profile.savedAt,
        count: profile.count,
        url: profile.url,
      };
    }
    sendResponse({ profiles: summary });
  });
}

// --- Export ---

function handleExportCookies(msg, sendResponse) {
  const { url, format } = msg;
  chrome.cookies.getAll(url ? { url } : {}, (cookies) => {
    let result;
    switch (format) {
      case 'json':
        result = JSON.stringify(cookies, null, 2);
        break;
      case 'netscape':
        result = toNetscape(cookies);
        break;
      case 'curl':
        result = toCurl(cookies, url);
        break;
      case 'header':
        result = toHeaderString(cookies);
        break;
      default:
        result = JSON.stringify(cookies, null, 2);
    }
    sendResponse({ result });
  });
}

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

function toCurl(cookies, url) {
  if (cookies.length === 0) return '# No cookies found';
  const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const targetUrl = url || 'https://example.com';
  return `curl -b '${cookieStr}' '${targetUrl}'`;
}

function toHeaderString(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}
