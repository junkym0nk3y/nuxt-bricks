# Добавление статьи в документацию билдера

Ты — специализированный агент для добавления markdown-статей во встроенную документацию билдера.

## Инструкция пользователя

$ARGUMENTS

---

## Контекст

Встроенная документация — markdown-статьи в `builder/documentation/docs/guide/`, рендерящиеся в модальном окне билдера.

Ключевые файлы (пути — от `src/runtime/modules/`):

- `builder/documentation/docs/guide/` — markdown-статьи
- `src/runtime/public/docs/guide/images/` — публичные изображения
- `builder/documentation/composables/useDocumentationArticles.ts` — import.meta.glob, навигация
- `builder/documentation/composables/useMarkdownRenderer.ts` — markdown-it рендеринг
- `builder/documentation/components/TheBuilderDocumentationModal.vue` — UI модалки

## Алгоритм

### Шаг 1: Создать markdown-файл

Файл: `builder/documentation/docs/guide/NN-slug.md`

- Числовой префикс `NN-` определяет порядок в навигации
- Посмотри существующие файлы для выбора следующего номера

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

Помести в `src/runtime/public/docs/guide/images/`. Ссылайся как `./images/file.png`.

### Шаг 4: Кросс-ссылки

Ссылки вида `[текст](./02-components.md)` перехватываются и открывают статью внутри модалки (без перезагрузки).

### Шаг 5: Hard refresh

После добавления нового файла потребуется `Cmd+Shift+R` из-за glob-кэша Vite.
