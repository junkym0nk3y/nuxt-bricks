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

## Legalized Exceptions (осознанные, 2026-07-07)

- ✅ `px` в media-query брейкпоинтах (`@media (max-width: 768px)`) — брейкпоинты не зависят от rem-базы
- ✅ `%` для позиционирования/геометрии (`left: 50%`, `width: 100%`, `translate(-50%)`) — не «размер»
- ✅ `letter-spacing` микрозначения (`0.05rem`, `0.1rem`) — правило кратности 0.2 не применяется (0.2rem — уже гигантский трекинг); только `rem`, не `em`
- ✅ Значения, производные от `1px`-бордера (`calc(var(--bricks-border-radius-xs) - 0.1rem)`) и центровка хэндлов (`-0.5rem` = половина 1rem-хэндла)
- ✅ Hover/focus `transition:` внутри компонентов — правило «transitions в `transitions.scss`» касается Vue-`<transition>`-анимаций, а не интерактивных состояний; длительность брать из `--bricks-default-transition`
- ✅ Форс светлой темы области ввода текста (`TextEditorArea`, `TheTextEditorModal`) — hex-блоки намеренные
- Текст на фиксированных фонах (primary, тёмные оверлеи) — `var(--bricks-static-white)`, НЕ `--bricks-base-0` (перевернётся в тёмной теме) и не `#fff`
- Pill-радиус — `var(--bricks-border-radius-pill)`, не `999px`/`99.9rem`

## Dark Theme / Color Scheme

- `.bricks-dark` на `<body>` через `useHead({ bodyAttrs })` — переменные `--bricks-*` наследуются каскадом
- Teleport-элементы тоже получают тему (дочерние body)
- **НЕ дублировать** переменные через `data-*` или unscoped стили — `var(--bricks-*)` в CSS modules достаточно
- Кастомные переменные привязывать к глобальным: `--my-bg: var(--bricks-base-0)`
- `--bricks-base-0` = фон (белый/тёмный), `--bricks-base-900` = текст. Не путать!
