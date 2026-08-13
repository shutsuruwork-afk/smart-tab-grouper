(function initializeSettingsStorage(global) {
  const MANIFEST_KEY = 'smartTabCategoriesManifestV2';
  const CHUNK_KEY_PREFIX = 'smartTabCategoriesChunkV2:';
  const LEGACY_CATEGORIES_KEY = 'categories';
  const FORMAT_VERSION = 2;
  const RAW_CHUNK_BYTES = 5_500;

  async function loadCategories(storageArea, fallback = []) {
    const root = await storageArea.get([MANIFEST_KEY, LEGACY_CATEGORIES_KEY]);
    const manifest = root[MANIFEST_KEY];
    if (isManifest(manifest)) {
      try {
        const chunks = await storageArea.get(manifest.keys);
        const encoded = manifest.keys.map((key) => {
          if (typeof chunks[key] !== 'string') throw new Error('分類設定の一部がありません。');
          return chunks[key];
        });
        const bytes = decodeChunks(encoded);
        if (bytes.length !== manifest.byteLength || hashBytes(bytes) !== manifest.hash) {
          throw new Error('分類設定の整合性を確認できませんでした。');
        }
        const parsed = JSON.parse(new TextDecoder().decode(bytes));
        if (!Array.isArray(parsed)) throw new Error('分類設定の形式が不正です。');
        return parsed;
      } catch (error) {
        if (Array.isArray(root[LEGACY_CATEGORIES_KEY])) {
          return clone(root[LEGACY_CATEGORIES_KEY]);
        }
        throw error;
      }
    }
    if (Object.hasOwn(root, MANIFEST_KEY)) {
      if (Array.isArray(root[LEGACY_CATEGORIES_KEY])) {
        return clone(root[LEGACY_CATEGORIES_KEY]);
      }
      throw new Error('分類設定の保存形式を確認できませんでした。');
    }
    return Array.isArray(root[LEGACY_CATEGORIES_KEY])
      ? clone(root[LEGACY_CATEGORIES_KEY])
      : clone(fallback);
  }

  async function prepareCategoryWrite(storageArea, categories) {
    if (!Array.isArray(categories)) throw new TypeError('分類設定は配列である必要があります。');
    const previous = await storageArea.get([MANIFEST_KEY]);
    const previousManifest = isManifest(previous[MANIFEST_KEY]) ? previous[MANIFEST_KEY] : null;
    const bytes = new TextEncoder().encode(JSON.stringify(categories));
    const generation = createGeneration();
    const items = {};
    const keys = [];
    for (let offset = 0, index = 0; offset < bytes.length; offset += RAW_CHUNK_BYTES, index += 1) {
      const key = `${CHUNK_KEY_PREFIX}${generation}:${index}`;
      keys.push(key);
      items[key] = bytesToBase64(bytes.subarray(offset, offset + RAW_CHUNK_BYTES));
    }
    if (keys.length === 0) {
      const key = `${CHUNK_KEY_PREFIX}${generation}:0`;
      keys.push(key);
      items[key] = bytesToBase64(bytes);
    }
    const manifest = {
      version: FORMAT_VERSION,
      generation,
      keys,
      byteLength: bytes.length,
      hash: hashBytes(bytes),
      updatedAt: Date.now()
    };
    return {
      items,
      manifest,
      previousKeys: previousManifest?.keys || [],
      previousGeneration: previousManifest?.generation || null
    };
  }

  async function commitCategoryWrite(storageArea, prepared, values = {}) {
    await storageArea.set(prepared.items);
    try {
      await storageArea.set({
        ...values,
        [MANIFEST_KEY]: prepared.manifest
      });
    } catch (error) {
      await storageArea.remove(prepared.manifest.keys).catch(() => {});
      throw error;
    }
    const obsoleteKeys = [
      LEGACY_CATEGORIES_KEY,
      ...prepared.previousKeys.filter((key) => !prepared.manifest.keys.includes(key))
    ];
    await storageArea.remove(obsoleteKeys).catch(() => {});
    return {
      saved: true,
      chunks: prepared.manifest.keys.length,
      byteLength: prepared.manifest.byteLength
    };
  }

  async function saveCategories(storageArea, categories, values = {}) {
    const prepared = await prepareCategoryWrite(storageArea, categories);
    return commitCategoryWrite(storageArea, prepared, values);
  }

  function isCategoryStorageChange(changes) {
    return Boolean(
      changes?.[LEGACY_CATEGORIES_KEY]
      || changes?.[MANIFEST_KEY]
      || Object.keys(changes || {}).some((key) => key.startsWith(CHUNK_KEY_PREFIX))
    );
  }

  function getItemBytes(key, value) {
    return new TextEncoder().encode(key).length
      + new TextEncoder().encode(JSON.stringify(value)).length;
  }

  function isManifest(value) {
    return value?.version === FORMAT_VERSION
      && typeof value.generation === 'string'
      && Array.isArray(value.keys)
      && value.keys.length > 0
      && value.keys.every((key) => typeof key === 'string' && key.startsWith(CHUNK_KEY_PREFIX))
      && Number.isInteger(value.byteLength)
      && value.byteLength >= 0
      && typeof value.hash === 'string';
  }

  function decodeChunks(chunks) {
    const decoded = chunks.map(base64ToBytes);
    const size = decoded.reduce((sum, bytes) => sum + bytes.length, 0);
    const result = new Uint8Array(size);
    let offset = 0;
    for (const bytes of decoded) {
      result.set(bytes, offset);
      offset += bytes.length;
    }
    return result;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function hashBytes(bytes) {
    let hash = 0x811c9dc5;
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  function createGeneration() {
    const random = global.crypto?.randomUUID?.()
      || `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    return `${Date.now().toString(36)}-${random.replaceAll('-', '').slice(0, 16)}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  global.SmartTabSettingsStorage = Object.freeze({
    MANIFEST_KEY,
    CHUNK_KEY_PREFIX,
    LEGACY_CATEGORIES_KEY,
    RAW_CHUNK_BYTES,
    loadCategories,
    prepareCategoryWrite,
    commitCategoryWrite,
    saveCategories,
    isCategoryStorageChange,
    getItemBytes
  });
})(globalThis);
