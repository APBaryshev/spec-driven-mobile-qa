import { prepareTask, type Task } from '../src/features/tasks/model';
import { generateTaskId } from '../src/features/tasks/taskId';

function preparedTasks(previous: readonly Task[], title: string): readonly Task[] {
  const result = prepareTask(previous, title, generateTaskId);
  if (!result.ok) {
    throw new Error(`Unexpected preparation error: ${result.error}`);
  }
  return result.tasks;
}

describe('TM-02 identity and TM-06 order', () => {
  test('allows identical titles with distinct UUID v4 IDs', () => {
    const first = preparedTasks([], 'Прочитать главу');
    const second = preparedTasks(first, 'Прочитать главу');

    expect(second.map((task) => task.title)).toEqual(['Прочитать главу', 'Прочитать главу']);
    const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(second[0].id).toMatch(uuidV4);
    expect(second[1].id).toMatch(uuidV4);
    expect(second[0].id).not.toBe(second[1].id);
    expect(second[1].id).toBe(first[0].id);
  });

  test('rejects an injected ID collision without changing previous tasks', () => {
    const existing = Object.freeze({ id: 'existing-id', title: 'Первая задача' });
    const previous = Object.freeze([existing]);
    const generateId = jest.fn(() => existing.id);
    const input = '  Новая задача  ';

    expect(prepareTask(previous, input, generateId)).toEqual({
      ok: false,
      input,
      error: 'idCollision',
    });
    expect(generateId).toHaveBeenCalledTimes(1);
    expect(previous).toEqual([{ id: 'existing-id', title: 'Первая задача' }]);
    expect(previous[0]).toBe(existing);
  });

  test('builds C, B, A without mutating earlier lists, tasks or IDs', () => {
    const empty = Object.freeze([]);
    const a = Object.freeze(preparedTasks(empty, 'A'));
    Object.freeze(a[0]);
    const b = Object.freeze(preparedTasks(a, 'B'));
    Object.freeze(b[0]);
    const c = preparedTasks(b, 'C');

    expect(empty).toEqual([]);
    expect(a.map((task) => task.title)).toEqual(['A']);
    expect(b.map((task) => task.title)).toEqual(['B', 'A']);
    expect(c.map((task) => task.title)).toEqual(['C', 'B', 'A']);
    expect(c).not.toBe(b);
    expect(c[1]).toBe(b[0]);
    expect(c[2]).toBe(a[0]);
    expect(new Set(c.map((task) => task.id)).size).toBe(3);
  });

  test('uses the normalized title in the candidate snapshot', () => {
    const result = prepareTask([], '  Купить  молоко  ', () => 'new-id');
    expect(result).toEqual({ ok: true, tasks: [{ id: 'new-id', title: 'Купить  молоко' }] });
  });

  test.each([
    ['', 'required'],
    ['  \t  ', 'required'],
    [`  ${'я'.repeat(101)}  `, 'tooLong'],
    ['  Вставленный\r\nтекст  ', 'singleLine'],
  ])('rejects invalid input %j without generating an ID or changing the list', (input, error) => {
    const previous = Object.freeze([Object.freeze({ id: 'stable-id', title: 'A' })]);
    const generateId = jest.fn(() => 'unused-id');

    expect(prepareTask(previous, input, generateId)).toEqual({ ok: false, input, error });
    expect(generateId).not.toHaveBeenCalled();
    expect(previous).toEqual([{ id: 'stable-id', title: 'A' }]);
  });
});
