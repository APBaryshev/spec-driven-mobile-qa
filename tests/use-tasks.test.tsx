import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { createRoot } from 'test-renderer';

import type { Task } from '../src/features/tasks/model';
import { taskStorage } from '../src/features/tasks/taskStorage';
import { type CreationResult, useTasks } from '../src/features/tasks/useTasks';

// Real hook, model, UUID generation, serialization and AsyncStorage JS wrapper.
// Native callbacks control settlement of the storage promises, including writes
// which have changed bytes but whose completion response has not arrived yet.
jest.mock('@react-native-async-storage/async-storage/lib/commonjs/RCTAsyncStorage', () => ({
  multiGet: jest.fn(), multiSet: jest.fn(),
}));
jest.mock('react-native/Libraries/AppState/AppState', () => {
  const listeners = new Set<(mockState: string) => void>();
  const appState = {
    currentState: 'active',
    addEventListener: (_: string, listener: (mockState: string) => void) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    emit(state: string) {
      appState.currentState = state;
      listeners.forEach((listener) => listener(state));
    },
  };
  return { __esModule: true, default: appState };
});
type NativeError = { message: string };
type ReadCallback = (errors: NativeError[] | null, entries?: [string, string | null][]) => void;
type WriteCallback = (errors?: NativeError[]) => void;
const native = jest.requireMock(
  '@react-native-async-storage/async-storage/lib/commonjs/RCTAsyncStorage',
) as {
  multiGet: jest.Mock<void, [string[], ReadCallback]>;
  multiSet: jest.Mock<void, [[string, string][], WriteCallback]>;
};
const key = 'taskflow.tasks';
const base: readonly Task[] = [
  { id: 'id-b', title: 'Одинаковое 😀' }, { id: 'id-a', title: 'Одинаковое 😀' },
];
const encoded = (tasks: readonly Task[]) => JSON.stringify({ schemaVersion: 1, tasks });
let bytes: string | null;
let reads: ReadCallback[];
let writes: { entries: [string, string][]; finish: WriteCallback }[];
let events: string[];

beforeEach(() => {
  jest.clearAllMocks();
  bytes = encoded(base);
  reads = [];
  writes = [];
  events = [];
  native.multiGet.mockImplementation((_, finish) => { events.push('load'); reads.push(finish); });
  native.multiSet.mockImplementation((entries, finish) => {
    events.push('save'); writes.push({ entries, finish });
  });
});

async function read(index: number, error = false, raw = bytes) {
  await act(async () => {
    events.push('read settled');
    reads[index](error ? [{ message: 'private read failure' }] : null, [[key, raw]]);
  });
}

function sent(index = 0): readonly Task[] {
  return JSON.parse(writes[index].entries[0][1]).tasks;
}

async function write(index: number, changed: boolean, error: boolean) {
  await act(async () => {
    if (changed) bytes = writes[index].entries[0][1];
    events.push('write settled');
    writes[index].finish(error ? [{ message: 'private write failure' }] : undefined);
  });
}

async function mounted() {
  const hook = await renderHook(() => useTasks(taskStorage));
  await read(0);
  expect(hook.result.current.state).toEqual({ status: 'ready', tasks: base });
  return hook;
}

type Hook = Awaited<ReturnType<typeof mounted>>;
async function start(hook: Hook, input = '  Новая задача  ') {
  let operation!: Promise<CreationResult>;
  await act(async () => { operation = hook.result.current.createTask(input); });
  return { operation }; // Do not await the controlled operation here.
}

describe('useTasks safe loading', () => {
  test('distinguishes loading from empty and errors; retry is guarded and never writes', async () => {
    const hook = await renderHook(() => useTasks(taskStorage));
    expect(hook.result.current.state).toEqual({ status: 'loading', tasks: null });
    expect(hook.result.current.canCreate).toBe(false);
    await expect(hook.result.current.createTask('A')).resolves.toEqual({ status: 'blocked' });
    await read(0, true);
    expect(hook.result.current.state).toEqual({ status: 'loadError', tasks: null });
    await expect(hook.result.current.createTask('A')).resolves.toEqual({ status: 'blocked' });
    expect(bytes).toBe(encoded(base));
    let retry!: Promise<void>;
    await act(async () => {
      retry = hook.result.current.retryLoad();
      void hook.result.current.retryLoad();
      void hook.result.current.retryLoad();
    });
    expect(reads).toHaveLength(2);
    expect(hook.result.current.state.tasks).toBeNull();
    await read(1);
    await retry;
    expect(hook.result.current.state).toEqual({ status: 'ready', tasks: base });
    await hook.result.current.retryLoad();
    expect(reads).toHaveLength(2);
    expect(writes).toHaveLength(0);
  });

  test('accepts an absent key as empty only after successful read', async () => {
    bytes = null;
    const hook = await renderHook(() => useTasks(taskStorage));
    expect(hook.result.current.state.tasks).toBeNull();
    await read(0);
    expect(hook.result.current.state).toEqual({ status: 'ready', tasks: [] });
    expect(hook.result.current.canCreate).toBe(true);
    expect(bytes).toBeNull();
    expect(writes).toHaveLength(0);
  });

  test('preserves corrupt bytes on startup and allows an explicit read retry', async () => {
    bytes = '{broken';
    const hook = await renderHook(() => useTasks(taskStorage));
    await read(0);
    expect(hook.result.current.state.status).toBe('loadError');
    expect(bytes).toBe('{broken');
    let retry!: Promise<void>;
    await act(async () => { retry = hook.result.current.retryLoad(); });
    await read(1, false, encoded(base));
    await retry;
    expect(hook.result.current.state.tasks).toEqual(base);
    expect(writes).toHaveLength(0);
  });
});

describe('useTasks confirmed creation', () => {
  test.each(['', '  ', 'A\nB', 'я'.repeat(101)])('validates %j before saving and preserves input', async (input) => {
    const hook = await mounted();
    const result = await hook.result.current.createTask(input);
    expect(result).toMatchObject({ status: 'invalid', input });
    expect(hook.result.current.state.tasks).toEqual(base);
    expect(writes).toHaveLength(0);
  });

  test('guards rapid submissions synchronously and keeps a slow write unconfirmed without a timeout', async () => {
    const hook = await mounted();
    const create = hook.result.current.createTask;
    let first!: Promise<CreationResult>;
    await act(async () => {
      first = create('  A  ');
      await expect(create('A')).resolves.toEqual({ status: 'blocked' });
      await expect(create('B')).resolves.toEqual({ status: 'blocked' });
    });
    expect(writes).toHaveLength(1);
    expect(hook.result.current.state).toEqual({ status: 'saving', tasks: base });
    expect(hook.result.current.canEdit).toBe(false);
    let settled = false;
    void first.then(() => { settled = true; });
    // Even changed persistent bytes are not confirmation until save settles.
    bytes = writes[0].entries[0][1];
    jest.useFakeTimers();
    try {
      await act(async () => { jest.advanceTimersByTime(60 * 60 * 1000); });
    } finally { jest.useRealTimers(); }
    expect(settled).toBe(false);
    expect(reads).toHaveLength(1);
    await expect(hook.result.current.retryReconciliation()).resolves.toEqual({ status: 'blocked' });
    await write(0, true, false);
    await expect(first).resolves.toEqual({ status: 'created', input: '  A  ', id: sent()[0].id });
    expect(hook.result.current.state).toEqual({ status: 'ready', tasks: sent() });
  });

  test('creates sequential snapshots without losing tasks, IDs or duplicate titles', async () => {
    const hook = await mounted();
    for (const [index, title] of ['A', 'A', 'C'].entries()) {
      const { operation } = await start(hook, title);
      await write(index, true, false);
      await expect(operation).resolves.toMatchObject({ status: 'created' });
      expect(hook.result.current.state.tasks).toEqual(sent(index));
    }
    const tasks = hook.result.current.state.tasks!;
    expect(tasks.map((task) => task.title)).toEqual(['C', 'A', 'A', ...base.map((task) => task.title)]);
    expect(new Set(tasks.map((task) => task.id)).size).toBe(5);
    expect(tasks.slice(3)).toEqual(base);
    expect(reads).toHaveLength(1);
  });
});

describe('useTasks write reconciliation', () => {
  test('handles a synchronous native write exception through reconciliation', async () => {
    const hook = await mounted();
    native.multiSet.mockImplementationOnce(() => { throw new Error('private exception'); });
    const first = await start(hook);
    await waitFor(() => expect(reads).toHaveLength(2));
    expect(hook.result.current.state).toEqual({ status: 'reconciling', tasks: base });
    await read(1);
    await expect(first.operation).resolves.toMatchObject({ status: 'saveError' });
    expect(bytes).toBe(encoded(base));
    expect(native.multiSet).toHaveBeenCalledTimes(1);
  });

  test.each([false, true])('reconciles changed=%s only after write settlement and safely creates changed input', async (changed) => {
    const hook = await mounted();
    const { operation } = await start(hook, '  A  ');
    expect(reads).toHaveLength(1);
    await write(0, changed, true);
    expect(events).toEqual(['load', 'read settled', 'save', 'write settled', 'load']);
    expect(hook.result.current.state).toEqual({ status: 'reconciling', tasks: base });
    expect(hook.result.current.canCreate).toBe(false);
    await expect(hook.result.current.createTask('B')).resolves.toEqual({ status: 'blocked' });
    await read(1);
    await expect(operation).resolves.toMatchObject({ status: changed ? 'created' : 'saveError', input: '  A  ' });
    expect(writes).toHaveLength(1);
    expect(hook.result.current.state.tasks).toEqual(changed ? sent() : base);
    const next = await start(hook, 'B');
    await write(1, true, false);
    await next.operation;
    expect(sent(1)).toEqual([sent(1)[0], ...(changed ? sent() : base)]);
    expect(sent(1)[0]).toMatchObject({ title: 'B' });
    expect(sent(1)[0].id).not.toBe(sent()[0].id);
  });

  test('retries identical raw input with the prepared ID and full snapshot after proven absence', async () => {
    const hook = await mounted();
    const first = await start(hook);
    await write(0, false, true);
    await read(1);
    await expect(first.operation).resolves.toEqual({ status: 'saveError', input: '  Новая задача  ' });
    expect(hook.result.current.canEdit).toBe(true);
    // Invalid correction does not discard the reusable attempt or write.
    await expect(hook.result.current.createTask('A\nB')).resolves.toMatchObject({ status: 'invalid', input: 'A\nB' });
    const retry = await start(hook);
    expect(sent(1)).toEqual(sent());
    await write(1, true, false);
    await expect(retry.operation).resolves.toMatchObject({ status: 'created', id: sent()[0].id });
  });

  const unexpected: [string, (sent: readonly Task[]) => string | null][] = [
    ['read error', () => null],
    ['invalid JSON', () => '{broken'],
    ['unknown version', (tasks) => JSON.stringify({ schemaVersion: 2, tasks })],
    ['duplicate IDs', (tasks) => encoded([tasks[0], tasks[0]])],
    ['missing key with nonempty base', () => null],
    ['only attempt ID', (tasks) => encoded([tasks[0]])],
    ['changed attempt title', (tasks) => encoded([{ ...tasks[0], title: 'Other' }, ...base])],
    ['changed existing title', (tasks) => encoded([tasks[0], { ...base[0], title: 'Other' }, base[1]])],
    ['changed existing ID', (tasks) => encoded([tasks[0], { ...base[0], id: 'other' }, base[1]])],
    ['changed order', (tasks) => encoded([tasks[0], base[1], base[0]])],
    ['extra task', (tasks) => encoded([...tasks, { id: 'extra', title: 'Extra' }])],
    ['changed base title', () => encoded([{ ...base[0], title: 'Other' }, base[1]])],
  ];
  test.each(unexpected)('blocks writes for %s; guarded retry only reads and can confirm sent snapshot', async (name, unexpectedBytes) => {
    const hook = await mounted();
    const { operation } = await start(hook);
    await write(0, false, true);
    await read(1, name === 'read error', unexpectedBytes(sent()));
    await expect(operation).resolves.toEqual({ status: 'outcomeUnknown', input: '  Новая задача  ' });
    expect(hook.result.current.state).toEqual({ status: 'outcomeUnknown', tasks: base });
    expect(hook.result.current.canEdit).toBe(false);
    await expect(hook.result.current.createTask('B')).resolves.toEqual({ status: 'blocked' });
    await hook.result.current.retryLoad();
    let retry!: Promise<CreationResult>;
    await act(async () => {
      retry = hook.result.current.retryReconciliation();
      await expect(hook.result.current.retryReconciliation()).resolves.toEqual({ status: 'blocked' });
    });
    expect(reads).toHaveLength(3);
    expect(hook.result.current.state).toEqual({ status: 'reconciling', tasks: base });
    await read(2, false, encoded(sent()));
    await expect(retry).resolves.toMatchObject({ status: 'created', id: sent()[0].id });
    expect(hook.result.current.state.tasks).toEqual(sent());
    expect(writes).toHaveLength(1);
  });

  test('keeps unknown across failed rechecks and foreground transitions, then permits retry on base', async () => {
    const hook = await mounted();
    const first = await start(hook);
    await write(0, false, true);
    await read(1, true);
    await first.operation;
    // RN lifecycle events in a JS session; native OS/process behavior is E2E.
    await act(async () => {
      const appState = jest.requireMock('react-native/Libraries/AppState/AppState').default;
      appState.emit('background');
      appState.emit('active');
    });
    expect(AppState.currentState).toBe('active');
    await hook.rerender(undefined);
    expect(hook.result.current.state.status).toBe('outcomeUnknown');
    expect(reads).toHaveLength(2);
    let retry!: Promise<CreationResult>;
    await act(async () => { retry = hook.result.current.retryReconciliation(); });
    await read(2, true);
    await expect(retry).resolves.toMatchObject({ status: 'outcomeUnknown' });
    await act(async () => { retry = hook.result.current.retryReconciliation(); });
    await read(3);
    await expect(retry).resolves.toMatchObject({ status: 'saveError' });
    const next = await start(hook, 'B');
    await write(1, true, false);
    await next.operation;
    expect(sent(1)).toEqual([sent(1)[0], ...base]);
  });

  test('reconciles a missing key with the original empty snapshot', async () => {
    bytes = null;
    const hook = await renderHook(() => useTasks(taskStorage));
    await read(0);
    const first = await start(hook);
    await write(0, false, true);
    await read(1);
    await expect(first.operation).resolves.toMatchObject({ status: 'saveError' });
    expect(hook.result.current.state.tasks).toEqual([]);
    expect(bytes).toBeNull();
  });
});

describe('useTasks lifecycle generations', () => {
  test.each([false, true])('ignores old initial read success/error=%s after unmount', async (error) => {
    const old = await renderHook(() => useTasks(taskStorage));
    await old.unmount();
    const next = await renderHook(() => useTasks(taskStorage));
    await read(1);
    await read(0, error, encoded([]));
    expect(next.result.current.state).toEqual({ status: 'ready', tasks: base });
    expect(writes).toHaveLength(0);
    await expect(old.result.current.createTask('A')).resolves.toEqual({ status: 'inactive' });
  });

  test.each([[true, false], [true, true], [false, true]])('new owner waits for pending write; changed=%s rejection=%s never starts stale reconciliation', async (changed, error) => {
    const old = await mounted();
    const first = await start(old);
    await old.unmount();
    const next = await renderHook(() => useTasks(taskStorage));
    expect(reads).toHaveLength(1);
    expect(next.result.current.state.status).toBe('loading');
    await expect(next.result.current.createTask('B')).resolves.toEqual({ status: 'blocked' });
    await write(0, changed, error);
    await expect(first.operation).resolves.toEqual({ status: 'inactive' });
    // AsyncStorage batches multiGet on setImmediate after the write barrier.
    await waitFor(() => expect(reads).toHaveLength(2));
    await read(1);
    expect(next.result.current.state.tasks).toEqual(changed ? sent() : base);
    expect(writes).toHaveLength(1);
  });

  test.each(['sent', 'base', 'loadError'] as const)('new session after interrupted reconciliation loads %s without replay', async (outcome) => {
    const old = await mounted();
    const first = await start(old);
    await write(0, outcome !== 'base', true);
    expect(old.result.current.state.status).toBe('reconciling');
    await old.unmount();
    const next = await renderHook(() => useTasks(taskStorage));
    await read(2, outcome === 'loadError');
    expect(next.result.current.state).toEqual(outcome === 'loadError'
      ? { status: 'loadError', tasks: null }
      : { status: 'ready', tasks: outcome === 'sent' ? sent() : base });
    // Old completion must neither confirm nor initiate a save in the new session.
    await read(1, false, encoded(sent()));
    await expect(first.operation).resolves.toEqual({ status: 'inactive' });
    expect(next.result.current.state.status).toBe(outcome === 'loadError' ? 'loadError' : 'ready');
    expect(writes).toHaveLength(1);
    if (outcome === 'loadError') {
      await expect(next.result.current.createTask('B')).resolves.toEqual({ status: 'blocked' });
    }
  });

  test.each([false, true])('development Strict Mode replays setup/cleanup and ignores old rejection=%s', async (error) => {
    // RNTL's wrapper is below its root and does not enable effect replay in
    // this renderer. Enable root Strict Mode with the installed test-renderer.
    const root = createRoot({ isStrictMode: true });
    const loads: { resolve: (tasks: readonly Task[]) => void; reject: () => void }[] = [];
    const storage = {
      // Independent promises at TaskStorage's boundary: AsyncStorage batches
      // same-turn native reads, so native call counts cannot prove effect replay.
      load: jest.fn(() => new Promise<readonly Task[]>((resolve, reject) => {
        loads.push({ resolve, reject });
      })),
      save: taskStorage.save,
    };
    let value!: ReturnType<typeof useTasks>;
    function Harness() {
      const tasks = useTasks(storage);
      useEffect(() => { value = tasks; });
      return null;
    }
    await act(async () => { root.render(<Harness />); });
    // Assert actual effect replay, rather than assuming the renderer supports it.
    expect(loads).toHaveLength(2);
    await act(async () => { loads[1].resolve(base); });
    await act(async () => {
      if (error) loads[0].reject();
      else loads[0].resolve([]);
    });
    expect(value.state).toEqual({ status: 'ready', tasks: base });
    let first!: Promise<CreationResult>;
    await act(async () => { first = value.createTask('A'); });
    await write(0, true, false);
    await first;
    expect(value.state.tasks).toEqual(sent());
    expect(writes).toHaveLength(1);
    await act(async () => { root.unmount(); });
  });
});
