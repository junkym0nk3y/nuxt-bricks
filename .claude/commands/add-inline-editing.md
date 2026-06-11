# Добавление inline editing для layout-компонента

Ты — специализированный агент для добавления поддержки inline editing (TipTap) в новый layout-компонент.

## Инструкция пользователя

$ARGUMENTS

---

## Контекст

Inline editing позволяет редактировать текст двойным кликом на канвасе (Notion-style).
Поддерживаемые типы: `textarea` (HTML-разметка) и `inline-content` (текст + медиа сегменты).

### Критические паттерны

- **`shallowRef` для Editor** — TipTap Editor нельзя делать глубоко реактивным. Pinia setup-store использует `shallowRef<Editor | null>`, а не `ref`
- **Флаг `isInternalUpdate`** — предотвращает цикл canvas→store→canvas. Сбрасывается через `Promise.resolve().then()`
- **`@mousedown.prevent`** на кнопках тулбара — предотвращает потерю фокуса TipTap
- **`watchEffect` для транзакций** — реактивность toolbar через счётчик транзакций `editor.on('transaction')`

### Ключевые файлы

```
(пути — от src/runtime/modules/)
editor/stores/inlineEditing.ts             — Pinia setup-store
editor/composables/useInlineEditor.ts      — TipTap lifecycle, lazy init
canvas/components/CanvasInlineEditingOverlay.vue — Floating toolbar
canvas/components/CanvasItem.vue   — dblclick → startEditing
canvas/components/CanvasItemLayout.vue — передаёт :component-id
builder/utils/inlineEditableProp.ts        — находит inline-редактируемое свойство
```

## Алгоритм

### Шаг 1: Обновить компонент

1. Добавить prop `componentId?: string`
2. Добавить свойство с типом `textarea` или `inline-content`

### Шаг 2: Inject и composable

```typescript
import { inject } from 'vue';
import { useInlineEditor } from '../../editor/composables/useInlineEditor';

const inlineEditingContext = inject('inlineEditingContext', null);
const { isEditing, editor, editorContent, initEditor } = useInlineEditor({
    componentId: props.componentId,
    propName: 'myProp', // имя prop
    propType: 'textarea', // или 'inline-content'
});
```

### Шаг 3: Watch на isEditing

```typescript
watch(isEditing, async (editing) => {
    if (editing) {
        await initEditor();
    }
});
```

### Шаг 4: Template

```vue
<template>
    <div v-if="isEditing && editor && editorContent">
        <component :is="editorContent" :editor="editor" />
    </div>
    <div v-else data-tiptap-content v-html="props.myProp" />
</template>
```

**Важно**: на `v-html` элементе обязательно `data-tiptap-content` для rich-text стилей!

### Шаг 5: CanvasItemLayout.vue

Передать `:component-id="props.component.id"` в новый компонент.

### Шаг 6: inlineEditableProp.ts

Добавить распознавание нового пропа в `findAllInlineEditableLayoutProps`.

### Шаг 7: Проверить

```bash
npx vue-tsc --noEmit 2>&1 | grep <changed-files>
npx oxlint <changed-files>
```

## Частые баги

| Симптом                          | Причина                                                     | Где смотреть                                 |
| -------------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| Тулбар не появляется             | `setEditor()` не вызван                                     | `useInlineEditor.ts` → `initEditor()`        |
| Кнопки не реагируют на выделение | Нет подписки на `editor.on('transaction')`                  | `CanvasInlineEditingOverlay.vue`             |
| Клик по кнопке снимает выделение | Нет `@mousedown.prevent`                                    | Кнопки тулбара                               |
| Бесконечный цикл обновлений      | `isInternalUpdate` не сброшен                               | `saveToStore()`                              |
| Editor глубоко реактивный        | `ref()` вместо `shallowRef()`                               | store + composable                           |
| `strong/b` не жирный (v-html)    | Нет пробела в CSS: `.bricks-text[data-tiptap-content]` | `default.scss`                               |
| Редактор не фокусируется         | Нет `await initEditor()`                                    | watch на isEditing                           |
