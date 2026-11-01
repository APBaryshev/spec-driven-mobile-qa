import { useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { TaskStorage } from './taskStorage';
import { type CreationResult, useTasks } from './useTasks';

const validationMessages = {
  required: 'Введите название задачи.',
  singleLine: 'Название должно быть в одну строку. Удалите переводы строк.',
  tooLong: 'Название должно содержать не более 100 символов.',
  idCollision: 'Не удалось подготовить задачу. Повторите создание.',
};

const statusMessages = {
  loading: 'Загрузка задач…',
  loadError: 'Не удалось загрузить задачи. Данные не изменены. Повторите загрузку.',
  ready: '',
  saving: 'Сохранение…',
  reconciling: 'Проверка результата сохранения…',
  saveError: 'Задача не сохранена. Исправьте название или повторите создание.',
  outcomeUnknown: 'Результат сохранения неизвестен. Название сохранено в форме. Повторите проверку, чтобы продолжить.',
};

function Action({ label, testID, disabled = false, busy = false, onPress }: {
  label: string; testID: string; disabled?: boolean; busy?: boolean; onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled, busy }} disabled={disabled}
      testID={testID} onPress={onPress}
      style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

/** The form owns only its draft/feedback. The hook owns all confirmed tasks and I/O. */
export function TasksScreen({ storage }: { storage: TaskStorage }) {
  const { state, canCreate, canEdit, createTask, retryLoad, retryReconciliation } = useTasks(storage);
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState('');
  const [invalid, setInvalid] = useState(false);
  const busy = ['loading', 'saving', 'reconciling'].includes(state.status);
  const error = invalid || ['loadError', 'saveError', 'outcomeUnknown'].includes(state.status);
  const message = feedback || statusMessages[state.status];

  function receive(result: CreationResult) {
    if (result.status === 'created') {
      setDraft('');
      setInvalid(false);
      setFeedback('Задача создана.');
    } else if (result.status === 'invalid') {
      setInvalid(true);
      setFeedback(validationMessages[result.error]);
    }
    // blocked/inactive and storage failures never discard the draft.
  }

  async function submit() {
    if (!canCreate) return;
    setFeedback('');
    setInvalid(false);
    receive(await createTask(draft));
  }

  const header = (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>TaskFlow</Text>
      <Text nativeID="task-title-label" style={styles.label}>Название задачи</Text>
      <TextInput accessibilityLabel="Название задачи" accessibilityLabelledBy="task-title-label"
        accessibilityHint="Одна строка, от 1 до 100 символов."
        accessibilityState={{ disabled: !canEdit }} testID="task-title-input"
        value={draft} editable={canEdit} multiline={false} returnKeyType="done"
        onChangeText={(text) => {
          if (!canEdit) return;
          setDraft(text);
          setFeedback('');
          setInvalid(false);
        }}
        onSubmitEditing={() => { void submit(); }} style={styles.input} />
      <Text style={styles.hint}>Одна строка, от 1 до 100 символов.</Text>
      <Action label="Создать задачу" testID="task-create-button" disabled={!canCreate}
        busy={busy}
        onPress={() => { void submit(); }} />
      <Text testID="task-status" accessibilityRole={message ? (error ? 'alert' : 'text') : undefined}
        accessible={message.length > 0} accessibilityLiveRegion="polite"
        style={[styles.message, error && styles.error]}>{message}</Text>
      {state.status === 'loadError' && (
        <Action label="Повторить загрузку" testID="task-retry-load-button"
          onPress={() => { void retryLoad(); }} />
      )}
      {state.status === 'outcomeUnknown' && (
        <Action label="Повторить проверку" testID="task-retry-reconciliation-button"
          onPress={() => { void retryReconciliation().then(receive); }} />
      )}
      {state.tasks !== null && <Text accessibilityRole="header" style={styles.listTitle}>Задачи</Text>}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <FlatList testID="task-list" accessibilityLabel="Список задач"
          style={styles.flex} contentContainerStyle={styles.content}
          data={state.tasks ?? []} keyExtractor={(task) => task.id}
          ListHeaderComponent={header}
          ListEmptyComponent={state.tasks !== null
            ? <Text testID="task-empty" style={styles.empty}>Пока нет задач. Создайте первую.</Text> : undefined}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text testID="task-title" style={styles.taskTitle}>{item.title}</Text>
            </View>
          )}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          removeClippedSubviews={false} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 20, paddingBottom: 32 },
  header: { gap: 12 },
  title: { fontSize: 30, fontWeight: '700', color: '#172435' },
  label: { fontSize: 18, fontWeight: '600', color: '#172435' },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#586779', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 18, color: '#172435', backgroundColor: '#ffffff' },
  hint: { fontSize: 14, color: '#465568' },
  button: { minHeight: 48, padding: 14, borderRadius: 8, backgroundColor: '#2059a0',
    alignItems: 'center', justifyContent: 'center' },
  disabled: { backgroundColor: '#526175' },
  pressed: { opacity: 0.8 },
  buttonText: { fontSize: 17, fontWeight: '600', color: '#ffffff', textAlign: 'center' },
  message: { fontSize: 16, color: '#33465c' },
  error: { color: '#982323' },
  listTitle: { fontSize: 22, fontWeight: '600', color: '#172435', marginTop: 8 },
  row: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#d7dfe8' },
  taskTitle: { fontSize: 18, color: '#172435', flexShrink: 1 },
  empty: { fontSize: 17, color: '#465568', paddingVertical: 24 },
});
