import type { TPublishedPageSummary, TPublishFormState } from '../../../common/types/bricks-api';
import { cloneDeviceSet } from '../../../common/utils/bricks/devices';
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
        viewportConfig: null,
        createdAt: '',
        updatedAt: '',
    };
}

/**
 * Собирает состояние формы для копии страницы: клонирует meta, копия — черновик
 * с переданным `pagename` и суффиксом «(copy)» в названии.
 *
 * @param page - Исходная страница.
 * @param pagename - Уникальный `pagename` копии.
 * @returns Состояние формы публикации копии.
 */
export function buildCopyFormState(
    page: TPublishedPageSummary,
    pagename: string
): TPublishFormState {
    return {
        pagename,
        title: page.title ? `${page.title} (copy)` : page.title,
        description: page.description,
        keywords: page.keywords,
        published: false,
        layout: page.layout || DEFAULT_LAYOUT,
        backgroundColor: page.backgroundColor || resolveDefaultBackgroundColor(),
        socialImage: page.socialImage,
        urlPrefix: page.urlPrefix,
        subdomain: page.subdomain,
        // Глубокая копия: с общей ссылкой правка набора у копии меняла бы набор
        // оригинала, пока обе формы открыты
        viewportConfig: cloneDeviceSet(page.viewportConfig),
        createdAt: '',
        updatedAt: '',
    };
}

/**
 * Собирает состояние формы из сохранённой страницы — режим редактирования.
 *
 * Отличие от `buildCopyFormState`: страница открывается «как есть», со своими
 * датами и статусом публикации, а не превращается в новый черновик.
 *
 * @param page - Сводка страницы из списка стора.
 * @returns Состояние формы публикации.
 */
export function buildEditFormState(page: TPublishedPageSummary): TPublishFormState {
    return {
        pagename: page.pagename,
        title: page.title,
        description: page.description,
        keywords: page.keywords,
        published: page.published,
        layout: page.layout || DEFAULT_LAYOUT,
        backgroundColor: page.backgroundColor || resolveDefaultBackgroundColor(),
        socialImage: page.socialImage,
        urlPrefix: page.urlPrefix,
        subdomain: page.subdomain,
        viewportConfig: cloneDeviceSet(page.viewportConfig),
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
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
        // Черновики, записанные до появления набора, поля не содержат — это
        // законное «наследует набор проекта», а не потеря данных
        viewportConfig: cloneDeviceSet(formState.viewportConfig),
        createdAt: formState.createdAt ?? defaults.createdAt,
        updatedAt: formState.updatedAt ?? defaults.updatedAt,
    };
}
