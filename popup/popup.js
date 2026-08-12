// Popup Script for Smart Tab Grouper v1.1.0

document.addEventListener('DOMContentLoaded', async () => {
  const btnOrganize = document.getElementById('btnOrganize');
  const btnUndo = document.getElementById('btnUndo');
  const btnExcludeCurrent = document.getElementById('btnExcludeCurrent');
  const btnRemoveDuplicates = document.getElementById('btnRemoveDuplicates');
  const btnUngroup = document.getElementById('btnUngroup');
  const btnOptions = document.getElementById('btnOptions');
  const chkAutoGroup = document.getElementById('chkAutoGroup');
  const chkPreviewMode = document.getElementById('chkPreviewMode');
  const lblOrganizeBtn = document.getElementById('lblOrganizeBtn');
  const listSectionTitle = document.getElementById('listSectionTitle');
  const groupList = document.getElementById('groupList');
  const statTabCount = document.getElementById('statTabCount');
  const statGroupCount = document.getElementById('statGroupCount');
  const statusToast = document.getElementById('statusToast');

  function showToast(msg) {
    statusToast.textContent = msg;
    statusToast.style.opacity = '1';
    setTimeout(() => {
      statusToast.style.opacity = '0';
    }, 2500);
  }

  // Load and refresh state
  async function refreshUI() {
    const data = await chrome.storage.sync.get(['settings']);
    const settings = data.settings || {};
    
    chkAutoGroup.checked = !!settings.autoGroupOnUpdate;
    chkPreviewMode.checked = !!settings.previewMode;

    if (settings.previewMode) {
      lblOrganizeBtn.textContent = "🧪 テストシミュレーション実行";
      btnOrganize.classList.add('preview-active');
      listSectionTitle.textContent = "🧪 プレビュー分類シミュレーション結果";
    } else {
      lblOrganizeBtn.textContent = "✨ 今すぐタブを一括整理";
      btnOrganize.classList.remove('preview-active');
      listSectionTitle.textContent = "現在のグループ一覧";
    }

    const tabs = await chrome.tabs.query({ currentWindow: true });

    if (settings.previewMode) {
      // Execute dry-run preview simulation
      chrome.runtime.sendMessage({ action: "SIMULATE_ORGANIZE" }, (res) => {
        if (!res || !res.previewGroups) return;
        statTabCount.textContent = tabs.length;
        statGroupCount.textContent = `${res.previewGroups.length} (予想)`;
        renderGroupItems(res.previewGroups.map(g => ({
          title: g.name,
          color: g.color,
          tabCount: g.count,
          previewText: g.tabs.map(t => t.title).slice(0, 3).join(" • ")
        })));
      });
    } else {
      const groups = await chrome.tabGroups.query({ currentWindow: true });
      statTabCount.textContent = tabs.length;
      statGroupCount.textContent = groups.length;

      const groupData = groups.map(group => {
        const groupTabs = tabs.filter(t => t.groupId === group.id);
        return {
          title: group.title || '無題グループ',
          color: group.color || 'grey',
          tabCount: groupTabs.length,
          previewText: groupTabs.map(t => t.title).slice(0, 3).join(" • ")
        };
      });
      renderGroupItems(groupData);
    }
  }

  function renderGroupItems(groups) {
    if (!groups || groups.length === 0) {
      groupList.innerHTML = `
        <div class="empty-state">
          グループは作成されていません。<br>
          「タブを一括整理」を押すと色付きグループに整理されます。
        </div>
      `;
      return;
    }

    groupList.innerHTML = '';
    for (const g of groups) {
      const itemEl = document.createElement('div');
      itemEl.className = `group-item color-${g.color || 'grey'}`;
      itemEl.innerHTML = `
        <div class="group-header">
          <span class="group-name">${escapeHtml(g.title)}</span>
          <span class="group-badge">${g.tabCount} タブ</span>
        </div>
        <div class="group-preview" title="${escapeHtml(g.previewText)}">
          ${escapeHtml(g.previewText || 'なし')}
        </div>
      `;
      groupList.appendChild(itemEl);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Toggles Handlers
  chkAutoGroup.addEventListener('change', async (e) => {
    const data = await chrome.storage.sync.get(['settings']);
    const settings = data.settings || {};
    settings.autoGroupOnUpdate = e.target.checked;
    await chrome.storage.sync.set({ settings });
    showToast(e.target.checked ? "リアルタイム分け ON" : "リアルタイム分け OFF");
  });

  chkPreviewMode.addEventListener('change', async (e) => {
    const data = await chrome.storage.sync.get(['settings']);
    const settings = data.settings || {};
    settings.previewMode = e.target.checked;
    await chrome.storage.sync.set({ settings });
    showToast(e.target.checked ? "🧪 プレビューモード ON" : "✨ 通常モード ON");
    await refreshUI();
  });

  // Action Buttons
  btnOrganize.addEventListener('click', async () => {
    btnOrganize.disabled = true;
    btnOrganize.style.opacity = '0.7';
    chrome.runtime.sendMessage({ action: "ORGANIZE_CURRENT_WINDOW" }, async (res) => {
      btnOrganize.disabled = false;
      btnOrganize.style.opacity = '1';
      showToast(res && res.isPreview ? "🧪 プレビューシミュレーション完了" : "✨ タブ整理完了！");
      await refreshUI();
    });
  });

  btnUndo.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ action: "UNDO_LAST_ACTION" }, async (res) => {
      if (res && res.success) {
        showToast("↩️ 前回の整理を元に戻しました！");
      } else {
        showToast(res ? res.message : "元に戻す履歴がありません");
      }
      await refreshUI();
    });
  });

  btnExcludeCurrent.addEventListener('click', async () => {
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTabs[0] && activeTabs[0].url) {
      try {
        const u = new URL(activeTabs[0].url);
        const host = u.hostname;
        chrome.runtime.sendMessage({ action: "ADD_EXCLUSION", domain: host }, (res) => {
          showToast(`🚫 ${host} を除外リストに追加`);
        });
      } catch (e) {
        showToast("有効なWebドメインではありません");
      }
    }
  });

  btnRemoveDuplicates.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ action: "CLOSE_DUPLICATES" }, async (res) => {
      const count = res ? res.removedCount : 0;
      showToast(`🧹 重複タブ ${count}件 削除`);
      await refreshUI();
    });
  });

  btnUngroup.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ action: "UNGROUP_ALL" }, async (res) => {
      showToast("🔓 グループを解除しました");
      await refreshUI();
    });
  });

  btnOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Initial Load
  await refreshUI();
});
