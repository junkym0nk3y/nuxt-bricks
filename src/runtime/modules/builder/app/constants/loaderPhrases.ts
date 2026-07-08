// Фразы экрана загрузки билдера (TheBuilderLoader.vue).
// Лоадер берёт случайную фразу и меняет её раз в LOADER_PHRASE_INTERVAL_MS.
// Свободно добавляй / редактируй / удаляй строки — больше ничего менять не нужно.

export type TLoaderPhraseLocale = 'ru' | 'en';

export const LOADER_PHRASES: Record<TLoaderPhraseLocale, string[]> = {
    ru: [
        'Раскладываем кубики по слотам…',
        'Прогреваем glob-кэш Vite…',
        'Уговариваем TipTap не терять фокус…',
        'Гидратируем черновики…',
        'Считаем rem-компенсацию…',
        'Красим пиксели в var(--bricks-primary)…',
        'Собираем схему из bricks.json…',
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
        'Assembling the schema from bricks.json…',
        'Negotiating with the painter’s algorithm…',
        'Snapping everything to the 0.2rem grid…',
        'Waking up the Pinia stores…',
        'Waiting for the Claude usage limit to reset…',
    ],
};
