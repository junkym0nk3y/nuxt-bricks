/**
 * Извлечение и замена image URL в LandingSchema.
 */

// #region Imports
// Types
import type { LandingSchema, LandingComponent } from '../../common/types/landing';
import type {
    IExtractedImageUrl,
    IImageLocation,
    TImageSourceType,
} from '../types/schemaImageResolver';
import type { IGalleryItem, IInlineContentSegment } from '../../layouts-blocks/types/layouts';
// #endregion

// #region Constants
const PLACEHOLDER_IMAGE_URL = '/images/land-empty.webp';

const IMAGE_EXTENSIONS_RE = /\.(webp|png|jpg|jpeg|gif|svg|avif)(\?|$)/i;
const CDN_PATTERNS_RE = /storage\.yandexcloud\.net|amazonaws\.com|cdn\./i;
const HTML_IMG_SRC_RE = /<img[^>]+src=["']([^"']+)["']/gi;
const DATA_URI_RE = /^data:/;
/**
 * Максимальная длина строки, которую можно считать голым URL.
 * HTML-строки всегда длиннее.
 */
const MAX_BARE_URL_LENGTH = 2048;
// #endregion

// #region Helpers
/**
 * Возвращает URL placeholder-изображения.
 */
export function getPlaceholderImageUrl(): string {
    return PLACEHOLDER_IMAGE_URL;
}

/**
 * Проверяет, является ли строка целиком URL изображения (не частью HTML).
 *
 * @param value - Строка для проверки.
 * @returns true если строка — голый URL изображения.
 */
function isBareImageUrl(value: string): boolean {
    if (!value || typeof value !== 'string') {
        return false;
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed.length < 5 || trimmed.length > MAX_BARE_URL_LENGTH) {
        return false;
    }

    // Исключаем data URI
    if (DATA_URI_RE.test(trimmed)) {
        return false;
    }

    // Исключаем placeholder
    if (trimmed === PLACEHOLDER_IMAGE_URL) {
        return false;
    }

    // Строка не должна содержать HTML-теги или пробелы (это не голый URL)
    if (trimmed.includes('<') || trimmed.includes('>') || trimmed.includes(' ')) {
        return false;
    }

    // Должна начинаться как URL
    if (
        !trimmed.startsWith('http://') &&
        !trimmed.startsWith('https://') &&
        !trimmed.startsWith('/')
    ) {
        return false;
    }

    // Проверяем по расширению или CDN-паттерну
    return IMAGE_EXTENSIONS_RE.test(trimmed) || CDN_PATTERNS_RE.test(trimmed);
}

/**
 * Проверяет, является ли значение массивом gallery items.
 *
 * @param value - Значение для проверки.
 */
function isGalleryArray(value: unknown): value is IGalleryItem[] {
    if (!Array.isArray(value) || value.length === 0) {
        return false;
    }

    const first = value[0];
    return (
        typeof first === 'object' &&
        first !== null &&
        'id' in first &&
        'url' in first &&
        typeof first.url === 'string'
    );
}

/**
 * Проверяет, является ли значение массивом inline content segments.
 *
 * @param value - Значение для проверки.
 */
function isInlineContentArray(value: unknown): value is IInlineContentSegment[] {
    if (!Array.isArray(value) || value.length === 0) {
        return false;
    }

    const first = value[0];
    return (
        typeof first === 'object' &&
        first !== null &&
        'kind' in first &&
        typeof first.kind === 'string'
    );
}

/**
 * Добавляет URL в Map с дедупликацией по URL.
 *
 * @param urlMap - Map для накопления результатов.
 * @param url - URL изображения.
 * @param location - Местоположение в схеме.
 */
function addUrlToMap(
    urlMap: Map<string, IImageLocation[]>,
    url: string,
    location: IImageLocation
): void {
    const existing = urlMap.get(url);
    if (existing) {
        existing.push(location);
    } else {
        urlMap.set(url, [location]);
    }
}

/**
 * Создаёт объект IImageLocation.
 */
function createLocation(
    componentIndex: number,
    component: LandingComponent,
    propName: string,
    sourceType: TImageSourceType,
    extra?: { arrayIndex?: number; segmentIndex?: number }
): IImageLocation {
    return {
        componentIndex,
        componentId: component.id,
        componentName: component.componentName,
        propName,
        sourceType,
        ...extra,
    };
}

/**
 * Извлекает URL из HTML-строки (textarea с TipTap контентом).
 *
 * @param html - HTML-строка.
 * @param componentIndex - Индекс компонента в схеме.
 * @param component - Компонент.
 * @param propName - Имя свойства.
 * @param urlMap - Map для накопления.
 */
function extractFromHtml(
    html: string,
    componentIndex: number,
    component: LandingComponent,
    propName: string,
    urlMap: Map<string, IImageLocation[]>
): void {
    let match: RegExpExecArray | null;
    HTML_IMG_SRC_RE.lastIndex = 0;

    while ((match = HTML_IMG_SRC_RE.exec(html)) !== null) {
        const src = match[1];
        if (src && !DATA_URI_RE.test(src) && src !== PLACEHOLDER_IMAGE_URL) {
            addUrlToMap(
                urlMap,
                src,
                createLocation(componentIndex, component, propName, 'html-img')
            );
        }
    }
}
// #endregion

// #region Public API
/**
 * Извлекает все уникальные URL изображений из схемы лендинга.
 *
 * @param schema - LandingSchema для анализа.
 * @returns Массив уникальных URL с информацией о местоположениях.
 */
export function extractSchemaImageUrls(schema: LandingSchema): IExtractedImageUrl[] {
    const urlMap = new Map<string, IImageLocation[]>();

    schema.components.forEach((component, componentIndex) => {
        if (!component.props) {
            return;
        }

        Object.entries(component.props).forEach(([propName, value]) => {
            // String prop
            if (typeof value === 'string') {
                // Голый URL (вся строка — это URL)
                if (isBareImageUrl(value)) {
                    addUrlToMap(
                        urlMap,
                        value,
                        createLocation(componentIndex, component, propName, 'simple-prop')
                    );
                    return;
                }

                // HTML-содержимое с <img> тегами
                if (value.includes('<img')) {
                    extractFromHtml(value, componentIndex, component, propName, urlMap);
                }

                return;
            }

            // Gallery array
            if (isGalleryArray(value)) {
                value.forEach((item, arrayIndex) => {
                    if (isBareImageUrl(item.url)) {
                        addUrlToMap(
                            urlMap,
                            item.url,
                            createLocation(componentIndex, component, propName, 'gallery-item', {
                                arrayIndex,
                            })
                        );
                    }
                });
                return;
            }

            // Inline content segments
            if (isInlineContentArray(value)) {
                value.forEach((segment, segmentIndex) => {
                    if (
                        (segment.kind === 'image' || segment.kind === 'svg') &&
                        segment.url &&
                        !DATA_URI_RE.test(segment.url) &&
                        segment.url !== PLACEHOLDER_IMAGE_URL
                    ) {
                        addUrlToMap(
                            urlMap,
                            segment.url,
                            createLocation(componentIndex, component, propName, 'inline-segment', {
                                segmentIndex,
                            })
                        );
                    }
                });
            }
        });
    });

    const result: IExtractedImageUrl[] = [];
    urlMap.forEach((locations, url) => {
        result.push({ url, locations });
    });

    return result;
}

/**
 * Заменяет URL изображений в схеме согласно маппингу.
 * Не мутирует входные данные — возвращает новую схему.
 * Заменяет только сами URL, остальной контент не трогает.
 *
 * @param schema - Исходная схема.
 * @param urlMap - Map<oldUrl, newUrl> для замен.
 * @returns Новая схема с заменёнными URL.
 */
export function replaceSchemaImageUrls(
    schema: LandingSchema,
    urlMap: Map<string, string>
): LandingSchema {
    if (urlMap.size === 0) {
        return schema;
    }

    const components = schema.components.map((component) => {
        if (!component.props) {
            return component;
        }

        let hasChanges = false;
        const newProps: Record<string, unknown> = {};

        Object.entries(component.props).forEach(([propName, value]) => {
            // String prop
            if (typeof value === 'string') {
                // Голый URL — заменяем целиком
                if (urlMap.has(value)) {
                    hasChanges = true;
                    newProps[propName] = urlMap.get(value) as string;
                    return;
                }

                // HTML — заменяем только URL внутри src атрибутов
                if (value.includes('<img')) {
                    let replaced = value;
                    urlMap.forEach((newUrl, oldUrl) => {
                        replaced = replaced.split(oldUrl).join(newUrl);
                    });
                    if (replaced !== value) {
                        hasChanges = true;
                        newProps[propName] = replaced;
                        return;
                    }
                }

                newProps[propName] = value;
                return;
            }

            // Gallery array
            if (isGalleryArray(value)) {
                const newItems = value.map((item) => {
                    const newUrl = urlMap.get(item.url);
                    if (newUrl) {
                        hasChanges = true;
                        return { ...item, url: newUrl };
                    }
                    return item;
                });
                newProps[propName] = newItems;
                return;
            }

            // Inline content segments
            if (isInlineContentArray(value)) {
                const newSegments = value.map((segment) => {
                    if (
                        (segment.kind === 'image' || segment.kind === 'svg') &&
                        segment.url &&
                        urlMap.has(segment.url)
                    ) {
                        hasChanges = true;
                        return { ...segment, url: urlMap.get(segment.url) as string };
                    }
                    return segment;
                });
                newProps[propName] = newSegments;
                return;
            }

            newProps[propName] = value;
        });

        if (hasChanges) {
            return { ...component, props: newProps };
        }

        return component;
    });

    return { ...schema, components };
}
// #endregion
