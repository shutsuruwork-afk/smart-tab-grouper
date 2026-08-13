import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWindowOrganizeConfirmation } from '../utils/organizer_confirmation.js';

test('通常の確認は安価な対象件数と予定グループ数だけを表示する', () => {
  const token = { version: 1, windowId: 7, digest: 'confirmed' };
  const result = buildWindowOrganizeConfirmation({
    count: 4,
    groupCount: 2,
    unresolved: 0,
    confirmationToken: token
  });

  assert.equal(result.title, '本当に整理しますか？');
  assert.equal(result.notice, '');
  assert.equal(result.description, '4件の未グループタブを2グループへ分類する予定です。');
  assert.equal(result.confirmDisabled, false);
  assert.equal(result.confirmationToken, token);
});

test('状態変更後は最新件数であることを明示してもう一度だけ確認する', () => {
  const result = buildWindowOrganizeConfirmation({ count: 2, groupCount: 1 }, {
    stateChanged: true
  });

  assert.equal(result.title, '最新の状態で整理しますか？');
  assert.equal(result.notice, '状態が変わったため、最新の件数に更新しました。');
  assert.match(result.description, /^2件/);
  assert.equal(result.confirmDisabled, false);
});

test('安価な対象が0件でも補助分類できる場合だけ実行を許可する', () => {
  const available = buildWindowOrganizeConfirmation({
    count: 0,
    groupCount: 0,
    unresolved: 3,
    contentClassificationEnabled: true,
    contentClassificationAvailable: true,
    contentLimitExceeded: false
  });
  const unavailable = buildWindowOrganizeConfirmation({
    count: 0,
    groupCount: 0,
    unresolved: 3,
    contentClassificationEnabled: true,
    contentClassificationAvailable: false
  });
  const overLimit = buildWindowOrganizeConfirmation({
    count: 0,
    groupCount: 0,
    unresolved: 31,
    contentClassificationEnabled: true,
    contentClassificationAvailable: true,
    contentLimitExceeded: true
  });

  assert.equal(available.confirmDisabled, false);
  assert.match(available.description, /見つかった場合だけ/);
  assert.equal(unavailable.confirmDisabled, true);
  assert.match(unavailable.description, /サイトアクセス/);
  assert.equal(overLimit.confirmDisabled, true);
});
