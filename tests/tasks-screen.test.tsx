import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Task } from '../src/features/tasks/model';
import { TasksScreen } from '../src/features/tasks/TasksScreen';

jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('react-native-safe-area-context/jest/mock').default);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const base = [{ id: 'old', title: 'Ранее подтверждённая' }];
let reads: ReturnType<typeof deferred<readonly Task[]>>[];
let writes: { tasks: readonly Task[]; operation: ReturnType<typeof deferred<void>> }[];
let storage: { load: jest.Mock; save: jest.Mock };
const input = () => screen.getByLabelText('Название задачи');
const create = () => screen.getByRole('button', { name: 'Создать задачу' });
const titles = () => screen.queryAllByTestId('task-title').map((node) => node.props.children);

beforeEach(() => {
  reads = [];
  writes = [];
  storage = {
    load: jest.fn(() => {
      const operation = deferred<readonly Task[]>();
      reads.push(operation);
      return operation.promise;
    }),
    save: jest.fn((tasks: readonly Task[]) => {
      const operation = deferred<void>();
      writes.push({ tasks, operation });
      return operation.promise;
    }),
  };
});

async function mount() {
  await render(<SafeAreaProvider><TasksScreen storage={storage} /></SafeAreaProvider>);
}
async function read(index: number, tasks: readonly Task[] = base) {
  await act(async () => { reads[index].resolve(tasks); });
}
async function failRead(index: number) {
  await act(async () => { reads[index].reject(new Error('raw private read exception')); });
}
async function write(index: number, fail = false) {
  await act(async () => {
    if (fail) writes[index].operation.reject(new Error('raw private write exception'));
    else writes[index].operation.resolve();
  });
}
async function submit(text = '  Новая  ') {
  await fireEvent.changeText(input(), text);
  await fireEvent.press(create());
}
function locked(text: string) {
  expect(input()).toHaveDisplayValue(text);
  expect(input()).toHaveProp('accessibilityState', { disabled: true });
  expect(input()).toHaveProp('editable', false);
  expect(create()).toBeDisabled();
}

test('loading, empty and read error are distinct; only load error offers guarded reload', async () => {
  await mount();
  locked('');
  expect(screen.getByText('Загрузка задач…')).toBeOnTheScreen();
  expect(create()).toHaveProp('accessibilityState', expect.objectContaining({ busy: true }));
  expect(screen.queryByTestId('task-empty')).toBeNull();
  await fireEvent.press(create());
  await failRead(0);
  expect(screen.getByRole('alert')).toHaveTextContent(/Не удалось загрузить задачи/);
  expect(screen.queryByText(/raw private/)).toBeNull();
  expect(screen.queryByTestId('task-empty')).toBeNull();
  const retry = screen.getByRole('button', { name: 'Повторить загрузку' });
  expect(retry).toHaveProp('accessibilityState', { disabled: false, busy: false });
  await fireEvent.press(retry);
  expect(reads).toHaveLength(2);
  expect(screen.queryByTestId('task-retry-load-button')).toBeNull();
  await read(1, []);
  expect(screen.getByTestId('task-empty')).toBeOnTheScreen();
  expect(create()).toBeEnabled();
  expect(input()).toHaveProp('multiline', false);
  expect(input()).not.toHaveProp('maxLength');
  expect(storage.save).not.toHaveBeenCalled();
});

test('confirmed creates clear the draft, preserve duplicate titles and display newest first', async () => {
  await mount();
  await read(0, []);
  for (const [index, title] of ['A', 'A', 'C'].entries()) {
    await submit(`  ${title}  `);
    locked(`  ${title}  `);
    expect(titles()).toHaveLength(index);
    await write(index);
    expect(input()).toHaveDisplayValue('');
    expect(screen.getByText('Задача создана.')).toBeOnTheScreen();
  }
  expect(titles()).toEqual(['C', 'A', 'A']);
  expect(new Set(writes[2].tasks.map((task) => task.id)).size).toBe(3);
});

test.each(['', '  ', 'я'.repeat(101), 'A\nB', 'A\rB', 'A\r\nB', 'A\vB', 'A\fB', 'A\u0085B', 'A\u2028B', 'A\u2029B'])(
  'validation preserves the exact pasted input %j without writing', async (text) => {
    await mount();
    await read(0);
    await submit(text);
    expect(input()).toHaveDisplayValue(text);
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(create()).toBeEnabled();
    expect(titles()).toEqual([base[0].title]);
    expect(storage.save).not.toHaveBeenCalled();
    await fireEvent.changeText(input(), 'Исправлено');
    expect(screen.queryByRole('alert')).toBeNull();
  },
);

test('rapid button and keyboard submissions share the hook guard; slow saving and reconciliation retain the list', async () => {
  await mount();
  await read(0);
  await fireEvent.changeText(input(), '  Новая  ');
  const enter = input().props.onSubmitEditing;
  await act(async () => { enter(); enter(); enter(); });
  await fireEvent.press(create());
  expect(writes).toHaveLength(1);
  expect(reads).toHaveLength(1);
  locked('  Новая  ');
  expect(create()).toHaveProp('accessibilityState', expect.objectContaining({ busy: true }));
  expect(screen.getByText('Сохранение…')).toHaveProp('accessibilityLiveRegion', 'polite');
  expect(titles()).toEqual([base[0].title]);
  await fireEvent.changeText(input(), 'Нельзя изменить');
  expect(input()).toHaveDisplayValue('  Новая  ');
  await write(0, true);
  expect(screen.getByText('Проверка результата сохранения…')).toBeOnTheScreen();
  locked('  Новая  ');
  expect(titles()).toEqual([base[0].title]);
  expect(screen.queryByTestId('task-retry-reconciliation-button')).toBeNull();
  await read(1, writes[0].tasks);
  expect(titles()).toEqual(['Новая', base[0].title]);
  expect(input()).toHaveDisplayValue('');
  expect(writes).toHaveLength(1);
});

test.each([false, true])('proven absence permits correction=%s and explicit creation retry', async (correct) => {
  await mount();
  await read(0);
  await submit();
  await write(0, true);
  await read(1);
  expect(screen.getByRole('alert')).toHaveTextContent(/Задача не сохранена/);
  expect(input()).toHaveDisplayValue('  Новая  ');
  expect(create()).toBeEnabled();
  expect(input()).toHaveProp('editable', true);
  expect(screen.queryByTestId('task-retry-reconciliation-button')).toBeNull();
  if (correct) await fireEvent.changeText(input(), 'Другая');
  await fireEvent.press(create());
  expect(writes[1].tasks[0].title).toBe(correct ? 'Другая' : 'Новая');
  if (!correct) expect(writes[1].tasks).toEqual(writes[0].tasks);
  await write(1);
  expect(titles()).toEqual([correct ? 'Другая' : 'Новая', base[0].title]);
  expect(input()).toHaveDisplayValue('');
});

test.each(['sent', 'base'] as const)('unknown result retries only reading, then accepts %s', async (outcome) => {
  await mount();
  await read(0);
  await submit();
  await write(0, true);
  await failRead(1);
  locked('  Новая  ');
  expect(screen.getByRole('alert')).toHaveTextContent(/Результат сохранения неизвестен/);
  expect(screen.queryByTestId('task-retry-load-button')).toBeNull();
  expect(screen.queryByText(/raw private/)).toBeNull();
  await fireEvent.press(create());
  const retry = screen.getByRole('button', { name: 'Повторить проверку' });
  expect(retry).toHaveProp('accessibilityState', { disabled: false, busy: false });
  await fireEvent.press(retry);
  expect(reads).toHaveLength(3);
  locked('  Новая  ');
  expect(titles()).toEqual([base[0].title]);
  await failRead(2);
  locked('  Новая  ');
  await fireEvent.press(screen.getByRole('button', { name: 'Повторить проверку' }));
  await read(3, outcome === 'sent' ? writes[0].tasks : base);
  expect(storage.save).toHaveBeenCalledTimes(1);
  expect(create()).toBeEnabled();
  expect(input()).toHaveDisplayValue(outcome === 'sent' ? '' : '  Новая  ');
  expect(titles()).toEqual(outcome === 'sent' ? ['Новая', base[0].title] : [base[0].title]);
});

test('long titles are untruncated in a virtualized scrollable list with the form in its header', async () => {
  await mount();
  const long = 'я'.repeat(99) + '😀';
  const tasks = Array.from({ length: 40 }, (_, index) => ({ id: `${index}`, title: index === 0 ? long : `Задача ${index}` }));
  await read(0, tasks);
  expect(screen.getByText(long)).not.toHaveProp('numberOfLines');
  expect(screen.getByText(long)).not.toHaveProp('allowFontScaling', false);
  const list = screen.getByTestId('task-list');
  expect(list).toHaveProp('keyboardShouldPersistTaps', 'handled');
  expect(list).not.toHaveProp('scrollEnabled', false);
  expect(screen.getByRole('header', { name: 'TaskFlow' })).toBeOnTheScreen();
  // Layout, real scrolling, keyboard and TalkBack still require Android checks.
});

test('an inactive completion cannot clear a new screen draft', async () => {
  await mount();
  await read(0);
  await submit();
  await screen.unmount();
  await mount();
  await write(0);
  await read(1);
  await fireEvent.changeText(input(), 'Новый черновик');
  expect(input()).toHaveDisplayValue('Новый черновик');
  expect(writes).toHaveLength(1);
});
