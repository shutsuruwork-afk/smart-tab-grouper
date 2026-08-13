export function buildWindowOrganizeConfirmation(preview = {}, { stateChanged = false } = {}) {
  const count = Number(preview?.count) || 0;
  const groupCount = Number(preview?.groupCount) || 0;
  const hasContentCandidates = preview?.contentClassificationEnabled === true
    && Number(preview?.unresolved) > 0;
  const contentMayAdd = hasContentCandidates
    && preview?.contentClassificationAvailable !== false
    && preview?.contentLimitExceeded !== true;
  const assistText = hasContentCandidates
    ? preview?.contentClassificationAvailable === false
      ? ' 補助分類はサイトアクセスがないため使用しません。'
      : preview?.contentLimitExceeded
        ? ' 補助分類は候補が30件を超えたため使用しません。'
        : ' 補助分類により対象が増える場合があります。'
    : '';
  const description = count > 0
    ? `${count}件の未グループタブを${groupCount}グループへ分類する予定です。${assistText}`
    : contentMayAdd
      ? '補助分類で未グループタブを確認し、対象が見つかった場合だけ分類します。'
      : hasContentCandidates && preview?.contentClassificationAvailable === false
        ? 'サイトアクセスが解除されています。設定で未登録サイトの自動分類をオンにし直してください。'
        : '現在の設定で分類できる未グループタブはありません。';

  return {
    title: stateChanged ? '最新の状態で整理しますか？' : '本当に整理しますか？',
    notice: stateChanged ? '状態が変わったため、最新の件数に更新しました。' : '',
    description,
    confirmDisabled: count === 0 && !contentMayAdd,
    confirmationToken: preview?.confirmationToken || null
  };
}
