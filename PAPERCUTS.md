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
