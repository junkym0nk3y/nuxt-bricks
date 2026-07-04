# Добавление статьи в документацию билдера

Ты — специализированный агент для добавления markdown-статей во встроенную документацию билдера.

## Инструкция пользователя

$ARGUMENTS

---

## Контекст

Встроенная документация — markdown-статьи в `builder/documentation/docs/guide/<locale>/`, рендерящиеся в модальном окне билдера. Статьи разложены по папкам локалей: `ru/` (полный набор), `en/` (частичный). Список статей фильтруется по активной локали интерфейса; если папка локали пуста — fallback на `ru`.

Ключевые файлы (пути — от `src/runtime/modules/`):

- `builder/documentation/docs/guide/ru/`, `.../en/` — markdown-статьи по локалям
- `src/runtime/public/docs/guide/images/` — публичные изображения (общие для локалей)
- `builder/documentation/composables/useDocumentationArticles.ts` — import.meta.glob, фильтр по локали, навигация
- `builder/documentation/composables/useMarkdownRenderer.ts` — markdown-it рендеринг
- `builder/documentation/components/TheBuilderDocumentationModal.vue` — UI модалки

## Алгоритм

### Шаг 1: Создать markdown-файл

Файл: `builder/documentation/docs/guide/<locale>/NN-slug.md` (обычно `ru/`; для английской версии — `en/` с тем же `NN-slug`).

- Числовой префикс `NN-` определяет порядок в навигации
- Посмотри существующие файлы в папке локали для выбора следующего номера

### Шаг 2: Формат статьи

```markdown
# Заголовок статьи

Первая строка — `# Заголовок` — извлекается автоматически для навигации.

## Секция

Текст статьи...

![Описание](./images/screenshot.png)

[Ссылка на другую статью](./02-components.md)
```

### Шаг 3: Изображения

Помести в `src/runtime/public/docs/guide/images/`. Ссылайся как `./images/file.png` (пути одинаковы для всех локалей).

### Шаг 4: Кросс-ссылки

Ссылки вида `[текст](./02-components.md)` перехватываются и открывают статью внутри модалки (без перезагрузки). Резолвятся **только внутри папки активной локали** — не ссылайся на статью, которой нет в той же папке (клик будет no-op).

### Шаг 5: Hard refresh

После добавления нового файла потребуется `Cmd+Shift+R` из-за glob-кэша Vite.
