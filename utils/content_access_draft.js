export const CONTENT_ACCESS_DRAFTS_KEY = 'contentAccessDraftsV1';
export const CONTENT_ACCESS_SESSION_KEY = 'contentAccessDraftSessionIdV1';
export const CONTENT_ACCESS_CLEANUP_KEY = 'contentAccessCleanupPendingV1';

export const CONTENT_ACCESS_REQUEST = Object.freeze({
  permissions: ['scripting'],
  origins: ['http://*/*', 'https://*/*']
});

const sessionIdPromises = new WeakMap();
const draftQueues = new WeakMap();

export function beginContentAccessDraft(chromeApi, tabId, optionsUrl) {
  return withDraftLock(chromeApi, async () => {
    if (!Number.isInteger(tabId)) return { tracked: false, reason: 'missing-tab' };

    const sessionId = await getSessionId(chromeApi);
    const records = await readDrafts(chromeApi);
    records[String(tabId)] = {
      sessionId,
      createdAt: Date.now()
    };
    await writeDrafts(chromeApi, records);

    const tab = await chromeApi.tabs.get(tabId).catch(() => null);
    if (!tab || !isOptionsUrl(tab.pendingUrl || tab.url, optionsUrl)) {
      delete records[String(tabId)];
      await writeDrafts(chromeApi, records);
      await reconcileContentAccessDraftsUnlocked(chromeApi, optionsUrl, {
        revokeIfUnused: true
      });
      return { tracked: false, reason: 'tab-closed' };
    }

    return { tracked: true };
  });
}

export function commitContentAccessDraft(chromeApi, tabId) {
  return withDraftLock(chromeApi, async () => {
    if (!Number.isInteger(tabId)) return { removed: false };
    const records = await readDrafts(chromeApi);
    const key = String(tabId);
    if (!records[key]) return { removed: false };
    delete records[key];
    await writeDrafts(chromeApi, records);
    return { removed: true };
  });
}

export function abandonContentAccessDraft(chromeApi, tabId, optionsUrl) {
  return withDraftLock(chromeApi, async () => {
    if (!Number.isInteger(tabId)) return { removed: false, permissionRemoved: false };
    const records = await readDrafts(chromeApi);
    const key = String(tabId);
    if (!records[key]) return { removed: false, permissionRemoved: false };

    delete records[key];
    await writeDrafts(chromeApi, records);
    const reconciled = await reconcileContentAccessDraftsUnlocked(chromeApi, optionsUrl, {
      revokeIfUnused: true
    });
    return {
      removed: true,
      permissionRemoved: reconciled.permissionRemoved
    };
  });
}

export function reconcileContentAccessDrafts(
  chromeApi,
  optionsUrl,
  { revokeIfUnused = false } = {}
) {
  return withDraftLock(chromeApi, () => reconcileContentAccessDraftsUnlocked(
    chromeApi,
    optionsUrl,
    { revokeIfUnused }
  ));
}

async function reconcileContentAccessDraftsUnlocked(
  chromeApi,
  optionsUrl,
  { revokeIfUnused = false } = {}
) {
  const sessionId = await getSessionId(chromeApi);
  const records = await readDrafts(chromeApi);
  const tabs = await chromeApi.tabs.query({});
  const tabById = new Map(tabs
    .filter((tab) => Number.isInteger(tab.id))
    .map((tab) => [String(tab.id), tab]));
  const active = {};
  let staleCount = 0;

  for (const [key, record] of Object.entries(records)) {
    const tab = tabById.get(key);
    if (
      record?.sessionId === sessionId
      && tab
      && isOptionsUrl(tab.pendingUrl || tab.url, optionsUrl)
    ) {
      active[key] = record;
    } else {
      staleCount += 1;
    }
  }

  if (staleCount > 0) await writeDrafts(chromeApi, active);
  const cleanupPending = await readCleanupPending(chromeApi);
  const shouldRevoke = (staleCount > 0 || revokeIfUnused || cleanupPending)
    && Object.keys(active).length === 0;
  let permissionRemoved = false;
  let cleanupDeferred = cleanupPending;
  if (shouldRevoke) {
    const outcome = await removePermissionWhenSettingIsOff(chromeApi);
    permissionRemoved = outcome.removed;
    cleanupDeferred = !outcome.settled;
    await writeCleanupPending(chromeApi, cleanupDeferred);
  }

  return {
    activeCount: Object.keys(active).length,
    staleCount,
    permissionRemoved,
    cleanupDeferred
  };
}

export function isOptionsUrl(rawUrl, optionsUrl) {
  if (!rawUrl || !optionsUrl) return false;
  try {
    const current = new URL(rawUrl);
    const expected = new URL(optionsUrl);
    return current.origin === expected.origin && current.pathname === expected.pathname;
  } catch (error) {
    return String(rawUrl).split(/[?#]/, 1)[0] === String(optionsUrl).split(/[?#]/, 1)[0];
  }
}

export function shouldAbandonContentAccessDraft(changeInfo, optionsUrl) {
  if (changeInfo?.status === 'loading') return true;
  return Boolean(changeInfo?.url && !isOptionsUrl(changeInfo.url, optionsUrl));
}

function withDraftLock(chromeApi, operation) {
  const previous = draftQueues.get(chromeApi) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  draftQueues.set(chromeApi, current);
  return current.finally(() => {
    if (draftQueues.get(chromeApi) === current) draftQueues.delete(chromeApi);
  });
}

async function getSessionId(chromeApi) {
  if (!sessionIdPromises.has(chromeApi)) {
    sessionIdPromises.set(chromeApi, (async () => {
      const stored = await chromeApi.storage.session.get([CONTENT_ACCESS_SESSION_KEY]);
      if (typeof stored[CONTENT_ACCESS_SESSION_KEY] === 'string') {
        return stored[CONTENT_ACCESS_SESSION_KEY];
      }
      const generated = globalThis.crypto?.randomUUID?.()
        || `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await chromeApi.storage.session.set({ [CONTENT_ACCESS_SESSION_KEY]: generated });
      return generated;
    })());
  }
  return sessionIdPromises.get(chromeApi);
}

async function readDrafts(chromeApi) {
  const stored = await chromeApi.storage.local.get([CONTENT_ACCESS_DRAFTS_KEY]);
  const records = stored[CONTENT_ACCESS_DRAFTS_KEY];
  return records && typeof records === 'object' && !Array.isArray(records)
    ? { ...records }
    : {};
}

async function writeDrafts(chromeApi, records) {
  if (Object.keys(records).length === 0) {
    await chromeApi.storage.local.remove(CONTENT_ACCESS_DRAFTS_KEY);
    return;
  }
  await chromeApi.storage.local.set({ [CONTENT_ACCESS_DRAFTS_KEY]: records });
}

async function readCleanupPending(chromeApi) {
  const stored = await chromeApi.storage.local.get([CONTENT_ACCESS_CLEANUP_KEY]);
  return stored[CONTENT_ACCESS_CLEANUP_KEY] === true;
}

async function writeCleanupPending(chromeApi, pending) {
  if (pending) {
    await chromeApi.storage.local.set({ [CONTENT_ACCESS_CLEANUP_KEY]: true });
  } else {
    await chromeApi.storage.local.remove(CONTENT_ACCESS_CLEANUP_KEY);
  }
}

async function removePermissionWhenSettingIsOff(chromeApi) {
  try {
    const stored = await chromeApi.storage.sync.get(['settings']);
    if (stored.settings?.contentClassificationEnabled === true) {
      return { settled: true, removed: false };
    }

    const granted = await chromeApi.permissions.contains(CONTENT_ACCESS_REQUEST);
    if (!granted) return { settled: true, removed: false };
    const removed = await chromeApi.permissions.remove(CONTENT_ACCESS_REQUEST);
    return { settled: removed === true, removed: removed === true };
  } catch (error) {
    return { settled: false, removed: false };
  }
}
