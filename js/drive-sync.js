/**
 * Google Drive Cloud Storage & Sync Engine for Chelsea's Personal Dictionary
 * Features:
 * - Google Identity Services (GIS) OAuth 2.0 Token Client
 * - Least-privilege scope: drive.file (only touches dictionary_words.json created by this app)
 * - Persistent sessions: silent background token renewal (prompt: '')
 * - Offline-first / local-first architecture with debounced cloud sync
 */

window.DriveSync = (() => {
  'use strict';

  // Storage Keys
  const STORAGE_KEY_TOKEN = 'dictionary_drive_token_v1';
  const STORAGE_KEY_EXPIRY = 'dictionary_drive_token_expiry_v1';
  const STORAGE_KEY_USER = 'dictionary_drive_user_v1';
  const STORAGE_KEY_FILE_ID = 'dictionary_drive_file_id_v1';
  const STORAGE_KEY_CLIENT_ID = 'dictionary_drive_client_id_v1';
  const STORAGE_KEY_LAST_SYNC = 'dictionary_drive_last_sync_v1';

  // Optional default Client ID (can be configured in Settings modal)
  const DEFAULT_CLIENT_ID = '';

  // Scope: Least privilege - only files created by this app + user identity
  const SCOPES = 'https://www.googleapis.com/auth/drive.file email profile';
  const DATA_FILENAME = 'dictionary_words.json';

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let driveFileId = null;
  let currentUser = null;
  let currentStatus = 'unconfigured'; // 'unconfigured' | 'disconnected' | 'connecting' | 'syncing' | 'synced' | 'error' | 'offline'

  let onStatusChangeCallback = null;
  let onRemoteDataCallback = null;

  let debounceTimer = null;
  let pendingPayload = null;
  let isSyncing = false;

  // Initialization
  function init({ onStatusChange, onRemoteData } = {}) {
    onStatusChangeCallback = onStatusChange || (() => {});
    onRemoteDataCallback = onRemoteData || (() => {});

    // Load cached credentials and state
    accessToken = localStorage.getItem(STORAGE_KEY_TOKEN);
    tokenExpiresAt = Number(localStorage.getItem(STORAGE_KEY_EXPIRY)) || 0;
    driveFileId = localStorage.getItem(STORAGE_KEY_FILE_ID);

    try {
      const userStr = localStorage.getItem(STORAGE_KEY_USER);
      if (userStr) currentUser = JSON.parse(userStr);
    } catch (e) {
      console.warn('[DriveSync] Could not parse stored user profile', e);
    }

    const clientId = getClientId();
    if (!clientId) {
      updateStatus('unconfigured');
      return;
    }

    // Try restoring session
    setupGisClient(clientId, () => {
      if (accessToken && currentUser) {
        if (Date.now() < tokenExpiresAt - 60000) {
          // Token is still valid
          updateStatus('synced');
          pullFromDrive();
        } else {
          // Token expired, attempt silent background refresh
          silentRefresh();
        }
      } else {
        updateStatus('disconnected');
      }
    });
  }

  function getClientId() {
    return localStorage.getItem(STORAGE_KEY_CLIENT_ID) ||
           localStorage.getItem('kanso_drive_client_id_v1') ||
           DEFAULT_CLIENT_ID ||
           '';
  }

  function setClientId(id) {
    const cleanId = (id || '').trim();
    if (cleanId) {
      localStorage.setItem(STORAGE_KEY_CLIENT_ID, cleanId);
    } else {
      localStorage.removeItem(STORAGE_KEY_CLIENT_ID);
    }
    tokenClient = null;
    if (cleanId) {
      setupGisClient(cleanId, () => {
        updateStatus('disconnected');
      });
    } else {
      updateStatus('unconfigured');
    }
  }

  function setupGisClient(clientId, onReady) {
    if (!clientId) {
      updateStatus('unconfigured');
      return;
    }

    let attempts = 0;
    const checkGis = () => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        try {
          tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: SCOPES,
            callback: handleTokenResponse
          });
          if (onReady) onReady();
        } catch (err) {
          console.error('[DriveSync] Error initializing token client:', err);
          updateStatus('error', err.message);
        }
      } else if (attempts < 100) {
        attempts++;
        setTimeout(checkGis, 100);
      } else {
        console.warn('[DriveSync] Google Identity Services script not ready.');
      }
    };

    checkGis();
  }

  // Handle Token Received
  async function handleTokenResponse(resp) {
    if (resp.error) {
      console.warn('[DriveSync] Token error:', resp);
      if (resp.error === 'immediate_failed' || resp.error === 'popup_closed_by_user') {
        updateStatus(accessToken ? 'synced' : 'disconnected');
      } else {
        updateStatus('error', resp.error_description || resp.error);
      }
      return;
    }

    accessToken = resp.access_token;
    const expiresIn = Number(resp.expires_in) || 3599;
    tokenExpiresAt = Date.now() + (expiresIn - 120) * 1000;

    localStorage.setItem(STORAGE_KEY_TOKEN, accessToken);
    localStorage.setItem(STORAGE_KEY_EXPIRY, String(tokenExpiresAt));

    updateStatus('syncing');

    // Fetch user profile if needed
    if (!currentUser || !currentUser.email) {
      await fetchUserProfile();
    }

    // Locate or create drive file, then pull
    await ensureDriveFile();
    await pullFromDrive();
  }

  // Silent Background Token Refresh (prompt: '')
  function silentRefresh() {
    if (!tokenClient) return;
    const hint = currentUser ? currentUser.email : '';
    try {
      updateStatus('syncing');
      tokenClient.requestAccessToken({ prompt: '', hint: hint || undefined });
    } catch (e) {
      console.warn('[DriveSync] Silent refresh failed, falling back to disconnected', e);
      updateStatus('disconnected');
    }
  }

  // Connect (Interactive)
  function connect() {
    const clientId = getClientId();
    if (!clientId) {
      updateStatus('unconfigured');
      return false;
    }

    if (!tokenClient) {
      setupGisClient(clientId, () => {
        if (tokenClient) {
          tokenClient.requestAccessToken({ prompt: 'select_account' });
        }
      });
      return true;
    }

    updateStatus('connecting');
    try {
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch (e) {
      console.error('[DriveSync] Failed to request access token:', e);
      updateStatus('error', e.message);
    }
    return true;
  }

  // Disconnect
  function disconnect() {
    if (accessToken && window.google && google.accounts && google.accounts.oauth2) {
      try {
        google.accounts.oauth2.revoke(accessToken, () => {});
      } catch (e) {}
    }

    accessToken = null;
    tokenExpiresAt = 0;
    driveFileId = null;
    currentUser = null;

    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_EXPIRY);
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_FILE_ID);
    localStorage.removeItem(STORAGE_KEY_LAST_SYNC);

    updateStatus(getClientId() ? 'disconnected' : 'unconfigured');
  }

  // Fetch User Info
  async function fetchUserProfile() {
    if (!accessToken) return;
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        currentUser = await res.json();
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
      }
    } catch (e) {
      console.warn('[DriveSync] Could not fetch user profile', e);
    }
  }

  // Ensure dictionary_words.json exists in Drive
  async function ensureDriveFile() {
    if (driveFileId) return driveFileId;
    if (!accessToken) return null;

    try {
      // Search for dictionary_words.json
      const query = encodeURIComponent(`name = '${DATA_FILENAME}' and trashed = false`);
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
          driveFileId = searchData.files[0].id;
          localStorage.setItem(STORAGE_KEY_FILE_ID, driveFileId);
          return driveFileId;
        }
      }

      // Not found, create it
      const metadata = {
        name: DATA_FILENAME,
        description: "Chelsea's Personal Dictionary Cloud Storage",
        mimeType: 'application/json'
      };

      const initialContent = JSON.stringify({
        words: [],
        customTags: [],
        updatedAt: Date.now(),
        version: 1
      }, null, 2);

      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      const multipartBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        initialContent +
        closeDelim;

      const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartBody
      });

      if (createRes.ok) {
        const newFile = await createRes.json();
        driveFileId = newFile.id;
        localStorage.setItem(STORAGE_KEY_FILE_ID, driveFileId);
        return driveFileId;
      }
    } catch (err) {
      console.error('[DriveSync] Error ensuring Drive file:', err);
    }
    return null;
  }

  // Pull dictionary from Drive
  async function pullFromDrive() {
    if (!accessToken || !driveFileId) return;

    try {
      updateStatus('syncing');
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (res.status === 401) {
        // Expired token, refresh
        silentRefresh();
        return;
      }

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem(STORAGE_KEY_LAST_SYNC, String(Date.now()));
        updateStatus('synced');
        if (onRemoteDataCallback && data) {
          onRemoteDataCallback(data);
        }
      } else {
        updateStatus('error', `Download error (${res.status})`);
      }
    } catch (err) {
      console.warn('[DriveSync] Pull failed:', err);
      updateStatus(navigator.onLine ? 'error' : 'offline');
    }
  }

  // Push local data to Drive
  async function pushToDrive(payload) {
    if (!accessToken) {
      pendingPayload = payload;
      silentRefresh();
      return;
    }

    if (!driveFileId) {
      await ensureDriveFile();
      if (!driveFileId) return;
    }

    isSyncing = true;
    updateStatus('syncing');

    try {
      const content = JSON.stringify({
        ...payload,
        updatedAt: Date.now(),
        version: 1
      }, null, 2);

      const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        },
        body: content
      });

      if (res.status === 401) {
        silentRefresh();
        return;
      }

      if (res.ok) {
        localStorage.setItem(STORAGE_KEY_LAST_SYNC, String(Date.now()));
        updateStatus('synced');
      } else {
        updateStatus('error', `Upload error (${res.status})`);
      }
    } catch (err) {
      console.warn('[DriveSync] Push error:', err);
      updateStatus(navigator.onLine ? 'error' : 'offline');
    } finally {
      isSyncing = false;
    }
  }

  // Debounced queue sync (called on word additions, edits, deletions)
  function queueSync(payload) {
    pendingPayload = payload;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (pendingPayload && accessToken) {
        pushToDrive(pendingPayload);
      }
    }, 800);
  }

  function syncNow() {
    if (pendingPayload) {
      pushToDrive(pendingPayload);
    } else {
      pullFromDrive();
    }
  }

  function updateStatus(status, detail) {
    currentStatus = status;
    if (onStatusChangeCallback) {
      onStatusChangeCallback({
        status,
        detail,
        user: currentUser,
        lastSync: Number(localStorage.getItem(STORAGE_KEY_LAST_SYNC)) || 0,
        clientId: getClientId()
      });
    }
  }

  return {
    init,
    connect,
    disconnect,
    syncNow,
    queueSync,
    getClientId,
    setClientId,
    getUserInfo: () => currentUser,
    getStatus: () => currentStatus,
    isConnected: () => !!(accessToken && currentUser)
  };
})();
