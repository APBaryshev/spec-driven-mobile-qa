import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TasksScreen } from './src/features/tasks/TasksScreen';
import { taskStorage } from './src/features/tasks/taskStorage';

export default function App() {
  return (
    <SafeAreaProvider>
      <TasksScreen storage={taskStorage} />
    </SafeAreaProvider>
  );
}
