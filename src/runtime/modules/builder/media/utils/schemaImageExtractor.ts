/**
 * Extraction and replacement of the image URLs of an `IBricksSchema`.
 */

// #region Imports
// Types
import type { IBricksSchema, IBricksComponent } from '../../../common/types/brick';
import type {
    IExtractedImageUrl,
    IImageLocation,
    TImageSourceType,
} from '../types/schemaImageResolver';
import type { IGalleryItem, IInlineContentSegment } from '../../../common/types/content';

// Utils
import { resolveBricksAssetUrl } from '../../../common/utils/bricks/assetPaths';
// #endregion

// #region Constants
/**
 * Asset path of the placeholder inside the module's `public/` (the URL itself is
 * built by `resolveBricksAssetUrl`).
 */
const PLACEHOLDER_IMAGE_ASSET_PATH = 'images/brick-empty.webp';

/**
 * The suffix the placeholder is recognized by in a schema: comparing by the suffix
 * rather than by the whole URL does not depend on the `app.baseURL` of the
 * environment the schema happened to be saved in.
 */
const PLACEHOLDER_IMAGE_SUFFIX = '/images/brick-empty.webp';

const IMAGE_EXTENSIONS_RE = /\.(webp|png|jpg|jpeg|gif|svg|avif)(\?|$)/i;
const CDN_PATTERNS_RE = /storage\.yandexcloud\.net|amazonaws\.com|cdn\./i;
/**
 * The `src` of an `<img>` split into three groups: everything up to the value,
 * the quote and the value itself. Extraction and replacement go through one and
 * the same pattern, so what gets swapped is exactly what was found.
 *
 * The whitespace before `src` is mandatory — otherwise `data-src` of a lazy
 * loader passes for `src` and its URL is collected as an image of the page.
 */
const HTML_IMG_SRC_RE = /(<img\b[^>]*?\s+src\s*=\s*)(["'])([^"']+)\2/gi;

/** Whether the string holds an `<img>` at all — a cheap gate ahead of the pattern. */
const HTML_IMG_TAG_RE = /<img\b/i;
const DATA_URI_RE = /^data:/;
/**
 * The longest string that may still be taken for a bare URL — a ceiling against
 * running the URL checks over long content. Markup is cut off before this one gets
 * a say: a string with angle brackets or spaces is not a bare URL to begin with.
 */
const MAX_BARE_URL_LENGTH = 2048;
// #endregion

// #region Helpers
/**
 * Returns the URL of the placeholder image, honoring `app.baseURL`.
 *
 * @param baseURL - `app.baseURL` of the application (`/` — a no-op).
 */
export function getPlaceholderImageUrl(baseURL: string): string {
    return resolveBricksAssetUrl(baseURL, PLACEHOLDER_IMAGE_ASSET_PATH);
}

/**
 * Whether the URL is the placeholder of the module (in any of the historical forms
 * it was written into a schema in).
 *
 * @param url - The URL being checked.
 */
function isPlaceholderImageUrl(url: string): boolean {
    return url.endsWith(PLACEHOLDER_IMAGE_SUFFIX);
}

/**
 * Checks whether the string as a whole is an image URL rather than a piece of HTML.
 *
 * @param value - The string to check.
 * @returns true when the string is a bare image URL.
 */
function isBareImageUrl(value: string): boolean {
    if (!value || typeof value !== 'string') {
        return false;
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed.length < 5 || trimmed.length > MAX_BARE_URL_LENGTH) {
        return false;
    }

    // Data URIs are out
    if (DATA_URI_RE.test(trimmed)) {
        return false;
    }

    // The placeholder is out
    if (isPlaceholderImageUrl(trimmed)) {
        return false;
    }

    // A bare URL carries neither tags nor spaces
    if (trimmed.includes('<') || trimmed.includes('>') || trimmed.includes(' ')) {
        return false;
    }

    // And it has to start like a URL
    if (
        !trimmed.startsWith('http://') &&
        !trimmed.startsWith('https://') &&
        !trimmed.startsWith('/')
    ) {
        return false;
    }

    // Recognized either by the extension or by the CDN pattern
    return IMAGE_EXTENSIONS_RE.test(trimmed) || CDN_PATTERNS_RE.test(trimmed);
}

/**
 * Checks whether the value is an array of gallery items.
 *
 * @param value - The value to check.
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
 * Checks whether the value is an array of inline content segments.
 *
 * @param value - The value to check.
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
 * Adds a URL to the map, deduplicating by the URL itself.
 *
 * @param urlMap - The map the results are collected into.
 * @param url - URL of the image.
 * @param location - Where in the schema it sits.
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
 * Builds an `IImageLocation`.
 */
function createLocation(
    componentIndex: number,
    component: IBricksComponent,
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
 * Extracts the URLs out of an HTML string (a textarea holding TipTap content).
 *
 * @param html - The HTML string.
 * @param componentIndex - Index of the component in the schema.
 * @param component - The component.
 * @param propName - Name of the prop.
 * @param urlMap - The map the results are collected into.
 */
function extractFromHtml(
    html: string,
    componentIndex: number,
    component: IBricksComponent,
    propName: string,
    urlMap: Map<string, IImageLocation[]>
): void {
    let match: RegExpExecArray | null;
    HTML_IMG_SRC_RE.lastIndex = 0;

    while ((match = HTML_IMG_SRC_RE.exec(html)) !== null) {
        const src = match[3];
        if (src && !DATA_URI_RE.test(src) && !isPlaceholderImageUrl(src)) {
            addUrlToMap(
                urlMap,
                src,
                createLocation(componentIndex, component, propName, 'html-img')
            );
        }
    }
}
/**
 * Swaps the `src` of every `<img>` whose value the map holds, leaving the rest of
 * the markup exactly as it was (the quote character included).
 *
 * @param html - The HTML string of the prop.
 * @param urlMap - `Map<oldUrl, newUrl>` of the replacements.
 * @returns The string with the sources replaced.
 */
function replaceHtmlImageSources(html: string, urlMap: Map<string, string>): string {
    HTML_IMG_SRC_RE.lastIndex = 0;

    return html.replace(
        HTML_IMG_SRC_RE,
        (match: string, prefix: string, quote: string, src: string): string => {
            const newUrl = urlMap.get(src);

            // An empty new URL is a legitimate value of the map, so the check is
            // for its presence and not for its truthiness
            return newUrl === undefined ? match : `${prefix}${quote}${newUrl}${quote}`;
        }
    );
}
// #endregion

// #region Public API
/**
 * Extracts every unique image URL out of a landing schema.
 *
 * @param schema - The `IBricksSchema` to walk.
 * @returns The unique URLs, each with every place it was met in.
 */
export function extractSchemaImageUrls(schema: IBricksSchema): IExtractedImageUrl[] {
    const urlMap = new Map<string, IImageLocation[]>();

    schema.components.forEach((component, componentIndex) => {
        if (!component.props) {
            return;
        }

        Object.entries(component.props).forEach(([propName, value]) => {
            // String prop
            if (typeof value === 'string') {
                // A bare URL (the whole string is the URL)
                if (isBareImageUrl(value)) {
                    addUrlToMap(
                        urlMap,
                        value,
                        createLocation(componentIndex, component, propName, 'simple-prop')
                    );
                    return;
                }

                // HTML content carrying <img> tags
                if (HTML_IMG_TAG_RE.test(value)) {
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
                        !isPlaceholderImageUrl(segment.url)
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
 * Replaces the image URLs of a schema according to a mapping.
 * The input is not mutated — a new schema is returned.
 *
 * Everything is swapped by an EXACT match of the whole value: a bare prop, an item
 * of a gallery or of a segment, and the `src` of an `<img>` inside an HTML prop.
 * The scope is the same as the extraction's, and that is the point: the
 * replacement used to walk the whole HTML string, so a match was taken wherever
 * it sat — in the `href` of a neighboring link, in the visible text, in a
 * `data-` attribute — and a URL that was a PREFIX of another one broke it: with
 * `…/a.png` swapped ahead of `…/a.png?v=2`, the second turned into
 * `<the new URL>?v=2`, a broken link. An exact comparison has neither edge, and
 * the order of the map stops mattering.
 *
 * What the narrowed scope gives up: the same URL inside an `href` around the
 * picture stays as it was. It was never extracted, so it was never shown to the
 * user either — swapping links is a separate job, with a source type of its own.
 *
 * @param schema - The original schema.
 * @param urlMap - `Map<oldUrl, newUrl>` of the replacements.
 * @returns A new schema with the URLs replaced.
 */
export function replaceSchemaImageUrls(
    schema: IBricksSchema,
    urlMap: Map<string, string>
): IBricksSchema {
    if (urlMap.size === 0) {
        return schema;
    }

    const components = schema.components.map((component) => {
        if (!component.props) {
            return component;
        }

        let hasChanges = false;
        // Prop names arrive out of a schema, a hand-imported one included:
        // `newProps['__proto__'] = value` would replace the prototype of the object
        // being assembled instead of writing a key, and the props would travel into
        // it. Hence the pairs: `Object.fromEntries` makes an own property even out
        // of `__proto__` (CreateDataProperty rather than an assignment), so the
        // prototype is left alone and the "the rest of the content is left alone"
        // contract holds. `toSafeRecord` does not fit here — it would drop such a
        // key, and only when the picture changed; the dropping belongs at the
        // entrance of a schema into the store (`cloneComponentProps`), where it
        // happens unconditionally
        const newPropEntries: Array<[string, unknown]> = [];

        Object.entries(component.props).forEach(([propName, value]) => {
            // String prop
            if (typeof value === 'string') {
                // A bare URL — swapped whole
                if (urlMap.has(value)) {
                    hasChanges = true;
                    newPropEntries.push([propName, urlMap.get(value) as string]);
                    return;
                }

                // HTML — only the `src` of an `<img>`, by an exact match of the
                // whole value
                if (HTML_IMG_TAG_RE.test(value)) {
                    const replaced = replaceHtmlImageSources(value, urlMap);

                    if (replaced !== value) {
                        hasChanges = true;
                        newPropEntries.push([propName, replaced]);
                        return;
                    }
                }

                newPropEntries.push([propName, value]);
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
                newPropEntries.push([propName, newItems]);
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
                newPropEntries.push([propName, newSegments]);
                return;
            }

            newPropEntries.push([propName, value]);
        });

        if (hasChanges) {
            return { ...component, props: Object.fromEntries(newPropEntries) };
        }

        return component;
    });

    return { ...schema, components };
}
// #endregion
