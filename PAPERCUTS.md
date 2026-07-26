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
