# Добавление модального окна в билдер

Ты — специализированный агент для добавления новых модальных окон в систему лендинг-билдера.

## Инструкция пользователя

$ARGUMENTS

---

## Контекст

Любой компонент с `category: 'Modal'` в `.brick.ts` автоматически:

- Обнаруживается через stories system
- Исключается из левого сайдбара (не перетаскивается на канвас)
- Появляется в `modal-select` селекторах

Ключевые файлы:

- `composables/useModals.ts` — загрузка и кэширование модалок
- `getModalOptions()` — список доступных модалок для селекторов
- `getModalComponent()` — динамический импорт модалки по имени

## Алгоритм

### Шаг 1: Создать Vue компонент модалки

Размести в `playground/components/modals/` (или соответствующей папке).
Следуй конвенциям из `.claude/rules/vue-sfc.md`.

### Шаг 2: Создать `.brick.ts` story файл

```typescript
import { defineComponent, h } from 'vue';
import Component from './MyModal.vue';
import type { IBrickFileStructure } from '../../common/types';

export const story: IBrickFileStructure = {
    category: 'Modal', // <-- Обязательно 'Modal'
    values: {}, // <-- Пустой для модалок
};

export default defineComponent({
    name: 'MyModalDemo',
    components: { Component },
    setup() {
        return () => h(Component);
    },
});
```

### Шаг 3: Регенерировать stories

```bash
npm run bricks:gen
```

### Шаг 4: Использование в компонентах

В `.brick.ts` компонента-потребителя добавить prop с типом `modal-select`:

```typescript
export const story = {
    category: 'UI',
    values: {
        modalComponent: {
            default: null,
            type: 'modal-select', // Авто-заполняется всеми модалками
        },
    },
};
```

### Шаг 5: Проверить

```bash
npx vue-tsc --noEmit 2>&1 | grep <changed-files>
npx oxlint <changed-files>
```

После добавления нового файла может потребоваться Hard Refresh (`Cmd+Shift+R`) из-за glob-кэша Vite.
