// Types
import { BASE_DEVICE_KEY } from '../../../common/constants/devices';
import type {
    IBuilderSessionToken,
    IThumbnailUploadResponse,
    IUsePageThumbnailReturn,
} from '../types/composables';

// Vue
import { nextTick } from 'vue';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';

// Constants
import {
    BRICKS_S3_PROXY_TIMEOUT_MS,
    BRICKS_THUMBNAIL_UPLOAD_TIMEOUT_MS,
} from '../../../common/constants/apiTimeouts';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { usePublishStore } from '../../publish/stores/publish';

/** Target width of the canvas snapshot (px) — the server recompresses the webp to it too. */
const THUMBNAIL_TARGET_WIDTH = 480;

/** Aspect ratio of the thumbnail in the dashboard (16:10). */
const THUMBNAIL_ASPECT_RATIO = 0.625;

/**
 * Height limit of the snapshot — about two 16:10 frames, so that very long pages
 * are not rendered.
 */
const THUMBNAIL_MAX_FRAMES = 2;

/**
 * The canvas snapshot for the page preview in the /bricks dashboard: it shoots the
 * DOM of the canvas (modern-screenshot, a lazy chunk of the builder), uploads it
 * into S3 and patches the `thumbnailUrl` of the page. Fire-and-forget: any error is
 * put out with a `console.warn`, the save of the page is not blocked.
 *
 * @param sessionToken - The session token: a snapshot of the canvas belongs to the
 * page the request went out of.
 */
export function usePageThumbnail(sessionToken: IBuilderSessionToken): IUsePageThumbnailReturn {
    const componentsStore = useComponentsStore();
    const publishStore = usePublishStore();

    /**
     * Finds the DOM node of the canvas for the snapshot.
     *
     * In the Figma mode there are several `.bricks-canvas` on the page — the sheet
     * of the base device is taken: the shot goes into the card of the page, and a
     * narrow sheet would show a layout other than the one the page is recognized by.
     */
    function findCanvasNode(): HTMLElement | null {
        return (
            document.querySelector<HTMLElement>(
                `[data-bricks-viewport="${BASE_DEVICE_KEY}"].bricks-canvas`
            ) ?? document.querySelector<HTMLElement>('.bricks-canvas')
        );
    }

    /**
     * Assembles the fetchFn for modern-screenshot: cross-origin media is pulled
     * through a same-origin proxy (a bucket with no CORS headers gives the bytes to
     * dom-to-image nowhere). The proxy lets through the URLs of the media library
     * only; everything else gives false (an ordinary fetch).
     *
     * @returns The resolver of a resource into a data URL, cached for the duration
     * of the snapshot.
     */
    function createProxyFetchFn(): (url: string) => Promise<string | false> {
        const { apiFetcher } = useApiClient();
        const cache = new Map<string, Promise<string | false>>();

        return (url: string) => {
            if (url.startsWith('data:') || url.startsWith(window.location.origin)) {
                return Promise.resolve(false);
            }

            const cached = cache.get(url);
            if (cached) {
                return cached;
            }

            const request = apiFetcher<{ dataUrl: string }>('/api/bricks/media/s3-proxy', {
                method: 'POST',
                body: { url },
                // The override is what keeps the write ceiling (30 s) off a read
                // performed with a POST; why the value is what it is — at the
                // constant. The trade-off is local: the 15 s cover the whole
                // exchange, the transfer of the base64 in the answer included, so a
                // large resource on a slow link drops out of the snapshot. Taking a
                // preview is best-effort (`fetchFn` returns false and the resource
                // simply does not make it into the frame), so the ceiling matters
                // more here than completeness
                timeout: BRICKS_S3_PROXY_TIMEOUT_MS,
            }).then(
                (response) => response.dataUrl || false,
                () => false as const
            );

            cache.set(url, request);
            return request;
        };
    }

    /**
     * Shoots the canvas, uploads the snapshot into S3 and saves the `thumbnailUrl`
     * of the page with a PATCH. An empty schema is skipped (the canvas holds the
     * watermark of the empty state alone).
     *
     * The token comes from the caller rather than being taken here: the shot is the
     * tail of a save, and "the start of the operation" is the moment the save began.
     * With a token taken on the spot every check below becomes empty whenever the
     * shot itself is started after a change of session already — which is exactly
     * what `handleSaveAsCopy` does, calling it after `await switchToSavedPage`.
     *
     * There are three boundaries, and each answers for its own: on entry — before
     * the first mutation of a shared store; after the preparatory awaits — before
     * the live DOM is read; after `domToBlob` — before the result is sent. Not one
     * of them duplicates another.
     *
     * @param pageId - The identifier of the saved page.
     * @param startedIn - The session token taken at the start of the save.
     */
    async function captureAndUploadThumbnail(
        pageId: string | number,
        startedIn: number
    ): Promise<void> {
        try {
            // The check stands before any action rather than before the shot
            // alone: the first thing is `deselectComponent`, and that is a write
            // into a shared store — the reset of the selection, the switching off
            // of the interactive preview and the hiding of the properties panel.
            // Called out of a displaced save, it would drop the selection on the
            // canvas of an already different page
            if (!sessionToken.isCurrent(startedIn)) {
                return;
            }

            if (!import.meta.client || componentsStore.sortedComponents.length === 0) {
                return;
            }

            // The selection is dropped — the outline of a selected component would
            // make it into the snapshot
            componentsStore.deselectComponent();
            await nextTick();

            // A lazy import: the library lands in the chunk of the builder only
            // (the bundle firewall)
            const { domToBlob } = await import('modern-screenshot');

            // `pageId` is fixed at the start while what is shot is the live DOM of
            // the canvas: after a move the frame would belong to an already
            // different page, and the preview of the saved one would be patched
            // with somebody else's content. This check saves work — the swap itself
            // is caught by the check after the shot
            if (!sessionToken.isCurrent(startedIn)) {
                return;
            }

            const node = findCanvasNode();
            if (!node) {
                return;
            }

            const blob = await domToBlob(node, {
                scale: Math.min(1, THUMBNAIL_TARGET_WIDTH / node.offsetWidth),
                type: 'image/jpeg',
                quality: 0.8,
                // Explicit sizes in layout pixels: without a width the library
                // takes the width out of boundingClientRect (already shrunk by the
                // canvasTransform) and cuts the content off on the right
                width: node.offsetWidth,
                height: Math.min(
                    node.offsetHeight,
                    node.offsetWidth * THUMBNAIL_ASPECT_RATIO * THUMBNAIL_MAX_FRAMES
                ),
                // The canvasTransform (`canvasStore.scale * remCompensation`, see
                // `useCanvas`) and the frame of the canvas are neutralized
                style: { transform: 'none', margin: '0', boxShadow: 'none', borderRadius: '0' },
                fetchFn: createProxyFetchFn(),
            });

            // The decisive check: `domToBlob` does not clone the DOM at once. First
            // `createContext` waits for every `img`/`video` of the canvas to load
            // (`waitUntilLoad`), and only then comes `cloneNode`. A move inside that
            // window means the canvas of another page has been shot — such a frame
            // must not be uploaded under the fixed `pageId`
            if (!sessionToken.isCurrent(startedIn)) {
                return;
            }

            const formData = new FormData();
            formData.append('file', blob, `page-${pageId}.jpg`);
            formData.append('pageId', String(pageId));

            const { apiFetcher } = useApiClient();
            const response = await apiFetcher<IThumbnailUploadResponse>(
                '/api/bricks/media/s3-page-thumbnail',
                {
                    method: 'POST',
                    body: formData,
                    timeout: BRICKS_THUMBNAIL_UPLOAD_TIMEOUT_MS,
                }
            );

            if (!response.success || !response.url) {
                throw new Error('Thumbnail upload failed');
            }

            // No cache buster: the key is unique per upload, so the URL of a new
            // frame is a new one by itself. The former `?v=<ts>` would only get in
            // the way now — the version snapshot carries this very URL into the
            // history, and the versions would differ from one another by a query
            // parameter rather than by the file
            await publishStore.patchPage(pageId, { thumbnailUrl: response.url });
        } catch (error: unknown) {
            console.warn('[Bricks Thumbnail] Capture failed:', error);
        }
    }

    return { captureAndUploadThumbnail };
}
