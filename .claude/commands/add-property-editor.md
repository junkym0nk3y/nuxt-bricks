# Добавление нового типа редактора свойств

Ты — специализированный агент для добавления нового типа редактора свойств в систему лендинг-билдера.

## Инструкция пользователя

$ARGUMENTS

---

## Алгоритм работы

При добавлении нового типа редактора свойств (например, `my-new-type`) необходимо изменить **7+ файлов** в строгом порядке. **НЕ ПРОПУСКАЙ НИ ОДНОГО ШАГА!**

Все пути — от `src/runtime/modules/`.

### Шаг 1: Добавить тип в `common/types/brick.ts`

Добавь новый тип в union `PropertyType`:

```typescript
// common/types/brick.ts
export type PropertyType =
    | 'string'
    | 'number'
    | ...
    | 'my-new-type'; // <-- ДОБАВЬ СЮДА
```

### Шаг 2: Добавить в `PROPERTY_EDITOR_ORDER` в `builder/shell/sidebar/components/property-editors/types.ts`

Это определяет порядок отображения редакторов в панели свойств:

```typescript
// builder/shell/sidebar/components/property-editors/types.ts
export const PROPERTY_EDITOR_ORDER = [
    'boolean',
    'switch',
    'select',
    'input',
    'textarea',
    'inline-content',
    'image-gallery',
    'my-new-type', // <-- ДОБАВЬ СЮДА (порядок важен!)
    'image',
    'video',
] as const;
```

### Шаг 3: Добавить распознавание типа в `builder/core/composables/useComponentProperties.ts`

**ЭТО КРИТИЧЕСКИ ВАЖНЫЙ ШАГ!** Функция `inferPropertyType` преобразует тип из `.brick.ts` в `PropertyType`. Без этого шага тип будет игнорироваться и фолбечиться на `array` или `textarea`!

```typescript
// builder/core/composables/useComponentProperties.ts
const inferPropertyType = (value: IBrickValues): PropertyType => {
    // ... существующие проверки ...

    if (value.type === 'my-new-type') {
        return 'my-new-type';
    }

    // ... остальной код ...
};
```

### Шаг 4: Создать компонент редактора в `builder/shell/sidebar/components/property-editors/`

Создай Vue компонент `BuilderShellSidebarProperty{Name}Editor.vue` (имя — модульная цепочка, см. `.claude/rules/naming.md`). Следуй конвенциям из `.claude/rules/vue-sfc.md`:

- `<script setup lang="ts">`
- `#region` комментарии
- `withDefaults(defineProps<...>())`
- `defineEmits<...>()`
- CSS Modules

### Шаг 5: Зарегистрировать редактор в `builder/shell/sidebar/composables/useSidebarPropertiesPanel.ts`

Добавь async import компонента в объект `componentEditors`:

```typescript
'my-new-type': defineAsyncComponent(
    () => import('../components/property-editors/BuilderShellSidebarPropertyMyNewTypeEditor.vue')
),
```

### Шаг 6: Добавить обработчик варианта в `builder/shell/sidebar/composables/usePropertyVariants.ts`

#### 6.1. Добавить вызов обработчика в `addVariantForProperty`:

```typescript
if (handleMyNewTypeVariant(context)) return; // <-- ДОБАВЬ СЮДА
```

#### 6.2. Создать функцию обработчика:

```typescript
/**
 * Обрабатывает вариант my-new-type.
 */
function handleMyNewTypeVariant({
    property,
    componentProps,
    variants,
}: PropertyVariantContext): boolean {
    if (property.type !== 'my-new-type') {
        return false;
    }

    const currentValue = componentProps[property.name];
    const fallback =
        Array.isArray(property.default) && property.default.length > 0 ? property.default : [];
    const value = Array.isArray(currentValue) ? currentValue : fallback;

    variants['my-new-type'].push({
        label: property.label || property.name,
        value,
        disabled: false,
        property,
    });

    return true;
}
```

### Шаг 7: Обновить `BuilderShellSidebarPropertyEditorRow.vue`

Если редактор требует специальной обработки (как `inline-content` или `image-gallery`), добавь:

- `computed` для проверки типа: `const isMyNewTypeEditor = computed(() => props.type === 'my-new-type')`
- Обработчик изменений
- `<template v-else-if="isMyNewTypeEditor">` блок

### Шаг 8 (опционально): Добавить типы данных

Если редактор работает со сложными данными:

1. Добавь интерфейс в `common/types/content.d.ts` (там живут `IGalleryItem`, `IInlineContentSegment`)
2. Экспортируй из `common/types/index.ts`

### Шаг 9 (опционально): Обработка медиа-галереи

Если редактор использует медиа-галерею:

1. `builder/shell/sidebar/types/sidebarProperties.d.ts` — добавь `kind` в `TMediaContext`
2. `builder/shell/sidebar/composables/useSidebarPropertiesPanel.ts` — обнови `handleOpenMediaGallery` и `handleMediaSelect`

---

## Чеклист

- [ ] `common/types/brick.ts` — добавлен в `PropertyType`
- [ ] `builder/shell/sidebar/components/property-editors/types.ts` — добавлен в `PROPERTY_EDITOR_ORDER`
- [ ] `builder/core/composables/useComponentProperties.ts` — добавлен в `inferPropertyType` **(!)**
- [ ] `builder/shell/sidebar/components/property-editors/BuilderShellSidebarProperty*.vue` — создан компонент
- [ ] `builder/shell/sidebar/composables/useSidebarPropertiesPanel.ts` — зарегистрирован в `componentEditors`
- [ ] `builder/shell/sidebar/composables/usePropertyVariants.ts` — добавлен `handle*Variant`
- [ ] `builder/shell/sidebar/components/BuilderShellSidebarPropertyEditorRow.vue` — добавлена обработка (если нужна)
- [ ] `common/types/content.d.ts` — добавлен интерфейс данных (если нужен)
- [ ] `common/types/index.ts` — экспортирован интерфейс (если нужен)
- [ ] `vue-tsc --noEmit` — без ошибок
- [ ] `oxlint` — без ошибок
