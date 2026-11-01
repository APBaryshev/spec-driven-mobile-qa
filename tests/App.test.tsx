import { render, screen } from '@testing-library/react-native';

import App from '../App';

jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-native-async-storage/async-storage/lib/commonjs/RCTAsyncStorage', () => ({
  multiGet: jest.fn((keys, callback) => callback(null, [[keys[0], null]])),
  multiSet: jest.fn(),
}));

test('wires the real screen, hook and stable storage in App', async () => {
  await render(<App />);

  expect(screen.getByRole('header', { name: 'TaskFlow' })).toBeOnTheScreen();
  expect(await screen.findByText('Пока нет задач. Создайте первую.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Создать задачу' })).toBeEnabled();
  await screen.rerender(<App />);
  const native = jest.requireMock('@react-native-async-storage/async-storage/lib/commonjs/RCTAsyncStorage');
  expect(native.multiGet).toHaveBeenCalledTimes(1);
});
