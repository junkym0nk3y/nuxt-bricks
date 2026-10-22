// #region Imports
// Types
import type { IPreviewStoredPage } from '../../common/types/bricks-api';
import type {
    IPreviewDeviceBreakpoint,
    IRendererPreviewSync,
    IRendererPreviewSyncOptions,
} from '../types/composables';

// Utils
import { getPageAddressKey, toPageAddress } from '../../common/utils/bricks/pageAddress';

// Vue
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

// Composables
import { useBricksDevices } from '../../common/composables/useBricksDevices';

// Utils
import { deviceRanges, resolveDeviceIcon } from '../../common/utils/bricks/devices';
// #endregion

/**
 * Live synchronization of the preview with the builder tab: the localStorage
 * snapshot (taken only when it is no older than the saved page), realtime schema
 * updates over BroadcastChannel, a repeat request for the schema when the tab
 * regains focus, and a ResizeObserver for the banner showing the current device
 * and resolution. Outside preview (or on the server) nothing is subscribed — only
 * the computed values the banner needs. A preview of a saved version (`?version=`
 * in the URL) gets neither the sync nor the snapshot: its state comes from the
 * server and must not change.
 *
 * @param options - The address and the data of the page, the refs of the live sync
 * and the callback that restarts the data sources.
 */
export function useRendererPreviewSync(options: IRendererPreviewSyncOptions): IRendererPreviewSync {
    const {
        address,
        isPreview,
        previewVersionId,
        middlewarePageData,
        livePreviewData,
        page,
        refreshDataSources,
    } = options;

    // A version preview shows a state taken from the history: the live canvas is
    // not a source for it
    const isVersionPreview = previewVersionId !== null;

    // The page token in the localStorage slot and in the sync channel is the
    // address key, not the name: there is one slot per builder, and a snapshot of
    // `/blog/post` would otherwise show up in the preview of `/news/post` as its own
    const addressKey = getPageAddressKey(address);

    // Window size behind the resolution readout and the device match in the banner
    const windowWidth = ref(0);
    const windowHeight = ref(0);

    const { resolvePageDevices } = useBricksDevices();

    // The page's device set, not the project's: a page that defines its own set
    // has to be described by that set in the banner — otherwise at a width of 1400
    // the banner says "Tablet" while the page is already laid out as a laptop. The
    // label and the glyph come from the set itself; no second icon table is left
    // in the code
    const pageDevices = computed(() => resolvePageDevices(page.value?.viewportConfig ?? null));

    const sortedDeviceBreakpoints = computed<IPreviewDeviceBreakpoint[]>(() => {
        const devices = pageDevices.value;
        const ranges = deviceRanges(devices);

        return devices
            .map((device, index) => ({
                name: device.label,
                minWidth: ranges[index].min,
                icon: resolveDeviceIcon(device.icon),
            }))
            .sort((a, b) => b.minWidth - a.minWidth);
    });

    const currentDevice = computed<IPreviewDeviceBreakpoint>(() => {
        const width = windowWidth.value;
        const bps = sortedDeviceBreakpoints.value;

        for (const bp of bps) {
            if (width >= bp.minWidth) {
                return bp;
            }
        }

        return bps[bps.length - 1];
    });

    const resolutionText = computed(() => `${windowWidth.value}×${windowHeight.value}`);

    /**
     * Whether the snapshot in the slot belongs to this preview tab.
     *
     * @returns true — the slot is empty, unreadable, or taken from this same address.
     */
    function isPreviewSlotOwned(): boolean {
        const stored = window.localStorage.getItem('bricks-preview-page');

        if (!stored) {
            return true;
        }

        try {
            const parsed = JSON.parse(stored) as IPreviewStoredPage;

            return (
                getPageAddressKey(toPageAddress(parsed.pagename, parsed.urlPrefix)) === addressKey
            );
        } catch {
            return true;
        }
    }

    /**
     * Closes the preview window and clears the stored preview data.
     *
     * The localStorage entry belongs to the preview of the current canvas: a
     * version tab neither created it nor may delete it — otherwise closing a
     * version preview would strip the live preview of its snapshot.
     *
     * There is one slot per builder and the preview opened last owns it, so the
     * address is matched before the removal: closing tab A, opened before B, would
     * otherwise delete B's snapshot, and after a reload B would come up without any
     * canvas state (the sync channel carries the schema alone, with no base to
     * apply it to). An unreadable entry is removed anyway: its owner cannot be
     * determined and nothing can be restored from it.
     */
    function closePreview(): void {
        if (typeof window === 'undefined') {
            return;
        }

        if (!isVersionPreview && isPreviewSlotOwned()) {
            window.localStorage.removeItem('bricks-preview-page');
        }

        window.close();
    }

    if (isPreview && import.meta.client) {
        let resizeObserver: ResizeObserver | null = null;

        /**
         * Checks that the preview snapshot from localStorage is no older than the
         * saved page out of the SSR payload. Entries without `storedAt` (legacy)
         * count as stale whenever a saved page exists — otherwise a frozen snapshot
         * would overwrite a page that had just been saved.
         */
        function isStoredPreviewFresh(stored: IPreviewStoredPage): boolean {
            const dbPage = middlewarePageData.value;
            if (!dbPage) {
                return true;
            }

            const storedAt = Date.parse(stored.storedAt ?? '');
            if (Number.isNaN(storedAt)) {
                return false;
            }

            const updatedAt = Date.parse(dbPage.updatedAt ?? '');
            if (Number.isNaN(updatedAt)) {
                return true;
            }

            return storedAt >= updatedAt;
        }

        // On mount read the data from localStorage — but only when it is no older
        // than the saved page
        onMounted(() => {
            resizeObserver = new ResizeObserver(() => {
                windowWidth.value = window.innerWidth;
                windowHeight.value = window.innerHeight;
            });
            resizeObserver.observe(document.documentElement);

            // A version preview has received its state from the server: a snapshot
            // of the live canvas would replace the history with whatever is in the
            // editor right now
            if (isVersionPreview) {
                return;
            }

            try {
                const stored = window.localStorage.getItem('bricks-preview-page');
                if (stored) {
                    const parsed = JSON.parse(stored) as IPreviewStoredPage;
                    const storedKey = getPageAddressKey(
                        toPageAddress(parsed.pagename, parsed.urlPrefix)
                    );

                    if (storedKey === addressKey && isStoredPreviewFresh(parsed)) {
                        livePreviewData.value = parsed;
                    }
                }
            } catch {
                // ignore storage errors
            }
        });

        // The sync with the builder is for a preview of the current state only: a
        // version tab does not ask the builder for the schema (it would answer with
        // the live canvas) and does not accept its updates
        if (!isVersionPreview) {
            // Subscribe to realtime schema updates from the builder tab
            const previewChannel = new BroadcastChannel('bricks-preview-sync');

            previewChannel.onmessage = (event: MessageEvent) => {
                const { type, address: msgAddress, schema, viewportConfig } = event.data ?? {};

                if (type === 'content-update' && msgAddress === addressKey) {
                    // livePreviewData as the fallback: relevant for temporary pages
                    // that are not in the database
                    const base = middlewarePageData.value ?? livePreviewData.value;
                    if (base) {
                        // The device set arrives together with the schema: it sets
                        // the thresholds and the container widths, and without it
                        // the preview would show the new schema in the old layout
                        livePreviewData.value = {
                            ...base,
                            schema,
                            viewportConfig: viewportConfig ?? null,
                        };
                    }
                }
            };

            /**
             * Asks the builder tab for a fresh schema: restores the live sync after
             * a reload of the preview or of the builder itself.
             */
            function requestFreshSchema(): void {
                previewChannel.postMessage({ type: 'request-schema', address: addressKey });
            }

            /**
             * A repeated request on coming back to the tab — the builder could have
             * reloaded while the preview was in the background.
             */
            function handleVisibilityChange(): void {
                if (!document.hidden) {
                    requestFreshSchema();
                }
            }

            requestFreshSchema();
            document.addEventListener('visibilitychange', handleVisibilityChange);

            onUnmounted(() => {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
                previewChannel.close();
            });
        }

        onUnmounted(() => {
            resizeObserver?.disconnect();
            resizeObserver = null;
        });

        // Refresh the data sources when the page data changes (the first load or a
        // live update)
        watch(
            () => page.value,
            (value) => {
                if (value) {
                    refreshDataSources();
                }
            },
            { immediate: true }
        );
    }

    return {
        currentDevice,
        resolutionText,
        closePreview,
    };
}
