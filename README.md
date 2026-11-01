# TaskFlow

Учебное React Native приложение: Spec-Driven Development с OpenSpec,
AI-assisted разработка и проверяемые требования. Реализован один экран создания
и просмотра задач: TaskFlow, однострочная форма, подтверждённый список с новыми
задачами сверху, пустое состояние и безопасные повторы при ошибках.
Ход реализации — в change
[`task-management-foundation`](openspec/changes/task-management-foundation/tasks.md).
Формат и ограничения хранения описаны в [docs/storage.md](docs/storage.md),
результаты проверок — в [docs/traceability.md](docs/traceability.md).

## Как пользоваться

Введите однострочное название (1–100 кодовых точек Unicode) и нажмите
«Создать задачу» или Done на клавиатуре. Пробелы по краям удаляются,
внутренние пробелы сохраняются. Одинаковые названия разрешены. Длинные названия
в списке переносятся; форма и список прокручиваются, системный размер шрифта
поддерживается без фиксированной высоты строк.

Новая задача появляется, а поле очищается только после подтверждения сохранения.
До этого виден прежний подтверждённый список. Во время сохранения и проверки
результата поле и создание заблокированы. При ошибке валидации ввод не обрезается
и не заменяется молча. Черновик хранится только в форме текущей экранной сессии;
после завершения процесса его восстановление не гарантируется.

- «Повторить загрузку» доступно только при ошибке начального чтения.
  До успешной загрузки создание недоступно; ошибка не выдаётся за пустой список.
- После ошибки записи приложение проверяет фактический результат чтением.
  Если задача сохранена, создание подтверждается без новой записи. Если обнаружен
  прежний список, можно исправить название или снова нажать «Создать задачу».
- Если результат неизвестен, ввод и прежний список сохраняются, поле и создание
  остаются заблокированы. «Повторить проверку» повторяет только чтение.
  Это отдельное действие, которое не повторяет запись.

После нового запуска выполняется обычная загрузка; неподтверждённое создание
автоматически не повторяется. Повреждённые данные не сбрасываются и не исправляются
автоматически. Повтор чтения помогает при временном сбое, но блокировка при
повреждённом или неожиданном снимке может оставаться длительной.

Экран — [TasksScreen.tsx](src/features/tasks/TasksScreen.tsx), подключение —
[App.tsx](App.tsx): один стабильный `taskStorage`, один настоящий `useTasks`.
UI хранит черновик и сообщения формы; подтверждённый список принадлежит hook.
Safe area обеспечивает `react-native-safe-area-context` **5.10.1**, совместимый
с локальной картой зависимостей Expo SDK 58; новых навигации и state manager нет.

Текущие результаты проверки UI и границы ручного Android-прогона приведены
в [traceability.md](docs/traceability.md#пользовательский-экран-группа-5).
Исторические прогоны основы приложения ниже сохранены отдельно.

## Зафиксированное окружение

Используется только npm и `package-lock.json`. Точные прямые зависимости находятся
в [`package.json`](package.json), транзитивные — в lockfile.

| Инструмент | Версия |
| --- | --- |
| Node.js | 26.13.0 LTS (`.nvmrc`) |
| npm | 11.17.0 |
| Expo SDK / expo | 58 / 58.0.22 |
| React Native / React | 0.88.1 / 19.3.0 |
| TypeScript | 6.0.3, strict |
| ESLint / eslint-config-expo | 9.39.5 / 58.0.4 |
| Jest / jest-expo | 30.5.2 / 58.0.13 |
| React Native Testing Library / test-renderer | 14.1.0 / 1.3.0 |

Android baseline для проверки: стандартный Android SDK, AVD `Pixel_6_Pro`,
Android 13 / API 33, Google APIs, arm64-v8a. Установлены emulator 37.1.11,
platform-tools 37.0.1 и OpenJDK 17.0.20. Для Expo Go Java/Gradle не нужны;
toolchain самостоятельной сборки приведён ниже, результаты — в
[отчёте группы 6](docs/verification/taskflow-android-6/report.md).

Имя приложения — **TaskFlow**, slug — `taskflow`, Android application ID —
`dev.taskflow.app`, версия — `0.1.0`, versionCode — `1`.
При запуске через Expo Go используется контейнер `host.exp.exponent`;
самостоятельный APK запускается как `dev.taskflow.app`.

## Установка и проверки

Проверенное окружение — **macOS arm64**. Команды ниже рассчитаны на macOS
с zsh или bash; Linux и Windows в рамках этого этапа не проверялись.
Выполняйте команды из корня этого репозитория. Нужны указанные Node/npm,
[nvm](https://github.com/nvm-sh/nvm), Git, `rg` (ripgrep), `ps`, `lsof`,
доступ к npm registry, стандартный Android SDK и совместимый Android AVD.
`adb` и `emulator` должны быть доступны в PATH; `ANDROID_HOME` должен указывать
на вашу установку SDK (на проверенной машине — `$HOME/Library/Android/sdk`).

```sh
# nvm должен быть установлен и загружен в текущую shell
nvm install
nvm use
# npm устанавливается только внутри выбранной версии Node в nvm
npm install --global npm@11.17.0
node --version  # ожидается v26.13.0
npm --version   # ожидается 11.17.0
npm ci
npm run typecheck
npm run lint
npm test -- --watch=false
npx expo install --check
npm audit
git diff --check
```

`nvm install` и `nvm use` читают `.nvmrc`; выбор версии действует в текущей shell.
Перед командой установки npm убедитесь, что `command -v node` и `command -v npm`
указывают на выбранную установку nvm. Не запускайте её через `sudo` или
с системным Node. Для загрузки nvm в новой shell используйте настройку из
официального руководства nvm; автоматическое изменение shell-профиля не требуется.

`npm ci` устанавливает зависимости из lockfile. Тесты проверяют модель, хранение,
настоящий hook и экран через Jest, preset `jest-expo` и React Native Testing Library.
Линтер завершает проверку ошибкой при любых предупреждениях.

Локальные `.env`/`.env.*`, корневой `.npmrc` с локальной авторизацией,
credential-файлы и файлы подписи исключены из Git. Безопасные шаблоны
`.env.example`, `.env.*.example` и `.npmrc.example` можно коммитить после проверки
их содержимого. Общие проектные JSON-конфигурации этим правилом не скрываются.

## Запуск Android

### Самостоятельный APK для эмулятора

Для проверки MVP используйте release APK со встроенным Hermes/JS bundle.
Expo Go и запущенный Metro ему не нужны. На macOS arm64 после `nvm use`
и `npm ci`:

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
# JAVA_HOME — JDK 17; java -version должен показывать 17
npm run android:prebuild
npm run android:build
adb -s emulator-5554 install -r android/app/build/outputs/apk/release/app-release.apk
adb -s emulator-5554 shell am start -n dev.taskflow.app/.MainActivity
```

`android:prebuild` генерирует только Android стандартным Expo prebuild;
`android/` исключён из Git и восстанавливается из app.json и npm lockfile.
`android:build` вызывает стандартный Gradle `assembleRelease` для `arm64-v8a`.
Для x86_64 AVD замените `-PreactNativeArchitectures=arm64-v8a` на `x86_64`
при прямом вызове `./android/gradlew -p android assembleRelease`.
Не используйте `prebuild --clean` в каталоге с собственными native-изменениями.

Toolchain из закреплённых Expo/RN: Gradle **9.4.1**, AGP **9.2.1**,
Kotlin **2.2.10**, NDK **27.1.12297006**, Build Tools **37.0.0**,
compileSdk **37**, targetSdk **36**, minSdk **24**. Нужны Android SDK,
принятые лицензии и сеть для первой загрузки build-зависимостей.
Generated release использует стандартный debug signing key Expo template:
это устанавливаемая проверочная сборка, подпись для магазина здесь не настроена.
Не удаляйте установленное приложение при несовпадении подписи: это удалит данные.

Собственный package — `dev.taskflow.app`, versionName `0.1.0`, versionCode `1`.
Команда `install -r` сохраняет данные совместимой существующей установки.
Maestro запускается напрямую, без собственного runner; предусловия, изоляция,
offline/lifecycle-команды и фактические результаты —
[Android E2E report](docs/verification/taskflow-android-6/report.md).
Автоматизация предназначена для отдельного тестового профиля/AVD с синтетическими
данными. В persistence-flow нет `clearState`.

Итог группы 6: **7 успешных Maestro-прогонов**, Jest **136/136**, typecheck,
ESLint и OpenSpec strict validation пройдены. Проверены offline, force-stop,
возврат из фона, пересоздание Activity и остановка фонового процесса.
Прослеживаемость TM-01–TM-12 — в
[docs/traceability.md](docs/traceability.md#сверка-сценариев-tm-01tm-12-группа-6).
Прогресс OpenSpec — **20/21**: открыта 5.3, требуется слуховая проверка TalkBack
человеком. Нативная остановка во время контрольного чтения не воспроизводилась;
её проверка остаётся integration, граница доказательств записана в report.

### Разработка через Expo Go

Сначала проверьте процессы, порт Metro и устройства:

```sh
ps -eo pid,ppid,etime,comm | rg -i 'node|metro|expo|emulator|qemu|adb'
lsof -nP -iTCP:8082 -sTCP:LISTEN
adb devices -l
emulator -list-avds
```

Отсутствие вывода `lsof` (exit code 1) означает, что порт свободен. Если порт
занят, выясните владельца; не завершайте чужой процесс. Можно выбрать другой
свободный порт: `npm run android -- --port 8083`.

Если устройства ещё нет, в отдельном терминале запустите имеющийся AVD
стандартной командой Android SDK (замените имя на результат `-list-avds`):

```sh
emulator -avd Pixel_6_Pro -no-snapshot-save
```

После загрузки Android:

```sh
adb devices -l
npm run android
```

Команда запускает собственный Metro **TaskFlow** на `localhost:8082` и открывает
приложение через Expo Go. При первом запуске Expo CLI может предложить загрузку
совместимого Expo Go; нужен доступ к серверам Expo. Ожидаемый экран: «TaskFlow», поле «Название задачи», «Создать задачу»
и после загрузки список либо «Пока нет задач. Создайте первую.». На первом старте закройте подсказку
developer menu кнопкой `Continue`, затем вернитесь к экрану приложения.
Для последующих запусков одного Metro
достаточно `npm start`, затем клавиши `a`. Не запускайте обе команды одновременно.
Завершение запущенного здесь Metro — `Ctrl+C` в его терминале.

Проект использует стандартные настройки Expo/Metro, без собственных скриптов
управления эмулятором и без файлов, серверов или команд других RN-проектов.

## Фактическая проверка

Регрессия после обновления Node, **2026-11-01**, macOS arm64,
**Node 26.13.0 / npm 11.17.0**:

| Проверка | Фактический результат |
| --- | --- |
| Выбор Node через nvm | Node 26.13.0 установлен с проверкой checksum, npm 11.17.0 |
| `npm ci` | Exit 0, 1248 пакетов из lockfile |
| `npm run typecheck` | Exit 0 |
| `npm run lint` | Exit 0, без предупреждений |
| `npm test -- --watch=false` | Exit 0, 1 suite / 1 test passed |
| `npx expo install --check` | Exit 0, `Dependencies are up to date` |
| `npm audit --json --logs-max=0` | Exit 1, 1 low + 43 moderate, 0 high/critical |
| Manifest / lockfile / Node engines | Согласованы; несовместимых engines в lockfile нет |
| Проверка дерева lockfile | Все записи зависимостей сохранены без изменений; изменён только корневой Node engine |
| `git check-ignore` / `git status` | Секреты и generated output исключены, безопасные примеры разрешены; отслеживаемых секретов/служебных файлов не обнаружено |
| `git diff --check` | Exit 0 |

Для проверки использован nvm 0.40.3 во временном каталоге
`/private/tmp/taskflow-nvm-26130`: установка не меняла системный Node,
shell-профили или пользовательский default alias. Node 26.13.0 выбран как
[LTS-релиз с накопленными security-исправлениями](https://nodejs.org/en/blog/release/v26.13.0).
Версии Expo, React Native, React и остальных зависимостей сохранены.
Android и Metro при этой точечной регрессии повторно не запускались.

Первичная проверка Android **до обновления Node**: **2026-11-01**, macOS arm64,
Node 26.5.0 / npm 11.17.0 (исторический результат):

| Проверка | Фактический результат |
| --- | --- |
| `npm ci` | Успешно, 1248 пакетов установлено из lockfile |
| `npm run typecheck` | Успешно, strict TypeScript |
| `npm run lint` | Успешно, без предупреждений |
| `npm test -- --watch=false` | 1 suite / 1 test passed, без предупреждений конфигурации |
| `npx expo install --check` | `Dependencies are up to date` |
| Проверка процессов/порта | Порт 8082 свободен перед стартом; чужие процессы не завершались |
| `emulator -avd Pixel_6_Pro -no-snapshot-save` | Android API 33, `emulator-5554`, загрузка завершена |
| `npm run android` | Expo Go 58.0.5 установлен CLI; Android bundle: 711 модулей; минимальный экран показан |
| `git diff --check` | Успешно; существующие файлы не удалены |

Команды основного пути выполнены: установка из lockfile → typecheck → lint →
Jest → проверка совместимости Expo → проверка процессов/порта → запуск на Android.
AVD был запущен при предварительной проверке SDK; перед Metro устройство и порт
проверены повторно. Показ экрана подтверждён визуально и через `adb shell
uiautomator dump`: присутствуют оба ожидаемых текста.
[Скриншот Android](docs/verification/foundation-android.png).

Ограничения окружения и зависимостей:

- CLI Expo, npm registry, ADB и эмулятор в ограниченной sandbox потребовали
  разрешённого запуска с доступом к сети и стандартным каталогам инструментов.
- `npm ci` выводит deprecated-предупреждения для ESLint 9 и транзитивных пакетов,
  а также allow-scripts-предупреждения для необязательных `@parcel/watcher` и
  `fsevents`. Установка и запуск прошли без дополнительного разрешения их scripts.
- Известное ограничение, повторный audit **2026-11-01**: **44** записи
  (1 low, 43 moderate), связанные с `minimatch`, `glob` и `deepmerge`.
  Это инструменты разработки/сборки, включая Expo CLI в `dependencies`;
  путь эксплуатации через текущий Android-экран не обнаружен. Риск связан
  с недоверенными glob patterns/деревьями файлов и объектами конфигурации.
  Исправления glob/minimatch выходят за диапазоны текущих родителей,
  исправленного релиза deepmerge нет. Несовместимые обновления и
  `npm audit fix --force` не выполнялись. Повторять audit при изменении
  зависимостей, перед релизом и перед обработкой недоверенных PR в публичном CI
  или открытием dev server для внешнего доступа.
- Metro выводил предупреждение Node о конфликте `NO_COLOR`/`FORCE_COLOR`
  в окружении терминала; это не помешало сборке и показу экрана.

Историческая проверка Expo Go не заменяет автономную Android-сборку, E2E и
проверку сохранности: новые результаты группы 6 приведены в
[Android report](docs/verification/taskflow-android-6/report.md).
iOS и web в рамках этого change не проверяются.

Настройка основана на официальных руководствах
[Expo: Jest и Testing Library](https://docs.expo.dev/develop/unit-testing/)
и [Expo: ESLint](https://docs.expo.dev/guides/using-eslint/).
