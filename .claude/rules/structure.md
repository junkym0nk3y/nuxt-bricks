# Project Structure

## /assets/

Static files: styles, images, fonts, helpers, utils, constants.

```
assets/
├── fonts/              # Project fonts (connected via _fonts.scss mixin)
├── js/                 # JS modules, classes, helpers, constants
├── utils/              # Helper functions and utilities
├── mock/json/          # Mock data as JSON
├── scss/
│   ├── bundle.scss     # Import common files + global styles
│   ├── vendors.scss    # Library imports
│   ├── default.css     # Base additional styles
│   ├── common/
│   │   ├── fonts.scss       # Font definitions
│   │   ├── reset.scss       # Browser style reset
│   │   ├── text.scss        # Typography
│   │   └── transitions.scss # Global Vue transitions
│   └── shared/
│       ├── _functions.scss  # SCSS functions
│       ├── _mixins.scss     # SCSS mixins
│       └── _variables.scss  # CSS variables (NOT SCSS vars)
└── sprite/
    ├── svg/            # SVG icons for sprite generation
    └── gen/            # Generated (don't touch)
```

Shared SCSS files are connected in `nuxt.config.ts` via `vite.css.preprocessorOptions.scss.additionalData`.

## /components/

```
components/
├── ui/                 # Standardized UI elements (buttons, dropdowns, tabs)
├── modals/             # Modal components (global ones only)
├── layout/
│   ├── TheHeader.vue   # Root components start with "The"
│   ├── TheFooter.vue
│   ├── TheModal.vue
│   ├── header/         # TheHeader children
│   └── footer/         # TheFooter children
├── pages/              # Page-specific components
│   └── investors/      # Components for /investors route ONLY
│       ├── InvestorsHero.vue
│       ├── InvestorsStats.vue
│       └── hero/       # InvestorsHero children
└── common/             # Shared components (used on 2+ pages)
    ├── cards/          # Grouped by entity/logic
    └── forms/
```

**Rules:**

- Page components named with page prefix: `InvestorsHero`, `InvestorsStats`
- If component used on multiple pages → move to `common/`
- Page-specific modals stay in `pages/[page]/modals/`
- Root layout components: `TheHeader`, `TheFooter`, `TheModal`

## /layouts/

Page layout templates (default.vue, error.vue, etc.)

## /pages/

Vue files → auto-generated routes via Nuxt file-based routing.

## /plugins/

Scripts that run before Vue app initialization.

## /public/

Static files served as-is (no processing).

## /server/

Server-side logic (API routes, middleware).

## /store/

Pinia stores for application state.

**Reminder:** Use Pinia only for truly global state. Prefer prop-drilling for component communication.
