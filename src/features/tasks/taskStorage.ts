import AsyncStorage from '@react-native-async-storage/async-storage';

import { type Task, validateTaskTitle } from './model';

export interface TaskStorage {
  load(): Promise<readonly Task[]>;
  save(tasks: readonly Task[]): Promise<void>;
}

export type TaskStorageErrorCategory = 'read' | 'write' | 'format';

// Never retain the underlying exception: it may contain the entire snapshot.
export class TaskStorageError extends Error {
  constructor(readonly category: TaskStorageErrorCategory) {
    super(`Task storage ${category} failed`);
    this.name = 'TaskStorageError';
  }
}

const STORAGE_KEY = 'taskflow.tasks';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkedTasks(value: unknown): readonly Task[] {
  if (!Array.isArray(value)) {
    throw new TaskStorageError('format');
  }

  const ids = new Set<string>();
  return value.map((task: unknown) => {
    if (
      !isRecord(task) ||
      Object.keys(task).length !== 2 ||
      typeof task.id !== 'string' ||
      task.id.trim().length === 0 ||
      typeof task.title !== 'string' ||
      ids.has(task.id)
    ) {
      throw new TaskStorageError('format');
    }
    const validation = validateTaskTitle(task.title);
    // Stored titles must already be normalized; never silently repair data.
    if (!validation.ok || validation.title !== task.title) {
      throw new TaskStorageError('format');
    }
    ids.add(task.id);
    return { id: task.id, title: task.title };
  });
}

export const taskStorage: TaskStorage = {
  async load() {
    let entries: readonly [string, string | null][];
    try {
      // getItem in 2.2.0 coerces an empty string to null. multiGet preserves
      // those corrupt bytes so that they cannot masquerade as a missing key.
      entries = await AsyncStorage.multiGet([STORAGE_KEY]);
    } catch {
      throw new TaskStorageError('read');
    }
    if (entries.length !== 1 || entries[0][0] !== STORAGE_KEY) {
      throw new TaskStorageError('format');
    }
    const raw = entries[0][1];
    if (raw === null) {
      return [];
    }
    if (typeof raw !== 'string') {
      throw new TaskStorageError('format');
    }

    let snapshot: unknown;
    try {
      snapshot = JSON.parse(raw);
    } catch {
      throw new TaskStorageError('format');
    }
    if (
      !isRecord(snapshot) ||
      Object.keys(snapshot).length !== 2 ||
      snapshot.schemaVersion !== 1
    ) {
      throw new TaskStorageError('format');
    }
    return checkedTasks(snapshot.tasks);
  },

  async save(tasks) {
    const snapshot = JSON.stringify({ schemaVersion: 1, tasks: checkedTasks(tasks) });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, snapshot);
    } catch {
      // Rejection says nothing about whether the value actually changed.
      throw new TaskStorageError('write');
    }
  },
};
