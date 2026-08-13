const preview = createPreviewAdapter();
let activeUiTheme = preview?.uiTheme || cloneThemeConfig(SmartTabTheme.DEFAULT_CONFIG);
let currentWindowId = null;
let undoAvailable = false;
let currentUndoOperationId = null;
let availableCategories = [];
let pollTimer = null;
let openCorrectionMenu = null;

const themeReady = initializeTheme();

document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  await themeReady;
  bindStaticActions();
  observePreviewSize();

  try {
    currentWindowId = await resolveCurrentWindowId();
    const state = await sendAction({
      action: 'GET_POPUP_STATE',
      windowId: currentWindowId
    });
    if (!state?.success) throw new Error(state?.message || '状態を確認できませんでした。');
    renderPopupState(state);
  } catch (error) {
    renderConfirmation({ count: null, groupCount: 0, unresolved: 0 });
    setStatus('confirmationStatus', error?.message || '状態を確認できませんでした。', 'error');
  }
}

function bindStaticActions() {
  const undoShortcut = SmartTabKeyboardShortcuts.getUndoShortcut();
  const undoButton = document.getElementById('btnUndo');
  undoButton.title = `ショートカット: ${undoShortcut.compact}`;
  undoButton.setAttribute('aria-keyshortcuts', undoShortcut.ariaKeyShortcuts);
  document.getElementById('btnCancel').addEventListener('click', () => closePopup('cancel'));
  document.getElementById('btnClose').addEventListener('click', () => closePopup('success'));
  document.getElementById('btnConfirm').addEventListener('click', organizeCurrentWindow);
  document.getElementById('btnUndo').addEventListener('click', undoLastAction);
  for (const button of document.querySelectorAll('.settings-link')) {
    button.addEventListener('click', openSettings);
  }
  document.addEventListener('click', closeCorrectionMenuFromOutside);
  document.addEventListener('keydown', handleUndoShortcut);
}

function renderPopupState(state) {
  if (Array.isArray(state.categories)) availableCategories = state.categories;
  if (state.inProgress) {
    renderProgress();
    startProgressPolling();
    return;
  }
  if (state.undo?.available) {
    renderCompletion(state.undo);
    return;
  }
  renderConfirmation(state.preview, state.recovery);
}

function renderConfirmation(previewState = {}, recovery = null) {
  showOnly('confirmationView');
  undoAvailable = false;
  currentUndoOperationId = null;
  const title = document.getElementById('confirmationTitle');
  const description = document.getElementById('confirmationDescription');
  const confirmButton = document.getElementById('btnConfirm');
  const count = Number.isInteger(previewState.count) ? previewState.count : null;
  const groups = Number.isInteger(previewState.groupCount) ? previewState.groupCount : 0;
  const unresolved = Number.isInteger(previewState.unresolved) ? previewState.unresolved : 0;
  const hasContentCandidates = previewState.contentClassificationEnabled && unresolved > 0;
  const contentMayAdd = hasContentCandidates && !previewState.contentLimitExceeded;

  if (count === null) {
    title.textContent = '本当に整理しますか？';
    description.textContent = '現在のウィンドウのタブをグループに整理します。';
    confirmButton.disabled = false;
  } else if (count === 0 && !contentMayAdd) {
    title.textContent = hasContentCandidates && previewState.contentLimitExceeded
      ? '補助分類を実行できません'
      : '整理できるタブはありません';
    description.textContent = hasContentCandidates && previewState.contentLimitExceeded
      ? '補助分類の候補が30件を超え、登録済みルールに一致するタブもありません。'
      : '未整理のタブに、登録済みルールと一致するものはありません。';
    confirmButton.disabled = true;
  } else {
    title.textContent = `${count}件のタブを整理しますか？`;
    const groupText = groups > 0 ? `${groups}グループへ整理する予定です。` : '';
    const assistText = hasContentCandidates
      ? previewState.contentLimitExceeded
        ? '補助分類は候補が30件を超えたため使用しません。'
        : '補助分類の結果で対象が増える場合があります。'
      : '';
    description.textContent = [groupText, assistText].filter(Boolean).join(' ')
      || '補助分類で対象を確認します。';
    confirmButton.disabled = false;
  }

  setStatus(
    'confirmationStatus',
    recovery?.recovered ? '中断されていた前回の整理を安全に戻しました。' : '',
    recovery?.errors?.length ? 'error' : null
  );
  document.getElementById('btnCancel').focus({ preventScroll: true });
}

function renderProgress() {
  showOnly('progressView');
  undoAvailable = false;
}

function renderCompletion(undoState, fallbackMessage = '') {
  showOnly('completionView');
  const summary = undoState?.summary || { count: 0, groups: [] };
  const count = Number(summary.count) || 0;
  const groups = Array.isArray(summary.groups) ? summary.groups : [];
  const isGroupEdit = summary.kind === 'group-edit';
  undoAvailable = undoState?.available === true;
  currentUndoOperationId = undoState?.operationId || null;

  document.getElementById('completionTitle').textContent = isGroupEdit
    ? 'グループを変更しました'
    : count > 0
      ? '整理しました'
      : '整理する新しいタブはありません';
  document.getElementById('completionDescription').textContent = isGroupEdit
    ? summary.message || 'グループの表示を変更しました。'
    : count > 0
      ? `${count}件を${groups.length}グループへ整理しました。`
      : fallbackMessage || '現在の状態は変更していません。';
  renderCompletionGroups(groups);
  document.getElementById('btnUndo').hidden = !undoAvailable;
  document.getElementById('btnUndo').disabled = false;
  setStatus('completionStatus', '', null);
  document.getElementById('btnClose').focus({ preventScroll: true });
}

function renderCompletionGroups(groups) {
  const container = document.getElementById('completionGroups');
  openCorrectionMenu = null;
  container.replaceChildren();
  container.hidden = groups.length === 0;
  for (const group of groups) {
    const block = document.createElement('details');
    block.className = 'completion-group';
    const row = document.createElement('summary');
    row.className = 'completion-group-summary';

    const dot = document.createElement('span');
    dot.className = `group-dot group-dot-${group.color || 'grey'}`;
    dot.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'completion-group-name';
    name.textContent = group.name || 'グループ';

    const count = document.createElement('span');
    count.className = 'completion-group-count';
    count.textContent = `${Number(group.count) || group.tabs?.length || 0}件`;

    const chevron = document.createElement('span');
    chevron.className = 'completion-group-chevron';
    chevron.textContent = '›';
    chevron.setAttribute('aria-hidden', 'true');

    row.append(dot, name, count, chevron);
    block.append(row);

    if (Array.isArray(group.tabs) && group.tabs.length > 0) {
      const tabs = document.createElement('div');
      tabs.className = 'completion-tabs';
      for (const tab of group.tabs) {
        const tabRow = document.createElement('div');
        tabRow.className = 'completion-tab';

        const tabCopy = document.createElement('span');
        tabCopy.className = 'completion-tab-copy';
        const title = document.createElement('span');
        title.className = 'completion-tab-title';
        title.textContent = tab.title || '無題のタブ';
        const host = document.createElement('small');
        host.textContent = getHostname(tab.url);
        tabCopy.append(title, host);
        tabRow.append(tabCopy);

        const alternatives = availableCategories.filter((item) => item.id !== group.categoryId);
        if (alternatives.length > 0) {
          const correct = document.createElement('button');
          correct.type = 'button';
          correct.className = 'correction-trigger';
          correct.textContent = '修正';
          correct.setAttribute('aria-label', `${tab.title || 'このタブ'}の分類を修正`);
          correct.setAttribute('aria-expanded', 'false');
          correct.setAttribute('aria-haspopup', 'menu');

          const choices = document.createElement('div');
          choices.id = `correction-menu-${tab.tabId}`;
          choices.className = 'correction-choices';
          choices.hidden = true;
          choices.setAttribute('role', 'menu');
          choices.setAttribute('aria-label', `${tab.title || 'このタブ'}の移動先`);
          correct.setAttribute('aria-controls', choices.id);
          for (const category of alternatives) {
            const choice = document.createElement('button');
            choice.type = 'button';
            choice.className = 'correction-choice';
            choice.setAttribute('role', 'menuitem');
            choice.tabIndex = -1;
            choice.textContent = category.name;
            choice.addEventListener('click', () => applyCorrection(tab.tabId, category.id));
            choices.append(choice);
          }
          correct.addEventListener('click', () => toggleCorrectionMenu(correct, choices));
          choices.addEventListener('keydown', (event) => handleCorrectionMenuKeydown(
            event,
            correct,
            choices
          ));
          choices.addEventListener('focusout', (event) => {
            const next = event.relatedTarget;
            if (next !== correct && !(next instanceof Node && choices.contains(next))) {
              closeOpenCorrectionMenu();
            }
          });
          tabRow.append(correct, choices);
        }
        tabs.append(tabRow);
      }
      block.append(tabs);
    }
    container.append(block);
  }
}

function toggleCorrectionMenu(trigger, menu) {
  const willOpen = menu.hidden;
  closeOpenCorrectionMenu();
  if (!willOpen) return;

  menu.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  openCorrectionMenu = { trigger, menu };
  const firstChoice = menu.querySelector('.correction-choice');
  if (firstChoice) {
    firstChoice.tabIndex = 0;
    firstChoice.focus({ preventScroll: true });
  }
}

function closeOpenCorrectionMenu({ restoreFocus = false } = {}) {
  if (!openCorrectionMenu) return;
  const { trigger, menu } = openCorrectionMenu;
  menu.hidden = true;
  for (const choice of menu.querySelectorAll('.correction-choice')) choice.tabIndex = -1;
  trigger.setAttribute('aria-expanded', 'false');
  openCorrectionMenu = null;
  if (restoreFocus) trigger.focus({ preventScroll: true });
}

function closeCorrectionMenuFromOutside(event) {
  if (!openCorrectionMenu) return;
  const target = event.target;
  if (target instanceof Element && target.closest('.correction-trigger, .correction-choices')) return;
  closeOpenCorrectionMenu();
}

function handleCorrectionMenuKeydown(event, trigger, menu) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeOpenCorrectionMenu({ restoreFocus: true });
    return;
  }

  const choices = [...menu.querySelectorAll('.correction-choice')];
  const nextIndex = SmartTabMenuNavigation.getNextIndex(
    event.key,
    choices.indexOf(document.activeElement),
    choices.length
  );
  if (nextIndex === null) return;
  event.preventDefault();
  for (const [index, choice] of choices.entries()) choice.tabIndex = index === nextIndex ? 0 : -1;
  choices[nextIndex].focus({ preventScroll: true });
}

async function applyCorrection(tabId, targetCategoryId) {
  if (!undoAvailable || !currentUndoOperationId) return;
  undoAvailable = false;
  document.getElementById('btnUndo').disabled = true;
  for (const button of document.querySelectorAll('.correction-trigger, .correction-choice')) {
    button.disabled = true;
  }
  setStatus('completionStatus', '分類ルールを修正しています…', null);

  try {
    const response = await sendAction({
      action: 'CORRECT_CLASSIFICATION',
      windowId: currentWindowId,
      operationId: currentUndoOperationId,
      tabId,
      targetCategoryId
    });
    if (!response?.success) throw new Error(response?.message || '分類を修正できませんでした。');
    renderCompletion(response.undo);
    setStatus('completionStatus', response.message, null);
  } catch (error) {
    undoAvailable = true;
    document.getElementById('btnUndo').disabled = false;
    for (const button of document.querySelectorAll('.correction-trigger, .correction-choice')) {
      button.disabled = false;
    }
    setStatus('completionStatus', error?.message || '分類を修正できませんでした。', 'error');
  }
}

async function organizeCurrentWindow() {
  renderProgress();
  try {
    const response = await sendAction({
      action: 'ORGANIZE_CURRENT_WINDOW_CONFIRMED',
      windowId: currentWindowId
    });
    if (!response?.success) throw new Error(response?.message || '整理できませんでした。');
    if (response.undo?.available) {
      renderCompletion(response.undo);
      if (response.ownershipConflicts > 0) {
        setStatus('completionStatus', '同名グループと安全に照合できない分類は変更していません。', null);
      }
    } else {
      renderCompletion(null, response.message);
    }
  } catch (error) {
    const state = await safeReloadPopupState();
    if (state?.undo?.available) {
      renderCompletion(state.undo);
      setStatus('completionStatus', '整理結果を確認しました。', null);
      return;
    }
    renderConfirmation(state?.preview || { count: null });
    setStatus('confirmationStatus', error?.message || '整理できませんでした。もう一度お試しください。', 'error');
  }
}

async function handleUndoShortcut(event) {
  if (
    !SmartTabKeyboardShortcuts.matchesUndoShortcut(event)
    || !undoAvailable
    || document.getElementById('completionView').hidden
    || isEditableTarget(event.target)
  ) return;

  event.preventDefault();
  await undoLastAction();
}

async function undoLastAction() {
  if (!undoAvailable || document.getElementById('completionView').hidden) return;
  const undoOperationId = currentUndoOperationId;
  undoAvailable = false;
  const undoButton = document.getElementById('btnUndo');
  undoButton.disabled = true;
  setStatus('completionStatus', '元に戻しています…', null);

  try {
    const response = await sendAction({
      action: 'UNDO_LAST_ACTION',
      windowId: currentWindowId
    });
    if (!response?.success) throw new Error(response?.message || '元に戻せませんでした。');
    currentUndoOperationId = null;
    document.getElementById('completionTitle').textContent = '元に戻しました';
    document.getElementById('completionDescription').textContent = response.message;
    document.getElementById('completionGroups').replaceChildren();
    document.getElementById('completionGroups').hidden = true;
    undoButton.hidden = true;
    setStatus('completionStatus', response.partial ? '後から変更されたタブはそのまま残しています。' : '', null);
    document.getElementById('btnClose').focus({ preventScroll: true });
  } catch (error) {
    undoAvailable = true;
    currentUndoOperationId = undoOperationId;
    undoButton.hidden = false;
    undoButton.disabled = false;
    setStatus('completionStatus', error?.message || '元に戻せませんでした。', 'error');
  }
}

async function openSettings() {
  if (preview && window.parent !== window) {
    window.parent.postMessage({
      source: 'smart-tab-grouper-preview',
      type: 'open-settings'
    }, '*');
    return;
  }

  try {
    const optionsUrl = chrome.runtime.getURL('options/options.html');
    const targetWindowId = Number.isInteger(currentWindowId)
      ? currentWindowId
      : await resolveCurrentWindowId();
    const tabs = await chrome.tabs.query({});
    const destination = SmartTabNavigation.chooseSettingsDestination(tabs, targetWindowId, optionsUrl);
    const existing = destination.type === 'reuse' ? destination.tab : null;
    const existingHash = existing?.url ? new URL(existing.url).hash : '';
    const targetUrl = new URL(optionsUrl);
    targetUrl.searchParams.set('windowId', String(targetWindowId));
    targetUrl.hash = existingHash;
    if (destination.type === 'reuse') {
      if (Number.isInteger(existing.windowId)) {
        await chrome.windows.update(existing.windowId, { focused: true });
      }
      await chrome.tabs.update(existing.id, { active: true, url: targetUrl.href });
    } else if (destination.type === 'replace') {
      await chrome.tabs.update(destination.tab.id, { url: targetUrl.href, active: true });
    } else {
      await chrome.tabs.create({
        windowId: targetWindowId,
        url: targetUrl.href,
        active: true
      });
    }
    window.close();
  } catch (error) {
    const statusId = document.getElementById('completionView').hidden
      ? 'confirmationStatus'
      : 'completionStatus';
    setStatus(statusId, '設定を開けませんでした。', 'error');
  }
}

function startProgressPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const state = await safeReloadPopupState();
    if (!state || state.inProgress) return;
    clearInterval(pollTimer);
    pollTimer = null;
    renderPopupState(state);
  }, 500);
}

async function safeReloadPopupState() {
  try {
    return await sendAction({ action: 'GET_POPUP_STATE', windowId: currentWindowId });
  } catch (error) {
    return null;
  }
}

function showOnly(viewId) {
  for (const view of document.querySelectorAll('.popup-view')) {
    view.hidden = view.id !== viewId;
  }
}

function setStatus(id, message, state) {
  const element = document.getElementById(id);
  element.textContent = message || '';
  if (state) element.dataset.state = state;
  else delete element.dataset.state;
}

function isEditableTarget(target) {
  return target instanceof HTMLElement
    && (target.matches('input, textarea, select') || target.isContentEditable);
}

async function resolveCurrentWindowId() {
  if (preview) return 1;
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (Number.isInteger(activeTab?.windowId)) return activeTab.windowId;
  return (await chrome.windows.getCurrent()).id;
}

function sendAction(message) {
  if (preview) return preview.send(message);
  return chrome.runtime.sendMessage(message);
}

function closePopup(reason) {
  if (preview && window.parent !== window) {
    window.parent.postMessage({
      source: 'smart-tab-grouper-preview',
      type: 'popup-closed',
      reason
    }, '*');
    return;
  }
  window.close();
}

function observePreviewSize() {
  if (!preview || window.parent === window || typeof ResizeObserver !== 'function') return;
  const report = () => window.parent.postMessage({
    source: 'smart-tab-grouper-preview',
    type: 'popup-size',
    height: Math.ceil(document.documentElement.scrollHeight)
  }, '*');
  new ResizeObserver(report).observe(document.body);
  report();
}

function createPreviewAdapter() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('preview') !== '1' || window.location.protocol === 'chrome-extension:') return null;

  const theme = params.get('theme');
  const palette = params.get('palette');
  const shadow = params.get('shadow');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  if (shadow === 'off') document.documentElement.dataset.shadow = 'off';

  const uiTheme = palette === 'custom'
    ? SmartTabTheme.normalizeConfig({ mode: 'custom', seed: params.get('seed') })
    : SmartTabTheme.normalizeConfig({ mode: 'preset', preset: palette });
  const storageKey = 'smart-tab-grouper-popup-preview-undo';
  const actionDelay = clampDelay(params.get('actionDelay'), 700);

  return Object.freeze({
    theme: theme === 'dark' ? 'dark' : 'light',
    uiTheme,
    async send(message) {
      if (message.action === 'GET_POPUP_STATE') {
        const undo = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
        return {
          success: true,
          windowId: 1,
          undo,
          inProgress: false,
          preview: {
            count: 4,
            groupCount: 3,
            unresolved: 4,
            contentClassificationEnabled: true,
            contentLimitExceeded: false
          },
          categories: [
            { id: 'cat_dev', name: '💻 開発・プログラミング', color: 'purple' },
            { id: 'cat_ai_search', name: '🔍 検索・AIアシスタント', color: 'cyan' },
            { id: 'cat_news', name: '📰 ニュース・情報', color: 'orange' },
            { id: 'cat_shopping', name: '🛒 ショッピング', color: 'yellow' }
          ]
        };
      }
      await wait(actionDelay);
      if (params.get('outcome') === 'error') {
        return { success: false, message: '整理できませんでした。もう一度お試しください。' };
      }
      if (message.action === 'UNDO_LAST_ACTION') {
        sessionStorage.removeItem(storageKey);
        return { success: true, restoredCount: 4, skippedCount: 0, partial: false, message: '4件を元に戻しました。' };
      }
      if (message.action === 'CORRECT_CLASSIFICATION') {
        const undo = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
        const tab = undo?.summary?.groups?.flatMap((group) => group.tabs || [])
          .find((item) => item.tabId === message.tabId);
        const target = [
          { id: 'cat_dev', name: '💻 開発・プログラミング', color: 'purple' },
          { id: 'cat_ai_search', name: '🔍 検索・AIアシスタント', color: 'cyan' },
          { id: 'cat_news', name: '📰 ニュース・情報', color: 'orange' },
          { id: 'cat_shopping', name: '🛒 ショッピング', color: 'yellow' }
        ].find((item) => item.id === message.targetCategoryId);
        if (!undo || !tab || !target) return { success: false, message: '分類を修正できませんでした。' };
        for (const group of undo.summary.groups) {
          group.tabs = (group.tabs || []).filter((item) => item.tabId !== tab.tabId);
          group.count = group.tabs.length;
        }
        undo.summary.groups = undo.summary.groups.filter((group) => group.count > 0);
        let group = undo.summary.groups.find((item) => item.categoryId === target.id);
        if (!group) {
          group = { categoryId: target.id, name: target.name, color: target.color, count: 0, tabs: [] };
          undo.summary.groups.push(group);
        }
        group.tabs.push(tab);
        group.count = group.tabs.length;
        sessionStorage.setItem(storageKey, JSON.stringify(undo));
        return { success: true, undo, message: `${getHostname(tab.url)} を「${target.name}」へ登録しました。` };
      }
      if (message.action === 'ORGANIZE_CURRENT_WINDOW_CONFIRMED') {
        const undo = {
          available: true,
          operationId: 'preview-operation',
          windowId: 1,
          expiresAt: Date.now() + 30 * 60 * 1000,
          summary: {
            count: 4,
            groups: [
              {
                categoryId: 'cat_dev', name: '💻 開発・プログラミング', color: 'purple', count: 2,
                tabs: [
                  { tabId: 1, title: 'GitHub — smart-tab-grouper', url: 'https://github.com/example/smart-tab-grouper' },
                  { tabId: 2, title: 'JavaScript API', url: 'https://developer.example.com/api' }
                ]
              },
              {
                categoryId: 'cat_ai_search', name: '🔍 検索・AIアシスタント', color: 'cyan', count: 1,
                tabs: [{ tabId: 3, title: '検索結果', url: 'https://search.example.com/' }]
              },
              {
                categoryId: 'cat_news', name: '📰 ニュース・情報', color: 'orange', count: 1,
                tabs: [{ tabId: 4, title: '今日のニュース', url: 'https://news.example.com/today' }]
              }
            ]
          }
        };
        sessionStorage.setItem(storageKey, JSON.stringify(undo));
        return { success: true, changed: true, count: 4, undo };
      }
      return { success: true };
    }
  });
}

async function initializeTheme() {
  if (preview) {
    SmartTabTheme.apply(activeUiTheme, { theme: preview.theme });
    return;
  }
  const canUseExtensionStorage = window.location.protocol === 'chrome-extension:'
    && Boolean(globalThis.chrome?.storage?.sync);
  if (canUseExtensionStorage) {
    try {
      const data = await chrome.storage.sync.get(['uiTheme']);
      activeUiTheme = SmartTabTheme.normalizeConfig(data.uiTheme);
    } catch (error) {
      activeUiTheme = cloneThemeConfig(SmartTabTheme.DEFAULT_CONFIG);
    }
  }
  SmartTabTheme.apply(activeUiTheme);
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    SmartTabTheme.apply(activeUiTheme);
  });
}

function cloneThemeConfig(value) {
  return JSON.parse(JSON.stringify(value));
}

function clampDelay(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 0), 5000);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getHostname(rawUrl) {
  try {
    return new URL(rawUrl).hostname;
  } catch (error) {
    return '';
  }
}
