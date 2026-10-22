# Добавление иконки в BricksIcon

Ты — специализированный агент для добавления новых иконок в систему `<BricksIcon />`.

## Инструкция пользователя

$ARGUMENTS

---

## Контекст

Иконки используются через `<BricksIcon icon="prefix:name" />`.
Реестр разделён на два файла (published-страницы не грузят builder-набор):

- `plugins/icons/systemIconsRegistry.ts` — ядро `SYSTEM_ICONS` (только иконки, нужные на published/preview: photo/video/x/device-*)
- `plugins/icons/builderIcons.ts` — `BUILDER_ICONS`, весь UI билдера (lazy-чанк, доливается на `/bricks`)

Новые иконки почти всегда добавляются в `BUILDER_ICONS`; в ядро — только если иконка рендерится на published/preview.
Пакет: `@kalimahapps/vue-icons`. Паки: `ph` (Phosphor), `md` (Material Design), `bs` (Bootstrap), `cl`, `an`, `ak`, `fa`, `ca`, `cd`, `th`, `ti`, `re`, `ui`.

## Алгоритм

### Шаг 1: Найти иконку

Используй MCP-сервер `vue-icons` (`find-icon`) для поиска, **НО** проверяй реальное имя экспорта:

```bash
node -e "import('@kalimahapps/vue-icons/bs').then(m => console.log(Object.keys(m).filter(k => k.match(/KEYWORD/i))))"
```

Заменить `bs` на нужный пак и `KEYWORD` на поисковое слово.

### Шаг 2: Импортировать в `plugins/icons/builderIcons.ts`

```typescript
import { BsNewIcon } from '@kalimahapps/vue-icons/bs';
```

**НЕ используй `import *`** — это ломает Rollup из-за конфликта с `@codemirror`.

### Шаг 3: Зарегистрировать в `BUILDER_ICONS`

```typescript
'bs:new-icon': BsNewIcon,
```

Именование ключа: `prefix:kebab-case-name` (например `bs:moon-fill`, `ph:check-circle`).

### Шаг 4: Использовать

```vue
<BricksIcon icon="bs:new-icon" />
```

## Важно

- MCP-сервер `find-icon` возвращает display-имена (`ak:moon`), но реальные экспорты могут отличаться — всегда проверяй через `node -e`
- Если иконка не найдена в рантайме, в консоли будет: `[BricksIcon] Icon not found: ...`
