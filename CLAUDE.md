# CLAUDE.md

# Log papercuts

When you encounter small friction while working—a failed tool call, confusing
setup, flaky command, stale cache, misleading error, missing helper, or
non-obvious gotcha—record it in `PAPERCUTS.md`.

Create the file if it does not exist. Append one entry in this format:

## YYYY-MM-DD HH:MM — <model>

<What you were doing> → <what got in the way>. Include a possible cause or fix
when useful.

Log papercuts proactively when they occur, but do not interrupt the main task.
Do not add duplicate entries. Papercuts are minor workflow friction, distinct
from completed-work logs and real bugs or tracked issues.

Краткие инструкции для AI, работающего с репозиторием. Пользовательская и
эксплуатационная документация проекта живёт в `README.md`; не дублировать её
здесь и не добавлять сюда журналы работы, статусы задач или датированные отчёты.

## Перед началом работы

- Читать `README.md` для понимания возможностей, конфигурации и эксплуатации.
- Считать `package.json` источником истины для команд, а
  `.dependency-cruiser.cjs` — для границ между модулями.
- Искать локальный `README.md` в затрагиваемых `composables/` и `utils/`.

## Карта репозитория

- `src/module.ts`, `src/module-setup.ts`, `src/module-runtime-config.ts` —
  build-time настройка Nuxt-модуля; их типы — в `src/types/` (один файл на
  модуль).
- `src/runtime/modules/` — runtime-код по доменам: `builder`, `common`,
  `layouts-blocks`, `persistence`, `render`, `text-editor`, `ui`.
- `src/runtime/server/` — Nitro API, middleware и серверная инфраструктура.
- `playground/` — приложение для локальной разработки.
- `test/` — Vitest-тесты; `migrations/` — миграции БД; `scripts/` — smoke- и
  служебные проверки.

## Архитектурные правила

- Не пытаться пока поддерживать обратную совместимость, проект в стадии активной разработки и нигде не опубликован
- Использовать явные относительные импорты локального runtime-кода: его
  auto-import отключён.
- Соблюдать слоистость из `.dependency-cruiser.cjs`: `common` и `ui` — нижние
  слои, `render` не зависит от `builder`, `persistence` остаётся server-only.
- Не протаскивать builder-only зависимости в published renderer или общий
  entry-бандл. Layout-блоки описываются через definitions и registry; Vue-
  компоненты leaf-блоков подключаются лениво.
- Не хардкодить маршруты `/bricks`, `/preview`, имена роутов и пути публичных
  assets: использовать константы и helpers из `common`.
- Любой недоверенный HTML/SVG перед `v-html` или `innerHTML` пропускать через
  `common/utils/sanitize/`.
- Не редактировать уже выпущенные миграции; изменения схемы оформлять новой
  forward-миграцией.
- При добавлении или удалении файла в `composables/` или `utils/` обновлять
  локальный `README.md` этой папки.

## Делегирование задач в Codex

- У Codex **свой рабочий Figma MCP** (сервер `codex_apps`, полный набор `figma_*`:
  `get_design_context`, `get_screenshot`, `get_metadata`, `get_variable_defs`, `use_figma`).
  Figma MCP Claude Code (`plugin:figma:figma`) — отдельный инстанс; codex-плагину мои
  MCP-серверы НЕ пробрасываются, у codex свой коннектор.
- Когда пользователь просит **передать задачу Codex «с макетами»** — делегировать через
  сабагента `codex:codex-rescue` (команда `codex:rescue`) и класть в промпт **fileKey +
  конкретные node-id** (что и где сделать). Codex сам вытянет спеки/скриншоты/переменные
  из макета. **Не** скармливать Codex текстовый пересказ дизайна вместо узлов.
- Всегда для этого агента использовать модель gpt-5.6-sol high
- Всегда указывать информацию по скиллам, которые у тебя есть, включая принятые нами правила и code-style
- Запрещать коммиты
- Перепроверять результаты за агентом на своей стороне

### Ревью законченной работы

Ревью у Codex проходит **каждая** законченная правка — это внешний читатель, а не
линтер.

- **Все проверки прогонять до передачи** (см. «Проверки» ниже) плюс живую
  верификацию, если правка того требует. В промпте писать прямо: проверки
  прогнаны и зелёные, повторно не запускать, смотреть код и решения. Без этого
  Codex уходит перепрогонять `vitest`/`lint`/`prettier`/`dev:build` и умирает в
  фазе `verifying`, не выдав отчёта (проверено: 43 минуты и смерть против 9:45 с
  запретом).
- **Diff не пересказывать и не вставлять** — Codex снимает его сам. От меня
  нужна задача: что за пункт, что сделано, какие решения приняты и почему, где
  лежит раздел документации.
- **Ревью свободное.** Не сводить к чеклисту вопросов и не задавать формат
  отчёта — искать он должен там, где сочтёт нужным.
- Найденное перепроверять на своей стороне: Codex бывает неправ (BM-15 — два
  вывода пришлось поправить по фактам), поэтому принимать находки только с
  подтверждением.
- Companion не замечает смерть дочернего процесса: если `status` держит
  `running`, проверять `ps -p <pid>` из `status --json`, зомби гасить
  `cancel <job-id>` и перезапускать с `--fresh`.

## Проверки

Выбирать проверки по области изменения и сообщать, что было запущено:

- `.ts` / `.vue`: `npm run type-check` и `npx oxlint <changed-files>`;
- стили: `npx stylelint <changed-files>`;
- логика: релевантный `npx vitest run <test-file>`;
- границы импортов: `npm run deps:check`;
- широкие или релизные изменения: `npm run lint:check`, `npm test`, затем при
  необходимости `npm run build`, `npm run dev:build` или подходящий smoke-тест.
