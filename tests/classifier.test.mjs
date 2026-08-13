import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyTab, findLongestDomainMatch } from '../utils/classifier.js';

test('親ドメインと子ドメインが重なる場合は最長一致を使う', () => {
  const categories = [
    { id: 'search', enabled: true, domains: ['google.com'], titleKeywords: [] },
    { id: 'mail', enabled: true, domains: ['mail.google.com'], titleKeywords: [] }
  ];

  assert.equal(classifyTab({ url: 'https://mail.google.com/mail/u/0/' }, categories).id, 'mail');
  assert.equal(classifyTab({ url: 'https://maps.google.com/' }, categories).id, 'search');
  assert.equal(findLongestDomainMatch('deep.mail.google.com', categories).domain, 'mail.google.com');
});

test('同じ長さの完全一致が残っていても設定順で決定的に判定する', () => {
  const categories = [
    { id: 'first', enabled: true, domains: ['example.com'], titleKeywords: [] },
    { id: 'second', enabled: true, domains: ['example.com'], titleKeywords: [] }
  ];
  assert.equal(classifyTab({ url: 'https://example.com/' }, categories).id, 'first');
});
