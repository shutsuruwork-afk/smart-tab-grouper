import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../utils/default_rules.js';

document.addEventListener('DOMContentLoaded', async () => {
  // UI Elements
  const optStrictDomainPriority = document.getElementById('optStrictDomainPriority');
  const optGroupPinned = document.getElementById('optGroupPinned');
  const optDomainFallback = document.getElementById('optDomainFallback');
  const optCollapseInactive = document.getElementById('optCollapseInactive');
  const txtExclusions = document.getElementById('txtExclusions');
  const btnSaveExclusions = document.getElementById('btnSaveExclusions');
  const categoryContainer = document.getElementById('categoryContainer');
  const btnAddCategory = document.getElementById('btnAddCategory');
  const btnExportJson = document.getElementById('btnExportJson');
  const btnImportJson = document.getElementById('btnImportJson');
  const fileInput = document.getElementById('fileInput');
  const btnResetDefault = document.getElementById('btnResetDefault');
  
  // Modal Elements
  const categoryModal = document.getElementById('categoryModal');
  const modalTitle = document.getElementById('modalTitle');
  const categoryForm = document.getElementById('categoryForm');
  const catEditId = document.getElementById('catEditId');
  const catName = document.getElementById('catName');
  const catColor = document.getElementById('catColor');
  const catDomains = document.getElementById('catDomains');
  const catKeywords = document.getElementById('catKeywords');
  const catRegex = document.getElementById('catRegex');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCancelModal = document.getElementById('btnCancelModal');

  const toast = document.getElementById('toast');

  let categories = [];
  let settings = {};

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2500);
  }

  // Load from Storage
  async function loadData() {
    const data = await chrome.storage.sync.get(['categories', 'settings']);
    categories = data.categories || DEFAULT_CATEGORIES;
    settings = data.settings || DEFAULT_SETTINGS;

    optStrictDomainPriority.checked = settings.strictDomainPriority !== false;
    optGroupPinned.checked = !!settings.groupPinnedTabs;
    optDomainFallback.checked = !!settings.groupByDomainAsFallback;
    optCollapseInactive.checked = !!settings.collapseInactiveGroups;

    txtExclusions.value = (settings.exclusions || []).join('\n');

    renderCategories();
  }

  // Save Categories to Storage
  async function saveCategories() {
    await chrome.storage.sync.set({ categories });
    renderCategories();
    showToast("✅ カテゴリルールを保存しました");
  }

  // Save Settings to Storage
  async function saveSettings() {
    settings.strictDomainPriority = optStrictDomainPriority.checked;
    settings.groupPinnedTabs = optGroupPinned.checked;
    settings.groupByDomainAsFallback = optDomainFallback.checked;
    settings.collapseInactiveGroups = optCollapseInactive.checked;
    await chrome.storage.sync.set({ settings });
    showToast("⚙️ 一般設定を保存しました");
  }

  // Save Exclusions
  btnSaveExclusions.addEventListener('click', async () => {
    const parseList = (str) => str.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    settings.exclusions = parseList(txtExclusions.value);
    await chrome.storage.sync.set({ settings });
    showToast("🚫 除外リストを保存しました");
  });

  // Render Categories List
  function renderCategories() {
    categoryContainer.innerHTML = '';

    categories.forEach((cat, index) => {
      const card = document.createElement('div');
      card.className = `category-card-item cat-border-${cat.color || 'grey'}`;
      if (!cat.enabled) card.style.opacity = '0.5';

      const domainChips = (cat.domains || []).slice(0, 8).map(d => `<span class="chip">${escapeHtml(d)}</span>`).join('');
      const domainMore = (cat.domains || []).length > 8 ? `<span class="chip">+${cat.domains.length - 8}</span>` : '';

      const keywordChips = (cat.titleKeywords || []).slice(0, 6).map(k => `<span class="chip">${escapeHtml(k)}</span>`).join('');
      const keywordMore = (cat.titleKeywords || []).length > 6 ? `<span class="chip">+${cat.titleKeywords.length - 6}</span>` : '';

      card.innerHTML = `
        <div class="cat-item-top">
          <div class="cat-title-badge">
            <span class="cat-title">${escapeHtml(cat.name)}</span>
            <span class="cat-color-tag">${cat.color || 'grey'}</span>
          </div>
          <div class="cat-item-controls">
            <button class="btn btn-outline btn-sm btn-toggle" data-index="${index}">
              ${cat.enabled ? '🟢 有効' : '⚪ 無効'}
            </button>
            <button class="btn btn-outline btn-sm btn-up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>▲</button>
            <button class="btn btn-outline btn-sm btn-down" data-index="${index}" ${index === categories.length - 1 ? 'disabled' : ''}>▼</button>
            <button class="btn btn-outline btn-sm btn-edit" data-index="${index}">✏️ 編集</button>
            <button class="btn btn-danger btn-sm btn-delete" data-index="${index}">🗑️</button>
          </div>
        </div>

        <div class="cat-rules-preview">
          <div class="tag-group">
            <span class="tag-group-label">ドメイン:</span>
            ${domainChips}${domainMore}
          </div>
          <div class="tag-group">
            <span class="tag-group-label">キーワード:</span>
            ${keywordChips}${keywordMore}
          </div>
        </div>
      `;

      categoryContainer.appendChild(card);
    });

    attachCategoryEvents();
  }

  function attachCategoryEvents() {
    document.querySelectorAll('.btn-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = e.target.dataset.index;
        categories[idx].enabled = !categories[idx].enabled;
        saveCategories();
      });
    });

    document.querySelectorAll('.btn-up').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        if (idx > 0) {
          const temp = categories[idx];
          categories[idx] = categories[idx - 1];
          categories[idx - 1] = temp;
          saveCategories();
        }
      });
    });

    document.querySelectorAll('.btn-down').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        if (idx < categories.length - 1) {
          const temp = categories[idx];
          categories[idx] = categories[idx + 1];
          categories[idx + 1] = temp;
          saveCategories();
        }
      });
    });

    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = e.target.dataset.index;
        openModal(categories[idx]);
      });
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = e.target.dataset.index;
        if (confirm(`カテゴリ「${categories[idx].name}」を削除しますか？`)) {
          categories.splice(idx, 1);
          saveCategories();
        }
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Modal Handling
  function openModal(cat = null) {
    if (cat) {
      modalTitle.textContent = "カテゴリの編集";
      catEditId.value = cat.id;
      catName.value = cat.name;
      catColor.value = cat.color || 'purple';
      catDomains.value = (cat.domains || []).join('\n');
      catKeywords.value = (cat.titleKeywords || []).join('\n');
      catRegex.value = (cat.regexRules || []).join('\n');
    } else {
      modalTitle.textContent = "新しいカテゴリの追加";
      catEditId.value = "";
      catName.value = "";
      catColor.value = "purple";
      catDomains.value = "";
      catKeywords.value = "";
      catRegex.value = "";
    }
    categoryModal.classList.remove('hidden');
  }

  function closeModal() {
    categoryModal.classList.add('hidden');
  }

  btnAddCategory.addEventListener('click', () => openModal(null));
  btnCloseModal.addEventListener('click', closeModal);
  btnCancelModal.addEventListener('click', closeModal);

  categoryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = catEditId.value;

    const parseList = (str) => str.split(/[\n,]/).map(s => s.trim()).filter(Boolean);

    const updatedCat = {
      id: editId || `cat_custom_${Date.now()}`,
      name: catName.value.trim(),
      color: catColor.value,
      enabled: true,
      domains: parseList(catDomains.value),
      titleKeywords: parseList(catKeywords.value),
      regexRules: parseList(catRegex.value)
    };

    if (editId) {
      const idx = categories.findIndex(c => c.id === editId);
      if (idx !== -1) {
        categories[idx] = updatedCat;
      }
    } else {
      categories.push(updatedCat);
    }

    saveCategories();
    closeModal();
  });

  // Settings Change Listeners
  optStrictDomainPriority.addEventListener('change', saveSettings);
  optGroupPinned.addEventListener('change', saveSettings);
  optDomainFallback.addEventListener('change', saveSettings);
  optCollapseInactive.addEventListener('change', saveSettings);

  // Export JSON
  btnExportJson.addEventListener('click', () => {
    const configData = {
      categories,
      settings,
      exportedAt: new Date().toISOString()
    };
    const jsonStr = JSON.stringify(configData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `smart_tab_rules_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("📥 設定ルールをJSONエクスポートしました");
  });

  // Import JSON
  btnImportJson.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (imported.categories && Array.isArray(imported.categories)) {
          categories = imported.categories;
          if (imported.settings) settings = imported.settings;
          await chrome.storage.sync.set({ categories, settings });
          await loadData();
          showToast("📤 JSON設定を正常にインポートしました");
        } else {
          alert("無効なルール設定ファイルです。");
        }
      } catch (err) {
        alert("JSONファイルの読み込みエラー: " + err.message);
      }
    };
    reader.readAsText(file);
  });

  // Reset to Default
  btnResetDefault.addEventListener('click', async () => {
    if (confirm("標準のプリセット（開発系・小説執筆系など）に初期化しますか？")) {
      categories = DEFAULT_CATEGORIES;
      settings = DEFAULT_SETTINGS;
      await chrome.storage.sync.set({ categories, settings });
      await loadData();
      showToast("🔄 標準プリセットに初期化しました");
    }
  });

  // Initial Load
  await loadData();
});
