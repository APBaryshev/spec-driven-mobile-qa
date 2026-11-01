# Android verification — group 6

Дата: 2026-11-01, macOS arm64. Base commit:
`7353759e64e27d757460e91bc5dfbee10a0cab9b`; проверено рабочее дерево с изменениями
группы 6 (новый commit не создавался). Данные во всех новых E2E синтетические.

## Самостоятельная сборка — 6.1

Build identifier: `dev.taskflow.app/0.1.0(1)/release/arm64-v8a`.
APK SHA-256: `1c3d6acb5c3f0d7094aa61dfe3f3975e0cb667467de0ae7950ce2c69182a13fa`.
APK не включён в Git (20 MiB); локальный путь:
`android/app/build/outputs/apk/release/app-release.apk`.

Node 26.13.0, npm 11.17.0; Expo 58.0.22, RN 0.88.1, React 19.3.0,
AsyncStorage 2.2.0, safe-area-context 5.10.1.
JDK OpenJDK 17.0.20, Gradle 9.4.1, AGP 9.2.1, Kotlin 2.2.10,
NDK 27.1.12297006, Build Tools 37.0.0, compileSdk 37 / targetSdk 36 / minSdk 24.
Стандартный Expo template подписывает release тестовым debug key;
подпись для публикации в магазине вне этого change.

```sh
nvm use
npm ci
export ANDROID_HOME="$HOME/Library/Android/sdk"
npm run android:prebuild
npm run android:build
adb -s emulator-5554 install -r android/app/build/outputs/apk/release/app-release.apk
adb -s emulator-5554 shell am start -W -n dev.taskflow.app/.MainActivity
```

Фактически prebuild выполнен как `npx expo prebuild --platform android --no-install`,
сборка — `./android/gradlew -p android assembleRelease
-PreactNativeArchitectures=arm64-v8a --console=plain`, под Node 26.13.0 и указанным
ANDROID_HOME. Это те же стандартные команды, закреплённые в npm scripts.
Результат: **BUILD SUCCESSFUL in 5m 13s, 371 executed**.
Gradle установил отсутствовавшие Build Tools 37.0.0 через принятые SDK licenses.
Предупреждения: deprecated API зависимостей/Gradle 10, Kotlin catalog 2.2.0
заменён plugin version 2.2.10; сборка завершилась успешно.
Повторная документированная `npm run android:build`: exit 0,
**BUILD SUCCESSFUL in 15s**, 8 executed / 363 up-to-date; SHA-256 APK совпал.
[Краткий итог Gradle](build.txt). Это повтор на том же toolchain/кеше,
не обещание побитовой воспроизводимости на любой машине.

`unzip -l` подтвердил `assets/index.android.bundle` (1 285 680 bytes),
`libhermesvm.so`, `libreactnative.so`; `output-metadata.json` — release,
applicationId `dev.taskflow.app`, versionName 0.1.0, versionCode 1.
Package flags не содержат DEBUGGABLE. `am start -W` в основном профиле:
Status ok, LaunchState COLD, Activity `dev.taskflow.app/.MainActivity`.
Metro на localhost:8082 не слушает, dev server для запуска не использовался.

## Устройство и изоляция

AVD Pixel_6_Pro, emulator-5554, Android 13 / API 33, Google APIs arm64-v8a;
emulator 37.1.11.0, adb 37.0.1, Maestro 2.6.1. Эмулятор запущен стандартным
`emulator -avd Pixel_6_Pro -no-snapshot-save`.

Перед установкой `pm list packages dev.taskflow.app` не нашёл package в основном
профиле. Существующие данные Expo Go/других приложений не очищались.
Сначала создан отдельный пользователь `TaskFlowE2E` (10), APK установлен только
ему (`adb install --user 10 -r ...`). Собственный ADB-запуск прошёл, но Maestro
01 завершился Failed до проверки UI: AndroidDriver сообщил
`Package dev.taskflow.app is not installed` (его package lookup использует owner).
Это ограничение окружения, не успешный E2E и не дефект формы.

Затем выполнены `am switch-user 0` и
`cmd package install-existing --user 0 dev.taskflow.app`. Получена новая пустая
установка, изолированная собственным package; существующей пользовательской
установки TaskFlow здесь не было. Вторичный профиль оставлен для ревью;
его данные не выдаются за данные основного E2E.

Flows сами ничего не очищают. Независимые сценарии запускаются только на
выделенной тестовой установке с явно проверенным пустым состоянием.
Между созданием и проверкой persistence нет переустановки, очистки или clearState.
На устройстве с пользовательскими задачами эти сценарии запускать нельзя:
используйте отдельный AVD. Обычный повторный `adb install -r` сохраняет данные
при совпадении подписи; он не создаёт чистое предусловие.

## Повторение Maestro

Не запускайте каталог целиком: у независимых flow разные предусловия.
Во всех командах ниже `--device emulator-5554`; на другой машине укажите свой serial.
Нужен owner-профиль выделенного тестового AVD. Перед началом убедитесь, что
package не содержит пользовательских задач. Для повторения на той же **тестовой**
установке начальное состояние задаёт `adb shell pm clear --user 0 dev.taskflow.app`.
Эта команда удаляет данные и допустима только на синтетической тестовой установке.

```sh
# Empty test installation: 01 leaves storage empty; 02 creates exactly three rows.
maestro --device emulator-5554 test .maestro/flows/01-validation.yaml --format junit --output /private/tmp/taskflow-6-validation.xml
maestro --device emulator-5554 test .maestro/flows/02-creation-persistence.yaml --format junit --output /private/tmp/taskflow-6-persistence.xml

# Independent long-list scenario; reset synthetic data BEFORE creating its fixture.
adb shell pm clear --user 0 dev.taskflow.app
maestro --device emulator-5554 test .maestro/flows/03-long-list.yaml --format junit --output /private/tmp/taskflow-6-long-list.xml

# Independent offline scenario; reset BEFORE creating its fixture.
adb shell pm clear --user 0 dev.taskflow.app
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
adb shell settings get global airplane_mode_on
adb shell settings get global wifi_on
adb shell settings get global mobile_data
adb shell dumpsys connectivity
adb shell ip route
maestro --device emulator-5554 test .maestro/flows/04-offline-background.yaml --format junit --output /private/tmp/taskflow-6-offline.xml
```

Не очищайте данные после 04 перед 05: flow 05 только проверяет три сохранённые
строки после внешнего lifecycle-воздействия. `assert-three-tasks.yaml` читает
каждую строку по существующему testID и индексу, сравнивает полный текст:
`Newest`, `Same task`, `Same task`, затем проверяет отсутствие четвёртой строки.
Все три строки должны одновременно помещаться на baseline-экране; это не
универсальный подсчёт виртуализированных элементов произвольного длинного списка.
Длинный список отдельно проверяет реальную прокрутку до самого старого названия
в 100 символов и обратно до формы/новейшей строки.

В helper создания пустой EditText проверяется с учётом Maestro 2.6.1:
`copyTextFrom` возвращает первый непустой `text`, затем `hintText`, затем
`accessibilityText`. Это подтверждено локальным `javap -c -p` класса
`maestro.orchestra.Orchestra`, метод `resolveText` из установленного JAR.
После очистки поля он возвращает «Название задачи»; повторная отправка получает
«Введите название задачи.», а число строк далее остаётся точным.
Это исключает ложный успех при неочищенном отправленном названии.
При разработке flow первоначальные `text: ^$` и сравнение copiedText с пустой
строкой завершились Failed; лишний hideKeyboard при уже закрытой клавиатуре
отправлял Activity назад и давал Element not found. Эти проверки исправлены
в YAML, приложение для обхода ограничений Maestro не менялось.

Семантика команд сверена с
[launchApp](https://docs.maestro.dev/reference/commands-available/launchapp),
[stopApp](https://docs.maestro.dev/reference/commands-available/stopapp),
[copyTextFrom](https://docs.maestro.dev/reference/commands-available/copytextfrom).
В установленном `maestro-client.jar` `AndroidDriver.stopApp` вызывает
`am force-stop`, а `killApp` — `am kill` (проверено через `javap -c -v -p`).
Поэтому stop/launch в 02/04 обозначается как force-stop/launch.

## Сеть

Исходные raw settings: airplane_mode_on=0, wifi_on=1, mobile_data=1.
После `cmd connectivity airplane-mode enable`, `svc wifi disable`,
`svc data disable`:

```text
settings global airplane_mode_on: 1
settings global wifi_on: 0
settings global mobile_data: 1
cmd connectivity airplane-mode: enabled
cmd wifi status: Wifi is disabled
telephony.registry: mUserMobileDataState=false; mDataConnectionState=0
dumpsys connectivity: Active default network: none
ip route: (empty)
ping -c 1 -W 2 1.1.1.1: connect: Network is unreachable (exit 2)
```

Сырой mobile_data остался 1; он не выдаётся за фактический mobile connection.
Отсутствие сети подтверждают connectivity/маршруты/telephony и неудачный ping.
Это состояние Android, не mock запроса приложения. USB/локальный ADB-канал
Maestro не означает доступность сети внутри Android.

## Фактические результаты

| Flow | Результат | Доказательство |
| --- | --- | --- |
| [01-validation](../../../.maestro/flows/01-validation.yaml) — первый запуск, пустое/пробельное/101-символьное название, полный ввод сохранён | **Passed**, 44s | [JUnit](validation.xml) |
| [02-creation-persistence](../../../.maestro/flows/02-creation-persistence.yaml) — trim, очистка формы, два одинаковых названия, порядок/ровно 3 строки, force-stop/launch | **Passed**, 41s | [JUnit](persistence.xml), [экран после восстановления](persistence.png) |
| [03-long-list](../../../.maestro/flows/03-long-list.yaml) — 15 задач, полное название 100 символов, скролл вниз/к форме | **Passed**, 175s | [JUnit](long-list.xml), [низ](long-list-bottom.png), [верх](long-list-top.png) |
| [04-offline-background](../../../.maestro/flows/04-offline-background.yaml) — создание, HOME/возврат, force-stop/launch без сети | **Passed**, 46s | [JUnit](offline.xml), [offline-восстановление](offline-restored.png) |
| [05-verify-restored](../../../.maestro/flows/05-verify-restored.yaml) после пересоздания Activity | **Passed**, 3s | [JUnit](activity.xml) |
| Тот же 05 после завершения фонового процесса `am kill` | **Passed**, 2s | [JUnit](process.xml) |
| Тот же 05 после отдельного `am force-stop` с проверкой PID | **Passed**, 3s | [JUnit](force-stop.xml) |
| Native остановка во время reconciling / background при unknown | **Blocked**, native fault injection не выполнялась | Точные integration-проверки и ручной метод ниже |

Итого финальных запусков: **7 Passed**, 0 Failed; один native fault-сценарий
Blocked, не включён в число Passed. Первоначальный Failed в профиле 10 и ошибки
разработки селекторов описаны выше, не скрываются финальными успешными результатами.
JUnit — сырые итоговые отчёты Maestro. Массовые hierarchy/debug JSON и временные
логи оставлены вне репозитория в `/private/tmp/taskflow-6-maestro`.

### Различённые lifecycle-воздействия

Все дополнительные проверки ниже выполнены на трёх задачах, созданных flow 04,
при всё ещё выключенной сети. Между ними storage не очищался и не изменялся.

| Воздействие | Команда и фактическое наблюдение | Видимый результат |
| --- | --- | --- |
| Пересоздание Activity без остановки процесса | `adb shell am start -W -f 0x10008000 -n dev.taskflow.app/.MainActivity` (NEW_TASK/CLEAR_TASK). PID **15446 → 15446**. ActivityRecord **9795680 → 1e102a**, LaunchState WARM, Status ok | 05 Passed: тот же список, 3 строки, тот же порядок |
| Остановка фонового процесса | HOME; подтверждён launcher в topResumedActivity; `adb shell am kill --user 0 dev.taskflow.app`; `pidof` пуст, exit 1. Затем `am start -W -n ...`, COLD; PID **15446 → отсутствует → 16424** | 05 Passed: тот же список без дубликатов |
| Обычный фон/возврат | `input keyevent KEYCODE_HOME`; `am start -W -n ...`; PID **16424 → 16424**, task brought to front | В 04 HOME + `launchApp: stopApp: false` уже проверен тем же assert-three-tasks; отдельный PID подтверждает отличие от process death |
| Force-stop | `adb shell am force-stop --user 0 dev.taskflow.app`; `pidof` пуст, exit 1; `am start -W -n ...`, COLD; PID **16424 → отсутствует → 16866** | 05 Passed: тот же список, число и порядок |

Первый `am kill` сразу после HOME оставил PID 15446 живым: переход ещё не был
подтверждён. Он не засчитан как process death. Повтор выполнен после проверки
launcher, отсутствие PID подтверждено отдельно. Попытка текстового флага
`--activity-new-task` не поддерживается API 33 (exit 255); успешная проверка
использует приведённую маску flags. Ни одна из этих команд не очищает storage.
Это не симуляция low-memory killer, аппаратного сбоя или остановки посреди I/O.

После 04 и после всех lifecycle-проверок повторно получены
`Active default network: none`, пустой `ip route`, ping exit 2
`Network is unreachable`. Сетевые настройки восстановлены командами:

```sh
adb shell cmd connectivity airplane-mode disable
adb shell svc wifi enable
adb shell svc data enable
```

Контрольные raw settings после восстановления: **0 / 1 / 1**, как до проверки.
Чтение непосредственно после переключения временно вернуло mobile_data=0;
повтор после завершения перехода — 1, затем исходное значение 1 дополнительно
закреплено `settings put global mobile_data 1` / `svc data enable`.
`cmd wifi status` подтвердил подключение к AndroidWifi.
Три подтверждённые синтетические задачи оставлены в тестовой установке для ревью.

## Совокупная проверка — 6.4

Команды выполнялись с Node 26.13.0 / npm 11.17.0 из
`/private/tmp/taskflow-nvm-26130/versions/node/v26.13.0/bin` в PATH.
Использованы установленные зависимости закреплённого package-lock.json;
изменены только npm scripts, версии/lockfile не менялись.

| Команда / проверка | Фактический результат |
| --- | --- |
| `npm test -- --watch=false` | Exit 0, **6 suites / 136 tests passed**, без snapshots |
| `npm run typecheck` | Exit 0, strict TypeScript |
| `npm run lint` | Exit 0, ESLint, 0 warnings |
| `openspec validate task-management-foundation --strict` | Exit 0, valid |
| `git diff --check` | Exit 0 |
| Android prebuild / release build / install / launch | Passed, подробности и build.txt выше |
| Maestro | 7 Passed, сырые JUnit и границы выше |
| Относительные ссылки README/storage/traceability/tasks/report | Проверены локальным Path.exists; ссылки на строки — в границах файлов |
| Разделение UI / логики / хранения, сверка всех TM-сценариев | Выполнены; [актуальная матрица](../../traceability.md#сверка-сценариев-tm-01tm-12-группа-6) различает уровни доказательств |

Завершены **6.1–6.4**, прогресс **20/21**. Единственная незавершённая задача —
**5.3** (слуховое подтверждение TalkBack человеком). Native fault-сценарии
зафиксированы с ограничениями, не объявлены успешными. Известные audit findings
зависимостей остаются описанными в README; новый npm audit не выполнялся,
поскольку зависимости не менялись. Проверенный выпуск ограничен API 33 arm64,
другие Android API/ABI не выдаются за проверенные.

После группы 6 работа остановлена для независимого ревью. Commit, push,
OpenSpec sync/archive и новый change не выполнялись.

## Review и ограничения доказательств

Направление зависимостей проверено по исходникам: `model.ts` содержит чистые
правила без Expo/UI; `taskId.ts` изолирует UUID; `taskStorage.ts` — единственный
импорт AsyncStorage; `useTasks.ts` владеет загрузкой/записью и согласованием;
`TasksScreen.tsx` хранит только draft/feedback и вызывает hook;
`App.tsx` связывает один стабильный storage с экраном. Новых писателей,
debug UI, fault switches, runner или фреймворка не добавлено.
В исходниках приложения нет сетевых вызовов или логирования названий.

Native-модули проверяются обычным пользовательским путём этой release-сборки:
успешное создание вызывает `generateTaskId` → Expo `uuid.v4`. В установленном
`expo-modules-core/src/uuid/index.ts` Android-путь требует native
`globalThis.expo.uuidv4` и бросает ошибку при его отсутствии, JS fallback нет;
`CoreModule.kt` вызывает `UUID.randomUUID()`.
Generated PackageList содержит `AsyncStoragePackage` и `ExpoModulesPackage`.
Сохранность после уничтожения процесса подтверждает работу настоящего Android
AsyncStorage, не Jest mock. Выбран стандартный backend 2.2.0:
`AsyncStorage_useNextStorage` не задан, default false в package `config.gradle`.
Внутренние UUID/полные снимки здесь не читаются из UI или private DB:
точные ID проверяются unit/integration (см. traceability).

Остановка native процесса именно во время `reconciling` и возврат из фона при
`outcomeUnknown` **Blocked для native E2E**: обычный быстрый storage не позволяет
надёжно попасть в это состояние, а безопасного native fault injection здесь нет.
Не делаем вывод из force-stop после подтверждённой записи. Поведение покрыто
integration `new session after interrupted reconciliation loads %s without replay`
(sent/base/loadError) и `keeps unknown across failed rechecks and foreground
transitions, then permits retry on base` в
[use-tasks.test.tsx](../../../tests/use-tasks.test.tsx).
Если потребуется отдельное native-доказательство, выполнить ручной прогон
на изолированной инструментированной тестовой сборке: задержать завершившийся
ошибкой save/control read, убедиться в видимом reconciling, остановить процесс,
запустить и проверить фактический sent/base либо loadError без повторного save.
Такое вмешательство требует отдельного обоснования; в проверенный release
специальные переключатели не добавлялись.

Ошибки I/O/формата и длительные loading/saving/reconciling/outcomeUnknown,
блокировки и безопасные retry проверены управляемыми promises в Jest,
не объявляются native E2E Passed. Локальность данных подтверждена review,
offline-прогоном и тестами безопасных диагностик, не packet/security audit.
Нет гарантии аппаратной сохранности при произвольном отказе накопителя.

5.3 остаётся открытой: нет подтверждённого человеком прослушивания TalkBack.
Предыдущие аудиозаписи и результаты UI группы 5 не изменялись. Для закрытия 5.3
человек должен проверить фразу поля (включая label + labelledBy), сообщения,
ошибки, disabled/busy и доступность retry; без UiAutomation, подавляющей TalkBack.
Maestro не подменяет эту проверку. iOS/Swift/XCUITest/KMP вне текущего change.
