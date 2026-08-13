import test from 'node:test';
import assert from 'node:assert/strict';

await import('../utils/settings_storage.js');

const store = globalThis.SmartTabSettingsStorage;

test('従来の単一キー分類設定をそのまま読み込める', async () => {
  const legacy = categories(2, 3);
  const area = createStorageArea({ categories: legacy });

  assert.deepEqual(await store.loadCategories(area, []), legacy);
});

test('8KBを超える分類設定を上限内の世代付きチャンクへ分割する', async () => {
  const value = categories(18, 45);
  const area = createStorageArea({ categories: categories(1, 1) });
  const prepared = await store.prepareCategoryWrite(area, value);

  assert.ok(JSON.stringify(value).length > 8_192);
  assert.equal(prepared.previousGeneration, null);
  assert.ok(Object.keys(prepared.items).length > 1);
  for (const [key, chunk] of Object.entries(prepared.items)) {
    assert.ok(store.getItemBytes(key, chunk) < 8_192, `${key} が8KBを超えています`);
  }

  await store.commitCategoryWrite(area, prepared);
  assert.deepEqual(await store.loadCategories(area, []), value);
  assert.equal(area.state.categories, undefined);
});

test('新しいマニフェストの確定に失敗しても直前の分類設定を維持する', async () => {
  const previous = categories(3, 4);
  const next = categories(5, 8);
  const area = createStorageArea({ settings: { marker: 'before' } });
  await store.saveCategories(area, previous, { settings: { marker: 'before' } });
  const oldManifest = structuredClone(area.state[store.MANIFEST_KEY]);
  area.failNext((value) => Object.hasOwn(value, store.MANIFEST_KEY));

  await assert.rejects(
    store.saveCategories(area, next, { settings: { marker: 'after' } }),
    /storage write failed/
  );

  assert.deepEqual(area.state[store.MANIFEST_KEY], oldManifest);
  assert.deepEqual(area.state.settings, { marker: 'before' });
  assert.deepEqual(await store.loadCategories(area, []), previous);
  assert.equal(
    Object.keys(area.state).filter((key) => key.startsWith(store.CHUNK_KEY_PREFIX)).length,
    oldManifest.keys.length
  );
});

test('破損した現行設定を既定値へ黙って置き換えない', async () => {
  const area = createStorageArea({
    [store.MANIFEST_KEY]: {
      version: 2,
      generation: 'broken',
      keys: [`${store.CHUNK_KEY_PREFIX}broken:0`],
      byteLength: 20,
      hash: '00000000'
    }
  });

  await assert.rejects(store.loadCategories(area, categories(1, 1)), /一部がありません/);
});

test('チャンク書き込みに失敗した場合も従来設定を削除しない', async () => {
  const previous = categories(2, 2);
  const area = createStorageArea({ categories: previous });
  area.failNext((value) => Object.keys(value).some((key) => key.startsWith(store.CHUNK_KEY_PREFIX)));

  await assert.rejects(store.saveCategories(area, categories(8, 20)), /storage write failed/);

  assert.deepEqual(area.state.categories, previous);
  assert.deepEqual(await store.loadCategories(area, []), previous);
});

test('保存成功後は旧世代チャンクだけを削除する', async () => {
  const area = createStorageArea();
  await store.saveCategories(area, categories(4, 8));
  const oldKeys = [...area.state[store.MANIFEST_KEY].keys];
  await store.saveCategories(area, categories(6, 12));

  assert.ok(oldKeys.every((key) => area.state[key] === undefined));
  assert.deepEqual(await store.loadCategories(area, []), categories(6, 12));
});

test('日本語・絵文字を含む分類設定もバイト境界をまたいで復元する', async () => {
  const value = [{
    id: '日本語',
    name: '🧪 検証・資料',
    color: 'cyan',
    enabled: true,
    domains: Array.from({ length: 700 }, (_, index) => `資料${index}.example.jp`),
    titleKeywords: ['調査', '設計', '参考資料']
  }];
  const area = createStorageArea();

  await store.saveCategories(area, value);

  assert.deepEqual(await store.loadCategories(area, []), value);
});

function categories(groupCount, domainsPerGroup) {
  return Array.from({ length: groupCount }, (_, groupIndex) => ({
    id: `category-${groupIndex}`,
    name: `🧩 分類 ${groupIndex}`,
    color: ['grey', 'blue', 'green', 'purple'][groupIndex % 4],
    enabled: true,
    domains: Array.from(
      { length: domainsPerGroup },
      (_, domainIndex) => `domain-${groupIndex}-${domainIndex}.example.com`
    ),
    titleKeywords: [`keyword-${groupIndex}`]
  }));
}

function createStorageArea(initial = {}) {
  const state = structuredClone(initial);
  let failurePredicate = null;
  return {
    state,
    failNext(predicate) {
      failurePredicate = predicate;
    },
    async get(keys) {
      if (keys === null || keys === undefined) return structuredClone(state);
      const selected = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (Object.hasOwn(state, key)) selected[key] = structuredClone(state[key]);
      }
      return selected;
    },
    async set(value) {
      if (failurePredicate?.(value)) {
        failurePredicate = null;
        throw new Error('storage write failed');
      }
      Object.assign(state, structuredClone(value));
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete state[key];
    }
  };
}
