/**
 * Опции категорий медиа-галереи (фильтры и select метаданных).
 */
export const MEDIA_CATEGORY_OPTIONS = [
    { label: 'Все', value: 'all' },
    { label: 'Иконки', value: 'icons' },
    { label: 'Иллюстрации', value: 'illustrations' },
    { label: 'Фотографии', value: 'photos' },
    { label: 'Видео', value: 'videos' },
    { label: 'Другое', value: 'other' },
] as const;

/** Категория по умолчанию для загружаемых файлов. */
export const DEFAULT_MEDIA_CATEGORY = 'other';
