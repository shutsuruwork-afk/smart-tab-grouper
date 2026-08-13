const state = {
  palette: 'rose',
  seed: '#5b6f91',
  theme: 'light',
  outcome: 'success',
  shadow: true
};

const popupPreview = document.getElementById('popupPreview');
const closedState = document.getElementById('closedState');
const closedReason = document.getElementById('closedReason');
const stageStatus = document.getElementById('stageStatus');
const shadowToggle = document.getElementById('shadowToggle');
const reopenButton = document.getElementById('reopenButton');
const customSeedRow = document.getElementById('customSeedRow');
const customSeedInput = document.getElementById('customSeedInput');
const customSeedValue = document.getElementById('customSeedValue');
const customSwatch = document.getElementById('customSwatch');

bindChoiceGroup('paletteOptions', 'palette');
bindChoiceGroup('themeOptions', 'theme');
bindChoiceGroup('outcomeOptions', 'outcome');

shadowToggle.addEventListener('change', () => {
  state.shadow = shadowToggle.checked;
  openPopup();
});

customSeedInput.addEventListener('input', () => {
  state.seed = customSeedInput.value;
  customSeedValue.textContent = state.seed.toUpperCase();
  customSwatch.style.background = state.seed;
  openPopup();
});

reopenButton.addEventListener('click', openPopup);

window.addEventListener('message', (event) => {
  if (event.source !== popupPreview.contentWindow) return;
  if (event.data?.source !== 'smart-tab-grouper-preview') return;
  if (event.data?.type === 'popup-size') {
    const height = Math.min(Math.max(Number(event.data.height) || 208, 176), 560);
    popupPreview.style.height = `${height}px`;
    document.getElementById('viewportLabel').textContent = `320 × ${height}`;
    return;
  }
  if (event.data?.type === 'open-settings') {
    window.open('../options/options.html?preview=1', 'smart-tab-grouper-options');
    stageStatus.textContent = '設定画面を別タブで開きました';
    return;
  }
  if (event.data?.type !== 'popup-closed') return;

  popupPreview.hidden = true;
  closedState.hidden = false;
  const isSuccess = event.data.reason === 'success';
  closedReason.textContent = isSuccess ? '整理完了後に閉じました' : '何も変更せず閉じました';
  stageStatus.textContent = isSuccess ? '成功フローを確認しました' : 'キャンセルを確認しました';
});

function bindChoiceGroup(id, stateKey) {
  const group = document.getElementById(id);
  group.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;

    state[stateKey] = button.dataset.value;
    if (stateKey === 'palette') {
      customSeedRow.hidden = state.palette !== 'custom';
    }
    for (const option of group.querySelectorAll('button[data-value]')) {
      const selected = option === button;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-pressed', String(selected));
    }
    openPopup();
  });
}

function openPopup() {
  const params = new URLSearchParams({
    preview: '1',
    palette: state.palette,
    seed: state.seed,
    theme: state.theme,
    outcome: state.outcome,
    shadow: state.shadow ? 'on' : 'off',
    actionDelay: '900',
    closeDelay: '900'
  });

  closedState.hidden = true;
  popupPreview.hidden = false;
  popupPreview.src = `../popup/popup.html?${params}`;
  stageStatus.textContent = '操作できます';
  applyChromeContextColors();
}

function applyChromeContextColors() {
  const config = state.palette === 'custom'
    ? { mode: 'custom', seed: state.seed }
    : { mode: 'preset', preset: state.palette, seed: state.seed };
  const tokens = SmartTabTheme.getTokens(config, state.theme).tokens;
  const colors = [tokens.header, tokens.baseContainer, tokens.baseContainerElevated];
  const context = document.querySelector('.chrome-context');
  context.style.background = colors[0];
  context.style.setProperty('--toolbar-color', colors[1]);
  document.querySelector('.chrome-tab').style.background = colors[2];
  document.querySelector('.chrome-omnibox').style.background = colors[2];
  context.querySelector('style')?.remove();
  const style = document.createElement('style');
  style.textContent = `.chrome-context::after { background: ${colors[1]}; }`;
  context.append(style);
}

openPopup();
