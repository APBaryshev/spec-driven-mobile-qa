# Прослеживаемость TaskFlow

Источник требований: [task-management/spec.md](../openspec/changes/task-management-foundation/specs/task-management/spec.md).
Область этого отчёта — задачи 2.1–5.4 [плана](../openspec/changes/task-management-foundation/tasks.md).
«Пройдено, unit» означает проверку правил модели в Jest, а не готовность всего
пользовательского сценария. «Пройдено, integration» для хранения означает настоящую
сериализацию и JS-обёртку AsyncStorage с управляемым нативным key-value I/O.
Текущие UI-проверки и ручной Android-прогон приведены в разделе
[«Пользовательский экран: группа 5»](#пользовательский-экран-группа-5).
Предыдущие разделы сохраняют результаты на момент соответствующего этапа;
их отметки «UI не проверен» уточняются новой таблицей. Нативная сохранность
Android E2E остаётся непроверенной (группа 6).

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

Round trip хранения и согласование после ошибок записи проверены ниже.
Не проверено: часть сценария «Два одинаковых названия» после нативного повторного
запуска и нативный UUID runtime Android (группа 6). Внутренние ID
проверяются unit/integration, без технического вывода ID в UI.

## TM-06 — просмотр и порядок

| Сценарий спецификации | Конкретный тест / будущая проверка | Фактический результат |
| --- | --- | --- |
| Последовательное создание | [builds C, B, A without mutating earlier lists, tasks or IDs](../tests/task-creation.test.ts#L41) | Пройдено, unit: следующие снимки A → B,A → C,B,A; прежние массивы не изменены |
| Последовательное создание — хранение | `persists model snapshots A then B then C without losing previous tasks` в [task-storage.test.ts](../tests/task-storage.test.ts#L82) | Пройдено, integration: модель + сериализация, C/B/A, все ID и названия |
| Последовательное создание — отображение | UI/E2E из групп 5–6 | Не проверено |
| Первый запуск без задач — хранение | `loads a missing key as empty without writing` в [task-storage.test.ts](../tests/task-storage.test.ts#L55) | Пройдено, integration: пустой результат, без записи |
| Первый запуск без задач — экран | Пустое состояние из задач 5.1, 6.2 | Не проверено; загрузка hook проверена ниже |
| Просмотр длинного списка | UI, прокрутка, читаемость названия в 100 точек из задач 5.1, 5.3 и группы 6 | Не проверено |

`prepareTask` возвращает кандидат следующего списка: новая задача сверху,
существующие задачи сохраняют порядок и идентичность. Публикация после
подтверждения постоянной записи проверена на уровне hook ниже (TM-03).

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

Таблица хранения выше отражает границу адаптера на этапе 3.1–3.3;
блокировка создания, публикация списка, согласование и retry hook проверены
на этапе 4.1–4.4 ниже. TM-09 покрыт восстановлением снимка и новой hook-сессией
в JS, без остановки Android-процесса. TM-10 «Использование без сети» на Android не проверен.
Нативная сохранность должна подтверждаться установленной сборкой со встроенным
JS bundle и собственным application ID, без очистки данных между stop/launch.
Проверка внутренних ID относится к unit/integration, а не к Maestro.

UI и нативные части TM-01–TM-12 остаются в незавершённых группах 5–6.

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

На момент прогона 3.1–3.3 нативный Android runtime, установленная сборка,
stop/launch, работа без сети и возврат из фона не проверялись; `useTasks`, reducer,
UI и контрольное чтение ещё не были реализованы. Proposal, spec и design не изменялись.

## Управление состоянием: 4.1–4.4, TM-03–TM-09/TM-12

Реализация: [useTasks.ts](../src/features/tasks/useTasks.ts).
Проверки: [use-tasks.test.tsx](../tests/use-tasks.test.tsx), **37 tests passed**.
Настоящие hook/reducer, модель, UUID, адаптер v1 и AsyncStorage JS исполняются
совместно. Управляемые native callbacks задают завершение promises чтения/записи;
синтетические байты сохраняются между экземплярами hook. Для Strict Mode отдельно
использован минимальный harness `test-renderer.createRoot({ isStrictMode: true })`
с независимыми promises на границе TaskStorage: native `multiGet` объединяет
одновременные чтения, поэтому его число не доказывает повтор effect.
Тест действительно требует два setup и проверяет устаревшие success/rejection.
Пользовательский экран не добавлен.

| Требование / сценарий | Конкретный тест в use-tasks.test.tsx | Фактический результат |
| --- | --- | --- |
| TM-07 «Ожидание чтения», TM-08 «Ошибка доступа», «Успешное повторное чтение» | [distinguishes loading from empty and errors; retry is guarded and never writes](../tests/use-tasks.test.tsx#L96) | Пройдено: tasks=null до успешного load; создание запрещено; быстрый retry даёт одно чтение; исходные данные не записываются/не обнуляются |
| TM-06 «Первый запуск без задач» | [accepts an absent key as empty only after successful read](../tests/use-tasks.test.tsx#L121) | Пройдено: ready + [] только после load; отсутствующий ключ не записывается |
| TM-08 «Повреждённые данные» | [preserves corrupt bytes on startup and allows an explicit read retry](../tests/use-tasks.test.tsx#L132) | Пройдено: loadError, повреждённые байты сохранены, явный повтор чтения |
| TM-01 — проверка перед I/O | [validates %j before saving and preserves input](../tests/use-tasks.test.tsx#L148) | Пройдено: пустой/пробельный/многострочный/101 точка, invalid с точным input, без save |
| TM-03 «Незавершённая запись», TM-04 «Быстрое повторное нажатие», TM-12 «Медленная запись» | [guards rapid submissions synchronously and keeps a slow write unconfirmed without a timeout](../tests/use-tasks.test.tsx#L156) | Пройдено: одна запись при нескольких вызовах до render, список остаётся исходным; изменение байтов и продвижение часов на час не подтверждают успех и не запускают контрольный load |
| TM-03 «Успешное сохранение», TM-02 одинаковые названия, TM-06 «Последовательное создание» | [creates sequential snapshots without losing tasks, IDs or duplicate titles](../tests/use-tasks.test.tsx#L184) | Пройдено: точные снимки A → A,A → C,A,A поверх исходного; разные ID, прежние ID/названия/порядок сохранены |
| TM-05 — синхронный отказ I/O | [handles a synchronous native write exception through reconciliation](../tests/use-tasks.test.tsx#L201) | Пройдено: исключение обработано; контрольное чтение подтверждает исходный список; одна попытка записи |
| TM-03 «Запись выполнена несмотря на ошибку ответа», TM-05 «Сбой записи» и оба сценария изменения названия; TM-12 «Медленная проверка результата» | [reconciles changed=%s only after write settlement and safely creates changed input](../tests/use-tasks.test.tsx#L213) | Пройдено, два исхода: save → завершение ошибки → load; sent даёт created без нового save, base даёт saveError; затем B строится поверх актуального подтверждённого списка, A сохраняется только если была записана. Во время load прежний список доступен, новое создание запрещено |
| TM-05 «Успешный повтор после сбоя» | [retries identical raw input with the prepared ID and full snapshot after proven absence](../tests/use-tasks.test.tsx#L234) | Пройдено: неизменённый исходный ввод повторяет те же ID и полный снимок; невалидное исправление не пишет и не теряет ввод |
| TM-04 «Результат ещё неизвестен», TM-05 «Проверка не смогла прочитать данные», «Проверка обнаружила неожиданные данные», «Повтор проверки установил результат» | [blocks writes for %s; guarded retry only reads and can confirm sent snapshot](../tests/use-tasks.test.tsx#L263) | Пройдено, 12 веток: ошибка чтения, JSON, версия, повтор ID, пропавший ключ, только ID попытки, изменение названия попытки/старой задачи, старого ID, порядка, лишняя запись, изменение base. Все сохраняют прежний список/input, блокируют create/retryLoad; быстрые повторы дают одно контрольное чтение, sent подтверждается без save |
| TM-05 повтор проверки до base; TM-09 «Возврат из фона» | [keeps unknown across failed rechecks and foreground transitions, then permits retry on base](../tests/use-tasks.test.tsx#L286) | Пройдено: повторная ошибка сохраняет unknown; JS-события background/active и rerender не инициируют I/O, блокировка остаётся; base разрешает создание B без A. AppState — управляемая модель событий, не нативный фон ОС |
| TM-05 — первый запуск с исходным пустым списком | [reconciles a missing key with the original empty snapshot](../tests/use-tasks.test.tsx#L315) | Пройдено: отсутствующий ключ равен пустому base; saveError, без автоматической записи [] |
| TM-07/TM-08 — cleanup | [ignores old initial read success/error=%s after unmount](../tests/use-tasks.test.tsx#L329) | Пройдено: устаревшие success/rejection не меняют новую сессию, старый create возвращает inactive |
| TM-09 — размонтирование при незавершённой записи | [new owner waits for pending write; changed=%s rejection=%s never starts stale reconciliation](../tests/use-tasks.test.tsx#L340) | Пройдено, три ветки: успешная запись, ошибка после изменения, ошибка без изменения. Новая загрузка ждёт завершения save, старый владелец не запускает согласование; затем читается фактический снимок без повторного save |
| TM-09 «Остановка процесса во время контрольного чтения» — модель новой сессии | [new session after interrupted reconciliation loads %s without replay](../tests/use-tasks.test.tsx#L357) | Пройдено: sent/base/loadError; точные ID/названия/порядок восстановлены либо tasks=null и create запрещён; старое завершение игнорируется. Нового save/автоматического создания нет. Это новая hook-сессия, не остановка процесса Android |
| TM-07/TM-08 — development Strict Mode | [development Strict Mode replays setup/cleanup and ignores old rejection=%s](../tests/use-tasks.test.tsx#L378) | Пройдено: фактический повтор effect, устаревшие успех и ошибка игнорируются; создание после чтения выполняет одну запись |

Публичный контракт `useTasks(storage)`:

- `state.status`: `loading`, `loadError`, `ready`, `saving`, `reconciling`,
  `saveError`, `outcomeUnknown`. `state.tasks` равен null в loading/loadError;
  в остальных состояниях это только подтверждённый список.
- `canCreate` / `canEdit` разрешены только в ready/saveError. Синхронный guard
  проверяет доступность независимо от задержки React render.
- `createTask(input): Promise<CreationResult>` возвращает `created` с ID и исходным
  input только после подтверждения. `invalid` содержит категорию и точный input;
  `saveError`/`outcomeUnknown` сохраняют input; `blocked` не запускает I/O;
  `inactive` означает завершение вне активного lifecycle-поколения.
- `retryLoad(): Promise<void>` действует только из loadError.
  `retryReconciliation(): Promise<CreationResult>` — только из outcomeUnknown,
  выполняет одно чтение и использует сохранённую попытку.
- Черновик принадлежит будущей форме. Она должна применять canEdit и очищать
  поле только по результату created; фактическая очистка UI пока не проверена.

Попытка хранит исходный текст, ID, base и sent. Сравниваются весь список, ID,
названия и порядок; проверку схемы v1 и содержимого выполняет существующий
TaskStorage. Подтверждённый список не меняется при ошибках. Ошибка save сама
по себе не снимает блокировку: только base разрешает исправление/повтор, только
sent подтверждает новую задачу. Неожиданный снимок не подставляется вместо base
и не перезаписывается. Зависшая запись остаётся saving без timeout.

Lifecycle: запись выполняется только при явном createTask. Cleanup инвалидирует
поколение, но не отменяет native save; небольшой WeakMap-барьер на объект
TaskStorage заставляет следующий экземпляр ждать settlement перед load.
Это не очередь, не транзакция и не механизм нескольких писателей. Требуется
один владелец и стабильный экземпляр TaskStorage для одного ключа; внешние
писатели/разные обёртки одного ключа не поддерживаются. Фон не инициирует I/O.
После новой сессии попытка и черновик не восстанавливаются как команда.
Повреждённый формат не исправляется, блокировка unknown может быть длительной.

Не проверено и остаётся в группах 5–6: форма, очистка/сохранность TextInput,
визуальные состояния и прокрутка во время ожидания (TM-03/TM-12), TalkBack,
клавиатура, увеличенный шрифт (TM-11), установленная Android-сборка со встроенным
JS, stop/launch без очистки данных, фактическая остановка процесса при проверке,
возврат из нативного фона и автономность без сети (TM-09/TM-10). JS-session
проверки не объявляются нативным E2E. Аппаратная сохранность, транзакции,
несколько писателей, сохранение черновика после остановки вне текущих гарантий.

## Выполненный прогон состояния (4.1–4.4)

2026-11-01, macOS arm64, Node **26.13.0**, npm **11.17.0**. Использованы
существующие зависимости и lockfile без изменений. Для выбора Node применён
тот же временный PATH, что указан в отчёте хранения выше. Данные синтетические.

| Команда | Фактический результат |
| --- | --- |
| `npm test -- --watch=false --runTestsByPath tests/use-tasks.test.tsx` | Exit 0, 1 suite / 37 tests passed |
| `npm test -- --watch=false` | Exit 0, 5 suites / 116 tests passed: 37 hook + 79 существующих |
| `npm run typecheck` | Exit 0, strict TypeScript |
| `npm run lint` | Exit 0, без предупреждений |
| `openspec validate task-management-foundation --strict` | Exit 0, change valid |
| `git diff --check` | Exit 0 |

Proposal, spec и design сохранены. Выполнены только 4.1–4.4; группы 5–6
не выполнялись. Git commit, push и архивирование не выполнялись.

## Пользовательский экран: группа 5

Результаты ниже относятся к первому UI-прогону. Оставшиеся проверки 5.3
уточнены в [дополнительном прогоне после ревью](#дополнительная-проверка-53-после-независимого-ревью).

2026-11-01, macOS arm64, Node **26.13.0**, npm **11.17.0**.
Базовый commit **273c686**, изменения этого прогона не закоммичены.
Реализация: [TasksScreen.tsx](../src/features/tasks/TasksScreen.tsx),
[App.tsx](../App.tsx). Утверждённые proposal/spec/design, модель, taskId,
TaskStorage и useTasks не изменены. Добавлена только прямая зависимость
`react-native-safe-area-context@5.10.1` (версия из bundledNativeModules Expo 58);
lockfile добавляет один пакет, остальные записи зависимостей сохранены.

Экран содержит прокручиваемую форму в заголовке FlatList и строки по стабильным
ID. У названий нет numberOfLines, фиксированной высоты и отключения font scaling.
SafeAreaProvider находится в App, SafeAreaView и KeyboardAvoidingView — в экране.
`keyboardShouldPersistTaps="handled"` позволяет активировать создание при
открытой клавиатуре; `keyboardDismissMode="on-drag"` поддерживает просмотр списка.
UI не копирует список и не запускает собственный протокол восстановления:
`state.tasks` — единственный источник подтверждённых данных. Форма хранит только
черновик и обратную связь; очищает его только по `created`, включая подтверждение
после `retryReconciliation`. `invalid`, `saveError`, `outcomeUnknown`, `blocked`
и `inactive` не очищают поле. Синхронный guard hook защищает оба способа отправки.

Автоматические component/integration-проверки:
[tests/tasks-screen.test.tsx](../tests/tasks-screen.test.tsx), **20 tests passed**.
Настоящие экран, hook, модель и генератор UUID; управляемые promises заменяют
только границу TaskStorage. Safe area использует официальный Jest mock пакета:
нативные insets/компоновка в Jest не доказываются. Отдельный тест App выполняет
настоящую связку экран → hook → адаптер v1 → AsyncStorage JS с контролируемым
native callback. Существующие 50 тестов хранения и 37 hook-тестов сохранены.

| Требование / сценарий | Конкретная UI-проверка | Фактический результат |
| --- | --- | --- |
| TM-07 «Ожидание чтения», TM-08 «Ошибка доступа», «Успешное повторное чтение»; TM-06 пустое состояние | [loading, empty and read error are distinct; only load error offers guarded reload](../tests/tasks-screen.test.tsx#L68) | Пройдено: загрузка/ошибка не показывают пустое состояние, создание/поле отключены; повтор загрузки только в loadError; нет save; после успешного пустого чтения форма доступна |
| TM-02 одинаковые названия, TM-03 подтверждение, TM-06 порядок | [confirmed creates clear the draft, preserve duplicate titles and display newest first](../tests/tasks-screen.test.tsx#L92) | Пройдено: A → A,A → C,A,A, разные ID; до settlement нет новой строки и очистки, после подтверждения поле пустое |
| TM-01 пустой/пробельный ввод, превышение длины, внутренний перевод строки; TM-11 текст ошибки | [validation preserves the exact pasted input %j without writing](../tests/tasks-screen.test.tsx#L107) | Пройдено, 11 входов: пусто, пробелы, 101 точка, LF/CR/CRLF/VT/FF/NEL/LS/PS; точный текст остаётся, save отсутствует, alert доступен, исправление убирает ошибку. Это события changeText в Jest, не нативная вставка clipboard |
| TM-03 незавершённая запись и sent после ошибки, TM-04 быстрые отправки, TM-12 медленная запись/проверка | [rapid button and keyboard submissions share the hook guard; slow saving and reconciliation retain the list](../tests/tasks-screen.test.tsx#L122) | Пройдено: три keyboard callback до render + отключённая кнопка дают один save; черновик заморожен; виден прежний список и разные сообщения saving/reconciling; sent даёт очистку без повторного save |
| TM-05 «Сбой записи», «Успешный повтор после сбоя», изменение названия после base | [proven absence permits correction=%s and explicit creation retry](../tests/tasks-screen.test.tsx#L148) | Пройдено, два исхода исправления: base сохраняет ввод/список и открывает форму; неизменённый ввод повторяет те же ID/снимок, изменённый добавляет только новую задачу |
| TM-04 unknown, TM-05 неудачная проверка и повтор до sent/base; TM-11 имена действий | [unknown result retries only reading, then accepts %s](../tests/tasks-screen.test.tsx#L168) | Пройдено: unknown сохраняет текст/список и блокирует поле/создание между проверками; retry читает без save; повторная ошибка сохраняет блокировку; sent очищает, base сохраняет ввод; разные кнопки retry доступны только в нужном состоянии |
| TM-06 длинное название, TM-11 font scaling и keyboard props | [long titles are untruncated in a virtualized scrollable list with the form in its header](../tests/tasks-screen.test.tsx#L195) | Пройдено: загружены 40 задач, название 99 букв + emoji отображается без ограничения строк/масштаба; прокрутка не отключена. Геометрия и реальный скролл этим тестом не подтверждаются |
| TM-09 lifecycle, сохранность новой формы после inactive | [an inactive completion cannot clear a new screen draft](../tests/tasks-screen.test.tsx#L209) | Пройдено: старый save завершён после unmount, новая сессия безопасно загружена; новый черновик сохранён, второго save нет. Это JS-сессии |
| TM-06 пустое состояние, TM-07 подключение приложения | [wires the real screen, hook and stable storage in App](../tests/App.test.tsx#L12) | Пройдено: настоящий App показывает пустое состояние после native callback, создание доступно; rerender App не вызывает повторной загрузки |
| TM-11 доступные имена/roles/states и динамические сообщения | Проверки getByLabelText/getByRole/toBeDisabled/accessibilityState в тестах выше | Пройдено: имя поля, header TaskFlow, роли button/alert, disabled/busy, именованные повторы. Один polite live region, без дополнительных announceForAccessibility и озвучивания списка на каждую запись |

`testID`: `task-title-input`, `task-create-button`, `task-list`, `task-title`
(одинаковый тип строки, внутренний React key = ID), `task-empty`, `task-status`,
`task-retry-load-button`, `task-retry-reconciliation-button`.
Это идентификаторы автоматизации, доступные имена — обычные русские подписи;
технические ID задач не выводятся пользователю или диктору.

### Ручной Android-прогон и ограничения

Android SDK AVD **Pixel_6_Pro**, **Android 13 / API 33**, arm64-v8a,
`emulator-5554`, Expo Go **58.0.5**, TaskFlow **0.1.0** через Metro **8082**.
Это development UI-прогон с просмотром скриншотов и семантического дерева через
agent-device; Maestro flows, автономный APK и группа 6 не выполнялись.
Все названия синтетические, данные других проектов не использовались.

| Проверка | Фактический результат |
| --- | --- |
| Старт и обычный шрифт | Показаны TaskFlow, однострочное поле, создание и пустое состояние после чтения; затем Keyboard task создана, поле очищено. [Итоговый экран при обычном шрифте](verification/taskflow-ui/screen-standard.png) |
| Реальная экранная клавиатура | Проверена Gboard, `agent-device keyboard status` сообщил visible=yes. При масштабе 200% поле и кнопка видны над клавиатурой; нажатие создания при пустом поле показывает текст ошибки. При обычном масштабе нажатие Done на реальной Gboard создало Keyboard live, очистило поле и закрыло клавиатуру |
| Увеличенный системный шрифт | Временно `font_scale=2.0`; заголовок, поле, подсказка и кнопка читаемы, высота адаптируется. [Скриншот с открытой Gboard](verification/taskflow-ui/keyboard-font200.png). После проверки масштаб возвращён: Android сообщает **1.0**. Настройки Mac не изменялись |
| Одинаковые названия и новый элемент сверху | Созданы две отдельные строки Same task, затем List 04…List 12; видимый порядок новых строк обратный созданию |
| Длина и ошибки | Название в 104 ASCII-символа отклонено с сохранением ввода, исправленное название ровно в 100 символов создано. Нативная вставка внутренних переводов строк/emoji через clipboard не проверена |
| Длинный список и переносы при обычном шрифте | 13 задач на момент скриншота (затем 14 после Keyboard live); `scroll bottom` открыл старую Keyboard task и две Same task; название в 100 символов полностью читается с переносами. [Скриншот нижних строк](verification/taskflow-ui/list-bottom.png). После повторного открытия development UI форма доступна; команда scroll top подтвердила верхнюю позицию |
| TalkBack | **Не подтверждено**. Пакет установлен; пробное включение записало enabled service, но dumpsys accessibility показал `Ui Automation`, `Bound services: {}`, `touchExplorationEnabled=false`, отсутствие accessibility focus. UI Automation подавляет подключение TalkBack. Полноценная навигация диктором, речь и отсутствие лишних озвучиваний требуют ручного прогона без автоматизационного runner. Служба возвращена в исходное отключённое состояние |
| Медленный I/O, loadError/saveError/outcomeUnknown и безопасные повторы | Подтверждены только component/integration-тестами с управляемыми promises. В production UI не добавлены переключатели отказов, debug-экраны или координатные тестовые элементы |

Команды прогона: `adb devices -l`, `emulator -list-avds`, проверка процессов и
порта 8082, `emulator -avd Pixel_6_Pro -no-snapshot-save`, `npm run android`.
Действия UI: `agent-device open <exp URL> --session taskflow-ui`, `snapshot -i`,
`fill id=task-title-input <synthetic title>`, `press id=task-create-button`,
`keyboard status`, `screenshot`, `scroll bottom`, `diff snapshot -i`, `scroll top`.
Для Gboard использован `adb shell ime set` установленного LatinIME, поскольку
IME helper инструмента не рисует клавиши. Тестовые изменения font_scale и
службы TalkBack восстановлены; show_ime_with_hard_keyboard оставлено исходным 1.

Не проверены: TalkBack пользователя без UI Automation, длинный список именно
при увеличенном шрифте, нативная вставка многострочного ввода, реальные отказы
AsyncStorage, iOS/web, автономная сборка, нативный stop/launch без Metro,
остановка процесса при reconciliation и работа без сети. JS-проверки не заменяют
эти сценарии. Подтверждённые задачи сохраняются только в рамках описанного
контракта AsyncStorage: без транзакционных гарантий, нескольких писателей,
восстановления после очистки/переустановки и сохранения черновика после остановки.

### Автоматический прогон группы 5

Использован закреплённый Node/npm через временный PATH из предыдущего отчёта.

| Команда | Фактический результат |
| --- | --- |
| `npm test -- --watch=false --runTestsByPath tests/tasks-screen.test.tsx tests/App.test.tsx` | Exit 0, 2 suites / 21 tests passed |
| `npm test -- --watch=false` | Exit 0, 6 suites / 136 tests passed (20 новых UI + 116 существующих с обновлённым тестом App) |
| `npm run typecheck` | Exit 0, strict TypeScript |
| `npm run lint` | Exit 0, без предупреждений |
| `npx expo install --check` | Exit 0, dependencies are up to date; offline-карта bundledNativeModules, CLI предупредил об ограниченной надёжности без сети |
| `openspec validate task-management-foundation --strict` | Exit 0, change valid |
| `git diff --check` | Exit 0 |
| Проверка относительных файловых Markdown-ссылок README/traceability/tasks | 83 ссылки разрешаются; номера строк в пределах файлов |

5.1, 5.2 и 5.4 выполнены. Код 5.3 реализован, но checkbox остаётся открытым:
полный обязательный ручной прогон с TalkBack и длинным списком при увеличенном
шрифте не подтверждён. Прогресс **16/21**, группа 6 не выполнялась.
Commit, push, архивирование и изменение утверждённых spec/design не выполнялись.

## Дополнительная проверка 5.3 после независимого ревью

**2026-11-01**, тот же AVD Pixel_6_Pro / Android 13 API 33 / emulator-5554,
Expo Go и Metro TaskFlow на **8082**. На старте загружены **14** синтетических
задач из первого прогона. Продуктовый код, архитектура, зависимости, тесты,
proposal/spec/design в этой проверке **не изменялись**. Пользователь отдельно
разрешил временные изменения настроек Android с восстановлением; настройки
Mac не менялись. Новые задачи при этих проверках не создавались.

Доказательства находятся в [taskflow-ui-53](verification/taskflow-ui-53/manifest.json):
manifest содержит размеры и SHA-256 файлов. Это управляемый прогон настоящего
Android UI со скриншотами и read-only диагностикой; полное слуховое ревью
человеком не выполнялось. Component-тесты не выдаются за TalkBack-прогон.

### Длинный список при системном шрифте 200% — TM-06/TM-11

Временное значение `font_scale=2.0`. После завершения перезапуска Activity
проверены форма и верх списка → прокрутка вниз → старые задачи → прокрутка вверх
→ поле и кнопка → открытая Gboard. Промежуточный splash screen не использован
как доказательство UI. Итог: **пройдено** на указанном AVD.

- [Верх списка и доступная форма](verification/taskflow-ui-53/font200-form.png):
  заголовок, подпись, поле, подсказка и кнопка читаемы; высота адаптируется.
- [Низ списка](verification/taskflow-ui-53/font200-bottom.png): доступны старая
  Keyboard task и обе Same task. Название длиной 100 ASCII-символов отображается
  полностью, с переносами; конец `…6789012345` виден перед следующей строкой.
- После обратной прокрутки форма снова доступна. При открытой Gboard поле и
  создание остаются доступны: [клавиатура при 200%](verification/taskflow-ui-53/font200-keyboard.png).

Это проверка реальной компоновки и скролла, а не вывод из React props.
Масштаб после проверки восстановлен до исходного **1.0**.

### Нативная вставка многострочного названия — TM-01

Использован штатный `EmulatorController.setClipboard` из SDK
`emulator/lib/emulator_controller.proto`, затем настоящий Android Paste.
Первый LF вставлен через [нативное всплывающее меню Paste](verification/taskflow-ui-53/paste-menu.png).
Для повторяемого сравнения восьми разделителей использован `KEYCODE_PASTE`:
это тот же путь нативного TextInput/Clipboard, без вызова `onChangeText` из теста.
Исходный clipboard сохранён приватно и затем восстановлен.

Read-only CDP-проверка читала `memoizedProps.value` настоящего TextInput,
его code points и подтверждённый taskCount из работающего React-дерева.
Она не вызывала обработчики и не меняла React state, хранилище или исходники.
[Точное выражение проверки](verification/taskflow-ui-53/read-only-runtime-probe.txt).
На время чтения Inspector подключался к локальному Metro. После изменения
масштаба старый inspector target сначала не имел Runtime; после обычного
повторного открытия development-проекта получен активный `main` context.
Обхода авторизации или изменения настроек debugger не было.

| Разделитель в clipboard между First и Second | Фактический React-черновик до и после отправки | Результат |
| --- | --- | --- |
| LF U+000A | `First\nSecond`, точка 10 | Ошибка однострочности, текст сохранён |
| CR U+000D | `First\rSecond`, точка 13 | То же |
| CRLF U+000D U+000A | Обе точки 13, 10, в исходном порядке | То же |
| VT U+000B | Точка 11 сохранена | То же |
| FF U+000C | Точка 12 сохранена | То же |
| NEL U+0085 | Точка 133 сохранена | То же |
| LS U+2028 | Точка 8232 сохранена | То же |
| PS U+2029 | Точка 8233 сохранена | То же |

[Сводка всех восьми проверок](verification/taskflow-ui-53/native-paste-summary.json)
содержит полный точный черновик и code points. Для каждого варианта сохранены
отдельные `paste-<separator>-before-submit.json` и `paste-<separator>-after-submit.json`;
пример: [LF до отправки](verification/taskflow-ui-53/paste-lf-before-submit.json),
[LF после отправки](verification/taskflow-ui-53/paste-lf-after-submit.json).
Во всех восьми случаях число подтверждённых задач осталось **14**, а сообщение —
«Название должно быть в одну строку. Удалите переводы строк.».
[Видимая ошибка после Paste](verification/taskflow-ui-53/paste-lf-result.png).

Важная особенность Android: LF визуально выглядит как пробел в single-line
TextInput, а native Copy выделенного текста возвращает `First Second`.
Это преобразование представления/копирования, **не потеря LF в форме**:
read-only измерение JS до и после submit подтверждает U+000A. Не делаем вывод
о фактическом черновике по внешнему виду поля или результату Copy.
TM-01 на указанном Android подтверждён для всех согласованных разделителей;
дефект, требующий изменения кода, не обнаружен.

### Причина конфликта UiAutomation и реальный TalkBack — TM-11

[Android UiAutomation](https://developer.android.com/reference/android/app/UiAutomation#FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)
по умолчанию подавляет остальные accessibility-службы; API имеет отдельный
флаг `FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES` для совместной работы.
На этой машине agent-device 0.20.5 держал persistent instrumentation
`com.callstack.agentdevice.snapshothelper/.SnapshotInstrumentation`.
Пока helper работал, dumpsys показывал UiAutomation:
[состояние с automation](verification/taskflow-ui-53/automation-attached.txt).

Завершён **только этот helper**, без остановки Expo Go, Metro или посторонних
процессов. После `am force-stop com.callstack.agentdevice.snapshothelper`
UiAutomation исчезла: [после отключения](verification/taskflow-ui-53/automation-detached.txt).
Затем включён установленный TalkBack. Получено фактическое подключение службы,
`touchExplorationEnabled=true`, `serviceHandlesDoubleTap=true`, accessibility focus:
[TalkBack подключён](verification/taskflow-ui-53/talkback-bound.txt).
После этого snapshot/press/longpress agent-device **не использовались**:
они могли бы снова подключить UiAutomation.

Обычные `adb shell input` инъекции не использованы как доказательство жестовой
навигации диктором: они могут прокручивать приложение, обходя touch exploration.
Для проверенных жестов использован аппаратный `EmulatorController.sendTouch`
(Linux multitouch protocol B из SDK), затем read-only `screencap`/`dumpsys`.
Отправлялись реальные касания с обязательным release pressure=0, без
accessibility automation-соединения и без debug-элементов приложения.

Подтверждено на настоящем TalkBack:

- [Поле получает accessibility focus](verification/taskflow-ui-53/talkback-field-hardware.png).
- Жест «следующий элемент» переводит фокус на
  [подсказку](verification/taskflow-ui-53/talkback-next-focus.png), затем на
  [«Создать задачу»](verification/taskflow-ui-53/talkback-create-focus.png).
- Двойное касание активирует создание с пустым полем; появляется текстовая
  ошибка «Введите название задачи.», новых задач нет.
- [Ошибка получает accessibility focus](verification/taskflow-ui-53/talkback-validation-focus.png).
  [Read-only состояние формы после активации](verification/taskflow-ui-53/talkback-validation-form.json)
  подтверждает пустой draft, сообщение и прежний taskCount=14.
- [Dumpsys после этих действий](verification/taskflow-ui-53/talkback-final-before-restore.txt)
  подтверждает активный TalkBack без UiAutomation.

Доступное название поля требует отдельного слухового подтверждения.
В настоящем runtime одновременно заданы `accessibilityLabel="Название задачи"`
и `accessibilityLabelledBy="task-title-label"`; связанный Text имеет то же название.
[Runtime props](verification/taskflow-ui-53/initial-form.json).
[Документация React Native](https://reactnative.dev/docs/accessibility#accessibilitylabelledby)
описывает label и labelledBy как источники текста для TalkBack. В установленном
RN 0.88.1 `ReactAccessibilityDelegate.kt` связывает `info.setLabeledBy(...)`,
а accessibilityLabel задаёт content description. Наличие этих двух источников
не доказывает корректную итоговую фразу и не доказывает её дублирование.
Автоматический component matcher с именем поля эту слуховую проверку не заменяет.
Без подтверждённого дефекта props не удалялись и код не менялся.

Сохранены записи реального аудиовыхода эмулятора (16 kHz, mono PCM WAV):
[фокус и переходы формы](verification/taskflow-ui-53/talkback-field-hardware.wav),
[активация и ошибка валидации](verification/taskflow-ui-53/talkback-validation-error.wav).
[Метаданные записи](verification/taskflow-ui-53/audio-capture-metadata.json)
подтверждают ненулевой сигнал, но **не распознавание или правильность речи**.
Записи не прослушаны: инструментальный интерфейс вернул
`audio content omitted because you do not support audio input`.
Внешние сервисы распознавания, изменение громкости, микрофона и настроек Mac
не использовались. Факт наличия аудио не объявлен успешной проверкой озвучивания.

**Оставшийся точный блокер:** нет возможности услышать и оценить TalkBack
в доступном интерфейсе агента. Не подтверждены итоговая фраза поля и отсутствие
повтора при label + labelledBy, полнота/кратность озвучивания ошибки, динамических
сообщений и состояний disabled/busy. Нативные retry-кнопки и длительные
loading/saving/reconciling/outcomeUnknown этим прогоном не воспроизводились:
для них остаются прежние component/integration-доказательства, но нет
слухового результата TalkBack. Production-переключатели отказов и специальные
экраны не добавлялись. Для закрытия 5.3 требуется слуховой прогон человеком
без UiAutomation, включая эти сценарии; существующие аудиозаписи покрывают
только поле/переходы формы и ошибку валидации.

### Восстановление окружения и итог 5.3

[Исходные настройки](verification/taskflow-ui-53/settings-before.json) и
[настройки после восстановления](verification/taskflow-ui-53/settings-after.json)
совпадают **по всем пяти значениям**: font_scale=1.0,
enabled_accessibility_services отсутствует, accessibility_enabled=1 (исходное
сырое значение), Gboard и show_ime_with_hard_keyboard=1. Само сырое значение
accessibility_enabled не считается признаком включённого TalkBack:
[финальный dumpsys](verification/taskflow-ui-53/after-restore.txt) показывает
`Bound services: {}`, `touchExplorationEnabled=false`, UiAutomation отсутствует.
Clipboard восстановлен из приватной копии; его исходное содержимое не включено
в публичные доказательства. Временный React DevTools daemon остановлен.

[Финальный экран](verification/taskflow-ui-53/final-standard.png) оставлен с обычным
шрифтом, пустой формой и теми же 14 задачами;
[состояние формы](verification/taskflow-ui-53/final-form.json): ready, draft пуст,
сообщений нет, создание доступно. Исходники TaskFlow и настройки Mac не менялись.

Проверены длинный список при 200%, нативный Paste и реальная TalkBack-навигация
по доступным элементам. Полный слуховой прогон **не завершён**, поэтому checkbox
5.3 остаётся **[ ]**, общий прогресс — **16/21**. Как полностью закрытый этап 5
к коммиту **пока не готов**: требуется указанная ручная слуховая проверка.
Группа 6, архивирование, commit и push не выполнялись.

Регрессия после дополнительной проверки (закреплённый Node 26.13.0 / npm 11.17.0):
`npm test -- --watch=false` — **exit 0, 6 suites / 136 tests passed**;
`npm run typecheck`, `npm run lint`,
`openspec validate task-management-foundation --strict`, `git diff --check` —
**exit 0**. Проверены **111** относительных файловых ссылок README/traceability/tasks
и все **42** SHA-256 из manifest доказательств. OpenSpec apply подтвердил
`5.3: done=false`, прогресс **16/21**. Эти автоматические результаты не закрывают
оставшуюся слуховую проверку.
