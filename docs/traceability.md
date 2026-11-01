# Прослеживаемость TaskFlow

Источник требований: [task-management/spec.md](../openspec/changes/task-management-foundation/specs/task-management/spec.md).
Область этого отчёта — задачи 2.1–2.3 [плана](../openspec/changes/task-management-foundation/tasks.md).
«Пройдено, unit» означает проверку правил модели в Jest, а не готовность всего
пользовательского сценария. UI, постоянное хранение и Android E2E здесь не проверены.

## TM-01 — проверка названия

Все названия тестов ниже находятся в suite `TM-01 title validation`, кроме явно
указанных тестов подготовки снимка из suite `TM-02 identity and TM-06 order`.

| Сценарий спецификации | Конкретный тест | Фактический результат |
| --- | --- | --- |
| Название с пробелами по краям | [trims ECMAScript whitespace at the edges and preserves internal spaces](../tests/task-model.test.ts#L11); [uses the normalized title in the candidate snapshot](../tests/task-creation.test.ts#L59) | Пройдено, unit: `Купить  молоко`, внутренние пробелы сохранены |
| Пустое название | [rejects empty or whitespace-only input %j and preserves it](../tests/task-model.test.ts#L4); [rejects invalid input %j without generating an ID or changing the list](../tests/task-creation.test.ts#L64) | Пройдено, unit: пустой/пробельный ввод возвращается с `required`, ID и задача не создаются |
| Границы допустимой длины | [accepts %i code points after trimming](../tests/task-model.test.ts#L25) | Пройдено, unit: 1 и 100 кодовых точек после trim принимаются |
| Превышение длины | [rejects 101 code points without truncating the original input](../tests/task-model.test.ts#L30); [rejects invalid input %j without generating an ID or changing the list](../tests/task-creation.test.ts#L64) | Пройдено, unit: 101 отклоняется с `tooLong`, исходный ввод и предыдущий список сохранены |
| Символ за пределами базовой многоязычной плоскости | [accepts 99 letters plus an emoji as 100 code points](../tests/task-model.test.ts#L35) | Пройдено, unit: 99 букв + 😀 принимаются |
| Внутренний перевод строки | [rejects pasted internal %s without removing or replacing input](../tests/task-model.test.ts#L51); [rejects invalid input %j without generating an ID or changing the list](../tests/task-creation.test.ts#L64) | Пройдено, unit: LF/CR/CRLF/VT/FF/NEL/LS/PS во вставленном тексте отклоняются с `singleLine`, возвращается точный исходный ввод |

Дополнительные проверки согласованных правил:

| Правило | Конкретный тест | Фактический результат |
| --- | --- | --- |
| Без изменения регистра и Unicode-нормализации, внутренние табы сохранены | [preserves case, internal tabs and Unicode representation](../tests/task-model.test.ts#L18) | Пройдено, unit |
| Кодовые точки вместо UTF-16 units | [counts astral characters as code points rather than UTF-16 units](../tests/task-model.test.ts#L40) | Пройдено, unit: 100 emoji приняты, 101 отклонён |
| Кодовые точки вместо графем | [counts combining sequences as code points rather than graphemes](../tests/task-model.test.ts#L46) | Пройдено, unit: 51 сочетание `e` + combining acute — 102 точки, отклонено |
| trim следует ECMAScript, NEL не удаляется по краям | [does not trim NEL because ECMAScript trim does not treat it as whitespace](../tests/task-model.test.ts#L65) | Пройдено, unit: NEL отклонён |

Не проверено: понятные текстовые ошибки в форме, сохранность текста в поле,
вставка через нативный TextInput, однострочная конфигурация поля, отсутствие
подтверждённой строки UI при ошибке. Это проверки задач 5.1–5.2 и 6.2;
модель пока возвращает категорию ошибки и полный исходный ввод.

## TM-02 — независимая идентичность

Suite: `TM-02 identity and TM-06 order`.

| Сценарий / инвариант | Конкретный тест | Фактический результат |
| --- | --- | --- |
| Два одинаковых названия — создание отдельных задач | [allows identical titles with distinct UUID v4 IDs](../tests/task-creation.test.ts#L13) | Пройдено, unit: два одинаковых названия, два разных UUID v4; первый ID сохранён |
| Искусственная коллизия генератора с существующим ID (design, задача 2.2) | [rejects an injected ID collision without changing previous tasks](../tests/task-creation.test.ts#L25) | Пройдено, unit: `idCollision`, исходный ввод/список/задача сохранены, повторной генерации в цикле нет |
| Стабильность существующих ID при добавлении | [builds C, B, A without mutating earlier lists, tasks or IDs](../tests/task-creation.test.ts#L41) | Пройдено, unit: сохранены прежние объекты задач и их ID, включая замороженные входы |

Используется [generateTaskId](../src/features/tasks/taskId.ts), вызывающий `uuid.v4()`
из уже установленного Expo 58.0.22. В тесте одинаковых названий вызывается этот
генератор без собственного mock; в тесте коллизии передаётся контролируемый генератор.
[model.ts](../src/features/tasks/model.ts) не импортирует Expo или нативные API.
Тесты подтверждают проверяемые инварианты, но не математическую невозможность
случайного совпадения UUID. Коллизия отклоняется до построения нового снимка.

Не проверено: часть сценария «Два одинаковых названия» после повторного запуска,
round trip хранения, нативный UUID runtime Android и согласование после ошибок
записи. Это задачи 3.1, 4.3–4.4 и группа 6. Внутренние ID после восстановления
будут проверяться unit/integration, без технического вывода ID в UI.

## TM-06 — просмотр и порядок

| Сценарий спецификации | Конкретный тест / будущая проверка | Фактический результат |
| --- | --- | --- |
| Последовательное создание | [builds C, B, A without mutating earlier lists, tasks or IDs](../tests/task-creation.test.ts#L41) | Пройдено, unit: следующие снимки A → B,A → C,B,A; прежние массивы не изменены |
| Последовательное создание — сохранение и отображение | Integration/UI/E2E из групп 3–6 | Не проверено |
| Первый запуск без задач | Загрузка и пустое состояние из задач 4.1, 5.1, 6.2 | Не проверено |
| Просмотр длинного списка | UI, прокрутка, читаемость названия в 100 точек из задач 5.1, 5.3 и группы 6 | Не проверено |

`prepareTask` возвращает кандидат следующего списка: новая задача сверху,
существующие задачи сохраняют порядок и идентичность. Публикация после
подтверждения постоянной записи относится к следующим группам (TM-03).

TM-03–TM-05 и TM-07–TM-12 в этой сессии не проверены; их реализация и
прослеживаемость остаются в соответствующих незавершённых задачах плана.

## Выполненный прогон

2026-11-01, macOS arm64, Node **26.13.0**, npm **11.17.0**.
Использованы установленные зависимости из существующего lockfile; manifest и
lockfile не изменены, новых зависимостей нет. Все данные тестов синтетические.

| Команда | Фактический результат |
| --- | --- |
| `npm test -- --watch=false --runTestsByPath tests/task-model.test.ts` | Exit 0, 1 suite / 20 tests passed (2.1) |
| `npm test -- --watch=false` | Exit 0, 3 suites / 29 tests passed: 20 правил названия, 8 подготовки задач, 1 регрессия минимального экрана |
| `npm run typecheck` | Exit 0, strict TypeScript |
| `npm run lint` | Exit 0, без предупреждений |
| Проверка относительных Markdown-ссылок скриптом Python (`Path.is_file`, диапазоны `#L`) | 22 ссылки разрешаются, ссылки на строки в пределах файлов |
| `openspec validate task-management-foundation --strict` | Exit 0, change valid |
| `git diff --check` | Exit 0 |

Это проверка исходников в Jest. Android-сборка, эмулятор, AsyncStorage,
useTasks и UI создания не запускались и не реализовывались в этой сессии.
