// #region Imports
// Types
import type { IUseCanvasSnapshotReturn } from '../types/composables';
import type { IBuilderSessionToken } from '../types/session';

// Constants
import { BASE_DEVICE_KEY } from '../../../common/constants/devices';
import { BRICKS_S3_PROXY_TIMEOUT_MS } from '../../../common/constants/apiTimeouts';

// Vue
import { nextTick } from 'vue';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
// #endregion

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
 * The shot of the canvas for a preview card — of a page in the dashboard list or of a
 * template in its section. It shoots the DOM of the canvas (modern-screenshot, a lazy
 * chunk of the builder); where the frame goes is the caller's business.
 *
 * @param sessionToken - The session token: a snapshot of the canvas belongs to the
 * session the save went out of.
 * @returns The capture of the canvas into a Blob.
 */
export function useCanvasSnapshot(sessionToken: IBuilderSessionToken): IUseCanvasSnapshotReturn {
    const componentsStore = useComponentsStore();

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
     * Shoots the canvas into a JPEG Blob. An empty schema is skipped (the canvas holds
     * the watermark of the empty state alone).
     *
     * The token comes from the caller rather than being taken here: the shot is the
     * tail of a save, and "the start of the operation" is the moment the save began.
     * With a token taken on the spot every check below becomes empty whenever the
     * shot itself is started after a change of session already — which is exactly
     * what the save of a copy of a page does, calling it after the move onto the copy.
     *
     * There are three boundaries, and each answers for its own: on entry — before
     * the first mutation of a shared store; after the preparatory awaits — before
     * the live DOM is read; after `domToBlob` — before the result is handed out. Not
     * one of them duplicates another.
     *
     * @param startedIn - The session token taken at the start of the save.
     * @returns The frame, or null — nothing to shoot, or the session changed meanwhile.
     */
    async function captureCanvasSnapshot(startedIn: number): Promise<Blob | null> {
        // The check stands before any action rather than before the shot alone: the
        // first thing is `deselectComponent`, and that is a write into a shared store —
        // the reset of the selection, the switching off of the interactive preview and
        // the hiding of the properties panel. Called out of a displaced save, it would
        // drop the selection on the canvas of an already different page
        if (!sessionToken.isCurrent(startedIn)) {
            return null;
        }

        if (!import.meta.client || componentsStore.sortedComponents.length === 0) {
            return null;
        }

        // The selection is dropped — the outline of a selected component would make it
        // into the snapshot
        componentsStore.deselectComponent();
        await nextTick();

        // A lazy import: the library lands in the chunk of the builder only (the bundle
        // firewall)
        const { domToBlob } = await import('modern-screenshot');

        // The identity the frame goes under is fixed at the start while what is shot is
        // the live DOM of the canvas: after a move the frame would belong to an already
        // different canvas. This check saves work — the swap itself is caught by the
        // check after the shot
        if (!sessionToken.isCurrent(startedIn)) {
            return null;
        }

        const node = findCanvasNode();
        if (!node) {
            return null;
        }

        const blob = await domToBlob(node, {
            scale: Math.min(1, THUMBNAIL_TARGET_WIDTH / node.offsetWidth),
            type: 'image/jpeg',
            quality: 0.8,
            // Explicit sizes in layout pixels: without a width the library takes the
            // width out of boundingClientRect (already shrunk by the canvasTransform)
            // and cuts the content off on the right
            width: node.offsetWidth,
            height: Math.min(
                node.offsetHeight,
                node.offsetWidth * THUMBNAIL_ASPECT_RATIO * THUMBNAIL_MAX_FRAMES
            ),
            // The canvasTransform (`canvasStore.scale`, see `useCanvas`) and the frame
            // of the canvas are neutralized
            style: { transform: 'none', margin: '0', boxShadow: 'none', borderRadius: '0' },
            fetchFn: createProxyFetchFn(),
        });

        // The decisive check: `domToBlob` does not clone the DOM at once. First
        // `createContext` waits for every `img`/`video` of the canvas to load
        // (`waitUntilLoad`), and only then comes `cloneNode`. A move inside that window
        // means the canvas of another session has been shot — such a frame must not be
        // uploaded under the fixed identity
        if (!sessionToken.isCurrent(startedIn)) {
            return null;
        }

        return blob;
    }

    return { captureCanvasSnapshot };
}
