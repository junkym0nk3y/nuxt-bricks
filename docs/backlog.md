# Бэклог

**Дата среза:** 12 июля 2026 года
**Источник:** `docs/application-audit-2026-07-12.md` (комплексный аудит + три итерации ре-ревью).

Технический спринт по аудиту завершён: оба P0 (A-01, A-02) и все восемь P1
(A-03…A-10, включая integration-часть A-06) закрыты по критериям приёмки —
ветка `audit-p1-remediation`, детали и коммиты в файле аудита. Ниже — только
незакрытые задачи.

## P2 — следующий технический спринт

### A-11. Параметры scrypt на уровне OWASP-минимума

**Файлы:** `src/runtime/server/utils/auth/passwords.ts`, `src/cli/bricks-hash-password.mjs`.

Используется `N=2^14, r=8, p=1`. Рекомендация OWASP для scrypt начинается с
`N=2^17, r=8, p=1` либо эквивалентных trade-off конфигураций; вариант с
`N=2^14` указан с `p=5`. Самоописывающий формат хеша уже допускает плавную
миграцию — практический риск низкий.

**Исправление:** benchmark на минимальном production instance, выбрать baseline,
генерировать новые хеши с ним и rehash-on-login для старых; синхронно обновить
dummy hash и учесть bounded-семафор scrypt (введён в A-04).

### A-12. CLI раскрывает пароль локальным наблюдателям

**Файлы:** `src/cli/bricks-hash-password.mjs`, `README.md`.

README рекомендует передавать пароль в argv (остаётся в shell history, виден в
process list); интерактивный `readline.question()` отображает ввод.

**Исправление:** скрытый TTY prompt с подтверждением или чтение из stdin/file
descriptor для automation; по умолчанию отклонять positional password; обновить
документацию.

### A-13 + browser-E2E из A-06. Доступность media UI и браузерный release gate

**Файлы:** `BuilderMediaGalleryGrid.vue`, `BuilderMediaGalleryPreviewLightbox.vue`,
`BuilderShellSidebarPropertyImageGalleryEditor.vue`, CI workflows.

Выбор/замена медиа и empty state — кликабельные `div` без button semantics и
keyboard handler; несколько icon-only buttons без accessible name; lightbox не
объявлен как dialog, не обрабатывает Escape, не управляет фокусом и не
возвращает его инициатору.

Из A-06 сюда перенесён browser-E2E-трек: полный editor/public lifecycle
(login → create/import → edit → save → publish → public reload →
conflict/restore) + coverage thresholds для security/persistence/session кода.

**Исправление:** настоящие `button`, локализованные accessible names, modal
dialog pattern с focus trap/restore и Escape; browser-E2E на основной lifecycle
с axe-проверками в CI; отдельные coverage thresholds.

### A-14. npm-пакет не готов юридически и операционно

**Блокер публичного npm-релиза.**
**Файлы:** `package.json`, корень репозитория.

`package.json` объявляет MIT, но файла LICENSE в корне и tarball нет (только
лицензия шрифта Inter). Поле `repository` указывает `saintfr3ak/nuxt-bricks`,
git remote — `junkym0nk3y/nuxt-bricks`. Нет `CHANGELOG.md`, `SECURITY.md`,
`CONTRIBUTING.md` и release workflow.

**Исправление:** подтвердить правообладателя/лицензию, добавить root `LICENSE`,
исправить repository/homepage/bugs, подготовить changelog, security contact,
provenance/release workflow и повторный pack smoke.

### A-15. Builder bundle и deprecated dependencies без гейта

Playground production build: builder client chunk ~1,05 МБ minified / 316 КБ
gzip; предупреждения о компонентах, импортируемых одновременно статически и
динамически (code splitting для них не работает). Отдельного budget для builder
route, CSS и fonts нет. Fresh consumer install сообщает deprecation для
`vue-i18n@10`, `unplugin-vue-router@0.19`, `glob@10` (известных уязвимостей
нет); целевая линия Vue I18n — v11.

**Исправление:** анализ/budget builder entry, устранить смешанные
static/dynamic imports, проверить lazy boundaries и font delivery; обновить
верхнеуровневые пакеты, удерживающие deprecated transitives, после
compatibility-тестов.

## До версии 1.0 — архитектурные решения

Задокументированные ограничения, требующие явного решения (см. «Архитектурные
ограничения» в аудите):

1. **Single-tenant / RBAC** — сейчас один уровень editor-доступа; для
   SaaS/multi-user нужны tenant key, ownership и RBAC во всех
   page/media/session запросах.
2. **Distributed rate limits** — in-memory limiters per-process; multi-replica
   требует shared store либо ingress enforcement (осознанное отступление A-04:
   внешний shared limiter не реализован, остаётся рекомендацией README).
3. **Upload memory sizing** — multipart буферизуется в памяти целиком; нужны
   reverse-proxy body limits и memory sizing (README).

## Документированные ограничения (не задачи, но помнить)

- **A-05**: без `bricks.proxy.healthUrl` readiness proxy-пути — только
  reachability-fallback (< 500 = жив); неверный путь `PROXY_URL` или
  отсутствующий editorial API на живом хосте не детектируется.
- **A-10**: средам, успевшим записать старый checksum `0001` новым CLI
  (внутренние стенды ветки), нужен ручной сброс drift'а (путь в README);
  осиротевшую копию `update_updated_at_column()` после 0005 оператор убирает
  вручную.
- Smoke/integration-гейты не заменяют внешний penetration test, DAST и
  нагрузочные испытания.
