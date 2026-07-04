/**
 * Опции категорий медиа-галереи (фильтры и select метаданных).
 * `label` — ключ i18n, переводится в компоненте через `t(option.label)`.
 */
export const MEDIA_CATEGORY_OPTIONS = [
    { label: 'bricks.media.categories.all', value: 'all' },
    { label: 'bricks.media.categories.icons', value: 'icons' },
    { label: 'bricks.media.categories.illustrations', value: 'illustrations' },
    { label: 'bricks.media.categories.photos', value: 'photos' },
    { label: 'bricks.media.categories.videos', value: 'videos' },
    { label: 'bricks.media.categories.other', value: 'other' },
] as const;

/** Категория по умолчанию для загружаемых файлов. */
export const DEFAULT_MEDIA_CATEGORY = 'other';
