# CSS & SCSS Rules

## Required

- **CSS Modules** — `:class="$style.ClassName"` in all components
- **CSS variables** — in `assets/scss/shared/_variables.scss`
- **rem units** — multiples of 0.2 (`0.4rem`, `0.8rem`, `1.6rem`, `2rem`)
- **Transitions** — in `assets/scss/common/transitions.scss`, NOT in components

## SCSS: Only for Nesting

```scss
// ✅ SCSS nesting is OK
.Card {
    padding: 2rem;

    &:hover {
        background: var(--base-50);
    }

    &--active {
        border-color: var(--primary-500);
    }
}

// ❌ NO SCSS variables
$primary-color: #6366f1; // FORBIDDEN
```

## Units

```scss
// ✅ GOOD — rem, multiples of 0.2
.Card {
    padding: 1.6rem;
    margin-bottom: 2.4rem;
    font-size: 1.4rem;
    border-radius: 0.8rem;
    border: 1px solid var(--base-200); // 1px OK for borders only
}

// ❌ BAD
.Card {
    padding: 20px; // NO px
    margin: 1.5rem; // NOT multiple of 0.2
    font-size: 0.9em; // NO em
    width: 50%; // NO % for sizes
}
```

## CSS Variables

```scss
// assets/scss/shared/_variables.scss
:root {
    --base-0: #ffffff;
    --base-50: #f9fafb;
    --base-200: #e5e7eb;
    --base-900: #111827;

    --primary-500: #6366f1;
    --primary-700: #4338ca;
}

// Usage in components
.Button {
    background: var(--primary-500);
    color: var(--base-0);

    &:hover {
        background: var(--primary-700);
    }
}
```

## Forbidden

- ❌ `px` for sizes (except `1px` border)
- ❌ `em`, `%` for sizes
- ❌ SCSS variables (`$color`)
- ❌ `backdrop-filter: blur()` — kills performance, use `linear-gradient` for overlays
- ❌ `:global()` for transitions in components
- ❌ Sizes not divisible by 0.2rem (`1.5rem`, `0.9rem`)
- ❌ `!important` — use higher specificity via nesting or CSS Modules instead

## Dark Theme / Color Scheme

- `.land-dark` на `<body>` через `useHead({ bodyAttrs })` — переменные `--land-*` наследуются каскадом
- Teleport-элементы тоже получают тему (дочерние body)
- **НЕ дублировать** переменные через `data-*` или unscoped стили — `var(--land-*)` в CSS modules достаточно
- Кастомные переменные привязывать к глобальным: `--my-bg: var(--land-base-0)`
- `--land-base-0` = фон (белый/тёмный), `--land-base-900` = текст. Не путать!
