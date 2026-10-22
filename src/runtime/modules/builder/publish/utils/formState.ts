import type { TPublishedPageSummary, TPublishFormState } from '../../../common/types/bricks-api';
import { cloneDeviceSet } from '../../../common/utils/bricks/devices';
import {
    DEFAULT_BACKGROUND_COLOR,
    DEFAULT_LAYOUT,
} from '../../../common/utils/bricks/publishedPage';

/**
 * The cached background color from the app config (set from a Vue context).
 */
let cachedBackgroundColor: string | null = null;

/**
 * Sets the cached background color from the app config.
 * To be called from a Vue setup context (in useBuilderPage, for one).
 *
 * @param color - The background color from the config.
 */
export function setPublishStoreBackgroundColor(color: string): void {
    cachedBackgroundColor = color;
}

/**
 * Returns the background color from the cache, or the default one.
 *
 * @returns The default background color.
 */
export function resolveDefaultBackgroundColor(): string {
    return cachedBackgroundColor || DEFAULT_BACKGROUND_COLOR;
}

/**
 * Builds the default state of the publish form, the configuration taken into
 * account.
 *
 * @returns The default state of the publish form.
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
        headCode: null,
        bodyEndCode: null,
        noindex: false,
        createdAt: '',
        updatedAt: '',
    };
}

/**
 * Builds the form state for a copy of a page: clones the meta; the copy is a draft
 * with the given `pagename` and the "(copy)" suffix in its title.
 *
 * @param page - The source page.
 * @param pagename - The unique `pagename` of the copy.
 * @returns The publish form state of the copy.
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
        // A deep copy: with a shared reference an edit of the device set on the
        // copy would change the set of the original while both forms are open
        viewportConfig: cloneDeviceSet(page.viewportConfig),
        headCode: page.headCode,
        bodyEndCode: page.bodyEndCode,
        noindex: page.noindex,
        createdAt: '',
        updatedAt: '',
    };
}

/**
 * Builds the form state out of a saved page — the editing mode.
 *
 * The difference from `buildCopyFormState`: the page opens "as is", with its own
 * dates and publication status, instead of turning into a new draft.
 *
 * @param page - Page summary from the list in the store.
 * @returns The publish form state.
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
        headCode: page.headCode,
        bodyEndCode: page.bodyEndCode,
        noindex: page.noindex,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
    };
}

/**
 * Stabilizes the publish form state: fills the missing fields in with the
 * defaults.
 *
 * @param formState - An arbitrary form state (out of localStorage, for one).
 * @returns The complete TPublishFormState structure.
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
        // The drafts written before the device set appeared carry no such field
        // — that is a legitimate "inherits the set of the project" rather than a
        // loss of data
        viewportConfig: cloneDeviceSet(formState.viewportConfig),
        // Drafts written before the page code appeared carry none of the three fields
        headCode: formState.headCode ?? null,
        bodyEndCode: formState.bodyEndCode ?? null,
        noindex: formState.noindex === true,
        createdAt: formState.createdAt ?? defaults.createdAt,
        updatedAt: formState.updatedAt ?? defaults.updatedAt,
    };
}
