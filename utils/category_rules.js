const CHROME_GROUP_COLORS = new Set([
  'grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'
]);

export function normalizeCategories(value, fallback = []) {
  const source = Array.isArray(value) ? value : Array.isArray(fallback) ? fallback : [];
  const seenIds = new Set();
  const normalized = [];

  for (const rawCategory of source) {
    if (!rawCategory || typeof rawCategory !== 'object' || Array.isArray(rawCategory)) continue;
    const id = typeof rawCategory.id === 'string' ? rawCategory.id.trim() : '';
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    const requestedColor = String(rawCategory.color || '').trim().toLowerCase();
    const color = requestedColor === 'gray'
      ? 'grey'
      : CHROME_GROUP_COLORS.has(requestedColor) ? requestedColor : 'grey';
    const name = typeof rawCategory.name === 'string' && rawCategory.name.trim()
      ? rawCategory.name.trim()
      : id;
    const category = {
      ...rawCategory,
      id,
      name,
      color,
      enabled: rawCategory.enabled !== false,
      domains: normalizeStringList(rawCategory.domains, { lowercase: true }),
      titleKeywords: normalizeStringList(rawCategory.titleKeywords)
    };
    if (Object.hasOwn(rawCategory, 'regexRules')) {
      category.regexRules = normalizeStringList(rawCategory.regexRules);
    }
    if (Object.hasOwn(rawCategory, 'contentKeywords')) {
      category.contentKeywords = normalizeStringList(rawCategory.contentKeywords);
    }
    normalized.push(category);
  }
  return normalized;
}

export function normalizeRuleSettings(value, fallback = {}) {
  const base = isPlainObject(fallback) ? fallback : {};
  const source = isPlainObject(value) ? value : {};
  const booleanSetting = (key) => Object.hasOwn(source, key)
    ? source[key] === true
    : base[key] === true;
  return {
    ...base,
    ...source,
    autoGroupOnUpdate: booleanSetting('autoGroupOnUpdate'),
    contentClassificationEnabled: booleanSetting('contentClassificationEnabled'),
    groupPinnedTabs: booleanSetting('groupPinnedTabs'),
    groupByDomainAsFallback: false,
    groupUnmatchedAsOthers: booleanSetting('groupUnmatchedAsOthers'),
    collapseInactiveGroups: booleanSetting('collapseInactiveGroups'),
    strictDomainPriority: booleanSetting('strictDomainPriority'),
    previewMode: booleanSetting('previewMode'),
    exclusions: normalizeStringList(
      Array.isArray(source.exclusions) ? source.exclusions : base.exclusions,
      { lowercase: true }
    )
  };
}

function normalizeStringList(value, { lowercase = false } = {}) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const text = String(item ?? '').trim();
    const normalized = lowercase ? text.toLowerCase() : text;
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
