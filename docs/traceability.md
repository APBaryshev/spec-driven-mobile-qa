# Прослеживаемость TaskFlow

Источник требований: [task-management/spec.md](../openspec/changes/task-management-foundation/specs/task-management/spec.md).
Область этого отчёта — задачи 2.1–2.3 и 3.1–3.3 [плана](../openspec/changes/task-management-foundation/tasks.md).
«Пройдено, unit» означает проверку правил модели в Jest, а не готовность всего
пользовательского сценария. «Пройдено, integration» для хранения означает настоящую
сериализацию и JS-обёртку AsyncStorage с управляемым нативным key-value I/O.
UI задач и нативная сохранность Android E2E здесь не проверены.

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

Round trip хранения проверен ниже. Не проверено: часть сценария «Два одинаковых
названия» после нативного повторного запуска, нативный UUID runtime Android и
согласование после ошибок записи. Это задачи 4.3–4.4 и группа 6. Внутренние ID
проверяются unit/integration, без технического вывода ID в UI.

## TM-06 — просмотр и порядок

| Сценарий спецификации | Конкретный тест / будущая проверка | Фактический результат |
| --- | --- | --- |
| Последовательное создание | [builds C, B, A without mutating earlier lists, tasks or IDs](../tests/task-creation.test.ts#L41) | Пройдено, unit: следующие снимки A → B,A → C,B,A; прежние массивы не изменены |
| Последовательное создание — хранение | `persists model snapshots A then B then C without losing previous tasks` в [task-storage.test.ts](../tests/task-storage.test.ts#L82) | Пройдено, integration: модель + сериализация, C/B/A, все ID и названия |
| Последовательное создание — отображение | UI/E2E из групп 4–6 | Не проверено |
| Первый запуск без задач — хранение | `loads a missing key as empty without writing` в [task-storage.test.ts](../tests/task-storage.test.ts#L55) | Пройдено, integration: пустой результат, без записи |
| Первый запуск без задач — экран | Загрузка и пустое состояние из задач 4.1, 5.1, 6.2 | Не проверено |
| Просмотр длинного списка | UI, прокрутка, читаемость названия в 100 точек из задач 5.1, 5.3 и группы 6 | Не проверено |

`prepareTask` возвращает кандидат следующего списка: новая задача сверху,
существующие задачи сохраняют порядок и идентичность. Публикация после
подтверждения постоянной записи относится к следующим группам (TM-03).

## Хранение: TM-02, TM-03, TM-05, TM-06, TM-08, TM-09, TM-10

Контракт, формат и проверка завершения выбранной версии адаптера описаны в
[storage.md](storage.md). Все тесты таблицы находятся в
[task-storage.test.ts](../tests/task-storage.test.ts). Mock подменяет только
`RCTAsyncStorage.multiGet/multiSet`: настоящий адаптер TaskFlow и установленная
JS-обёртка AsyncStorage 2.2.0 исполняются. Управляемая Map сохраняет точные байты,
callback задаёт момент завершения. Нативная база Android в этих тестах не запускается.

| Требование и сценарий | Конкретная проверка | Фактический результат / граница |
| --- | --- | --- |
| TM-02 «Два одинаковых названия»; TM-09 «Повторный запуск» — восстановление снимка | [round trips exact IDs, duplicate titles, Unicode and order through v1](../tests/task-storage.test.ts#L62) | Пройдено, integration: все ID/названия/порядок равны, одинаковые названия остаются двумя задачами. Нативный повторный запуск не проверен |
| TM-03 «Успешное сохранение»; TM-06 «Последовательное создание» — полная запись | [persists model snapshots A then B then C without losing previous tasks](../tests/task-storage.test.ts#L82); [replaces the complete snapshot including an explicit empty snapshot](../tests/task-storage.test.ts#L73) | Пройдено, integration: полный снимок по единственному ключу, предыдущие задачи сохраняются. Публикация списка и очистка формы не проверены |
| TM-03 «Незавершённая запись» | [keeps save pending before and after value change until native completion](../tests/task-storage.test.ts#L96) | Пройдено, integration: promise не подтверждает успех до callback, даже после фактического изменения значения. UI ожидания не проверен |
| TM-03 «Запись выполнена несмотря на ошибку ответа»; TM-05 «Сбой записи» | [rejects completed write with changed value = %s and performs no retry or read](../tests/task-storage.test.ts#L119), два значения changed | Пройдено, integration: ошибка до изменения оставляет исходный снимок, ошибка после изменения оставляет отправленный. Нет повторного save, чтения или продолжающихся записей адаптера после завершения в управляемой среде. Согласование относится к 4.3 |
| TM-06 «Первый запуск без задач»; предпосылка TM-07 | [loads a missing key as empty without writing](../tests/task-storage.test.ts#L55); [waits for read completion without returning a fabricated empty list](../tests/task-storage.test.ts#L146) | Пройдено, integration: только отсутствующий ключ даёт пустой список, незавершённое чтение не даёт результата. Экран и блокировка создания не проверены |
| TM-08 «Ошибка доступа», «Успешное повторное чтение» | [read failure preserves bytes and a later explicit load restores them](../tests/task-storage.test.ts#L158) | Пройдено, integration: категория read, исходные байты сохранены; последующий явный load восстанавливает список без записи. Пользовательский retry не проверен |
| TM-08 «Повреждённые данные» | [rejects %s without deleting, skipping or rewriting data](../tests/task-storage.test.ts#L212), таблица invalidSnapshots | Пройдено, integration: JSON/пустая строка, версия, структура, поля, ID, названия, дубликаты отклоняются целиком с format. Оригинал сохранён, повторного I/O нет |
| TM-08 — границы валидного снимка | [restores valid title boundaries exactly: %#](../tests/task-storage.test.ts#L230) | Пройдено, integration: 1 точка, 99 букв + emoji, 100 emoji без изменения |
| TM-10 «Диагностика ошибки» | [expectSafeError](../tests/task-storage.test.ts#L42) в тестах read/write/format; [sanitizes synchronous native write exceptions](../tests/task-storage.test.ts#L172) | Пройдено, integration: фиксированные категории/сообщения, String/JSON/stack без синтетического названия, снимка и sensitive-token; нет cause с исходным исключением |
| TM-08/TM-10 — невалидный исходящий снимок | [rejects invalid outgoing tasks before I/O and preserves the previous snapshot](../tests/task-storage.test.ts#L223) | Пройдено, integration: format до записи, исходное значение сохранено |

В таблице повреждений проверяются: неверный JSON, неизвестная/строковая/отсутствующая
версия; null/array/primitive конверта; отсутствующий/null/object tasks; отсутствующие,
неверно типизированные и лишние поля; null/array/primitive записи; пустые ID;
повтор ID с разными названиями; пустые/пробельные/ненормализованные названия,
101 кодовая точка и все восемь внутренних разделителей строк.

TM-09 «Повторный запуск» пока покрыт только восстановлением снимка в JS, без
остановки Android-процесса. Новая hook-сессия после прерванного согласования,
TM-09 «Возврат из фона» и «Остановка процесса во время контрольного чтения»
остаются в 4.4 и группе 6. TM-10 «Использование без сети» на Android не проверен.
Нативная сохранность должна подтверждаться установленной сборкой со встроенным
JS bundle и собственным application ID, без очистки данных между stop/launch.
Проверка внутренних ID относится к unit/integration, а не к Maestro.

TM-04, оставшиеся ветки TM-03/TM-05, поведение владельца состояния TM-07/TM-08,
UI и TM-11/TM-12 остаются в незавершённых группах 4–6.

## Выполненный прогон модели (2.1–2.3)

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

Это проверка исходников модели в Jest за этап 2.1–2.3. В том прогоне
Android-сборка, эмулятор, AsyncStorage, useTasks и UI создания не проверялись.

## Выполненный прогон хранения (3.1–3.3)

2026-11-01, macOS arm64. Итоговые проверки выполнены на Node **26.13.0**,
npm **11.17.0** из ранее подготовленного `/private/tmp/taskflow-nvm-26130`:

```sh
export PATH=/private/tmp/taskflow-nvm-26130/versions/node/v26.13.0/bin:$PATH
node --version
npm --version
npm test -- --watch=false --runTestsByPath tests/task-storage.test.ts
npm test -- --watch=false
npm run typecheck
npm run lint
npx expo install --check
openspec validate task-management-foundation --strict
git diff --check
```

Для другой машины используйте `nvm use` по README; временный путь — только
фактическое окружение этого прогона. Первоначальная установка
`npm install --save-exact @react-native-async-storage/async-storage@2.2.0`
выполнена с Node 26.5.0: exit 0 с предупреждением engines. Затем найден и выбран
зафиксированный Node 26.13.0; все итоговые проверки ниже проведены на нём.

| Проверка | Фактический результат |
| --- | --- |
| Тесты хранения | Exit 0, 1 suite / 50 tests passed |
| Полный Jest | Exit 0, 4 suites / 79 tests passed (50 хранения + 29 существующих) |
| TypeScript typecheck | Exit 0, strict |
| ESLint | Exit 0, без предупреждений |
| `npx expo install --check` | Exit 0, Dependencies are up to date; сеть Expo отключена, проверка использовала локальный bundledNativeModules.json, CLI предупредил об ограничении offline-проверки |
| Review контракта завершения 2.2.0 | JS callback завершает promise; стандартный Android backend завершает транзакцию перед callback. Пути исходников и ограничения перечислены в storage.md |
| Относительные Markdown-ссылки README/storage/traceability | 51 ссылка разрешается; якоря строк в пределах файлов |
| OpenSpec strict validation | Exit 0, change valid |
| `git diff --check` | Exit 0 |

Установка добавила только AsyncStorage и две транзитивные зависимости; прочие
записи lockfile не изменены. npm сообщил 1 low + 43 moderate, как в ранее
записанном baseline README; отдельный аудит в этой сессии не проводился.

Нативный Android runtime, установленная сборка, stop/launch, работа без сети и
возврат из фона не проверены. `useTasks`, reducer, UI и контрольное чтение после
ошибочной записи не реализованы. Proposal, spec и design не изменялись.
