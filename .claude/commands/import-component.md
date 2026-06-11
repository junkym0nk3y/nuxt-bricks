# Import Component Agent

Ты — специализированный агент для импорта компонентов в систему лендинг-билдера nuxt-bricks.

## Твоя задача

Пользователь указывает исходный Vue-компонент (путь, имя, или описание). Ты:

1. Находишь исходный компонент
2. Анализируешь его props, emits, slots
3. Создаёшь wrapper `.vue` и `.brick.ts` файлы в `playground/components/`
4. Регенерируешь `bricks.json`
5. Проверяешь типы

## Инструкция пользователя

$ARGUMENTS

---

## Алгоритм работы

### Шаг 1: Найти и изучить исходный компонент

- Прочитай `.vue` файл компонента целиком
- Изучи его `defineProps`, `defineEmits`, слоты
- Если компонент использует внешние типы — прочитай их тоже (`.d.ts`, `types.ts`)
- Пойми, какие props нужны для работы, какие опциональны
- Определи, нужен ли wrapper с трансформацией данных или простой pass-through

### Шаг 2: Определить категорию и имя

Определи категорию по типу компонента:

| Категория  | Когда                        | Папка       |
| ---------- | ---------------------------- | ----------- |
| `Buttons`  | Кнопки, CTA                  | `buttons/`  |
| `Cards`    | Карточки, баннеры            | `cards/`    |
| `Sections` | Секции, hero, блоки страницы | `sections/` |
| `Gallery`  | Слайдеры, галереи            | `gallery/`  |
| `Modal`    | Модальные окна               | `modals/`   |
| `Titles`   | Заголовки секций             | `titles/`   |

Имя файла:

- Если компонент уже имеет осмысленное имя — используй его
- Если нужна обёртка с трансформацией — суффикс `Wrapper` (например `ProjectHeroWrapper`)
- Если обёртка минимальная — можно без суффикса

### Шаг 3: Создать wrapper `.vue` (если нужен)

Wrapper нужен когда:

- Исходный компонент принимает сложные объекты (нужно собрать из плоских props)
- Нужна дополнительная логика (modal, computed, dynamic component)
- Компонент из внешнего пакета и нужен адаптер

Wrapper НЕ нужен когда:

- У компонента уже плоские простые props (string, number, boolean)
- Компонент можно использовать напрямую

#### Шаблон wrapper `.vue`:

```vue
<script setup lang="ts">
// #region Imports
// Types
import type { IOriginalInterface } from '@/types/...';

// Vue
import { computed } from 'vue';

// Components
import OriginalComponent from '@/components/.../OriginalComponent.vue';
// #endregion

// #region Interfaces
interface IProps {
    // Плоские props для билдера — по одному на каждое редактируемое свойство
    title?: string;
    description?: string;
    image?: string;
    // ... и т.д.
}
// #endregion

// #region Props
const props = withDefaults(defineProps<IProps>(), {
    title: 'Значение по умолчанию',
    description: '',
    image: '',
});
// #endregion

// #region Computed
/**
 * Собирает объект из плоских props для оригинального компонента.
 */
const dataObject = computed<IOriginalInterface>(() => ({
    title: props.title,
    description: props.description,
    image: props.image,
}));
// #endregion
</script>

<template>
    <OriginalComponent :data="dataObject" />
</template>
```

**Правила для wrapper:**

- `<script setup lang="ts">` — всегда
- `#region` комментарии — обязательны (пустые секции убирать)
- `props.propertyName` в template — всегда через `props.`
- `withDefaults` — обязательно
- CSS Modules (`<style module lang="scss">`) — если нужны стили
- rem единицы (кратные 0.2), `var(--bricks-*)` переменные
- Без `px` (кроме `1px` border), без `!important`
- **`data-tiptap-content`** — если элемент рендерит проп с `type: 'textarea'` через `v-html`, **обязательно** добавить атрибут `data-tiptap-content`. Без него `ul`, `ol`, `p`, `blockquote` внутри не получат стили:
    ```html
    <!-- ✅ -->
    <div data-tiptap-content v-html="props.text" />
    <!-- ❌ стили списков и блоков не применятся -->
    <div v-html="props.text" />
    ```
    Добавлять также на дочерние компоненты, которые рендерят pass-through textarea контент. **НЕ** добавлять на `v-html` с простым текстом (заголовки, лейблы) и на `ul`/`ol` в собственной вёрстке компонента.

### Шаг 4: Создать `.brick.ts` story файл

#### Шаблон `.brick.ts`:

```typescript
import { defineComponent, h } from 'vue';
import Component from './ComponentName.vue';

import type { IBrickFileStructure } from '../../common/types';

export const story: IBrickFileStructure = {
    category: 'CategoryName',
    description: 'Краткое описание компонента на русском',
    values: {
        // Свойства — по одному на каждый редактируемый prop
    },
};

export default defineComponent({
    name: 'ComponentNameDemo',
    components: { Component },

    setup() {
        return () => h(Component);
    },
});
```

#### Маппинг props → property types:

| Тип prop / данные                       | `type` в values     | Пример значения `default`                      |
| --------------------------------------- | ------------------- | ---------------------------------------------- |
| `string` (короткий текст)               | `'input'`           | `'Текст по умолчанию'`                         |
| `string` (HTML / длинный)               | `'textarea'`        | `'<p>Описание</p>'`                            |
| `boolean` (вкл/выкл)                    | `'switch'`          | `true` / `false`                               |
| `boolean` (есть/нет)                    | `'boolean'`         | `true` / `false`                               |
| `string` (из набора, dropdown)          | `'select'`          | `'primary'` + `vars: ['primary', 'secondary']` |
| `string` (из набора, 2-4 варианта)      | `'tabs'`            | `'utp'` + `vars: ['utp', 'principle']`         |
| `string` (URL картинки)                 | `'image'`           | `'/images/land-empty.webp'`                    |
| `string` (URL видео)                    | `'video'`           | `''`                                           |
| `string` (CSS цвет)                     | `'color'`           | `''` или `'#ffffff'`                           |
| `number`                                | `'input'`           | `32`                                           |
| `string[]` (теги)                       | `'tags'`            | `['Тег 1', 'Тег 2']`                           |
| `array` (массив объектов)               | `'array'`           | `[{ key: 'value' }]`                           |
| `object` (JSON объект)                  | `'object'`          | `{ key: 'value' }`                             |
| `object`/`array` (сложный JSON)         | `'json'`            | `{ nested: { key: 'value' } }`                 |
| Галерея картинок                        | `'image-gallery'`   | `[{ id: '1', title: '', url: '/img.webp' }]`   |
| Модальное окно                          | `'modal-select'`    | `null`                                         |
| Только чтение                           | `'readonly'`        | `'значение'`                                   |
| Inline контент (текст + медиа сегменты) | `'inline-content'`  | `[{ type: 'text', value: 'Hello' }]`           |
| Аккордеон                               | `'accordion-items'` | `[{ title: 'Q', content: 'A' }]`               |
| Взаимодействие/событие                  | `'interaction'`     | `null`                                         |

#### Дополнительные опции property:

```typescript
{
    default: value,           // Обязательно
    desc: 'Описание на русском', // Рекомендуется
    type: 'input',            // Обязательно
    vars: [],                 // Для select/tabs — массив вариантов
    showWhen: {               // Условное отображение
        field: 'otherProp',
        equals: 'someValue',
    },
    forceRender: true,        // Пересоздать компонент при изменении (для image/gallery)
    svgContentProperty: 'iconContent', // Для image с SVG (имя prop для SVG-контента)
    fields: {                 // Для image-gallery
        title: true,
        tags: false,
    },
    min: 0,                   // Для числовых input
    max: 100,
    step: 1,
}
```

#### Default export — 3 паттерна:

**A. Simple (модалки, простые компоненты):**

```typescript
setup() {
    return () => h(Component);
},
```

**B. С передачей props (когда wrapper трансформирует данные):**

```typescript
setup() {
    return () =>
        h(Component, {
            title: String(story.values?.title?.default ?? ''),
            count: Number(story.values?.count?.default ?? 0),
            isActive: Boolean(story.values?.isActive?.default),
        });
},
```

**C. С attrs (когда много props, pass-through):**

```typescript
setup(_, { attrs }) {
    return () => h(Component, attrs);
},
```

**Выбор паттерна:**

- Если wrapper `.vue` принимает все props напрямую → Паттерн A (wrapper сам обработает)
- Если `.brick.ts` импортирует wrapper, и wrapper трансформирует → Паттерн A
- Если нет wrapper, и нужна демо с дефолтами → Паттерн B
- Если компонент с множеством pass-through props → Паттерн C

### Шаг 5: Типы данных (если нужны)

Если wrapper использует кастомные типы для props, создай `.d.ts` файл рядом:

```typescript
// types.d.ts (в той же папке)
export interface IMyComponentProps {
    title?: string;
    description?: string;
    items?: IMyItem[];
}

export interface IMyItem {
    id: string;
    name: string;
}
```

### Шаг 6: Регенерировать bricks.json

```bash
npm run bricks:gen
```

### Шаг 7: Проверить типы

```bash
npx vue-tsc --noEmit 2>&1 | grep <changed-files>
npx oxlint <changed-files>
```

---

## Важные правила

1. **Описания (desc) — на русском языке**
2. **Плоские props** — билдер работает с плоскими свойствами, НЕ с вложенными объектами. Если оригинальный компонент принимает `{ title, text, image }` как один prop, wrapper должен развернуть его в отдельные `title`, `text`, `image`
3. **Дефолтные значения** — всегда осмысленные, чтобы компонент сразу выглядел прилично
4. **Картинки по умолчанию** — используй `/images/land-empty.webp` как placeholder
5. **Импорт типов** — `import type { IBrickFileStructure } from '../../common/types'`
6. **Имя Demo** — `{ComponentName}Demo` в `defineComponent({ name: ... })`
7. **Не добавляй лишние props** — только те, которые пользователь реально захочет настраивать в билдере
8. **showWhen** — используй для условных свойств (например, настройки модалки показывать только когда `action === 'modal'`)
9. **Modal категория** — `values: {}` (пустой), модалки не имеют редактируемых props в билдере
10. **Проверяй код** — `vue-tsc` и `oxlint` после создания файлов
