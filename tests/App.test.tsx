import { render, screen } from '@testing-library/react-native';

import App from '../App';

test('renders the TaskFlow foundation screen', async () => {
  await render(<App />);

  expect(screen.getByRole('header', { name: 'TaskFlow' })).toBeOnTheScreen();
  expect(screen.getByText('Основа приложения готова.')).toBeOnTheScreen();
});
