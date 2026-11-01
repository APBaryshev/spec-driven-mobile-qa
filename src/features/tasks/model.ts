export type Task = {
  readonly id: string;
  readonly title: string;
};

export type TitleValidation =
  | { readonly ok: true; readonly title: string }
  | {
      readonly ok: false;
      readonly input: string;
      readonly error: 'required' | 'singleLine' | 'tooLong';
    };

export function validateTaskTitle(input: string): TitleValidation {
  const title = input.trim();

  if (title.length === 0) {
    return { ok: false, input, error: 'required' };
  }

  // Check after trim: only internal line breaks are forbidden.
  if (/[\n\r\v\f\u0085\u2028\u2029]/u.test(title)) {
    return { ok: false, input, error: 'singleLine' };
  }

  if (Array.from(title).length > 100) {
    return { ok: false, input, error: 'tooLong' };
  }

  return { ok: true, title };
}

export type TaskPreparation =
  | { readonly ok: true; readonly tasks: readonly Task[] }
  | Extract<TitleValidation, { ok: false }>
  | { readonly ok: false; readonly input: string; readonly error: 'idCollision' };

// This is a candidate snapshot, not confirmation of a persisted creation.
export function prepareTask(
  previous: readonly Task[],
  input: string,
  generateId: () => string,
): TaskPreparation {
  const validation = validateTaskTitle(input);
  if (!validation.ok) {
    return validation;
  }

  const id = generateId();
  if (previous.some((task) => task.id === id)) {
    return { ok: false, input, error: 'idCollision' };
  }

  return { ok: true, tasks: [{ id, title: validation.title }, ...previous] };
}
