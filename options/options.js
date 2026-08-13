import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../utils/default_rules.js';
import { normalizeCategories, normalizeRuleSettings } from '../utils/category_rules.js';
import { buildWindowOrganizeConfirmation } from '../utils/organizer_confirmation.js';

const FALLBACK_CATEGORIES = normalizeCategories(DEFAULT_CATEGORIES);

const GROUP_COLORS = [
  { value: 'grey', label: 'グレー', hex: '#5f6368' },
  { value: 'blue', label: 'ブルー', hex: '#1a73e8' },
  { value: 'red', label: 'レッド', hex: '#d93025' },
  { value: 'yellow', label: 'イエロー', hex: '#f9ab00' },
  { value: 'green', label: 'グリーン', hex: '#188038' },
  { value: 'pink', label: 'ピンク', hex: '#d01884' },
  { value: 'purple', label: 'パープル', hex: '#a142f4' },
  { value: 'cyan', label: 'シアン', hex: '#12b5cb' },
  { value: 'orange', label: 'オレンジ', hex: '#fa903e' }
];

const PREVIEW_STORAGE_KEY = 'smart-tab-grouper-options-preview-v2';
const PREVIEW_CONTENT_ACCESS_KEY = 'smart-tab-grouper-options-preview-content-access';
const MANAGED_GROUPS_STORAGE_KEY = 'smartTabGrouperManagedGroupsV1';
const UNGROUPED_SELECTION_ID = 'ungrouped';
const previewMode = new URLSearchParams(window.location.search).get('preview') === '1';
const storage = createStorageAdapter();
const organizer = createOrganizerAdapter();

const workspacePickerButton = document.getElementById('workspacePickerButton');
const workspaceTitle = document.getElementById('workspaceTitle');
const workspaceMenu = document.getElementById('workspaceMenu');
const settingsWorkspaceOption = document.getElementById('settingsWorkspaceOption');
const organizerWorkspaceOption = document.getElementById('organizerWorkspaceOption');
const settingsDirtyIndicator = document.getElementById('settingsDirtyIndicator');
const settingsWorkspace = document.getElementById('settingsWorkspace');
const organizerWorkspace = document.getElementById('organizerWorkspace');
const behaviorNav = document.getElementById('behaviorNav');
const appearanceNav = document.getElementById('appearanceNav');
const categoryList = document.getElementById('categoryList');
const categoryCount = document.getElementById('categoryCount');
const editorTitle = document.getElementById('editorTitle');
const editorOverline = document.getElementById('editorOverline');
const behaviorEditorIcon = document.getElementById('behaviorEditorIcon');
const appearanceEditorIcon = document.getElementById('appearanceEditorIcon');
const selectedColorDot = document.getElementById('selectedColorDot');
const saveState = document.getElementById('saveState');
const appearanceEditor = document.getElementById('appearanceEditor');
const behaviorEditor = document.getElementById('behaviorEditor');
const groupEditor = document.getElementById('groupEditor');
const themeOptions = document.getElementById('themeOptions');
const contentClassificationToggle = document.getElementById('contentClassificationToggle');
const contentClassificationAccessStatus = document.getElementById('contentClassificationAccessStatus');
const groupUnmatchedToggle = document.getElementById('groupUnmatchedToggle');
const categoryEnabledToggle = document.getElementById('categoryEnabledToggle');
const behaviorOrganizeButton = document.getElementById('behaviorOrganizeButton');
const domainInput = document.getElementById('domainInput');
const addDomainButton = document.getElementById('addDomainButton');
const domainFeedback = document.getElementById('domainFeedback');
const domainList = document.getElementById('domainList');
const emptyDomains = document.getElementById('emptyDomains');
const colorOptions = document.getElementById('colorOptions');
const changeSummary = document.getElementById('changeSummary');
const discardButton = document.getElementById('discardButton');
const saveButton = document.getElementById('saveButton');
const toast = document.getElementById('toast');
const previewBadge = document.getElementById('previewBadge');
const refreshGroupsButton = document.getElementById('refreshGroupsButton');
const currentGroupList = document.getElementById('currentGroupList');
const organizerWindowSummary = document.getElementById('organizerWindowSummary');
const emptyGroups = document.getElementById('emptyGroups');
const inspectorColorDot = document.getElementById('inspectorColorDot');
const inspectorOverline = document.getElementById('inspectorOverline');
const inspectorTitle = document.getElementById('inspectorTitle');
const organizerStatus = document.getElementById('organizerStatus');
const organizeWindowButton = document.getElementById('organizeWindowButton');
const groupInspectorEmpty = document.getElementById('groupInspectorEmpty');
const selectedGroupContent = document.getElementById('selectedGroupContent');
const selectedGroupTabLabel = document.getElementById('selectedGroupTabLabel');
const selectedGroupTabCount = document.getElementById('selectedGroupTabCount');
const selectedGroupStateLabel = document.getElementById('selectedGroupStateLabel');
const selectedGroupCollapsed = document.getElementById('selectedGroupCollapsed');
const selectedGroupColorLabel = document.getElementById('selectedGroupColorLabel');
const selectedGroupColor = document.getElementById('selectedGroupColor');
const groupTabsHeading = document.getElementById('groupTabsHeading');
const groupTabsDescription = document.getElementById('groupTabsDescription');
const selectedGroupTabs = document.getElementById('selectedGroupTabs');
const groupEditAction = document.getElementById('groupEditAction');
const editGroupButton = document.getElementById('editGroupButton');
const groupReorganizeAction = document.getElementById('groupReorganizeAction');
const reorganizeGroupButton = document.getElementById('reorganizeGroupButton');
const organizerUndoHint = document.getElementById('organizerUndoHint');
const organizeDialog = document.getElementById('organizeDialog');
const organizeDialogOverline = document.getElementById('organizeDialogOverline');
const organizeDialogTitle = document.getElementById('organizeDialogTitle');
const organizeDialogDescription = document.getElementById('organizeDialogDescription');
const cancelOrganizeButton = document.getElementById('cancelOrganizeButton');
const confirmOrganizeButton = document.getElementById('confirmOrganizeButton');
const groupEditDialog = document.getElementById('groupEditDialog');
const groupEditNameInput = document.getElementById('groupEditNameInput');
const groupEditColorOptions = document.getElementById('groupEditColorOptions');
const groupEditCollapsedToggle = document.getElementById('groupEditCollapsedToggle');
const groupEditStatus = document.getElementById('groupEditStatus');
const cancelGroupEditButton = document.getElementById('cancelGroupEditButton');
const saveGroupEditButton = document.getElementById('saveGroupEditButton');

let categories = [];
let savedCategories = [];
let uiTheme = clone(SmartTabTheme.DEFAULT_CONFIG);
let savedUiTheme = clone(SmartTabTheme.DEFAULT_CONFIG);
let organizeSettings = normalizeOrganizeSettings();
let savedOrganizeSettings = normalizeOrganizeSettings();
let selectedCategoryId = null;
let selectedView = 'group';
let dirty = false;
let toastTimer = null;
let activeWorkspace = window.location.hash === '#organizer' ? 'organizer' : 'settings';
let organizerState = null;
let selectedCurrentGroupId = null;
let organizerLoading = false;
let organizerStateStale = false;
let organizerRefreshTimer = null;
let organizerRefreshPending = false;
let organizerUndoExpiryTimer = null;
const organizerRefreshRetry = SmartTabRetryBackoff.create();
let behaviorActionRunning = false;
let organizerDialogMode = 'window';
let pendingWindowConfirmationToken = null;
let pendingGroupReorganization = null;
let organizerDialogReturnFocus = null;
let pendingGroupEdit = null;
let selectedGroupEditColor = 'grey';
let groupEditSaving = false;
let contentClassificationAccessGranted = false;
let contentClassificationAccessChecking = false;
let contentAccessDraftActive = false;
let externalSettingsChanged = false;
let externalSettingsRefreshTimer = null;
let settingsSyncGeneration = 0;
let settingsSaveInFlight = false;

document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  previewBadge.hidden = !previewMode;
  const undoShortcut = SmartTabKeyboardShortcuts.getUndoShortcut();
  organizerUndoHint.querySelector('[data-undo-modifier]').textContent = undoShortcut.modifier;
  organizerUndoHint.setAttribute('aria-keyshortcuts', undoShortcut.ariaKeyShortcuts);
  const [stored, accessGranted] = await Promise.all([
    storage.load(),
    storage.hasContentClassificationAccess()
  ]);
  categories = stored.categories;
  uiTheme = SmartTabTheme.normalizeConfig(stored.uiTheme);
  const storedOrganizeSettings = normalizeOrganizeSettings(stored.settings);
  organizeSettings = clone(storedOrganizeSettings);
  savedCategories = clone(categories);
  savedUiTheme = clone(uiTheme);
  savedOrganizeSettings = clone(storedOrganizeSettings);
  contentClassificationAccessGranted = accessGranted;
  if (organizeSettings.contentClassificationEnabled && !contentClassificationAccessGranted) {
    organizeSettings.contentClassificationEnabled = false;
  }
  selectedCategoryId = categories[0]?.id || null;
  applyUiTheme();

  renderCategoryList();
  renderEditor();
  markDirty();

  workspacePickerButton.addEventListener('click', toggleWorkspaceMenu);
  settingsWorkspaceOption.addEventListener('click', () => switchWorkspace('settings', { restoreFocus: true }));
  organizerWorkspaceOption.addEventListener('click', () => switchWorkspace('organizer', { restoreFocus: true }));
  behaviorNav.addEventListener('click', selectBehavior);
  appearanceNav.addEventListener('click', selectAppearance);
  addDomainButton.addEventListener('click', addDomainsFromInput);
  domainInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addDomainsFromInput();
    }
  });
  contentClassificationToggle.addEventListener('change', changeContentClassificationBehavior);
  groupUnmatchedToggle.addEventListener('change', changeUnmatchedBehavior);
  categoryEnabledToggle.addEventListener('change', changeCategoryEnabled);
  behaviorOrganizeButton.addEventListener('click', organizeFromBehaviorSettings);
  saveButton.addEventListener('click', saveChanges);
  discardButton.addEventListener('click', discardChanges);
  refreshGroupsButton.addEventListener('click', () => loadOrganizerWorkspace({ announce: true }));
  organizeWindowButton.addEventListener('click', () => openOrganizeDialog());
  editGroupButton.addEventListener('click', openGroupEditDialog);
  reorganizeGroupButton.addEventListener('click', openGroupReorganizationDialog);
  cancelOrganizeButton.addEventListener('click', closeOrganizeDialog);
  confirmOrganizeButton.addEventListener('click', confirmOrganizerDialog);
  organizeDialog.addEventListener('cancel', (event) => {
    if (cancelOrganizeButton.disabled) {
      event.preventDefault();
      return;
    }
    const returnFocus = organizerDialogReturnFocus;
    resetOrganizerDialogState();
    window.setTimeout(() => {
      returnFocus?.focus({ preventScroll: true });
      flushOrganizerRefresh();
    }, 0);
  });
  groupEditNameInput.addEventListener('input', () => {
    groupEditStatus.textContent = '';
    updateGroupEditControls();
  });
  groupEditCollapsedToggle.addEventListener('change', () => {
    groupEditStatus.textContent = '';
    updateGroupEditControls();
  });
  cancelGroupEditButton.addEventListener('click', closeGroupEditDialog);
  saveGroupEditButton.addEventListener('click', saveSelectedGroupEdit);
  groupEditDialog.addEventListener('cancel', (event) => {
    if (groupEditSaving) {
      event.preventDefault();
      return;
    }
    resetGroupEditState();
    window.setTimeout(() => {
      editGroupButton.focus({ preventScroll: true });
      scheduleOrganizerRefresh(0);
    }, 0);
  });
  document.addEventListener('click', closeWorkspaceMenuFromOutside);
  document.addEventListener('focusin', closeWorkspaceMenuFromFocus);
  document.addEventListener('keydown', handleGlobalKeydown);
  window.addEventListener('hashchange', () => {
    switchWorkspace(window.location.hash === '#organizer' ? 'organizer' : 'settings', {
      updateHash: false
    });
  });
  await switchWorkspace(activeWorkspace, { updateHash: false });
  setupOrganizerChangeListeners();
  setupSettingsChangeListeners();
  setupContentAccessListeners();

  globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    applyUiTheme();
    if (selectedView === 'appearance') renderThemePreviews();
  });
}

function toggleWorkspaceMenu() {
  const willOpen = workspaceMenu.hidden;
  workspaceMenu.hidden = !willOpen;
  workspacePickerButton.setAttribute('aria-expanded', String(willOpen));
  if (willOpen) {
    const current = activeWorkspace === 'organizer'
      ? organizerWorkspaceOption
      : settingsWorkspaceOption;
    current.focus({ preventScroll: true });
  }
}

function closeWorkspaceMenu() {
  workspaceMenu.hidden = true;
  workspacePickerButton.setAttribute('aria-expanded', 'false');
}

function closeWorkspaceMenuFromOutside(event) {
  if (event.target.closest('.workspace-picker')) return;
  closeWorkspaceMenu();
}

function closeWorkspaceMenuFromFocus(event) {
  if (workspaceMenu.hidden || event.target.closest?.('.workspace-picker')) return;
  closeWorkspaceMenu();
}

async function switchWorkspace(workspace, { updateHash = true, restoreFocus = false } = {}) {
  activeWorkspace = workspace === 'organizer' ? 'organizer' : 'settings';
  const showingOrganizer = activeWorkspace === 'organizer';
  settingsWorkspace.hidden = showingOrganizer;
  organizerWorkspace.hidden = !showingOrganizer;
  workspaceTitle.textContent = showingOrganizer ? 'タブグループ整理' : '分類設定';
  settingsWorkspaceOption.setAttribute('aria-checked', String(!showingOrganizer));
  organizerWorkspaceOption.setAttribute('aria-checked', String(showingOrganizer));
  document.title = `${workspaceTitle.textContent} — Smart Tab Grouper`;
  closeWorkspaceMenu();

  if (updateHash) {
    const nextUrl = showingOrganizer
      ? `${window.location.pathname}${window.location.search}#organizer`
      : `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, '', nextUrl);
  }

  if (restoreFocus) workspacePickerButton.focus({ preventScroll: true });
  if (showingOrganizer) {
    if (!dirty) setOrganizerStatus('');
    await loadOrganizerWorkspace();
    if (dirty) {
      setOrganizerStatus(externalSettingsChanged
        ? '別の画面で設定が変わりました。最新を読み込んでから分類できます。'
        : '未保存の分類設定があります。保存するか戻してから分類できます。');
    }
  }
}

function handleGlobalKeydown(event) {
  if (organizeDialog.open || groupEditDialog.open) return;
  if (!workspaceMenu.hidden && event.key === 'Tab') {
    closeWorkspaceMenu();
    return;
  }
  if (
    !workspaceMenu.hidden
    && (event.key === 'Enter' || event.key === ' ')
    && [settingsWorkspaceOption, organizerWorkspaceOption].includes(document.activeElement)
  ) {
    event.preventDefault();
    document.activeElement.click();
    return;
  }
  if (!workspaceMenu.hidden && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const options = [settingsWorkspaceOption, organizerWorkspaceOption];
    const currentIndex = options.indexOf(document.activeElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : event.key === 'ArrowDown'
          ? (currentIndex + 1 + options.length) % options.length
          : (currentIndex - 1 + options.length) % options.length;
    options[nextIndex].focus({ preventScroll: true });
    return;
  }
  if (event.key === 'Escape' && !workspaceMenu.hidden) {
    event.preventDefault();
    closeWorkspaceMenu();
    workspacePickerButton.focus({ preventScroll: true });
    return;
  }
  if (
    SmartTabKeyboardShortcuts.matchesUndoShortcut(event)
    && activeWorkspace === 'organizer'
    && organizerState?.undo?.available
    && !organizerStateStale
    && !isEditableElement(event.target)
  ) {
    event.preventDefault();
    undoOrganizerAction();
  }
}

async function loadOrganizerWorkspace({ announce = false } = {}) {
  if (organizerLoading) return false;
  if (announce) organizerRefreshRetry.reset();
  const focusedControl = [
    refreshGroupsButton,
    organizeWindowButton,
    editGroupButton,
    reorganizeGroupButton
  ].includes(document.activeElement) ? document.activeElement : null;
  organizerLoading = true;
  organizerWorkspace.setAttribute('aria-busy', 'true');
  organizerRefreshPending = false;
  clearTimeout(organizerRefreshTimer);
  organizerRefreshTimer = null;
  refreshGroupsButton.disabled = true;
  organizeWindowButton.disabled = true;
  editGroupButton.disabled = true;
  reorganizeGroupButton.disabled = true;
  if (announce) setOrganizerStatus('更新しています…');

  try {
    const previousSelection = selectedCurrentGroupId;
    const wasStale = organizerStateStale;
    organizerState = await organizer.load({ reason: announce ? 'manual' : 'automatic' });
    organizerStateStale = false;
    organizerRefreshRetry.reset();
    const ungrouped = getUngroupedSelection();
    const groupIds = new Set(organizerState.groups.map((group) => group.id));
    if (ungrouped) groupIds.add(UNGROUPED_SELECTION_ID);
    selectedCurrentGroupId = groupIds.has(previousSelection)
      ? previousSelection
      : ungrouped
        ? UNGROUPED_SELECTION_ID
        : organizerState.groups[0]?.id ?? null;
    renderOrganizerWorkspace();
    if (organizerState.inProgress) {
      setOrganizerStatus(getOrganizerProgressMessage(organizerState.operationType));
      scheduleOrganizerRefresh(600);
    } else if (organizerState.recovery?.recovered) {
      setOrganizerStatus(
        organizerState.recovery.committed
          ? '前回の整理は完了済みです。Undoも引き続き利用できます。'
          : '中断されていた前回の整理を安全に戻しました。',
        (organizerState.recovery.errors?.length || 0) > 0
      );
    } else if (announce) {
      setOrganizerStatus('現在の状態に更新しました。');
    } else if (wasStale) {
      setOrganizerStatus('現在の状態へ復帰しました。');
    }
    return true;
  } catch (error) {
    const hasLastKnownState = Boolean(
      organizerState
      && Array.isArray(organizerState.groups)
      && Array.isArray(organizerState.tabs)
    );
    organizerStateStale = true;
    if (!hasLastKnownState) {
      organizerState = { groups: [], tabs: [], preview: null, undo: null };
      selectedCurrentGroupId = null;
      renderOrganizerWorkspace();
    }
    const retryDelay = organizerRefreshRetry.nextDelay();
    const rawFailureMessage = error?.message || 'タブグループを確認できませんでした。';
    const failureMessage = /[。.!?！？]$/.test(rawFailureMessage)
      ? rawFailureMessage
      : `${rawFailureMessage}。`;
    const preservedMessage = hasLastKnownState ? '表示は保持しています。' : '';
    setOrganizerStatus(
      retryDelay === null
        ? `${failureMessage}${preservedMessage}「更新」で再確認してください。`
        : `${failureMessage}${preservedMessage}自動で再確認します。`,
      true
    );
    if (retryDelay !== null) scheduleOrganizerRefresh(retryDelay);
    return false;
  } finally {
    organizerLoading = false;
    organizerWorkspace.removeAttribute('aria-busy');
    updateOrganizerControls();
    restoreOrganizerControlFocus(focusedControl);
    flushOrganizerRefresh();
  }
}

function restoreOrganizerControlFocus(previousControl) {
  if (!previousControl) return;
  const focusWasLost = document.activeElement === document.body
    || document.activeElement === document.documentElement;
  if (!focusWasLost) return;
  const target = previousControl.disabled ? refreshGroupsButton : previousControl;
  if (!target.disabled) target.focus({ preventScroll: true });
}

function renderOrganizerWorkspace() {
  const groups = organizerState?.groups || [];
  const tabs = organizerState?.tabs || [];
  const ungrouped = getUngroupedSelection();
  const ungroupedCount = ungrouped?.totalCount || 0;
  const targetCount = ungrouped?.tabIds.length || 0;
  organizerWindowSummary.textContent = [
    `${groups.length}グループ`,
    `${tabs.length}タブ`,
    ungroupedCount > 0
      ? `未グループ ${ungroupedCount}（分類候補 ${targetCount}）`
      : null
  ].filter(Boolean).join('・');
  emptyGroups.hidden = groups.length !== 0;
  currentGroupList.replaceChildren();

  if (ungrouped) renderCurrentGroupButton(ungrouped);

  for (const group of groups) {
    renderCurrentGroupButton(group);
  }

  organizerUndoHint.hidden = organizerState?.undo?.available !== true;
  scheduleOrganizerUndoExpiry(organizerState?.undo);
  renderSelectedCurrentGroup();
}

function scheduleOrganizerUndoExpiry(undoState) {
  clearTimeout(organizerUndoExpiryTimer);
  organizerUndoExpiryTimer = null;
  if (!undoState?.available) return;
  const delay = SmartTabActionExpiry.getDelay(undoState.expiresAt);
  if (delay === null) return;
  const operationId = undoState.operationId;
  organizerUndoExpiryTimer = setTimeout(() => {
    organizerUndoExpiryTimer = null;
    if (organizerState?.undo?.operationId !== operationId) return;
    organizerState.undo = null;
    organizerUndoHint.hidden = true;
    scheduleOrganizerRefresh(0);
  }, delay);
}

function clearOrganizerUndoExpiry() {
  clearTimeout(organizerUndoExpiryTimer);
  organizerUndoExpiryTimer = null;
}

function renderCurrentGroupButton(group) {
  const color = getGroupColor(group.color);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'current-group-item';
  button.setAttribute('aria-current', String(group.id === selectedCurrentGroupId));
  button.style.setProperty('--group-color', color.hex);

  const dot = document.createElement('span');
  dot.className = 'category-dot';
  dot.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('span');
  copy.className = 'category-copy';
  const name = document.createElement('span');
  name.className = 'category-name';
  name.textContent = group.title || '名称なし';
  const meta = document.createElement('span');
  meta.className = 'category-meta';
  meta.textContent = group.isUngrouped
    ? `${group.totalCount}タブ・分類候補 ${group.tabIds.length}`
    : `${group.tabIds?.length || 0}タブ・${color.label}${group.collapsed ? '・折りたたみ' : ''}${group.shared ? '・共有' : group.managed ? '・Smart Tab Grouper' : '・管理対象外'}`;
  copy.append(name, meta);
  const chevron = document.createElement('span');
  chevron.className = 'category-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '›';
  button.append(dot, copy, chevron);
  button.addEventListener('click', () => selectCurrentGroup(group.id));
  currentGroupList.append(button);
}

function selectCurrentGroup(groupId) {
  selectedCurrentGroupId = groupId;
  renderOrganizerWorkspace();
  updateOrganizerControls();
}

function renderSelectedCurrentGroup() {
  const group = selectedCurrentGroupId === UNGROUPED_SELECTION_ID
    ? getUngroupedSelection()
    : organizerState?.groups?.find((item) => item.id === selectedCurrentGroupId);
  groupInspectorEmpty.hidden = Boolean(group);
  selectedGroupContent.hidden = !group;
  inspectorColorDot.hidden = !group;

  if (!group) {
    inspectorOverline.textContent = 'TAB GROUP';
    inspectorTitle.textContent = 'タブグループを選択';
    selectedGroupTabs.replaceChildren();
    groupEditAction.hidden = true;
    groupReorganizeAction.hidden = true;
    return;
  }

  const color = getGroupColor(group.color);
  inspectorOverline.textContent = group.isUngrouped ? 'UNGROUPED TABS' : 'TAB GROUP';
  inspectorTitle.textContent = group.title || '名称なし';
  inspectorColorDot.style.setProperty('--group-color', color.hex);
  selectedGroupTabLabel.textContent = group.isUngrouped ? '分類候補' : 'タブ';
  selectedGroupTabCount.textContent = String(group.tabIds?.length || 0);
  selectedGroupStateLabel.textContent = group.isUngrouped ? '対象外' : '表示';
  selectedGroupCollapsed.textContent = group.isUngrouped
    ? String(Math.max(0, group.totalCount - group.tabIds.length))
    : group.collapsed ? '折りたたみ' : '展開';
  selectedGroupColorLabel.textContent = group.isUngrouped ? '状態' : '色';
  selectedGroupColor.textContent = group.isUngrouped ? '未整理' : color.label;
  groupTabsHeading.textContent = group.isUngrouped ? '今回の分類候補' : 'グループ内のタブ';
  groupTabsDescription.textContent = group.isUngrouped
    ? '保存済みルールで分類できるタブと、補助分類を使う場合の候補です。'
    : group.shared
      ? '共有タブグループです。現在は安全のため、この画面から変更しません。'
      : `現在の並び順です。${group.managed ? 'この拡張機能が管理しているグループです。' : 'この拡張機能の管理対象外です。'}`;
  groupEditAction.hidden = group.isUngrouped || group.shared;
  groupReorganizeAction.hidden = group.isUngrouped || group.shared;
  selectedGroupTabs.replaceChildren();

  const tabById = new Map((organizerState.tabs || []).map((tab) => [tab.id, tab]));
  for (const tabId of group.tabIds || []) {
    const tab = tabById.get(tabId);
    if (!tab) continue;
    const row = document.createElement('div');
    row.className = 'selected-group-tab';
    const index = document.createElement('span');
    index.className = 'selected-group-tab-index';
    index.textContent = String(selectedGroupTabs.childElementCount + 1);
    const copy = document.createElement('span');
    copy.className = 'selected-group-tab-copy';
    const title = document.createElement('strong');
    title.textContent = tab.title || '無題のタブ';
    const host = document.createElement('small');
    host.textContent = getHostnameForDisplay(tab.url);
    copy.append(title, host);
    row.append(index, copy);
    selectedGroupTabs.append(row);
  }
}

function getUngroupedSelection() {
  if (!organizerState) return null;
  const ungroupedTabs = (organizerState.tabs || []).filter((tab) => tab.groupId === -1);
  if (ungroupedTabs.length === 0) return null;
  const preview = organizerState.preview || {};
  const targetIds = new Set(preview.targetTabIds || []);
  if (contentAssistMayAdd(preview)) {
    for (const tabId of preview.unresolvedTabIds || []) targetIds.add(tabId);
  }
  return {
    id: UNGROUPED_SELECTION_ID,
    title: '未グループ',
    color: 'grey',
    collapsed: false,
    isUngrouped: true,
    totalCount: ungroupedTabs.length,
    tabIds: ungroupedTabs.filter((tab) => targetIds.has(tab.id)).map((tab) => tab.id)
  };
}

async function openOrganizeDialog({ refresh = true } = {}) {
  if (dirty) {
    setOrganizerStatus('分類設定を保存するか破棄してから実行してください。', true);
    return;
  }
  if (refresh && !(await loadOrganizerWorkspace())) return;
  if (!ensureOrganizerStateIsCurrent()) return;
  if (organizerState?.inProgress) return;
  renderWindowOrganizeConfirmation(organizerState?.preview);
  if (typeof organizeDialog.showModal === 'function') organizeDialog.showModal();
  else organizeDialog.setAttribute('open', '');
  cancelOrganizeButton.focus({ preventScroll: true });
}

function renderWindowOrganizeConfirmation(preview, { stateChanged = false } = {}) {
  const confirmation = buildWindowOrganizeConfirmation(preview, { stateChanged });
  organizerDialogMode = 'window';
  pendingWindowConfirmationToken = confirmation.confirmationToken;
  pendingGroupReorganization = null;
  organizerDialogReturnFocus = organizeWindowButton;
  organizeDialogOverline.textContent = 'UNGROUPED TABS';
  organizeDialogTitle.textContent = confirmation.title;
  organizeDialogDescription.replaceChildren();
  if (confirmation.notice) {
    const updateNotice = document.createElement('span');
    updateNotice.className = 'organize-dialog-notice';
    updateNotice.textContent = confirmation.notice;
    organizeDialogDescription.append(updateNotice);
  }
  const summary = document.createElement('span');
  summary.className = 'organize-dialog-summary';
  summary.textContent = confirmation.description;
  organizeDialogDescription.append(summary);
  confirmOrganizeButton.textContent = '整理';
  confirmOrganizeButton.disabled = confirmation.confirmDisabled;
}

async function openGroupReorganizationDialog() {
  if (dirty) {
    setOrganizerStatus('分類設定を保存するか破棄してから実行してください。', true);
    return;
  }
  if (!ensureOrganizerStateIsCurrent()) return;
  const group = getSelectedOrganizerGroup();
  if (!group || group.isUngrouped || group.tabIds.length < 2 || organizerLoading) return;

  reorganizeGroupButton.disabled = true;
  setOrganizerStatus('再構成案を確認しています…');
  try {
    const preview = await organizer.previewGroup(organizerState.windowId, group.id);
    if (!preview?.success) throw new Error(preview?.message || '再構成案を確認できませんでした。');
    if (selectedCurrentGroupId !== group.id) {
      setOrganizerStatus('選択が変わったため、再構成案を閉じました。');
      return;
    }

    organizerDialogMode = 'group';
    pendingGroupReorganization = preview;
    organizerDialogReturnFocus = reorganizeGroupButton;
    organizeDialogOverline.textContent = 'SELECTED GROUP';
    organizeDialogTitle.textContent = `「${preview.title}」を再構成しますか？`;
    organizeDialogDescription.textContent = preview.movedCount > 0
      ? `${preview.retainedCount}件は元のグループに残し、${preview.movedCount}件を${preview.targetGroupCount}グループへ移します。${preview.newGroupCount > 0 ? `新しいグループを${preview.newGroupCount}個作ります。` : '既存の管理グループを使います。'} 判定できないタブは残します。`
      : '現在の分類設定では、分け直す必要のあるタブは見つかりませんでした。判定できないタブは元のグループに残します。';
    confirmOrganizeButton.textContent = '再構成';
    confirmOrganizeButton.disabled = preview.movedCount === 0;
    if (typeof organizeDialog.showModal === 'function') organizeDialog.showModal();
    else organizeDialog.setAttribute('open', '');
    cancelOrganizeButton.focus({ preventScroll: true });
    setOrganizerStatus('');
  } catch (error) {
    setOrganizerStatus(error?.message || '再構成案を確認できませんでした。', true);
  } finally {
    updateOrganizerControls();
  }
}

function openGroupEditDialog() {
  if (dirty) {
    setOrganizerStatus('分類設定を保存するか破棄してから編集してください。', true);
    return;
  }
  if (!ensureOrganizerStateIsCurrent()) return;
  const group = getSelectedOrganizerGroup();
  if (!group || group.isUngrouped || group.shared || organizerLoading) return;

  pendingGroupEdit = {
    groupId: group.id,
    expectedFingerprint: {
      groupId: group.id,
      windowId: organizerState.windowId,
      title: group.title || '',
      color: group.color || 'grey',
      collapsed: group.collapsed === true,
      shared: group.shared === true
    },
    initial: {
      title: group.title || '',
      color: group.color || 'grey',
      collapsed: group.collapsed === true
    }
  };
  selectedGroupEditColor = pendingGroupEdit.initial.color;
  groupEditNameInput.value = pendingGroupEdit.initial.title;
  groupEditCollapsedToggle.checked = pendingGroupEdit.initial.collapsed;
  groupEditStatus.textContent = '';
  renderGroupEditColors();
  updateGroupEditControls();
  if (typeof groupEditDialog.showModal === 'function') groupEditDialog.showModal();
  else groupEditDialog.setAttribute('open', '');
  groupEditNameInput.focus({ preventScroll: true });
  groupEditNameInput.select();
}

function renderGroupEditColors() {
  groupEditColorOptions.replaceChildren();
  for (let index = 0; index < GROUP_COLORS.length; index += 1) {
    const color = GROUP_COLORS[index];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'group-edit-color-option';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(color.value === selectedGroupEditColor));
    button.setAttribute('aria-label', color.label);
    button.tabIndex = color.value === selectedGroupEditColor ? 0 : -1;
    button.dataset.color = color.value;
    button.title = color.label;
    button.style.setProperty('--group-color', color.hex);
    button.addEventListener('click', () => selectGroupEditColor(color.value));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? GROUP_COLORS.length - 1
          : event.key === 'ArrowRight' || event.key === 'ArrowDown'
            ? (index + 1) % GROUP_COLORS.length
            : (index - 1 + GROUP_COLORS.length) % GROUP_COLORS.length;
      selectGroupEditColor(GROUP_COLORS[nextIndex].value);
    });
    groupEditColorOptions.append(button);
  }
}

function selectGroupEditColor(value) {
  selectedGroupEditColor = value;
  groupEditStatus.textContent = '';
  renderGroupEditColors();
  updateGroupEditControls();
  groupEditColorOptions
    .querySelector(`[data-color="${value}"]`)
    ?.focus({ preventScroll: true });
}

function updateGroupEditControls() {
  if (!pendingGroupEdit) {
    saveGroupEditButton.disabled = true;
    return;
  }
  const draft = getGroupEditDraft();
  const changed = JSON.stringify(draft) !== JSON.stringify(pendingGroupEdit.initial);
  saveGroupEditButton.disabled = groupEditSaving || !changed;
  cancelGroupEditButton.disabled = groupEditSaving;
  groupEditNameInput.disabled = groupEditSaving;
  groupEditCollapsedToggle.disabled = groupEditSaving;
  for (const button of groupEditColorOptions.querySelectorAll('button')) {
    button.disabled = groupEditSaving;
  }
}

function getGroupEditDraft() {
  return {
    title: groupEditNameInput.value.trim(),
    color: selectedGroupEditColor,
    collapsed: groupEditCollapsedToggle.checked
  };
}

async function saveSelectedGroupEdit() {
  if (!pendingGroupEdit || groupEditSaving) return;
  const edit = pendingGroupEdit;
  const previousUndoOperationId = organizerState?.undo?.operationId || null;
  let resultReceived = false;
  groupEditSaving = true;
  groupEditStatus.textContent = '保存しています…';
  updateGroupEditControls();
  try {
    const result = await organizer.editGroup(
      organizerState.windowId,
      edit.groupId,
      edit.expectedFingerprint,
      getGroupEditDraft()
    );
    resultReceived = true;
    if (!result?.success) throw new Error(result?.message || 'グループを編集できませんでした。');
    groupEditSaving = false;
    closeGroupEditDialog();
    await loadOrganizerWorkspace();
    setOrganizerStatus(result.message || 'グループの表示を変更しました。');
  } catch (error) {
    if (!resultReceived) {
      groupEditSaving = false;
      const reconciliation = await reconcileOrganizerMutation(previousUndoOperationId);
      if (reconciliation.action === SmartTabActionReconciliation.ACTIONS.COMPLETED) {
        closeGroupEditDialog();
        setOrganizerStatus('グループの変更結果を確認しました。');
        return;
      }
      if (reconciliation.action === SmartTabActionReconciliation.ACTIONS.IN_PROGRESS) {
        closeGroupEditDialog();
        setOrganizerStatus('グループの変更は続いています。完了後に自動更新します。');
        return;
      }
    }
    groupEditStatus.textContent = error?.message || 'グループを編集できませんでした。';
  } finally {
    groupEditSaving = false;
    updateGroupEditControls();
  }
}

function closeGroupEditDialog() {
  if (groupEditSaving) return;
  if (typeof groupEditDialog.close === 'function') groupEditDialog.close();
  else groupEditDialog.removeAttribute('open');
  resetGroupEditState();
  editGroupButton.focus({ preventScroll: true });
  scheduleOrganizerRefresh(0);
}

function resetGroupEditState() {
  pendingGroupEdit = null;
  selectedGroupEditColor = 'grey';
  groupEditSaving = false;
  groupEditStatus.textContent = '';
  groupEditNameInput.disabled = false;
  groupEditCollapsedToggle.disabled = false;
  cancelGroupEditButton.disabled = false;
  saveGroupEditButton.disabled = true;
}

function closeOrganizeDialog() {
  const returnFocus = organizerDialogReturnFocus;
  if (typeof organizeDialog.close === 'function') organizeDialog.close();
  else organizeDialog.removeAttribute('open');
  resetOrganizerDialogState();
  returnFocus?.focus({ preventScroll: true });
  flushOrganizerRefresh();
}

function resetOrganizerDialogState() {
  organizerDialogMode = 'window';
  pendingWindowConfirmationToken = null;
  pendingGroupReorganization = null;
  organizerDialogReturnFocus = null;
}

function confirmOrganizerDialog() {
  return organizerDialogMode === 'group'
    ? reorganizeSelectedGroupFromSettings()
    : organizeCurrentWindowFromSettings();
}

async function organizeCurrentWindowFromSettings() {
  const previousUndoOperationId = organizerState?.undo?.operationId || null;
  let resultReceived = false;
  confirmOrganizeButton.disabled = true;
  cancelOrganizeButton.disabled = true;
  organizeDialogDescription.textContent = '整理しています…';
  try {
    const result = await organizer.organize(
      organizerState?.windowId,
      pendingWindowConfirmationToken
    );
    resultReceived = true;
    if (!result?.success) {
      if (result?.code === 'PREVIEW_STALE') {
        const loaded = await loadOrganizerWorkspace();
        if (!loaded) {
          organizeDialogDescription.textContent = '最新の状態を確認できませんでした。キャンセルして、もう一度お試しください。';
          confirmOrganizeButton.disabled = true;
          cancelOrganizeButton.disabled = false;
          cancelOrganizeButton.focus({ preventScroll: true });
          return;
        }
        renderWindowOrganizeConfirmation(organizerState?.preview, { stateChanged: true });
        cancelOrganizeButton.disabled = false;
        cancelOrganizeButton.focus({ preventScroll: true });
        return;
      }
      throw new Error(result?.message || '整理できませんでした。');
    }
    closeOrganizeDialog();
    await loadOrganizerWorkspace();
    setOrganizerStatus(result.message || `${result.count || 0}件を整理しました。`);
  } catch (error) {
    if (!resultReceived) {
      const reconciliation = await reconcileOrganizerMutation(previousUndoOperationId);
      if (reconciliation.action === SmartTabActionReconciliation.ACTIONS.COMPLETED) {
        closeOrganizeDialog();
        setOrganizerStatus('整理結果を確認しました。');
        return;
      }
      if (reconciliation.action === SmartTabActionReconciliation.ACTIONS.IN_PROGRESS) {
        closeOrganizeDialog();
        setOrganizerStatus('整理は続いています。完了後に自動更新します。');
        return;
      }
    }
    organizeDialogDescription.textContent = error?.message || '整理できませんでした。';
  } finally {
    cancelOrganizeButton.disabled = false;
    updateOrganizerControls();
  }
}

async function reorganizeSelectedGroupFromSettings() {
  const preview = pendingGroupReorganization;
  if (!preview) return;
  const previousUndoOperationId = organizerState?.undo?.operationId || null;
  let resultReceived = false;
  confirmOrganizeButton.disabled = true;
  cancelOrganizeButton.disabled = true;
  organizeDialogDescription.textContent = '再構成しています…';
  try {
    const result = await organizer.reorganizeGroup(
      organizerState?.windowId,
      preview.groupId,
      preview.fingerprint
    );
    resultReceived = true;
    if (!result?.success) throw new Error(result?.message || 'グループを再構成できませんでした。');
    closeOrganizeDialog();
    await loadOrganizerWorkspace();
    setOrganizerStatus(result.message || `${result.count || 0}件を分け直しました。`);
  } catch (error) {
    if (!resultReceived) {
      const reconciliation = await reconcileOrganizerMutation(previousUndoOperationId);
      if (reconciliation.action === SmartTabActionReconciliation.ACTIONS.COMPLETED) {
        closeOrganizeDialog();
        setOrganizerStatus('再構成結果を確認しました。');
        return;
      }
      if (reconciliation.action === SmartTabActionReconciliation.ACTIONS.IN_PROGRESS) {
        closeOrganizeDialog();
        setOrganizerStatus('再構成は続いています。完了後に自動更新します。');
        return;
      }
    }
    organizeDialogDescription.textContent = error?.message || 'グループを再構成できませんでした。';
  } finally {
    cancelOrganizeButton.disabled = false;
    updateOrganizerControls();
  }
}

async function undoOrganizerAction() {
  if (
    !organizerState?.undo?.available
    || organizerLoading
    || organizerStateStale
    || organizeDialog.open
    || groupEditDialog.open
    || !workspaceMenu.hidden
  ) return;
  const undoOperationId = organizerState.undo.operationId;
  clearOrganizerUndoExpiry();
  organizerState.undo = null;
  organizerUndoHint.hidden = true;
  setOrganizerStatus('元に戻しています…');
  try {
    const result = await organizer.undo(organizerState.windowId, undoOperationId);
    if (!result?.success) throw new Error(result?.message || '元に戻せませんでした。');
    await loadOrganizerWorkspace();
    setOrganizerStatus(result.message);
  } catch (error) {
    await loadOrganizerWorkspace();
    setOrganizerStatus(error?.message || '元に戻せませんでした。', true);
  }
}

async function reconcileOrganizerMutation(previousUndoOperationId) {
  const loaded = await loadOrganizerWorkspace();
  if (!loaded) return { action: SmartTabActionReconciliation.ACTIONS.UNAVAILABLE };
  return SmartTabActionReconciliation.reconcileMutationState(
    { success: true, ...organizerState },
    previousUndoOperationId
  );
}

function setOrganizerStatus(message, error = false) {
  organizerStatus.textContent = message || '';
  organizerStatus.classList.toggle('is-error', error);
}

function ensureOrganizerStateIsCurrent() {
  if (!organizerStateStale) return true;
  setOrganizerStatus('最新のタブ状態を確認してから操作できます。再確認をお待ちください。', true);
  return false;
}

function getOrganizerProgressMessage(operationType) {
  return {
    undo: '元に戻しています。完了後に自動更新します。',
    correction: '分類を修正しています。完了後に自動更新します。',
    reorganize: 'グループを再構成しています。完了後に自動更新します。',
    edit: 'グループを変更しています。完了後に自動更新します。'
  }[operationType] || 'タブを整理しています。完了後に自動更新します。';
}

function updateOrganizerControls() {
  const previewCount = Number(organizerState?.preview?.count) || 0;
  const hasPotentialTargets = hasOrganizerPotentialTargets();
  const blocked = organizerLoading || organizerStateStale || dirty || organizerState?.inProgress === true;
  refreshGroupsButton.disabled = organizerLoading;
  organizeWindowButton.disabled = blocked || !hasPotentialTargets;
  const selectedGroup = getSelectedOrganizerGroup();
  const canReorganizeGroup = Boolean(
    selectedGroup
    && !selectedGroup.isUngrouped
    && !selectedGroup.shared
    && (selectedGroup.tabIds?.length || 0) >= 2
  );
  const canEditGroup = Boolean(
    selectedGroup
    && !selectedGroup.isUngrouped
    && !selectedGroup.shared
  );
  editGroupButton.disabled = blocked || !canEditGroup;
  reorganizeGroupButton.disabled = blocked || !canReorganizeGroup;
  organizeWindowButton.title = dirty
    ? '分類設定を保存するか破棄してから実行できます'
    : organizerStateStale
      ? '最新のタブ状態を確認してから実行できます'
      : organizerState?.inProgress
        ? '別の整理処理を実行しています'
        : !hasPotentialTargets
          ? '現在の設定で分類できる未グループタブはありません'
          : '';
  confirmOrganizeButton.disabled = organizerDialogMode === 'group' && organizeDialog.open
    ? blocked || !(pendingGroupReorganization?.movedCount > 0)
    : blocked || !hasPotentialTargets;
  reorganizeGroupButton.title = dirty
    ? '分類設定を保存するか破棄してから実行できます'
    : organizerStateStale
      ? '最新のタブ状態を確認してから実行できます'
      : organizerState?.inProgress
        ? '別の整理処理を実行しています'
        : !canReorganizeGroup
          ? selectedGroup?.shared
            ? '共有グループは現在の変更対象外です'
            : '2件以上のタブがあるグループを選んでください'
          : '';
  editGroupButton.title = dirty
    ? '分類設定を保存するか破棄してから編集できます'
    : organizerStateStale
      ? '最新のタブ状態を確認してから編集できます'
      : organizerState?.inProgress
        ? '別の整理処理を実行しています'
        : selectedGroup?.shared
          ? '共有グループは現在の変更対象外です'
          : !canEditGroup
            ? '編集するグループを選んでください'
            : '';
}

function getSelectedOrganizerGroup() {
  if (selectedCurrentGroupId === UNGROUPED_SELECTION_ID) return getUngroupedSelection();
  return organizerState?.groups?.find((item) => item.id === selectedCurrentGroupId) || null;
}

function hasOrganizerPotentialTargets() {
  return (Number(organizerState?.preview?.count) || 0) > 0
    || contentAssistMayAdd(organizerState?.preview);
}

function contentAssistMayAdd(preview) {
  return preview?.contentClassificationEnabled === true
    && preview?.contentClassificationAvailable !== false
    && preview?.contentLimitExceeded !== true
    && Number(preview?.unresolved) > 0;
}

function setupOrganizerChangeListeners() {
  if (previewMode || !globalThis.chrome?.tabs || !globalThis.chrome?.tabGroups) return;
  const schedule = () => scheduleOrganizerRefresh(180);
  chrome.tabs.onCreated?.addListener(schedule);
  chrome.tabs.onRemoved?.addListener(schedule);
  chrome.tabs.onUpdated?.addListener(schedule);
  chrome.tabs.onMoved?.addListener(schedule);
  chrome.tabs.onAttached?.addListener(schedule);
  chrome.tabs.onDetached?.addListener(schedule);
  chrome.tabGroups.onCreated?.addListener(schedule);
  chrome.tabGroups.onRemoved?.addListener(schedule);
  chrome.tabGroups.onUpdated?.addListener(schedule);
  chrome.tabGroups.onMoved?.addListener(schedule);
  chrome.storage.onChanged?.addListener((changes, areaName) => {
    if (
      (areaName === 'sync' && (
        SmartTabSettingsStorage.isCategoryStorageChange(changes)
        || changes.settings
      ))
      || (areaName === 'local' && changes[MANAGED_GROUPS_STORAGE_KEY])
      || areaName === 'session'
    ) schedule();
  });
}

function setupSettingsChangeListeners() {
  storage.subscribe?.(() => {
    const generation = ++settingsSyncGeneration;
    clearTimeout(externalSettingsRefreshTimer);
    externalSettingsRefreshTimer = setTimeout(() => {
      externalSettingsRefreshTimer = null;
      refreshExternalSettingsState(generation);
    }, 80);
  });
}

async function refreshExternalSettingsState(generation) {
  try {
    const incoming = await storage.load();
    if (generation !== settingsSyncGeneration) return;
    if (settingsSaveInFlight) return;
    const reconciliation = SmartTabSettingsConcurrency.reconcile({
      saved: getSavedSettingsSnapshot(),
      current: getCurrentSettingsSnapshot(),
      incoming: getStoredSettingsSnapshot(incoming),
      dirty
    });
    const { action } = reconciliation;

    if (action === SmartTabSettingsConcurrency.ACTIONS.UNCHANGED) {
      if (externalSettingsChanged) {
        externalSettingsChanged = false;
        updateDirtyState();
      }
      return;
    }
    if (action === SmartTabSettingsConcurrency.ACTIONS.CURRENT) {
      if (settingsSaveInFlight || (!dirty && !externalSettingsChanged)) return;
      await applyStoredSettingsState(incoming);
      showToast('別の画面で同じ変更が保存されました');
      return;
    }
    if (action === SmartTabSettingsConcurrency.ACTIONS.RELOAD) {
      await applyStoredSettingsState(incoming);
      showToast('別の画面の変更を反映しました');
      return;
    }
    if (action === SmartTabSettingsConcurrency.ACTIONS.MERGE) {
      await applySettingsSnapshots(
        getStoredSettingsSnapshot(incoming),
        reconciliation.value
      );
      showToast('別の画面の変更を反映し、編集中の変更を残しました');
      return;
    }

    flagExternalSettingsConflict();
  } catch (error) {
    // A failed refresh must not discard the local draft or block a later retry.
  }
}

function flagExternalSettingsConflict() {
  const wasChanged = externalSettingsChanged;
  externalSettingsChanged = true;
  updateDirtyState();
  if (activeWorkspace === 'organizer') {
    setOrganizerStatus('別の画面で設定が変わりました。最新を読み込んでから分類できます。', true);
  }
  if (!wasChanged) showToast('別の画面で設定が変更されました');
}

function setupContentAccessListeners() {
  if (previewMode || !globalThis.chrome?.permissions) return;
  const refresh = () => refreshContentAccessState();
  chrome.permissions.onAdded?.addListener(refresh);
  chrome.permissions.onRemoved?.addListener(refresh);
}

async function refreshContentAccessState() {
  const granted = await storage.hasContentClassificationAccess();
  if (granted === contentClassificationAccessGranted) return;
  contentClassificationAccessGranted = granted;
  if (!granted && contentAccessDraftActive) {
    await finishContentAccessDraft();
  }
  if (!granted && organizeSettings.contentClassificationEnabled) {
    organizeSettings.contentClassificationEnabled = false;
  }
  if (selectedView === 'behavior') renderBehaviorSettings();
  markDirty();
}

function scheduleOrganizerRefresh(delay = 180) {
  organizerRefreshPending = true;
  queueOrganizerRefresh(delay);
}

function flushOrganizerRefresh() {
  // Preserve an existing debounce/progress delay. Only restore a request whose
  // timer already fired while a dialog or another load prevented the refresh.
  if (organizerRefreshPending && organizerRefreshTimer === null) queueOrganizerRefresh(0);
}

function queueOrganizerRefresh(delay) {
  clearTimeout(organizerRefreshTimer);
  organizerRefreshTimer = setTimeout(() => {
    organizerRefreshTimer = null;
    if (
      organizerRefreshPending
      && activeWorkspace === 'organizer'
      && !organizerLoading
      && !organizeDialog.open
      && !groupEditDialog.open
    ) {
      loadOrganizerWorkspace();
    }
  }, delay);
}

function getHostnameForDisplay(rawUrl) {
  try {
    return new URL(rawUrl).hostname || rawUrl;
  } catch (error) {
    return rawUrl || '';
  }
}

function isEditableElement(target) {
  return target instanceof HTMLElement
    && (target.matches('input, textarea, select') || target.isContentEditable);
}

function renderCategoryList() {
  const enabledCount = categories.filter((category) => category.enabled !== false).length;
  categoryCount.textContent = enabledCount === categories.length
    ? String(categories.length)
    : `${enabledCount}/${categories.length}`;
  categoryCount.setAttribute(
    'aria-label',
    enabledCount === categories.length
      ? `${categories.length}件すべて使用中`
      : `${categories.length}件中${enabledCount}件を使用中`
  );
  categoryList.replaceChildren();

  for (const category of categories) {
    const color = getGroupColor(category.color);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'category-item';
    button.classList.toggle('is-disabled', category.enabled === false);
    button.dataset.categoryId = category.id;
    button.setAttribute('aria-current', String(
      selectedView === 'group' && category.id === selectedCategoryId
    ));
    button.style.setProperty('--group-color', color.hex);

    const dot = document.createElement('span');
    dot.className = 'category-dot';
    dot.setAttribute('aria-hidden', 'true');

    const copy = document.createElement('span');
    copy.className = 'category-copy';
    const name = document.createElement('span');
    name.className = 'category-name';
    name.textContent = category.name;
    const meta = document.createElement('span');
    meta.className = 'category-meta';
    meta.textContent = category.enabled === false
      ? `停止中・${category.domains?.length || 0} ドメイン・${color.label}`
      : `${category.domains?.length || 0} ドメイン・${color.label}`;
    copy.append(name, meta);

    const chevron = document.createElement('span');
    chevron.className = 'category-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '›';

    button.append(dot, copy, chevron);
    button.addEventListener('click', () => selectCategory(category.id));
    categoryList.append(button);
  }
}

function renderEditor() {
  const showingAppearance = selectedView === 'appearance';
  const showingBehavior = selectedView === 'behavior';
  appearanceNav.setAttribute('aria-current', String(showingAppearance));
  behaviorNav.setAttribute('aria-current', String(showingBehavior));
  appearanceEditor.hidden = !showingAppearance;
  behaviorEditor.hidden = !showingBehavior;
  groupEditor.hidden = showingAppearance || showingBehavior;
  appearanceEditorIcon.hidden = !showingAppearance;
  behaviorEditorIcon.hidden = !showingBehavior;
  selectedColorDot.hidden = showingAppearance || showingBehavior;

  if (showingAppearance) {
    editorOverline.textContent = 'APPEARANCE';
    editorTitle.textContent = '外観';
    renderThemeOptions();
    return;
  }

  if (showingBehavior) {
    editorOverline.textContent = 'ORGANIZE';
    editorTitle.textContent = '整理の動作';
    renderBehaviorSettings();
    return;
  }

  const category = getSelectedCategory();
  if (!category) return;

  const color = getGroupColor(category.color);
  editorOverline.textContent = 'EDIT GROUP';
  editorTitle.textContent = category.name;
  selectedColorDot.style.setProperty('--group-color', color.hex);
  categoryEnabledToggle.checked = category.enabled !== false;
  domainFeedback.textContent = '';
  domainFeedback.classList.remove('is-success');
  renderDomains(category);
  renderColors(category);
}

function renderBehaviorSettings() {
  contentClassificationToggle.checked = organizeSettings.contentClassificationEnabled;
  contentClassificationToggle.disabled = contentClassificationAccessChecking;
  contentClassificationToggle.setAttribute('aria-busy', String(contentClassificationAccessChecking));
  contentClassificationToggle.closest('.toggle-setting-card')
    ?.classList.toggle('is-pending', contentClassificationAccessChecking);
  groupUnmatchedToggle.checked = organizeSettings.groupUnmatchedAsOthers;
  renderContentAccessStatus();
  updateBehaviorOrganizeButton();
}

function renderContentAccessStatus() {
  let message = '既定はオフ・未分類30件までです。ページ内容は端末外へ送信しません。';
  let state = '';

  if (contentClassificationAccessChecking) {
    message = 'Chromeでサイトアクセスを確認しています…';
  } else if (organizeSettings.contentClassificationEnabled && contentClassificationAccessGranted) {
    message = savedOrganizeSettings.contentClassificationEnabled
      ? 'サイトアクセスは許可されています。'
      : 'サイトアクセスを許可しました。保存すると自動分類が有効になります。';
    state = 'ready';
  } else if (savedOrganizeSettings.contentClassificationEnabled && !contentClassificationAccessGranted) {
    message = 'Chromeでサイトアクセスが解除されています。オンにし直すか、保存して自動分類をオフにしてください。';
    state = 'warning';
  } else if (!organizeSettings.contentClassificationEnabled && savedOrganizeSettings.contentClassificationEnabled) {
    message = '保存すると自動分類をオフにし、サイトアクセスを解除します。';
  } else if (!organizeSettings.contentClassificationEnabled && contentClassificationAccessGranted) {
    message = '自動分類はオフですが、サイトアクセスが許可されたままです。';
    state = 'warning';
  }

  contentClassificationAccessStatus.textContent = message;
  if (state) contentClassificationAccessStatus.dataset.state = state;
  else delete contentClassificationAccessStatus.dataset.state;
}

async function organizeFromBehaviorSettings() {
  if (behaviorActionRunning) return;
  behaviorActionRunning = true;
  updateBehaviorOrganizeButton();
  try {
    if (dirty && !(await saveChanges())) return;
    await switchWorkspace('organizer');
    if (organizerState?.inProgress) {
      setOrganizerStatus('別の整理処理を実行しています。完了後に自動更新します。');
      return;
    }
    if (!ensureOrganizerStateIsCurrent()) return;
    if (!hasOrganizerPotentialTargets()) {
      setOrganizerStatus('現在の設定で分類できる未グループタブはありません。');
      organizeWindowButton.focus({ preventScroll: true });
      return;
    }
    await openOrganizeDialog({ refresh: false });
  } finally {
    behaviorActionRunning = false;
    updateBehaviorOrganizeButton();
  }
}

function renderDomains(category) {
  domainList.replaceChildren();
  const domains = category.domains || [];
  emptyDomains.hidden = domains.length !== 0;

  for (const domain of domains) {
    const chip = document.createElement('span');
    chip.className = 'domain-chip';
    const text = document.createElement('span');
    text.textContent = domain;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-domain';
    remove.setAttribute('aria-label', `${domain} を削除`);
    remove.title = '削除';
    remove.textContent = '×';
    remove.addEventListener('click', () => removeDomain(domain));
    chip.append(text, remove);
    domainList.append(chip);
  }
}

function renderColors(category) {
  colorOptions.replaceChildren();

  for (const color of GROUP_COLORS) {
    const label = document.createElement('label');
    label.className = 'color-option';
    label.classList.toggle('is-selected', category.color === color.value);
    label.style.setProperty('--group-color', color.hex);

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'groupColor';
    input.value = color.value;
    input.checked = category.color === color.value;
    input.addEventListener('change', () => changeColor(color.value));

    const swatch = document.createElement('span');
    swatch.className = 'color-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'color-label';
    text.textContent = color.label;

    label.append(input, swatch, text);
    colorOptions.append(label);
  }
}

function renderThemeOptions() {
  const definitions = [
    ...Object.entries(SmartTabTheme.PRESET_META).map(([value, meta]) => ({
      value,
      label: meta.label,
      description: meta.description,
      config: { mode: 'preset', preset: value, seed: uiTheme.seed }
    })),
    {
      value: 'custom',
      label: 'カスタム',
      description: '基準色1色から自動生成',
      config: { mode: 'custom', preset: 'custom', seed: uiTheme.seed }
    }
  ];

  themeOptions.replaceChildren();
  for (const definition of definitions) {
    const selected = uiTheme.mode === 'custom'
      ? definition.value === 'custom'
      : definition.value === uiTheme.preset;

    const option = document.createElement('div');
    option.className = 'theme-option';
    option.classList.toggle('is-selected', selected);
    option.dataset.themeOption = definition.value;

    const input = document.createElement('input');
    input.id = `uiTheme-${definition.value}`;
    input.type = 'radio';
    input.name = 'uiTheme';
    input.value = definition.value;
    input.checked = selected;
    input.setAttribute('aria-label', `${definition.label} ${definition.description}`);
    input.addEventListener('change', () => selectUiTheme(definition.value));

    const selectionLabel = document.createElement('label');
    selectionLabel.className = 'theme-option-select';
    selectionLabel.htmlFor = input.id;

    const previewPair = createThemePreviewPair(definition.config);
    const copy = document.createElement('span');
    copy.className = 'theme-option-copy';
    const name = document.createElement('strong');
    name.textContent = definition.label;
    const description = document.createElement('small');
    description.textContent = definition.description;
    copy.append(name, description);

    const check = document.createElement('span');
    check.className = 'theme-check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = '✓';

    selectionLabel.append(previewPair, copy, check);
    option.append(input, selectionLabel);

    if (definition.value === 'custom') {
      option.append(createCustomInlineControls());
    }
    themeOptions.append(option);
  }
}

function createCustomInlineControls() {
  const controls = document.createElement('span');
  controls.className = 'custom-inline-controls';

  const title = document.createElement('span');
  title.textContent = 'カスタム';

  const picker = document.createElement('input');
  picker.type = 'color';
  picker.value = uiTheme.seed;
  picker.setAttribute('aria-label', 'カスタム基準色');
  picker.addEventListener('input', (event) => updateCustomSeed(event.target.value));

  const code = document.createElement('input');
  code.type = 'text';
  code.className = 'custom-seed-code';
  code.value = uiTheme.seed.toUpperCase();
  code.maxLength = 7;
  code.spellcheck = false;
  code.autocomplete = 'off';
  code.setAttribute('aria-label', 'カスタム色コード');
  code.addEventListener('input', (event) => {
    const normalized = SmartTabTheme.normalizeHex(event.target.value);
    event.target.setAttribute('aria-invalid', String(!normalized));
    if (normalized) updateCustomSeed(normalized, event.target);
  });
  code.addEventListener('blur', (event) => {
    const normalized = SmartTabTheme.normalizeHex(event.target.value);
    event.target.value = (normalized || uiTheme.seed).toUpperCase();
    event.target.setAttribute('aria-invalid', 'false');
  });

  controls.append(title, picker, code);
  return controls;
}

function createThemePreviewPair(config) {
  const pair = document.createElement('span');
  pair.className = 'theme-preview-pair';
  pair.setAttribute('aria-hidden', 'true');
  pair.append(
    createThemeMini(config, 'light'),
    createThemeMini(config, 'dark')
  );
  return pair;
}

function createThemeMini(config, resolvedTheme) {
  const tokens = SmartTabTheme.getTokens(config, resolvedTheme).tokens;
  const mini = document.createElement('span');
  mini.className = 'theme-mini';
  mini.style.setProperty('--mini-header', tokens.header);
  mini.style.setProperty('--mini-container', tokens.baseContainer);
  mini.style.setProperty('--mini-surface', tokens.baseContainerElevated);
  mini.style.setProperty('--mini-primary', tokens.primary);

  const tab = document.createElement('i');
  tab.className = 'theme-mini-tab';
  const card = document.createElement('i');
  card.className = 'theme-mini-card';
  const button = document.createElement('i');
  button.className = 'theme-mini-button';
  mini.append(tab, card, button);
  return mini;
}

function renderThemePreviews() {
  for (const option of themeOptions.querySelectorAll('.theme-option')) {
    const value = option.dataset.themeOption;
    const config = value === 'custom'
      ? { mode: 'custom', preset: 'custom', seed: uiTheme.seed }
      : { mode: 'preset', preset: value, seed: uiTheme.seed };
    option.querySelector('.theme-preview-pair')?.replaceWith(createThemePreviewPair(config));
  }
}

function selectUiTheme(value) {
  uiTheme = value === 'custom'
    ? { mode: 'custom', preset: 'custom', seed: uiTheme.seed }
    : { mode: 'preset', preset: value, seed: uiTheme.seed };
  applyUiTheme();
  renderThemeOptions();
  markDirty();
}

function updateCustomSeed(value, sourceInput = null) {
  const seed = SmartTabTheme.normalizeHex(value);
  if (!seed) return;
  uiTheme = { mode: 'custom', preset: 'custom', seed };
  const controls = themeOptions.querySelector('.custom-inline-controls');
  const picker = controls?.querySelector('input[type="color"]');
  const code = controls?.querySelector('.custom-seed-code');
  if (picker && picker !== sourceInput) picker.value = seed;
  if (code && code !== sourceInput) {
    code.value = seed.toUpperCase();
    code.setAttribute('aria-invalid', 'false');
  }
  applyUiTheme();
  renderThemePreviews();
  markDirty();
}

function applyUiTheme() {
  SmartTabTheme.apply(uiTheme);
}

function selectCategory(categoryId) {
  selectedView = 'group';
  selectedCategoryId = categoryId;
  renderCategoryList();
  renderEditor();
}

function selectAppearance() {
  selectedView = 'appearance';
  renderCategoryList();
  renderEditor();
}

function selectBehavior() {
  selectedView = 'behavior';
  renderCategoryList();
  renderEditor();
}

function changeUnmatchedBehavior(event) {
  organizeSettings.groupUnmatchedAsOthers = event.target.checked;
  renderBehaviorSettings();
  markDirty();
}

function changeCategoryEnabled(event) {
  const category = getSelectedCategory();
  if (!category) return;
  category.enabled = event.target.checked;
  renderCategoryList();
  markDirty();
}

async function changeContentClassificationBehavior(event) {
  const wantsEnabled = event.target.checked;
  if (!wantsEnabled) {
    organizeSettings.contentClassificationEnabled = false;
    if (!savedOrganizeSettings.contentClassificationEnabled && contentClassificationAccessGranted) {
      contentClassificationAccessChecking = true;
      renderBehaviorSettings();
      try {
        const removed = await storage.removeContentClassificationAccess();
        if (removed) {
          contentClassificationAccessGranted = false;
          await finishContentAccessDraft();
        }
        else showToast('サイトアクセスはChromeの拡張機能設定から解除できます');
      } catch (error) {
        showToast('サイトアクセスはChromeの拡張機能設定から解除できます');
      } finally {
        contentClassificationAccessChecking = false;
      }
    }
    renderBehaviorSettings();
    markDirty();
    return;
  }

  organizeSettings.contentClassificationEnabled = true;
  if (!contentClassificationAccessGranted) {
    contentClassificationAccessChecking = true;
    renderBehaviorSettings();
    let granted = false;
    try {
      const shouldTrackDraft = !savedOrganizeSettings.contentClassificationEnabled;
      const tracked = !shouldTrackDraft || await storage.beginContentAccessDraft();
      if (!tracked) throw new Error('サイトアクセスの未保存状態を追跡できませんでした。');
      contentAccessDraftActive = shouldTrackDraft;
      granted = await storage.requestContentClassificationAccess();
    } catch (error) {
      granted = false;
    }
    contentClassificationAccessGranted = granted;
    contentClassificationAccessChecking = false;
    if (!granted) {
      organizeSettings.contentClassificationEnabled = false;
      await finishContentAccessDraft();
      showToast('サイトアクセスが許可されなかったため、オフのままです');
    } else {
      showToast(savedOrganizeSettings.contentClassificationEnabled
        ? 'サイトアクセスを許可しました'
        : 'サイトアクセスを許可しました。設定を保存してください');
    }
  }
  renderBehaviorSettings();
  markDirty();
}

function addDomainsFromInput() {
  const rawItems = domainInput.value.split(/[\s,]+/).filter(Boolean);
  if (rawItems.length === 0) {
    showDomainFeedback('追加するドメインを入力してください。');
    return;
  }

  const category = getSelectedCategory();
  const added = [];

  for (const raw of rawItems) {
    const normalized = normalizeDomain(raw);
    if (!normalized) {
      showDomainFeedback(`「${raw}」は有効なドメインではありません。`);
      return;
    }

    if ((category.domains || []).includes(normalized)) {
      showDomainFeedback(`${normalized} はすでにこのグループに登録されています。`);
      return;
    }

    const conflict = findDomainConflict(category.id, normalized);
    if (conflict) {
      const detail = conflict.domain === normalized
        ? '登録されています'
        : `${conflict.domain} と対象範囲が重なります`;
      showDomainFeedback(`${normalized} は「${conflict.category.name}」の ${detail}。`);
      return;
    }
    added.push(normalized);
  }

  category.domains = [...(category.domains || []), ...added];
  domainInput.value = '';
  renderDomains(category);
  renderCategoryList();
  markDirty();
  showDomainFeedback(`${added.length}件追加しました。`, true);
  domainInput.focus();
}

function removeDomain(domain) {
  const category = getSelectedCategory();
  category.domains = (category.domains || []).filter((item) => item !== domain);
  renderDomains(category);
  renderCategoryList();
  markDirty();
  showDomainFeedback(`${domain} を削除しました。`, true);
}

function changeColor(colorValue) {
  const category = getSelectedCategory();
  if (category.color === colorValue) return;
  category.color = colorValue;
  const color = getGroupColor(colorValue);
  selectedColorDot.style.setProperty('--group-color', color.hex);
  renderColors(category);
  renderCategoryList();
  markDirty();
}

function getCurrentSettingsSnapshot() {
  return {
    categories,
    uiTheme,
    settings: organizeSettings
  };
}

function getSavedSettingsSnapshot() {
  return {
    categories: savedCategories,
    uiTheme: savedUiTheme,
    settings: savedOrganizeSettings
  };
}

function getStoredSettingsSnapshot(stored) {
  return {
    categories: normalizeCategories(stored?.categories, FALLBACK_CATEGORIES),
    uiTheme: SmartTabTheme.normalizeConfig(stored?.uiTheme),
    settings: normalizeOrganizeSettings(stored?.settings)
  };
}

async function applyStoredSettingsState(stored) {
  const snapshot = getStoredSettingsSnapshot(stored);
  return applySettingsSnapshots(snapshot, snapshot);
}

async function applySettingsSnapshots(savedSnapshot, currentSnapshot) {
  const currentSelection = selectedCategoryId;
  categories = clone(currentSnapshot.categories);
  uiTheme = clone(currentSnapshot.uiTheme);
  organizeSettings = clone(currentSnapshot.settings);
  savedCategories = clone(savedSnapshot.categories);
  savedUiTheme = clone(savedSnapshot.uiTheme);
  savedOrganizeSettings = clone(savedSnapshot.settings);
  externalSettingsChanged = false;

  if (savedOrganizeSettings.contentClassificationEnabled && contentAccessDraftActive) {
    await finishContentAccessDraft();
  }
  if (organizeSettings.contentClassificationEnabled && !contentClassificationAccessGranted) {
    organizeSettings.contentClassificationEnabled = false;
  }

  selectedCategoryId = categories.some((item) => item.id === currentSelection)
    ? currentSelection
    : categories[0]?.id || null;
  applyUiTheme();
  renderCategoryList();
  renderEditor();
  markDirty();
}

async function checkSettingsBeforeSave() {
  const incoming = await storage.load();
  const incomingSnapshot = getStoredSettingsSnapshot(incoming);
  const reconciliation = SmartTabSettingsConcurrency.reconcile({
    saved: getSavedSettingsSnapshot(),
    current: getCurrentSettingsSnapshot(),
    incoming: incomingSnapshot,
    dirty
  });
  const { action } = reconciliation;

  if (action === SmartTabSettingsConcurrency.ACTIONS.UNCHANGED) {
    externalSettingsChanged = false;
    return 'proceed';
  }
  if (action === SmartTabSettingsConcurrency.ACTIONS.CURRENT) {
    await applyStoredSettingsState(incoming);
    showToast('同じ変更は別の画面で保存済みです');
    return 'complete';
  }
  if (action === SmartTabSettingsConcurrency.ACTIONS.RELOAD) {
    await applyStoredSettingsState(incoming);
    showToast('別の画面の変更を反映しました');
    return 'complete';
  }
  if (action === SmartTabSettingsConcurrency.ACTIONS.MERGE) {
    await applySettingsSnapshots(incomingSnapshot, reconciliation.value);
    showToast('別の画面の変更を反映し、編集中の変更を残しました');
    return 'proceed';
  }

  flagExternalSettingsConflict();
  return 'conflict';
}

async function saveChanges() {
  settingsSyncGeneration += 1;
  clearTimeout(externalSettingsRefreshTimer);
  externalSettingsRefreshTimer = null;
  settingsSaveInFlight = true;
  saveButton.disabled = true;
  discardButton.disabled = true;
  changeSummary.textContent = '保存しています…';

  try {
    const syncResult = await checkSettingsBeforeSave();
    if (syncResult === 'complete') return true;
    if (syncResult === 'conflict') return false;

    if (organizeSettings.contentClassificationEnabled && !contentClassificationAccessGranted) {
      contentClassificationAccessChecking = true;
      renderBehaviorSettings();
      const granted = await storage.requestContentClassificationAccess();
      contentClassificationAccessChecking = false;
      contentClassificationAccessGranted = granted;
      if (!granted) {
        organizeSettings.contentClassificationEnabled = false;
        renderBehaviorSettings();
        markDirty();
        showToast('サイトへのアクセスが許可されなかったため、有効にできませんでした');
        return false;
      }
    }
    if (
      organizeSettings.contentClassificationEnabled
      && !await storage.hasContentClassificationAccess()
    ) {
      contentClassificationAccessGranted = false;
      organizeSettings.contentClassificationEnabled = false;
      renderBehaviorSettings();
      markDirty();
      showToast('サイトアクセスが変更されました。もう一度オンにしてください');
      return false;
    }

    let saved = await storage.save(
      { categories, uiTheme, settings: organizeSettings },
      getSavedSettingsSnapshot()
    );
    if (!saved) {
      const retrySyncResult = await checkSettingsBeforeSave();
      if (retrySyncResult === 'complete') return true;
      if (retrySyncResult === 'conflict') return false;
      saved = await storage.save(
        { categories, uiTheme, settings: organizeSettings },
        getSavedSettingsSnapshot()
      );
      if (!saved) {
        flagExternalSettingsConflict();
        return false;
      }
    }
    let accessRemoved = true;
    if (
      !organizeSettings.contentClassificationEnabled
      && savedOrganizeSettings.contentClassificationEnabled
    ) {
      try {
        accessRemoved = await storage.removeContentClassificationAccess();
        if (accessRemoved) {
          contentClassificationAccessGranted = false;
          await finishContentAccessDraft();
        }
      } catch (error) {
        accessRemoved = false;
      }
    }
    savedCategories = clone(categories);
    savedUiTheme = clone(uiTheme);
    savedOrganizeSettings = clone(organizeSettings);
    externalSettingsChanged = false;
    if (organizeSettings.contentClassificationEnabled) await finishContentAccessDraft();
    dirty = false;
    updateDirtyState();
    if (selectedView === 'behavior') renderBehaviorSettings();
    showToast(
      !accessRemoved
        ? '設定は保存しました。サイトアクセスはChromeの拡張機能設定から解除できます'
        : previewMode ? 'プレビュー設定を保存しました' : '設定を保存しました'
    );
    return true;
  } catch (error) {
    console.error('Settings save failed:', error);
    contentClassificationAccessChecking = false;
    dirty = true;
    updateDirtyState();
    if (selectedView === 'behavior') renderBehaviorSettings();
    const isQuotaError = /quota|max_write|bytes/i.test(String(error?.message || error));
    showToast(
      isQuotaError
        ? 'Chromeの同期容量を超えたため保存できませんでした。登録内容を減らして再試行してください'
        : '保存できませんでした。変更はこの画面に残っています'
    );
    return false;
  } finally {
    settingsSaveInFlight = false;
    updateDirtyState();
  }
}

async function discardChanges() {
  settingsSyncGeneration += 1;
  clearTimeout(externalSettingsRefreshTimer);
  externalSettingsRefreshTimer = null;
  discardButton.disabled = true;
  const hadExternalSettingsChange = externalSettingsChanged;
  let latest;
  try {
    latest = await storage.load();
  } catch (error) {
    updateDirtyState();
    showToast('最新の設定を読み込めませんでした');
    return false;
  }

  const latestSnapshot = getStoredSettingsSnapshot(latest);
  const removeDraftAccess = contentAccessDraftActive
    && contentClassificationAccessGranted
    && !latestSnapshot.settings.contentClassificationEnabled;
  await applyStoredSettingsState(latestSnapshot);
  if (removeDraftAccess) {
    contentClassificationAccessChecking = true;
    try {
      const removed = await storage.removeContentClassificationAccess();
      if (removed) {
        contentClassificationAccessGranted = false;
        await finishContentAccessDraft();
      }
      else showToast('サイトアクセスはChromeの拡張機能設定から解除できます');
    } catch (error) {
      showToast('サイトアクセスはChromeの拡張機能設定から解除できます');
    } finally {
      contentClassificationAccessChecking = false;
    }
  }
  if (organizeSettings.contentClassificationEnabled && !contentClassificationAccessGranted) {
    organizeSettings.contentClassificationEnabled = false;
  }
  applyUiTheme();
  renderCategoryList();
  renderEditor();
  markDirty();
  if (hadExternalSettingsChange) showToast('最新の設定を読み込みました');
  return true;
}

function markDirty() {
  dirty = !SmartTabSettingsConcurrency.deepEqual(
    getCurrentSettingsSnapshot(),
    getSavedSettingsSnapshot()
  );
  updateDirtyState();
}

function updateDirtyState() {
  const blockedByExternalChange = externalSettingsChanged;
  saveButton.disabled = !dirty || blockedByExternalChange || settingsSaveInFlight;
  discardButton.disabled = (!dirty && !blockedByExternalChange) || settingsSaveInFlight;
  discardButton.textContent = blockedByExternalChange ? '最新を読込' : '戻す';
  saveState.textContent = blockedByExternalChange ? '更新あり' : dirty ? '未保存' : '保存済み';
  saveState.classList.toggle('is-dirty', dirty || blockedByExternalChange);
  settingsDirtyIndicator.hidden = !dirty && !blockedByExternalChange;
  changeSummary.textContent = blockedByExternalChange
    ? '別の画面で設定が変わりました。最新を読み込んでください'
    : dirty ? '未保存の変更があります' : '変更はありません';
  saveButton.title = blockedByExternalChange ? '最新の設定を読み込んでから編集してください' : '';
  updateOrganizerControls();
  updateBehaviorOrganizeButton();
}

function updateBehaviorOrganizeButton() {
  if (!behaviorOrganizeButton) return;
  behaviorOrganizeButton.textContent = externalSettingsChanged
    ? '最新を読込後に分類'
    : dirty ? '保存して分類' : '分類を実行';
  behaviorOrganizeButton.disabled = behaviorActionRunning
    || contentClassificationAccessChecking
    || externalSettingsChanged;
}

async function finishContentAccessDraft() {
  if (!contentAccessDraftActive) return true;
  const finished = await storage.finishContentAccessDraft().catch(() => false);
  if (finished) contentAccessDraftActive = false;
  return finished;
}

function showDomainFeedback(message, success = false) {
  domainFeedback.textContent = message;
  domainFeedback.classList.toggle('is-success', success);
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2200);
}

function getSelectedCategory() {
  return categories.find((category) => category.id === selectedCategoryId);
}

function getGroupColor(value) {
  return GROUP_COLORS.find((color) => color.value === value) || GROUP_COLORS[0];
}

function normalizeDomain(rawValue) {
  let value = rawValue.trim().toLowerCase().replace(/^\*\./, '');
  if (!value) return null;

  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    const hostname = url.hostname.toLowerCase().replace(/^\.+|\.+$/g, '');
    if (!hostname || hostname.includes('..')) return null;
    if (!/^[a-z0-9.:[\]-]+$/i.test(hostname)) return null;
    return hostname;
  } catch (error) {
    return null;
  }
}

function findDomainConflict(selectedId, candidate) {
  for (const category of categories) {
    if (category.id === selectedId) continue;
    const domain = (category.domains || []).find((registered) => registered === candidate);
    if (domain) return { category, domain };
  }
  return null;
}

function createStorageAdapter() {
  const canUseExtensionStorage = !previewMode
    && window.location.protocol === 'chrome-extension:'
    && Boolean(globalThis.chrome?.storage?.sync);

  if (canUseExtensionStorage) {
    return {
      async load() {
        const [data, storedCategories] = await Promise.all([
          chrome.storage.sync.get(['uiTheme', 'settings']),
          SmartTabSettingsStorage.loadCategories(chrome.storage.sync, FALLBACK_CATEGORIES)
        ]);
        return {
          categories: normalizeCategories(storedCategories, FALLBACK_CATEGORIES),
          uiTheme: SmartTabTheme.normalizeConfig(data.uiTheme),
          settings: normalizeOrganizeSettings(data.settings)
        };
      },
      async save(value, expected) {
        const [current, currentCategories] = await Promise.all([
          chrome.storage.sync.get(['uiTheme', 'settings']),
          SmartTabSettingsStorage.loadCategories(chrome.storage.sync, FALLBACK_CATEGORIES)
        ]);
        if (
          expected
          && !SmartTabSettingsConcurrency.deepEqual(
            getStoredSettingsSnapshot({
              categories: currentCategories,
              uiTheme: current.uiTheme,
              settings: current.settings
            }),
            expected
          )
        ) return false;
        const categoriesToSave = normalizeCategories(value.categories, FALLBACK_CATEGORIES);
        const prepared = await SmartTabSettingsStorage.prepareCategoryWrite(
          chrome.storage.sync,
          categoriesToSave
        );
        if (expected) {
          const [latest, latestCategories] = await Promise.all([
            chrome.storage.sync.get([
              'uiTheme',
              'settings',
              SmartTabSettingsStorage.MANIFEST_KEY
            ]),
            SmartTabSettingsStorage.loadCategories(chrome.storage.sync, FALLBACK_CATEGORIES)
          ]);
          const latestGeneration = latest[SmartTabSettingsStorage.MANIFEST_KEY]?.generation || null;
          if (
            latestGeneration !== prepared.previousGeneration
            || !SmartTabSettingsConcurrency.deepEqual(
              getStoredSettingsSnapshot({
                categories: latestCategories,
                uiTheme: latest.uiTheme,
                settings: latest.settings
              }),
              expected
            )
          ) return false;
        }
        await SmartTabSettingsStorage.commitCategoryWrite(chrome.storage.sync, prepared, {
          uiTheme: SmartTabTheme.normalizeConfig(value.uiTheme),
          settings: normalizeOrganizeSettings(value.settings)
        });
        const [confirmed, confirmedCategories] = await Promise.all([
          chrome.storage.sync.get(['uiTheme', 'settings']),
          SmartTabSettingsStorage.loadCategories(chrome.storage.sync, FALLBACK_CATEGORIES)
        ]);
        return SmartTabSettingsConcurrency.deepEqual(
          getStoredSettingsSnapshot({
            categories: confirmedCategories,
            uiTheme: confirmed.uiTheme,
            settings: confirmed.settings
          }),
          getStoredSettingsSnapshot(value)
        );
      },
      subscribe(listener) {
        const handleChange = (changes, areaName) => {
          if (
            areaName === 'sync'
            && (
              SmartTabSettingsStorage.isCategoryStorageChange(changes)
              || changes.uiTheme
              || changes.settings
            )
          ) listener();
        };
        chrome.storage.onChanged.addListener(handleChange);
        return () => chrome.storage.onChanged.removeListener(handleChange);
      },
      async requestContentClassificationAccess() {
        return chrome.permissions.request({
          permissions: ['scripting'],
          origins: ['http://*/*', 'https://*/*']
        });
      },
      async hasContentClassificationAccess() {
        return chrome.permissions.contains({
          permissions: ['scripting'],
          origins: ['http://*/*', 'https://*/*']
        }).catch(() => false);
      },
      async removeContentClassificationAccess() {
        const request = {
          permissions: ['scripting'],
          origins: ['http://*/*', 'https://*/*']
        };
        if (!await chrome.permissions.contains(request)) return true;
        return chrome.permissions.remove(request);
      },
      async beginContentAccessDraft() {
        const tab = await chrome.tabs.getCurrent();
        const response = await chrome.runtime.sendMessage({
          action: 'BEGIN_CONTENT_ACCESS_DRAFT',
          tabId: tab?.id
        });
        return response?.success === true;
      },
      async finishContentAccessDraft() {
        const tab = await chrome.tabs.getCurrent();
        const response = await chrome.runtime.sendMessage({
          action: 'COMMIT_CONTENT_ACCESS_DRAFT',
          tabId: tab?.id
        });
        return response?.success === true;
      }
    };
  }

  let previewContentAccessGranted = window.localStorage.getItem(PREVIEW_CONTENT_ACCESS_KEY) === 'granted';
  return {
    async load() {
      try {
        const saved = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
        const parsed = saved ? JSON.parse(saved) : null;
        if (Array.isArray(parsed)) {
          return {
            categories: normalizeCategories(parsed, FALLBACK_CATEGORIES),
            uiTheme: clone(SmartTabTheme.DEFAULT_CONFIG),
            settings: normalizeOrganizeSettings()
          };
        }
        return {
          categories: normalizeCategories(parsed?.categories, FALLBACK_CATEGORIES),
          uiTheme: SmartTabTheme.normalizeConfig(parsed?.uiTheme),
          settings: normalizeOrganizeSettings(parsed?.settings)
        };
      } catch (error) {
        return {
          categories: clone(FALLBACK_CATEGORIES),
          uiTheme: clone(SmartTabTheme.DEFAULT_CONFIG),
          settings: normalizeOrganizeSettings()
        };
      }
    },
    async save(value, expected) {
      if (expected) {
        const current = await this.load();
        if (!SmartTabSettingsConcurrency.deepEqual(
          getStoredSettingsSnapshot(current),
          expected
        )) return false;
      }
      window.localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify({
        categories: clone(value.categories),
        uiTheme: SmartTabTheme.normalizeConfig(value.uiTheme),
        settings: normalizeOrganizeSettings(value.settings)
      }));
      return SmartTabSettingsConcurrency.deepEqual(
        getStoredSettingsSnapshot(await this.load()),
        getStoredSettingsSnapshot(value)
      );
    },
    subscribe(listener) {
      const handleChange = (event) => {
        if (event.key === PREVIEW_STORAGE_KEY) listener();
      };
      window.addEventListener('storage', handleChange);
      return () => window.removeEventListener('storage', handleChange);
    },
    async requestContentClassificationAccess() {
      previewContentAccessGranted = true;
      window.localStorage.setItem(PREVIEW_CONTENT_ACCESS_KEY, 'granted');
      return true;
    },
    async hasContentClassificationAccess() {
      return previewContentAccessGranted;
    },
    async removeContentClassificationAccess() {
      previewContentAccessGranted = false;
      window.localStorage.removeItem(PREVIEW_CONTENT_ACCESS_KEY);
      return true;
    },
    async beginContentAccessDraft() {
      return true;
    },
    async finishContentAccessDraft() {
      return true;
    }
  };
}

function createOrganizerAdapter() {
  const canUseExtensionApis = !previewMode
    && window.location.protocol === 'chrome-extension:'
    && Boolean(globalThis.chrome?.tabs && globalThis.chrome?.tabGroups);

  if (canUseExtensionApis) {
    return {
      async load() {
        const windowId = await resolveOrganizerWindowId();
        const [tabs, rawGroups, popupState, managedData] = await Promise.all([
          chrome.tabs.query({ windowId }),
          chrome.tabGroups.query({ windowId }),
          chrome.runtime.sendMessage({ action: 'GET_POPUP_STATE', windowId }),
          chrome.storage.local.get([MANAGED_GROUPS_STORAGE_KEY])
        ]);
        if (!popupState?.success) {
          throw new Error(popupState?.message || '整理状態を確認できませんでした。');
        }
        const normalizedTabs = tabs
          .filter((tab) => Number.isInteger(tab.id))
          .map((tab) => ({
            id: tab.id,
            groupId: tab.groupId,
            index: tab.index,
            pinned: tab.pinned === true,
            title: tab.title || tab.url || '無題のタブ',
            url: tab.url || tab.pendingUrl || ''
          }));
        const managedRecords = Array.isArray(managedData[MANAGED_GROUPS_STORAGE_KEY])
          ? managedData[MANAGED_GROUPS_STORAGE_KEY]
          : [];
        const groups = rawGroups.map((group) => ({
          id: group.id,
          title: group.title || '',
          color: group.color || 'grey',
          collapsed: group.collapsed === true,
          shared: group.shared === true,
          windowId: group.windowId,
          managed: managedRecords.some((record) =>
            record.windowId === windowId
            && record.groupId === group.id
            && record.title === (group.title || '')
            && record.color === (group.color || 'grey')
          ),
          tabIds: normalizedTabs
            .filter((tab) => tab.groupId === group.id)
            .sort((first, second) => first.index - second.index)
            .map((tab) => tab.id)
        })).sort((first, second) => {
          const firstIndex = normalizedTabs.find((tab) => tab.id === first.tabIds[0])?.index ?? Infinity;
          const secondIndex = normalizedTabs.find((tab) => tab.id === second.tabIds[0])?.index ?? Infinity;
          return firstIndex - secondIndex;
        });
        return {
          windowId,
          groups,
          tabs: normalizedTabs,
          preview: popupState.preview,
          undo: popupState.undo,
          inProgress: popupState.inProgress === true,
          operationType: popupState.operationType || null,
          recovery: popupState.recovery || null
        };
      },
      organize(windowId, confirmationToken) {
        return chrome.runtime.sendMessage({
          action: 'ORGANIZE_CURRENT_WINDOW_CONFIRMED',
          windowId,
          confirmationToken
        });
      },
      previewGroup(windowId, groupId) {
        return chrome.runtime.sendMessage({
          action: 'PREVIEW_SELECTED_GROUP_REORGANIZATION',
          windowId,
          groupId
        });
      },
      reorganizeGroup(windowId, groupId, expectedFingerprint) {
        return chrome.runtime.sendMessage({
          action: 'REORGANIZE_SELECTED_GROUP_CONFIRMED',
          windowId,
          groupId,
          expectedFingerprint
        });
      },
      editGroup(windowId, groupId, expectedFingerprint, changes) {
        return chrome.runtime.sendMessage({
          action: 'EDIT_SELECTED_GROUP_CONFIRMED',
          windowId,
          groupId,
          expectedFingerprint,
          changes
        });
      },
      async undo(windowId, operationId) {
        const message = { action: 'UNDO_LAST_ACTION', windowId, operationId };
        try {
          return await chrome.runtime.sendMessage(message);
        } catch (error) {
          return chrome.runtime.sendMessage(message);
        }
      }
    };
  }

  let previewOrganized = false;
  let previewReorganized = false;
  let previewUndoAvailable = false;
  let previewUndoAction = null;
  let previewUndoOperationId = null;
  let previewUndoExpiresAt = null;
  let previewOperationCounter = 0;
  let previewManualLoadFailed = false;
  const previewLostResponses = new Set();
  const previewParams = new URLSearchParams(window.location.search);
  const previewLoss = previewParams.get('loss');
  const previewStale = previewParams.get('stale');
  const previewLoadFailure = previewParams.get('loadFailure');
  const previewUndoMaximum = 30 * 60 * 1000;
  const previewUndoTtl = SmartTabActionExpiry.clampDuration(
    previewParams.get('undoTtl'),
    previewUndoMaximum,
    previewUndoMaximum
  );
  const previewGroupOverrides = new Map();
  const previewTabs = [
    { id: 101, groupId: 11, index: 0, title: 'GitHub — smart-tab-grouper', url: 'https://github.com/example/smart-tab-grouper' },
    { id: 102, groupId: 11, index: 1, title: '検索結果を開発グループへ仮置き', url: 'https://www.google.com/search?q=extensions' },
    { id: 103, groupId: 12, index: 2, title: '検索結果', url: 'https://www.google.com/search?q=tab+groups' },
    { id: 104, groupId: 12, index: 3, title: 'ChatGPT', url: 'https://chatgpt.com/' },
    { id: 105, groupId: 13, index: 4, title: '作業用BGM', url: 'https://www.youtube.com/watch?v=example' },
    { id: 106, groupId: -1, index: 5, title: '今日のニュース', url: 'https://news.example.com/today' },
    { id: 107, groupId: -1, index: 6, title: '技術ニュース', url: 'https://it.example.com/article' }
  ];

  function expirePreviewUndoIfNeeded() {
    if (!previewUndoAvailable || !SmartTabActionExpiry.isExpired(previewUndoExpiresAt)) return false;
    previewUndoAvailable = false;
    previewUndoAction = null;
    previewUndoOperationId = null;
    previewUndoExpiresAt = null;
    return true;
  }

  return {
    async load({ reason } = {}) {
      if (
        previewLoadFailure === 'refresh'
        && reason === 'manual'
        && !previewManualLoadFailed
      ) {
        previewManualLoadFailed = true;
        throw new Error('一時的にタブ状態を確認できませんでした。');
      }
      expirePreviewUndoIfNeeded();
      const tabs = previewTabs.map((tab) => {
        if (previewOrganized && [106, 107].includes(tab.id)) return { ...tab, groupId: 14 };
        if (previewReorganized && tab.id === 102) return { ...tab, groupId: 12 };
        return { ...tab };
      });
      const groups = [
        { id: 11, title: '💻 開発・プログラミング', color: 'purple', collapsed: false, shared: false, managed: true, tabIds: tabs.filter((tab) => tab.groupId === 11).map((tab) => tab.id) },
        { id: 12, title: '🔍 検索・AIアシスタント', color: 'cyan', collapsed: false, shared: false, managed: true, tabIds: tabs.filter((tab) => tab.groupId === 12).map((tab) => tab.id) },
        { id: 13, title: '🎬 動画・メディア', color: 'red', collapsed: true, shared: false, managed: false, tabIds: [105] }
      ].map((group) => ({ ...group, windowId: 1, ...(previewGroupOverrides.get(group.id) || {}) }));
      if (previewOrganized) {
        groups.push({ id: 14, title: '📰 ニュース・情報', color: 'orange', collapsed: false, managed: true, tabIds: [106, 107] });
      }
      return {
        windowId: 1,
        groups,
        tabs,
        preview: {
          count: previewOrganized ? 0 : 2,
          groupCount: previewOrganized ? 0 : 1,
          targetTabIds: previewOrganized ? [] : [106, 107],
          eligibleCount: previewOrganized ? 0 : 2,
          unresolvedTabIds: [],
          unresolved: 0,
          contentClassificationEnabled: false,
          contentClassificationAvailable: false,
          confirmationToken: { version: 1, windowId: 1, digest: 'options-preview' }
        },
        inProgress: false,
        operationType: null,
        recovery: null,
        undo: previewUndoAvailable
          ? {
            available: true,
            operationId: previewUndoOperationId,
            expiresAt: previewUndoExpiresAt
          }
          : null
      };
    },
    async organize() {
      await waitForPreview(500);
      if (previewStale === 'organize' && !previewLostResponses.has('stale-organize')) {
        previewLostResponses.add('stale-organize');
        return {
          success: false,
          code: 'PREVIEW_STALE',
          message: 'タブまたは分類設定が変わりました。最新の件数を確認してください。'
        };
      }
      previewUndoAction = { type: 'organize', previous: previewOrganized };
      previewOrganized = true;
      previewUndoAvailable = true;
      previewUndoOperationId = `options-preview-${++previewOperationCounter}`;
      previewUndoExpiresAt = Date.now() + previewUndoTtl;
      if (previewLoss === 'organize' && !previewLostResponses.has('organize')) {
        previewLostResponses.add('organize');
        throw new Error('整理の応答を確認できませんでした。');
      }
      return { success: true, count: 2, message: '2件のタブを整理しました。' };
    },
    async previewGroup(windowId, groupId) {
      await waitForPreview(300);
      const currentTabs = previewTabs.filter((tab) =>
        (previewReorganized && tab.id === 102 ? 12 : tab.groupId) === groupId
      );
      const source = groupId === 11
        ? { title: '💻 開発・プログラミング', color: 'purple' }
        : { title: '選択グループ', color: 'grey' };
      const movable = groupId === 11 && !previewReorganized ? [102] : [];
      return {
        success: true,
        windowId,
        groupId,
        title: source.title,
        color: source.color,
        totalCount: currentTabs.length,
        retainedCount: currentTabs.length - movable.length,
        movedCount: movable.length,
        targetGroupCount: movable.length > 0 ? 1 : 0,
        newGroupCount: 0,
        blockedCount: 0,
        targets: movable.length > 0
          ? [{ categoryId: 'cat_ai_search', name: '🔍 検索・AIアシスタント', color: 'cyan', count: 1, reusesManagedGroup: true }]
          : [],
        fingerprint: {
          groupId,
          title: source.title,
          color: source.color,
          tabs: currentTabs.map((tab) => ({
            id: tab.id,
            index: tab.index,
            url: tab.url,
            title: tab.title
          }))
        }
      };
    },
    async reorganizeGroup() {
      await waitForPreview(500);
      previewUndoAction = { type: 'reorganize', previous: previewReorganized };
      previewReorganized = true;
      previewUndoAvailable = true;
      previewUndoOperationId = `options-preview-${++previewOperationCounter}`;
      previewUndoExpiresAt = Date.now() + previewUndoTtl;
      if (previewLoss === 'reorganize' && !previewLostResponses.has('reorganize')) {
        previewLostResponses.add('reorganize');
        throw new Error('再構成の応答を確認できませんでした。');
      }
      return { success: true, count: 1, message: '1件を1グループへ分け直しました。' };
    },
    async editGroup(windowId, groupId, expectedFingerprint, changes) {
      await waitForPreview(350);
      previewUndoAction = {
        type: 'edit',
        groupId,
        previous: previewGroupOverrides.has(groupId)
          ? { ...previewGroupOverrides.get(groupId) }
          : null
      };
      previewGroupOverrides.set(groupId, {
        title: String(changes?.title || '').trim(),
        color: GROUP_COLORS.some((color) => color.value === changes?.color) ? changes.color : 'grey',
        collapsed: changes?.collapsed === true
      });
      previewUndoAvailable = true;
      previewUndoOperationId = `options-preview-${++previewOperationCounter}`;
      previewUndoExpiresAt = Date.now() + previewUndoTtl;
      if (previewLoss === 'edit' && !previewLostResponses.has('edit')) {
        previewLostResponses.add('edit');
        throw new Error('グループ変更の応答を確認できませんでした。');
      }
      return {
        success: true,
        count: 1,
        message: `「${String(changes?.title || '').trim() || '名称なし'}」の表示を変更しました。`
      };
    },
    async undo(windowId, operationId) {
      await waitForPreview(300);
      if (expirePreviewUndoIfNeeded()) {
        return { success: false, message: '元に戻せる時間が終了しました。' };
      }
      if (operationId && operationId !== previewUndoOperationId) {
        return { success: false, message: '表示後に別の整理が完了したため、元に戻していません。' };
      }
      if (previewUndoAction?.type === 'organize') {
        previewOrganized = previewUndoAction.previous;
      } else if (previewUndoAction?.type === 'reorganize') {
        previewReorganized = previewUndoAction.previous;
      } else if (previewUndoAction?.type === 'edit') {
        if (previewUndoAction.previous) {
          previewGroupOverrides.set(previewUndoAction.groupId, previewUndoAction.previous);
        } else {
          previewGroupOverrides.delete(previewUndoAction.groupId);
        }
      }
      previewUndoAction = null;
      previewUndoAvailable = false;
      previewUndoOperationId = null;
      previewUndoExpiresAt = null;
      return { success: true, restoredCount: 2, message: '2件を元に戻しました。' };
    }
  };
}

async function resolveOrganizerWindowId() {
  const requested = Number.parseInt(new URLSearchParams(window.location.search).get('windowId'), 10);
  if (Number.isInteger(requested) && requested >= 0) {
    try {
      await chrome.windows.get(requested);
      return requested;
    } catch (error) {
      // The source window may have been closed while this settings tab stayed open.
    }
  }
  const current = await chrome.windows.getCurrent();
  if (!Number.isInteger(current?.id)) throw new Error('整理するウィンドウを確認できませんでした。');
  return current.id;
}

function waitForPreview(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeOrganizeSettings(value = {}) {
  return normalizeRuleSettings(value, DEFAULT_SETTINGS);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

window.addEventListener('beforeunload', (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = '';
});
