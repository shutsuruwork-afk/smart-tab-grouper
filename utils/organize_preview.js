import { classifyTab } from './classifier.js';

export const ORGANIZE_PREVIEW_TOKEN_VERSION = 1;

export async function createOrganizationPreviewToken({
  windowId,
  tabs,
  categories,
  settings,
  contentAccessGranted,
  noneGroupId = -1
}) {
  const payload = {
    version: ORGANIZE_PREVIEW_TOKEN_VERSION,
    windowId,
    tabs: createConfirmedTabStates(tabs, noneGroupId, { categories, settings }),
    categories: (Array.isArray(categories) ? categories : []).map((category) => ({
      id: category?.id || '',
      name: category?.name || '',
      color: category?.color || 'grey',
      enabled: category?.enabled !== false,
      domains: normalizeList(category?.domains),
      regexRules: normalizeList(category?.regexRules),
      titleKeywords: normalizeList(category?.titleKeywords),
      contentKeywords: normalizeList(category?.contentKeywords)
    })),
    settings: {
      contentClassificationEnabled: settings?.contentClassificationEnabled === true,
      groupUnmatchedAsOthers: settings?.groupUnmatchedAsOthers === true,
      exclusions: normalizeList(settings?.exclusions)
    },
    contentAccessGranted: settings?.contentClassificationEnabled === true
      && contentAccessGranted === true
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return {
    version: ORGANIZE_PREVIEW_TOKEN_VERSION,
    windowId,
    digest: [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  };
}

export function organizationPreviewTokensEqual(current, expected) {
  return current?.version === ORGANIZE_PREVIEW_TOKEN_VERSION
    && expected?.version === ORGANIZE_PREVIEW_TOKEN_VERSION
    && Number.isInteger(current.windowId)
    && current.windowId === expected.windowId
    && typeof current.digest === 'string'
    && current.digest === expected.digest;
}

export function createConfirmedTabStates(
  tabs,
  noneGroupId = -1,
  { categories = null, settings = {} } = {}
) {
  return (Array.isArray(tabs) ? tabs : [])
    .filter((tab) => Number.isInteger(tab?.id) && tab.groupId === noneGroupId)
    .map((tab) => {
      const pinned = tab.pinned === true;
      const url = pinned ? '' : tab.url || tab.pendingUrl || '';
      const primaryCategoryId = Array.isArray(categories)
        ? classifyTab(tab, categories, { ...settings, groupUnmatchedAsOthers: false })?.id || null
        : null;
      const tracksTitle = isHttpUrl(url)
        && (!Array.isArray(categories) || titleCanChangeClassification(tab, categories, settings));
      return {
        id: tab.id,
        windowId: tab.windowId,
        groupId: tab.groupId,
        pinned,
        url,
        primaryCategoryId,
        tracksTitle,
        title: tracksTitle ? tab.title || '' : ''
      };
    })
    .sort((first, second) => first.id - second.id);
}

export function confirmedTabStateMatches(
  tab,
  expected,
  { categories = null, settings = {} } = {}
) {
  const pinned = tab?.pinned === true;
  const url = pinned ? '' : tab?.url || tab?.pendingUrl || '';
  const primaryCategoryId = Array.isArray(categories)
    ? classifyTab(tab, categories, { ...settings, groupUnmatchedAsOthers: false })?.id || null
    : expected?.primaryCategoryId ?? null;
  return Number.isInteger(tab?.id)
    && tab.id === expected?.id
    && tab.windowId === expected.windowId
    && tab.groupId === expected.groupId
    && pinned === expected.pinned
    && url === expected.url
    && primaryCategoryId === (expected.primaryCategoryId ?? null)
    && (expected.tracksTitle !== true || (tab.title || '') === expected.title);
}

function normalizeList(value) {
  return Array.isArray(value) ? value.map((item) => String(item ?? '')) : [];
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function titleCanChangeClassification(tab, categories, settings) {
  const safeSettings = { ...settings, groupUnmatchedAsOthers: false };
  const withTitle = classifyTab(tab, categories, safeSettings)?.id || null;
  const withoutTitle = classifyTab({ ...tab, title: '' }, categories, safeSettings)?.id || null;
  return withTitle !== withoutTitle;
}
