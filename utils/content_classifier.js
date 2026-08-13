import { classifyTab } from './classifier.js';

export const CONTENT_CLASSIFICATION_MAX_TABS = 30;
export const CONTENT_CLASSIFICATION_BUDGET_MS = 3_000;
export const CONTENT_CLASSIFICATION_CACHE_KEY = 'smartTabGrouperContentCacheV1';

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const EXTRACTION_TIMEOUT_MS = 900;
const MAX_PARALLEL_EXTRACTIONS = 3;

const BUILT_IN_CONTENT_KEYWORDS = Object.freeze({
  cat_dev: [
    'javascript', 'typescript', 'python', 'api reference', 'source code', 'repository',
    'プログラミング', 'ソースコード', '開発者', '技術ドキュメント', 'コード例'
  ],
  cat_novel: [
    'novel', 'fiction', 'character profile', 'world building', '小説', '物語', '登場人物',
    'プロット', '執筆', '原稿', '設定資料', '類語', '辞典'
  ],
  cat_ai_search: [
    'search results', 'web search', 'ai assistant', 'generative ai', '検索結果',
    'ウェブ検索', '生成ai', 'aiアシスタント', '質問への回答'
  ],
  cat_media: [
    'watch video', 'streaming', 'playlist', 'podcast', 'episode', '動画', 'ライブ配信',
    'プレイリスト', '視聴', '番組', '音楽配信'
  ],
  cat_sns: [
    'social network', 'community', 'direct message', 'timeline', 'ソーシャル', 'コミュニティ',
    'タイムライン', '投稿', 'フォロー', 'チャット'
  ],
  cat_shopping: [
    'add to cart', 'in stock', 'shipping', 'product details', 'buy now', 'カートに入れる',
    '在庫', '送料', '商品詳細', '購入する', '価格'
  ],
  cat_news: [
    'breaking news', 'latest news', 'press release', 'reported by', 'ニュース', '速報',
    '報道', '記者', 'プレスリリース', '最新情報'
  ]
});

export function classifyContentSignals(signals, categories) {
  const activeCategories = categories.filter((category) => category?.enabled !== false);
  const scored = [];

  for (const category of activeCategories) {
    const keywords = getCategoryContentKeywords(category);
    if (keywords.length === 0) continue;

    const meta = normalizeText(signals?.meta);
    const headings = normalizeText(signals?.headings);
    const body = normalizeText(signals?.body);
    let score = 0;
    let distinctMatches = 0;

    for (const keyword of keywords) {
      const normalizedKeyword = normalizeText(keyword);
      if (normalizedKeyword.length < 2) continue;
      let matched = false;
      if (meta.includes(normalizedKeyword)) {
        score += 4;
        matched = true;
      }
      if (headings.includes(normalizedKeyword)) {
        score += 3;
        matched = true;
      }
      if (body.includes(normalizedKeyword)) {
        score += 1;
        matched = true;
      }
      if (matched) distinctMatches += 1;
    }

    if (distinctMatches > 0) scored.push({ category, score, distinctMatches });
  }

  scored.sort((first, second) => second.score - first.score);
  const best = scored[0];
  const second = scored[1];
  if (!best || best.distinctMatches < 2 || best.score < 6) return null;
  if (second && best.score - second.score < 3) return null;

  return {
    categoryId: best.category.id,
    confidence: Math.min(0.98, 0.72 + best.score * 0.018 + best.distinctMatches * 0.025)
  };
}

export function createContentAssistedClassifier(classifications, baseSettings = {}) {
  const primarySettings = { ...baseSettings, groupUnmatchedAsOthers: false };

  return (tab, categories, settings = baseSettings) => {
    const primary = classifyTab(tab, categories, primarySettings);
    if (primary) return primary;

    const assisted = classifications.get(tab.id);
    if (
      assisted
      && assisted.url === (tab.url || tab.pendingUrl || '')
      && assisted.title === (tab.title || '')
    ) {
      const category = categories.find((item) => item.id === assisted.categoryId && item.enabled !== false);
      if (category) return category;
    }

    if (settings.groupUnmatchedAsOthers === true) {
      return {
        id: 'cat_others',
        name: 'Others',
        color: 'grey',
        isFallback: true
      };
    }
    return null;
  };
}

export async function prepareContentClassifications({
  chromeApi,
  tabs,
  categories,
  settings,
  now = () => Date.now(),
  monotonicNow = () => globalThis.performance?.now?.() ?? Date.now()
}) {
  const classifications = new Map();
  const deadline = monotonicNow() + CONTENT_CLASSIFICATION_BUDGET_MS;
  if (settings.contentClassificationEnabled !== true) {
    return buildResult('disabled', classifications, 0, 0);
  }

  const hasAccess = await hasContentClassificationAccess(chromeApi);
  if (!hasAccess) return buildResult('permission-missing', classifications, 0, 0);

  const unresolved = tabs.filter((tab) => {
    if (!isEligibleTab(tab, chromeApi.tabGroups.TAB_GROUP_ID_NONE)) return false;
    return classifyTab(tab, categories, { ...settings, groupUnmatchedAsOthers: false }) === null;
  });

  if (unresolved.length > CONTENT_CLASSIFICATION_MAX_TABS) {
    return buildResult('limit-exceeded', classifications, 0, unresolved.length);
  }

  const cache = await loadCache(chromeApi, now());
  const categoryIds = new Set(categories.filter((item) => item.enabled !== false).map((item) => item.id));
  const signature = buildRuleSignature(categories);
  const pending = [];
  let cacheHits = 0;
  let attempted = 0;

  for (const tab of unresolved) {
    const cacheKey = buildCacheKey(tab, signature);
    const entry = cache[cacheKey];
    if (entry && entry.url === tab.url && categoryIds.has(entry.categoryId)) {
      classifications.set(tab.id, {
        categoryId: entry.categoryId,
        confidence: entry.confidence,
        url: tab.url,
        title: tab.title || ''
      });
      cacheHits += 1;
      continue;
    }
    pending.push({ tab, cacheKey });
  }

  await mapWithConcurrency(pending, MAX_PARALLEL_EXTRACTIONS, async ({ tab, cacheKey }) => {
    let remaining = deadline - monotonicNow();
    if (remaining <= 0) return;
    attempted += 1;
    const lightSignals = await executeExtractorWithTimeout(
      chromeApi,
      tab.id,
      extractMetadataSignals,
      Math.min(EXTRACTION_TIMEOUT_MS, remaining)
    );
    if (!lightSignals) return;
    let result = classifyContentSignals(lightSignals, categories);
    if (!result) {
      remaining = deadline - monotonicNow();
      if (remaining <= 0) return;
      const body = await executeExtractorWithTimeout(
        chromeApi,
        tab.id,
        extractBodySignal,
        Math.min(EXTRACTION_TIMEOUT_MS, remaining)
      );
      if (!body) return;
      result = classifyContentSignals({ ...lightSignals, body }, categories);
    }
    if (!result) return;

    classifications.set(tab.id, { ...result, url: tab.url, title: tab.title || '' });
    cache[cacheKey] = {
      ...result,
      url: tab.url,
      title: tab.title || '',
      expiresAt: now() + CACHE_TTL_MS
    };
  });

  await saveCache(chromeApi, cache);
  const budgetExhausted = attempted < pending.length && monotonicNow() >= deadline;
  return {
    ...buildResult(budgetExhausted ? 'budget-exhausted' : 'ready', classifications, attempted, unresolved.length),
    cacheHits
  };
}

export async function hasContentClassificationAccess(chromeApi) {
  try {
    return await chromeApi.permissions.contains({
      permissions: ['scripting'],
      origins: ['http://*/*', 'https://*/*']
    });
  } catch (error) {
    return false;
  }
}

function getCategoryContentKeywords(category) {
  const custom = Array.isArray(category.contentKeywords) ? category.contentKeywords : [];
  return [...new Set([...custom, ...(BUILT_IN_CONTENT_KEYWORDS[category.id] || [])])];
}

function normalizeText(value) {
  return String(value || '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function isEligibleTab(tab, noneGroupId) {
  if (!tab || !Number.isInteger(tab.id) || tab.pinned || tab.groupId !== noneGroupId) return false;
  try {
    const url = new URL(tab.url || tab.pendingUrl || '');
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function buildRuleSignature(categories) {
  const ruleText = categories
    .filter((item) => item.enabled !== false)
    .map((item) => `${item.id}:${getCategoryContentKeywords(item).join(',')}`)
    .join('|');
  return hashText(ruleText);
}

function buildCacheKey(tab, signature) {
  return hashText(`${signature}|${tab.url || tab.pendingUrl || ''}|${tab.title || ''}`);
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

async function loadCache(chromeApi, timestamp) {
  try {
    const data = await chromeApi.storage.session.get([CONTENT_CLASSIFICATION_CACHE_KEY]);
    const source = data[CONTENT_CLASSIFICATION_CACHE_KEY];
    if (!source || typeof source !== 'object') return {};
    return Object.fromEntries(
      Object.entries(source).filter(([, entry]) => Number(entry?.expiresAt) > timestamp)
    );
  } catch (error) {
    return {};
  }
}

async function saveCache(chromeApi, cache) {
  const entries = Object.entries(cache)
    .sort((first, second) => Number(second[1]?.expiresAt || 0) - Number(first[1]?.expiresAt || 0))
    .slice(0, MAX_CACHE_ENTRIES);
  try {
    await chromeApi.storage.session.set({
      [CONTENT_CLASSIFICATION_CACHE_KEY]: Object.fromEntries(entries)
    });
  } catch (error) {
    // Caching is an optimization. Classification remains usable if it fails.
  }
}

async function executeExtractorWithTimeout(chromeApi, tabId, extractor, timeoutMs) {
  let timer;
  try {
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), Math.max(0, timeoutMs));
    });
    const execution = chromeApi.scripting.executeScript({
      target: { tabId },
      func: extractor
    }).then((results) => results?.[0]?.result || null).catch(() => null);
    return await Promise.race([execution, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function extractMetadataSignals() {
  const clean = (value, limit) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const meta = clean([
    document.querySelector('meta[name="description"]')?.content,
    document.querySelector('meta[property="og:description"]')?.content
  ].filter(Boolean).join(' '), 700);
  const headings = clean(
    [...document.querySelectorAll('main h1, main h2, article h1, article h2, h1, h2')]
      .filter((element) => typeof element.checkVisibility !== 'function' || element.checkVisibility({
        checkOpacity: true,
        checkVisibilityCSS: true
      }))
      .slice(0, 24)
      .map((element) => element.textContent)
      .join(' '),
    1600
  );

  return { meta, headings, body: '' };
}

function extractBodySignal() {
  const clean = (value, limit) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const root = document.querySelector('main, article, [role="main"]') || document.body;
  if (!root) return '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const pieces = [];
  let length = 0;
  while (walker.nextNode() && length < 3600) {
    const parent = walker.currentNode.parentElement;
    if (!parent || parent.closest('script, style, noscript, form, input, textarea, select, button, iframe, [hidden], [aria-hidden="true"], [contenteditable="true"]')) continue;
    if (typeof parent.checkVisibility === 'function' && !parent.checkVisibility({
      checkOpacity: true,
      checkVisibilityCSS: true
    })) continue;
    const text = clean(walker.currentNode.nodeValue, 500);
    if (text.length < 2) continue;
    pieces.push(text);
    length += text.length;
  }
  return clean(pieces.join(' '), 3600);
}

async function mapWithConcurrency(items, concurrency, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  });
  await Promise.all(workers);
}

function buildResult(status, classifications, attempted, unresolved) {
  return { status, classifications, attempted, unresolved, cacheHits: 0 };
}
