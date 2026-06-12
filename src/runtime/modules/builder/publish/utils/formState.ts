import type { TPublishFormState } from '../../../common/types/bricks-api';
import {
    DEFAULT_BACKGROUND_COLOR,
    DEFAULT_LAYOUT,
} from '../../../common/utils/bricks/publishedPage';

/**
 * Кэш цвета фона из app config (устанавливается из Vue контекста).
 */
let cachedBackgroundColor: string | null = null;

/**
 * Устанавливает кэшированный цвет фона из app config.
 * Вызывать из Vue setup контекста (например, в useBuilderPage).
 *
 * @param color - Цвет фона из конфига.
 */
export function setPublishStoreBackgroundColor(color: string): void {
    cachedBackgroundColor = color;
}

/**
 * Возвращает цвет фона из кэша или дефолт.
 *
 * @returns Цвет фона по умолчанию.
 */
export function resolveDefaultBackgroundColor(): string {
    return cachedBackgroundColor || DEFAULT_BACKGROUND_COLOR;
}

/**
 * Собирает дефолтное состояние формы публикации с учётом конфигурации.
 *
 * @returns Дефолтное состояние формы публикации.
 */
export function buildDefaultFormState(): TPublishFormState {
    const backgroundColor = resolveDefaultBackgroundColor();

    return {
        pagename: '',
        title: '',
        description: '',
        keywords: '',
        published: false,
        backgroundColor,
        layout: DEFAULT_LAYOUT,
        socialImage: '',
        urlPrefix: null,
        subdomain: null,
        createdAt: '',
        updatedAt: '',
    };
}

/**
 * Стабилизирует состояние формы публикации: заполняет отсутствующие поля дефолтами.
 *
 * @param formState - Произвольное состояние формы (например из localStorage).
 * @returns Полная структура TPublishFormState.
 */
export function normalizeFormState(formState: Partial<TPublishFormState>): TPublishFormState {
    const defaults = buildDefaultFormState();

    return {
        ...defaults,
        ...formState,
        pagename: formState.pagename ?? defaults.pagename,
        title: formState.title ?? defaults.title,
        description: formState.description ?? defaults.description,
        keywords: formState.keywords ?? defaults.keywords,
        published: Boolean(formState.published),
        backgroundColor: formState.backgroundColor ?? defaults.backgroundColor,
        layout: formState.layout ?? defaults.layout,
        socialImage: formState.socialImage ?? defaults.socialImage,
        urlPrefix: formState.urlPrefix ?? null,
        subdomain: formState.subdomain ?? null,
        createdAt: formState.createdAt ?? defaults.createdAt,
        updatedAt: formState.updatedAt ?? defaults.updatedAt,
    };
}
