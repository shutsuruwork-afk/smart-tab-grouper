import test from 'node:test';
import assert from 'node:assert/strict';

await import('../utils/serial_poller.js');

const { create } = globalThis.SmartTabSerialPoller;

test('遅い読込み中に再開始してもリクエストを重ねず古い結果を描画しない', async () => {
  const timers = fakeTimers();
  const first = deferred();
  const second = deferred();
  const pending = [first, second];
  const values = [];
  let activeLoads = 0;
  let maximumActiveLoads = 0;
  const poller = create({
    load: async () => {
      activeLoads += 1;
      maximumActiveLoads = Math.max(maximumActiveLoads, activeLoads);
      try {
        return await pending.shift().promise;
      } finally {
        activeLoads -= 1;
      }
    },
    onValue: (value) => values.push(value),
    shouldContinue: (value) => value === 'progress',
    interval: 5,
    ...timers.adapter
  });

  poller.start({ immediate: true });
  timers.runNext();
  poller.start({ immediate: true });
  assert.equal(timers.pendingCount(), 0);
  first.resolve('old-complete');
  await settle();
  assert.deepEqual(values, []);
  assert.equal(timers.pendingCount(), 1);

  timers.runNext();
  second.resolve('complete');
  await settle();
  assert.deepEqual(values, ['complete']);
  assert.equal(maximumActiveLoads, 1);
  assert.equal(poller.isActive(), false);
});

test('一時的な読込み失敗後も一つずつ再試行して完了する', async () => {
  const timers = fakeTimers();
  const values = [];
  const errors = [];
  let calls = 0;
  const poller = create({
    load: async () => {
      calls += 1;
      if (calls === 1) throw new Error('temporary');
      return 'complete';
    },
    onValue: (value) => values.push(value),
    shouldContinue: () => false,
    onError: (error) => errors.push(error.message),
    ...timers.adapter
  });

  poller.start({ immediate: true });
  timers.runNext();
  await settle();
  assert.equal(timers.pendingCount(), 1);
  timers.runNext();
  await settle();

  assert.equal(calls, 2);
  assert.deepEqual(errors, ['temporary']);
  assert.deepEqual(values, ['complete']);
});

test('停止後に届いた応答は描画せず再試行もしない', async () => {
  const timers = fakeTimers();
  const request = deferred();
  const values = [];
  const poller = create({
    load: () => request.promise,
    onValue: (value) => values.push(value),
    shouldContinue: () => true,
    ...timers.adapter
  });

  poller.start({ immediate: true });
  timers.runNext();
  poller.stop();
  request.resolve('late');
  await settle();

  assert.deepEqual(values, []);
  assert.equal(timers.pendingCount(), 0);
  assert.equal(poller.isActive(), false);
});

function fakeTimers() {
  let nextId = 0;
  const queue = [];
  return {
    adapter: {
      schedule(callback) {
        const entry = { id: ++nextId, callback, cancelled: false };
        queue.push(entry);
        return entry.id;
      },
      cancel(id) {
        const entry = queue.find((item) => item.id === id);
        if (entry) entry.cancelled = true;
      }
    },
    pendingCount: () => queue.filter((item) => !item.cancelled).length,
    runNext() {
      const index = queue.findIndex((item) => !item.cancelled);
      assert.notEqual(index, -1, 'expected a scheduled callback');
      const [entry] = queue.splice(index, 1);
      entry.callback();
    }
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
