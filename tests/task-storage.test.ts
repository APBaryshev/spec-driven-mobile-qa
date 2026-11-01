import { prepareTask, type Task } from '../src/features/tasks/model';
import { taskStorage, TaskStorageError } from '../src/features/tasks/taskStorage';

// Control only native key-value I/O; TaskFlow serialization and AsyncStorage JS execute normally.
// Internal RCTAsyncStorage path depends on package layout; recheck when upgrading AsyncStorage.
jest.mock('@react-native-async-storage/async-storage/lib/commonjs/RCTAsyncStorage', () => ({
  multiGet: jest.fn(),
  multiSet: jest.fn(),
}));

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
const tasks: readonly Task[] = Object.freeze([
  Object.freeze({ id: 'id-c', title: 'Прочитать главу' }),
  Object.freeze({ id: 'id-b', title: 'Прочитать главу' }),
  Object.freeze({ id: 'id-a', title: 'A\t e\u0301  😀' }),
]);
const encoded = (value: unknown) => JSON.stringify({ schemaVersion: 1, tasks: value });
let values: Map<string, string>;

beforeEach(() => {
  jest.clearAllMocks();
  values = new Map();
  native.multiGet.mockImplementation((keys, callback) => {
    callback(null, keys.map((name) => [name, values.get(name) ?? null]));
  });
  native.multiSet.mockImplementation((entries, callback) => {
    entries.forEach(([name, value]) => values.set(name, value));
    callback();
  });
});

async function expectSafeError(operation: Promise<unknown>, category: string, secrets: string[]) {
  const error: unknown = await operation.catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(TaskStorageError);
  expect(error).toMatchObject({ name: 'TaskStorageError', category });
  expect((error as Error).message).toBe(`Task storage ${category} failed`);
  expect(error).not.toHaveProperty('cause');
  const diagnostic = [String(error), JSON.stringify(error), (error as Error).stack].join('\n');
  for (const secret of secrets) {
    expect(diagnostic).not.toContain(secret);
  }
}

describe('TaskStorage v1 integration', () => {
  test('loads a missing key as empty without writing', async () => {
    await expect(taskStorage.load()).resolves.toEqual([]);
    expect(native.multiGet).toHaveBeenCalledWith([key], expect.any(Function));
    expect(native.multiSet).not.toHaveBeenCalled();
    expect(values.size).toBe(0);
  });

  test('round trips exact IDs, duplicate titles, Unicode and order through v1', async () => {
    await taskStorage.save(tasks);
    expect(native.multiSet).toHaveBeenCalledTimes(1);
    expect([...values]).toEqual([[key, encoded(tasks)]]);
    const restored = await taskStorage.load();
    expect(restored).toEqual(tasks);
    expect(restored).not.toBe(tasks);
    expect(restored[0]).not.toBe(tasks[0]);
    expect(tasks[0].id).toBe('id-c');
  });

  test('replaces the complete snapshot including an explicit empty snapshot', async () => {
    values.set(key, encoded(tasks));
    await taskStorage.save([tasks[2]]);
    await expect(taskStorage.load()).resolves.toEqual([tasks[2]]);
    await taskStorage.save([]);
    expect(values.get(key)).toBe(encoded([]));
    await expect(taskStorage.load()).resolves.toEqual([]);
  });

  test('persists model snapshots A then B then C without losing previous tasks', async () => {
    let previous: readonly Task[] = [];
    for (const title of ['A', 'B', 'C']) {
      const candidate = prepareTask(previous, title, () => `id-${title}`);
      if (!candidate.ok) throw new Error('Unexpected invalid fixture');
      await taskStorage.save(candidate.tasks);
      previous = await taskStorage.load();
      expect(previous).toEqual(candidate.tasks);
    }
    expect(previous).toEqual([
      { id: 'id-C', title: 'C' }, { id: 'id-B', title: 'B' }, { id: 'id-A', title: 'A' },
    ]);
  });

  test('keeps save pending before and after value change until native completion', async () => {
    let finish!: WriteCallback;
    let entries!: [string, string][];
    native.multiSet.mockImplementation((sent, callback) => {
      entries = sent;
      finish = callback;
    });
    let settled = false;
    const saving = taskStorage.save(tasks).then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(values.has(key)).toBe(false);
    entries.forEach(([name, value]) => values.set(name, value));
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();
    await saving;
    expect(settled).toBe(true);
    expect(values.get(key)).toBe(encoded(tasks));
    expect(native.multiSet).toHaveBeenCalledTimes(1);
    expect(native.multiGet).not.toHaveBeenCalled();
  });

  test.each([false, true])('rejects completed write with changed value = %s and performs no retry or read', async (changed) => {
    const original = encoded([tasks[2]]);
    values.set(key, original);
    let finish!: WriteCallback;
    native.multiSet.mockImplementation((entries, callback) => {
      if (changed) entries.forEach(([name, value]) => values.set(name, value));
      finish = callback;
    });
    let settled = false;
    const result = taskStorage.save(tasks).catch((error: unknown) => {
      settled = true;
      return error;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish([{ message: `sensitive-token ${encoded(tasks)}` }]);
    await expectSafeError(result.then((error) => Promise.reject(error)), 'write', [
      'sensitive-token', tasks[0].title, encoded(tasks),
    ]);
    const completedValue = changed ? encoded(tasks) : original;
    expect(values.get(key)).toBe(completedValue);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(values.get(key)).toBe(completedValue);
    expect(native.multiSet).toHaveBeenCalledTimes(1);
    expect(native.multiGet).not.toHaveBeenCalled();
  });

  test('waits for read completion without returning a fabricated empty list', async () => {
    let finish!: ReadCallback;
    native.multiGet.mockImplementation((_, callback) => { finish = callback; });
    let settled = false;
    const loading = taskStorage.load().then((result) => { settled = true; return result; });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    finish(null, [[key, encoded(tasks)]]);
    await expect(loading).resolves.toEqual(tasks);
    expect(native.multiSet).not.toHaveBeenCalled();
  });

  test('read failure preserves bytes and a later explicit load restores them', async () => {
    const original = encoded(tasks);
    values.set(key, original);
    native.multiGet.mockImplementationOnce((_, callback) => {
      callback([{ message: `sensitive-token ${original}` }]);
    });
    await expectSafeError(taskStorage.load(), 'read', ['sensitive-token', tasks[0].title, original]);
    expect(values.get(key)).toBe(original);
    expect(native.multiGet).toHaveBeenCalledTimes(1);
    expect(native.multiSet).not.toHaveBeenCalled();
    await expect(taskStorage.load()).resolves.toEqual(tasks);
    expect(native.multiSet).not.toHaveBeenCalled();
  });

  test('sanitizes synchronous native write exceptions', async () => {
    values.set(key, encoded(tasks));
    const fail = () => { throw new Error(`sensitive-token ${encoded(tasks)}`); };
    native.multiSet.mockImplementationOnce(fail);
    await expectSafeError(taskStorage.save(tasks), 'write',
      ['sensitive-token', tasks[0].title, encoded(tasks)]);
    expect(values.get(key)).toBe(encoded(tasks));
  });
});

const invalidSnapshots: [string, string][] = [
  ['invalid JSON with private content', `{"private":"sensitive-token ${tasks[0].title}"`],
  ['empty string', ''],
  ['null envelope', 'null'],
  ['array envelope', '[]'],
  ['primitive envelope', '42'],
  ['missing version', JSON.stringify({ tasks })],
  ['unknown version', JSON.stringify({ schemaVersion: 2, tasks })],
  ['string version', JSON.stringify({ schemaVersion: '1', tasks })],
  ['missing tasks', '{"schemaVersion":1}'],
  ['null tasks', encoded(null)],
  ['object tasks', encoded({})],
  ['extra envelope field', JSON.stringify({ schemaVersion: 1, tasks, extra: true })],
  ['null task', encoded([tasks[0], null])],
  ['array task', encoded([[]])],
  ['primitive task', encoded([42])],
  ['missing ID', encoded([{ title: 'A' }])],
  ['non-string ID', encoded([{ id: 42, title: 'A' }])],
  ['empty ID', encoded([{ id: '', title: 'A' }])],
  ['blank ID', encoded([{ id: '  ', title: 'A' }])],
  ['missing title', encoded([{ id: 'a' }])],
  ['non-string title', encoded([{ id: 'a', title: 42 }])],
  ['extra task field', encoded([{ ...tasks[0], extra: true }])],
  ['duplicate IDs with different titles', encoded([tasks[0], { ...tasks[0], title: 'Other' }])],
  ...['', '  ', ' A ', 'я'.repeat(101), '😀'.repeat(101),
    ...['\n', '\r', '\r\n', '\v', '\f', '\u0085', '\u2028', '\u2029'].map((s) => `A${s}B`),
  ].map((title, index): [string, string] => [`invalid title ${index}`, encoded([{ id: 'a', title }])]),
];

describe('TaskStorage integrity and safe diagnostics', () => {
  test.each(invalidSnapshots)('rejects %s without deleting, skipping or rewriting data', async (_, raw) => {
    values.set(key, raw);
    await expectSafeError(taskStorage.load(), 'format', [
      'sensitive-token', tasks[0].title, ...(raw.length > 2 ? [raw] : []),
    ]);
    expect(values.get(key)).toBe(raw);
    expect(values.size).toBe(1);
    expect(native.multiSet).not.toHaveBeenCalled();
    expect(native.multiGet).toHaveBeenCalledTimes(1);
  });

  test('rejects invalid outgoing tasks before I/O and preserves the previous snapshot', async () => {
    values.set(key, encoded(tasks));
    await expectSafeError(taskStorage.save([tasks[0], tasks[0]]), 'format', [tasks[0].title]);
    expect(values.get(key)).toBe(encoded(tasks));
    expect(native.multiSet).not.toHaveBeenCalled();
  });

  test.each(['A', 'я'.repeat(99) + '😀', '😀'.repeat(100)])('restores valid title boundaries exactly: %#', async (title) => {
    const expected = [{ id: 'stable-id', title }];
    values.set(key, encoded(expected));
    await expect(taskStorage.load()).resolves.toEqual(expected);
    expect(native.multiSet).not.toHaveBeenCalled();
  });
});
