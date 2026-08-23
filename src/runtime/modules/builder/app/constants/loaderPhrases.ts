// The phrases of the loading screen of the builder (TheBuilderLoader.vue).
// The loader picks a random phrase and changes it at its own rotation interval.
// Add, edit and remove lines freely — nothing else has to be changed.

export type TLoaderPhraseLocale = 'ru' | 'en';

/** The default caption: visible from the first frame (SSR-safe) until the rotation starts. */
export const LOADER_DEFAULT_PHRASE: Record<TLoaderPhraseLocale, string> = {
    ru: 'Загрузка…',
    en: 'Loading…',
};

export const LOADER_PHRASES: Record<TLoaderPhraseLocale, string[]> = {
    ru: [
        'Раскладываем кубики по слотам…',
        'Прогреваем glob-кэш Vite…',
        'Уговариваем TipTap не терять фокус…',
        'Гидратируем черновики…',
        'Считаем rem-компенсацию…',
        'Красим пиксели в var(--bricks-primary)…',
        'Собираем манифест бриков…',
        'Договариваемся с painter’s algorithm…',
        'Выравниваем всё по сетке 0.2rem…',
        'Будим Pinia-сторы…',
        'Ждём, когда обновится Usage Limit в Claude…',
    ],
    en: [
        'Stacking bricks into slots…',
        'Warming up the Vite glob cache…',
        'Convincing TipTap to keep focus…',
        'Hydrating drafts…',
        'Computing rem compensation…',
        'Painting pixels in var(--bricks-primary)…',
        'Assembling the brick manifest…',
        'Negotiating with the painter’s algorithm…',
        'Snapping everything to the 0.2rem grid…',
        'Waking up the Pinia stores…',
        'Waiting for the Claude usage limit to reset…',
    ],
};
