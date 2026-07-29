# Papercuts

## 2026-07-13 00:05 — Claude Fable 5

Тесты HttpStorageAdapter с fetch-моком → `mockResolvedValue(new Response(...))` отдаёт ОДИН объект Response на все вызовы — второй `response.text()` падает «Body has already been read». Фикс: `mockImplementation(() => Promise.resolve(jsonResponse(...)))`, чтобы каждый вызов получал свежий Response.

## 2026-07-13 00:06 — Claude Fable 5

Составная zsh-команда с `echo ===` → «(eval): == not found»: zsh раскрывает `=word` как путь к бинарю (`=`-expansion). Фикс: кавычить разделители (`echo '---'`).

## 2026-07-13 00:07 — Claude Fable 5

Vitest-спек, импортирующий persistence/server/utils/mediaProcessing → падение «Package import specifier "#nitro-internal-virtual/error-handler" is not defined»: imageProcessing тянет `useAppConfig` из nitropack/runtime. Фикс — известный паттерн репозитория: `vi.mock('nitropack/runtime', () => ({ useAppConfig: () => ({}), useRuntimeConfig: () => ({}) }))` до импортов (см. persistenceMediaUploadSvg.spec.ts).

## 2026-07-13 14:51 — Codex GPT-5

Поиск локального skill `verify` составной zsh-командой → незакрытая двойная кавычка из-за вложенных кавычек и backtick-паттерна; дополнительный `find` шумел на отсутствующих необязательных `.agents`/`.codex`. Фикс: искать простым `rg -S "verify" .` с glob-исключениями и проверять существование необязательных каталогов перед `find`.

## 2026-07-13 14:53 — Codex GPT-5

Чтение Vue-файла с динамическим именем `[pagename].vue` через zsh → `no matches found`, потому что квадратные скобки интерпретировались как glob. Фикс: заключать такие пути целиком в одинарные кавычки.

## 2026-07-21 12:30 — Opus 4.8

Отрисовка тинтов primary в Figma (`use_figma`): `setBoundVariableForPaint(...)` с
последующим `paint.opacity = 0.08` — и даже с `opacity` в исходной краске до привязки —
периодически рендерился сплошной заливкой (100%), хотя readback показывал 0.08. Надёжный
фикс: развернуть возвращённую bound-краску в новый объект — `{ ...boundPaint, opacity: o }`
— тогда и привязка к переменной сохраняется, и opacity применяется при рендере.

## 2026-07-22 22:16 — Codex GPT-5

Чтение Figma page node `229:7` через `get_design_context` по явному node-id → MCP вернул
«You currently have nothing selected», хотя дочерняя доска `229:8` читается по тому же fileKey.
Вероятная причина: page nodes не поддерживаются этим design-context endpoint; использовать
конкретный frame/section node, а page считать только навигационным контейнером.

## 2026-07-24 21:10 — Opus 5

Проверка drag&drop для user-brick в playground: добавил `playground/components/DemoDragProbe.brick.ts`
→ манифест `/api/bricks/components` брик увидел (`brickPath: ../playground/components/...`),
но `findImportModule` не нашёл loader — «Available glob keys: []». Причина: `import.meta.glob`
в `useBrickImports` объявлен от Vite root (playground) как `/components/**/*.brick.ts`, а
`generate-bricks-json` при `npm run dev` пишет путь от корня монорепо, без стрипа `playground/`
(флаг `isPlayground`). Итог: user-bricks в playground не поднимаются, путь «живое превью
карточки» вживую не проверить — только встроенные layout-блоки. Фикс: передавать `isPlayground`
в генератор при dev-запуске (или согласовать префикс в `normalizeBrickPath`).

## 2026-07-24 22:05 — Opus 5

Правки канваса «не применялись» в браузере: `npm run dev` сообщил
«Unable to find an available port (tried 3000) → Using alternative port 3001», потому что
dev-сервер прошлой сессии всё ещё держал 3000. Проверял вживую 3000 (устаревший бандл),
пока не сверил скомпилированный модуль через `curl /_nuxt/@fs/...`. Полезная привычка:
после старта dev читать порт из лога, а при странных «непримененных» правках — грепать
скомпилированный модуль по ключевому символу.

## 2026-07-24 22:08 — Opus 5

`<TransitionGroup>` на канвасе молча не анимировал ничего (ни enter, ни move). Две причины,
обе без предупреждений Vue: (1) `BuilderCanvasItem` был многокорневым (div + Teleport) —
FLIP пропускает такие узлы; (2) у блоков есть `transition: box-shadow` в CSS-модуле с той же
специфичностью, что и глобальный `.bricks-canvas-flow-move`, поэтому `transition-property`
оставался `box-shadow`, а Vue по `hasCSSTransform()` считал, что transform-перехода нет,
и отключал move целиком. Диагностика: клонировать элемент, навесить move-класс и посмотреть
`getComputedStyle(clone).transitionProperty` — ровно то, что делает Vue.

## 2026-07-24 22:19 — Opus 5

Продолжение папercut'а про user-bricks в playground: ручная правка `brickPath` в
`playground/public/bricks.json` на glob-совместимый `/components/<Name>.brick.ts` (+ перезапуск
dev, чтобы `public/` подхватился) убирает ошибку loader'а, но карточка брика в библиотеке
сайдбара всё равно не появляется. То есть путь — не единственная причина; проверять
`useComponentLibrary`/манифест `/api/bricks/components`. Вживую слот-поток канваса из-за этого
не проверяется.

## 2026-07-25 01:05 — Opus 5

Playwright MCP отвалился посреди сессии (сервер отключился), Chrome-расширение
claude-in-chrome тоже не подключено — верификацию DnD пришлось поднимать скриптом:
`npm install --no-save playwright-core` + браузер из кеша `~/Library/Caches/ms-playwright/
chromium-1208/chrome-mac-arm64/...`. Грабли по пути: (1) скрипт в scratchpad не видит
node_modules проекта (ESM-резолв идёт от файла) — держать скрипт в корне репо;
(2) `page.mouse.down/move` НЕ запускает нативный HTML5 DnD ни в headless, ни в headed —
drag-обработчики просто не вызываются; рабочий путь — синтетические `DragEvent` с
настоящим `DataTransfer` через `page.evaluate` (обработчики зон — обычные listeners);
(3) `document.querySelector('.bricks-canvas')` попадает в скрытый measure-probe карточки
сайдбара — в проверках канваса всегда скоупить по `[data-canvas-area="true"]`.

## 2026-07-25 01:45 — Opus 5

Диагностика FLIP-артефактов: контроль «отключим фикс наблюдателем» не работает.
Снимал класс `bricks-canvas--flow-instant` через `MutationObserver`, чтобы
воспроизвести поведение до фикса, — и «до» выглядело так же чисто, как «после»
(0 transform-кадров в обоих прогонах). Причина: наблюдатель асинхронный
(микротаска), а Vue решает применять ли FLIP синхронно в `onUpdated` сразу после
патча — класс к тому моменту ещё на месте. Достоверный контроль — отключить guard
в самом коде (например, временным флагом из query-строки) и прогнать оба варианта.

## 2026-07-26 18:45 — Opus 5

Верификация плейсхолдера через Playwright MCP: `browser_take_screenshot` отчитался
о сохранении файла (`./canvas-state.png`), но на диске его нет ни в CWD, ни в
`.playwright-mcp/` — искал даже `find / -newermt`. Скриншоты в этой конфигурации
доступны только как вложение в ответе инструмента; для проверок геометрии надёжнее
`browser_evaluate` с `offsetWidth`/`getBoundingClientRect` (заодно точнее, чем
глазами по картинке). Второе: `measureProbe` карточек сайдбара меряется в 0 px,
пока над билдером открыт модал восстановления драфта — при синтетических драгах
из библиотеки модал закрывать до замера, иначе плейсхолдер выходит 4×24 px
(border + `MIN_PLACEHOLDER_HEIGHT`) и выглядит как баг размера.

## 2026-07-26 23:30 — Opus 5

Отладка резолва brick-компонентов: `import.meta.glob` в dev не подхватывал
только что созданный `*.brick.ts` при SSR, хотя вотчер манифест перегенерировал.
Vite (`vite:import-glob`) инвалидирует glob-модули корректно, но у vite-node —
SSR-слоя Nuxt — свой кеш, и сбрасывает он его через
`clientServer.watcher.on('all')` → `getModulesByFile(file)` → обход импортёров.
Для нового файла модулей в графе ещё нет, обход не начинается. Обходится
синтетическим событием по файлу самого glob-модуля:
`server.watcher.emit('all', 'change', <путь useBrickImports>)`. Публичного API
для попадания в `invalidates` у Nuxt нет.

Второе: Nuxt поднимает два Vite-сервера с одним набором плагинов, поэтому
`configureServer` вызывается дважды и обработчики вотчера регистрируются дважды.
Различать по `server.config.build.ssr` (клиентский — `false`). У обоих серверов
`httpServer` равен `null` (middlewareMode), так что распространённая очистка через
`server.httpServer?.once('close', …)` не выполняется никогда — тихо мёртвый код.

## 2026-07-27 20:05 — Opus 5

Искал пример brick-файла для верификации (`grep -rln "export const brick"`) →
единственные попадания оказались в `playground/.nuxt/dist/server/_nuxt/*.js.map`,
то есть артефактами прошлой проверки с уже удалёнными исходниками. Полезно как
источник образца, но легко принять за живой код: `.nuxt` не чистится при удалении
файлов. Искать примеры с `--glob '!**/.nuxt/**'`, а найденное в `.nuxt` считать
историей, а не текущим состоянием.

## 2026-07-27 20:06 — Opus 5

Ожидание строки в логе dev-сервера через process substitution —
`until grep -q "..." <(tail -n +N "$log"); do sleep 1; done` — висит до таймаута
инструмента: `tail` без `-f` читает файл до конца мгновенно, но цикл
перечитывает срез, который уже не меняется, если сервер молчит. Надёжнее
`until grep -q "..." "$log"` по всему файлу (или `sleep` + разовый `tail`),
а для однократного ожидания — Bash с `run_in_background` и `until`-циклом.

## 2026-07-27 21:25 — Opus 5

Стресс-проверка dev-вотчера (удаление 30 brick-файлов разом) → каскад
последовательных мягких рестартов: каждый инстанс Nuxt отрабатывает один
`callHook('restart')` (в `@nuxt/cli` обработчик сам себя разподписывает через
`unsub()`), оставшиеся `unlink` подхватывает уже следующий инстанс. В моменте
Vite сыпет `WebSocket server error: Port 24680 is already in use (x27)`, сервер
отдаёт 503 и восстанавливается сам примерно за минуту. Не баг вотчера, но при
`git checkout` большой ветки с brick-файлами выглядит как повисший dev-сервер:
подождать, а не перезапускать руками.

## 2026-07-27 21:35 — Opus 5

Запуск dev-сервера в фоне как `npm run dev 2>&1 | tail -60` → ноль вывода всё
время работы: `tail` без `-f` копит буфер и печатает только на выходе
процесса, поэтому и лог не читается, и ожидание готовности по нему висит.
Долгоживущие процессы в фоне писать в файл (`> dev.log 2>&1`) и ждать
готовности отдельным опросом (по логу или `curl` до ручки).

## 2026-07-27 23:45 — Opus 5

Первый прогон ревью через `codex:codex-rescue` умер молча: job-лог остановился
на `Turn started`, pid исчез (`ps -p` пусто), `broker.sock` в
`/var/folders/.../cxc-*/` так и не появился, `broker.log` нулевой — а
`codex-companion.mjs status --all` продолжал отдавать `status: "running"`,
`phase: "starting"` и тикающий `elapsed` (30 минут). То есть companion не
детектит смерть дочернего процесса и повисший job выглядит как живой.
Ожидание по маркерам в выходном файле в такой ситуации не срабатывает никогда.
Проверять живость через `ps -p <pid>` из `status --json`, повисший job гасить
`codex-companion.mjs cancel <job-id>` и запускать заново с `--fresh` —
повторный прогон в shared-runtime прошёл штатно (13.5 минуты).

## 2026-07-28 14:24 — Opus 5

Мутационная проверка теста: откат мутации через `git checkout <файл>` при
незакоммиченной работе снёс не мутацию, а всю свою правку в этом файле (BM-04 в
`src/api-handlers.ts`) — восстановление вслепую съело бы правку целиком, спасло
только то, что diff был на виду. Перед мутацией класть копию файла в scratchpad
и откатывать из неё; `git checkout` до коммита не использовать.

## 2026-07-28 15:50 — Opus 5

Инструмент `drag` chrome-devtools MCP отдал `Successfully dragged an element`,
но карточка библиотеки на канвас не попала — тот же нативный HTML5 DnD, что и в
записи от 2026-07-25 (мышиные события drag-обработчики не поднимают), только
теперь сбивает с толку успешный ответ инструмента. Проверять результат drag'а по
DOM, а компонент на канвас в проверках заводить импортом схемы JSON (файл в
скрытый `input[type=file]` через `DataTransfer` + `dispatchEvent('change')`) —
это работает и детерминированно.

## 2026-07-28 15:52 — Opus 5

Заведение verify-пользователя по рецепту скилла `verify`
(`docker exec ... psql -c "<INSERT>"`) спотыкается на кавычках: одинарные внутри
`sh -c "…"` рвут строку, а `\x27` psql принимает буквально и падает на
`syntax error at or near "\"`. Рабочий путь — положить SQL в файл и подать на
stdin: `docker exec -i nuxt-bricks-db sh -c 'psql -U "$POSTGRES_USER" -d
"$POSTGRES_DB"' < user.sql`.

## 2026-07-28 16:35 — Opus 5

Ревью через `codex:codex-rescue` с большим промптом («проверь, что заявленные
проверки действительно зелёные») ушло перепрогонять весь набор — `type-check`,
`vitest` целиком, `lint:check`, `prettier`, `budget:bundle` — и умерло на 43-й
минуте в фазе `verifying`, не выдав отчёта; companion при этом продолжал
показывать `running` (детект смерти — по `ps -p <pid>` из `status --json`, см.
запись 2026-07-27 23:45). Полезная часть работы к тому моменту была сделана и
осталась только в job-логе. В промпте ревью писать прямо: проверки прогнаны и
зелёные, повторно не запускать; при нехватке времени отдавать отчёт по
найденному.

## 2026-07-28 19:20 — Opus 5

Проверка правки `src/module.ts` (снял `hot.send({type:'full-reload'})`, чтобы
посмотреть, перезагружает ли страницу сам Vite) дала ложный результат: работающий
`npm run dev` правки модуля не подхватывает вообще, а «Restarting Nuxt…» в логе
относилось к `add` пробного brick-файла — то есть исполнялась прежняя версия
модуля, и full-reload по-прежнему посылали мы. Подсказка была в
`node_modules/.cache/jiti/src-module.*.mjs`: файл кеша старше правки и содержит
снятую строку. Любую проверку поведения `src/module.ts` начинать с полного
рестарта dev-сервера, а не рассчитывать на рестарт от вотчера.

## 2026-07-28 20:38 — Opus 5

Гасил playground-dev перед `npm run dev:build` через `pkill -f "nuxt dev"` — не
сработало: процесс висит как `nuxi dev playground`, так что и `pkill`, и
последующий `pgrep -f "nuxt dev"` его не видят. Сборка упала на lock-файле
(«Another Nuxt dev is already running (PID …)»), причём бюджеты после неё прошли
на **старом** `.output` и выглядели зелёными. Гасить по `pkill -f "nuxi dev"` или
по PID из сообщения; вывод `dev:build` не глотать в `tail` без проверки exit code.

## 2026-07-28 20:47 — Opus 5

Правка `useBuilderDraftPersistence.ts` вызвала diagnostics-уведомление про
`ProbeCard.brick.ts: Cannot find module './ProbeCard.vue'` — файла нет ни в
рабочем дереве, ни в git (пробный brick прошлой сессии удалён). LSP держит
стухшую запись открытого-и-удалённого файла и подмешивает её в отчёт по чужой
правке; сверять такие сообщения с `git status` / `find`, прежде чем идти чинить.

## 2026-07-28 23:32 — Opus 5

Живая проверка гонок через `browser_run_code_unsafe` (Playwright MCP): код
исполняется в процессе Playwright-сервера, где нет `setTimeout` — задержка внутри
`page.route` упала с `ReferenceError: setTimeout is not defined`. Работает
`await page.waitForTimeout(ms)`.

## 2026-07-28 23:34 — Opus 5

`browser_take_screenshot` с относительным `filename` положил PNG в корень
репозитория, а не в gitignored `.playwright-mcp/` — файл сразу всплыл в
`git status`. Указывать путь внутрь `.playwright-mcp/` или сразу удалять после
чтения.
