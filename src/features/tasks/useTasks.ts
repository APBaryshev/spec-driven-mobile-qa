import { useEffect, useReducer, useRef } from 'react';

import { prepareTask, type Task, type TaskPreparation } from './model';
import { generateTaskId } from './taskId';
import type { TaskStorage } from './taskStorage';

type LoadedStatus = 'ready' | 'saving' | 'reconciling' | 'saveError' | 'outcomeUnknown';
export type TasksState =
  | { readonly status: 'loading' | 'loadError'; readonly tasks: null }
  | { readonly status: LoadedStatus; readonly tasks: readonly Task[] };

type Action =
  | { type: 'loading' | 'loadError' }
  | { type: 'confirmed'; tasks: readonly Task[] }
  | { type: 'phase'; status: LoadedStatus };

function reducer(state: TasksState, action: Action): TasksState {
  switch (action.type) {
    case 'loading':
    case 'loadError':
      return { status: action.type, tasks: null };
    case 'confirmed':
      return { status: 'ready', tasks: action.tasks };
    case 'phase':
      return state.tasks === null ? state : { status: action.status, tasks: state.tasks };
  }
}

type Attempt = {
  readonly input: string;
  readonly id: string;
  readonly base: readonly Task[];
  readonly sent: readonly Task[];
};

export type CreationResult =
  | { readonly status: 'created'; readonly input: string; readonly id: string }
  | { readonly status: 'saveError' | 'outcomeUnknown'; readonly input: string }
  | { readonly status: 'invalid'; readonly input: string;
      readonly error: Extract<TaskPreparation, { ok: false }>['error'] }
  | { readonly status: 'blocked' | 'inactive' };

type Session = {
  active: boolean;
  busy: boolean;
  state: TasksState;
  attempt?: Attempt;
  storage: TaskStorage;
};

// A cleanup cannot cancel native I/O. A replacement owner waits for settlement
// before loading. This is a write barrier, not an operation queue; simultaneous
// mounted owners/external writers for the same persistent key are unsupported.
const pendingWrites = new WeakMap<TaskStorage, Promise<void>>();

function sameSnapshot(a: readonly Task[], b: readonly Task[]): boolean {
  // TaskStorage validates the v1 envelope and records before returning tasks.
  return a.length === b.length && a.every((task, index) =>
    task.id === b[index].id && task.title === b[index].title);
}

/** One owner per storage/key. Keep storage identity stable for the session.
 * The form owns its draft: clear it only for a `created` result. All other
 * results preserve input. canEdit/canCreate freeze it until the outcome is known.
 * No background/foreground listener, automatic retry, timeout or cleanup write.
 */
export function useTasks(storage: TaskStorage) {
  const [state, dispatch] = useReducer(reducer, { status: 'loading', tasks: null });
  const current = useRef<Session | null>(null);

  function send(session: Session, action: Action) {
    if (!session.active) return;
    // Update synchronously as well as rendering: consecutive events must see
    // the latest confirmed list and guards even before React commits a render.
    session.state = reducer(session.state, action);
    dispatch(action);
  }

  async function load(session: Session) {
    if (!session.active || session.busy) return;
    session.busy = true;
    send(session, { type: 'loading' });
    try {
      const pending = pendingWrites.get(session.storage);
      if (pending) await pending;
      if (!session.active) return;
      const tasks = await session.storage.load();
      if (session.active) send(session, { type: 'confirmed', tasks });
    } catch {
      send(session, { type: 'loadError' });
    } finally {
      session.busy = false;
    }
  }

  useEffect(() => {
    const session: Session = {
      active: true, busy: false, state: { status: 'loading', tasks: null }, storage,
    };
    current.current = session;
    void load(session);
    return () => { session.active = false; };
    // Each setup has an independent token, including Strict Mode effect replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage]);

  async function reconcile(session: Session, attempt: Attempt): Promise<CreationResult> {
    send(session, { type: 'phase', status: 'reconciling' });
    try {
      const tasks = await session.storage.load();
      if (!session.active) return { status: 'inactive' };
      if (sameSnapshot(tasks, attempt.sent)) {
        send(session, { type: 'confirmed', tasks: attempt.sent });
        session.attempt = undefined;
        return { status: 'created', input: attempt.input, id: attempt.id };
      }
      if (sameSnapshot(tasks, attempt.base)) {
        send(session, { type: 'phase', status: 'saveError' });
        return { status: 'saveError', input: attempt.input };
      }
    } catch {
      if (!session.active) return { status: 'inactive' };
    }
    send(session, { type: 'phase', status: 'outcomeUnknown' });
    return { status: 'outcomeUnknown', input: attempt.input };
  }

  async function createTask(input: string): Promise<CreationResult> {
    const session = current.current;
    if (!session?.active) return { status: 'inactive' };
    if (session.busy || !['ready', 'saveError'].includes(session.state.status) ||
      session.state.tasks === null) return { status: 'blocked' };

    let attempt = session.attempt;
    if (!attempt || attempt.input !== input) {
      const prepared = prepareTask(session.state.tasks, input, generateTaskId);
      if (!prepared.ok) return { status: 'invalid', input, error: prepared.error };
      attempt = { input, id: prepared.tasks[0].id, base: session.state.tasks, sent: prepared.tasks };
    }
    session.attempt = attempt;
    session.busy = true; // Before the first await and before invoking storage.
    send(session, { type: 'phase', status: 'saving' });
    try {
      // Capture synchronous exceptions too. The barrier always settles without
      // rejection, while saving retains the original success/failure outcome.
      const saving = (async () => { await session.storage.save(attempt.sent); })();
      const barrier = saving.then(() => {}, () => {});
      pendingWrites.set(session.storage, barrier);
      try {
        await saving;
      } finally {
        if (pendingWrites.get(session.storage) === barrier) pendingWrites.delete(session.storage);
      }
      if (!session.active) return { status: 'inactive' };
      send(session, { type: 'confirmed', tasks: attempt.sent });
      session.attempt = undefined;
      return { status: 'created', input, id: attempt.id };
    } catch {
      if (!session.active) return { status: 'inactive' };
      return await reconcile(session, attempt);
    } finally {
      session.busy = false;
    }
  }

  async function retryReconciliation(): Promise<CreationResult> {
    const session = current.current;
    if (!session?.active) return { status: 'inactive' };
    if (session.busy || session.state.status !== 'outcomeUnknown' || !session.attempt) {
      return { status: 'blocked' };
    }
    session.busy = true;
    try {
      return await reconcile(session, session.attempt);
    } finally {
      session.busy = false;
    }
  }

  async function retryLoad(): Promise<void> {
    const session = current.current;
    if (session?.active && session.state.status === 'loadError') await load(session);
  }

  const canCreate = state.status === 'ready' || state.status === 'saveError';
  return { state, canCreate, canEdit: canCreate, createTask, retryLoad, retryReconciliation };
}
