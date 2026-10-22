// #region Imports
// Types
import type { IPreviewStoredPage } from '../../../common/types/bricks-api';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type { IBuilderSessionToken } from '../types/session';

// Utils
import { cloneDeviceSet } from '../../../common/utils/bricks/devices';
import { getPageAddressKey, toPageAddress } from '../../../common/utils/bricks/pageAddress';

// Vue
import { onUnmounted, watch } from 'vue';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

// #region Data
/**
 * The actions of the components store that do not change the schema: the
 * selection, the favorites, the copy into the clipboard, the reads. Everything else
 * (new actions included) triggers the preview sync by default — a false positive is
 * safe, a false negative would break the sync.
 */
const NON_SCHEMA_ACTIONS = new Set([
    'selectComponent',
    'deselectComponent',
    'toggleInteractivePreview',
    'copyComponentToClipboard',
    'copySelectedComponent',
    'toggleFavorite',
    'exportSchema',
    'getRootComponents',
]);
// #endregion

/**
 * Synchronization of the canvas schema with an open preview tab through a
 * BroadcastChannel.
 *
 * The channel is open for the whole life of the builder: on mounting, the preview
 * sends a `request-schema` and the builder answers with a snapshot of the content
 * (the schema plus the device set) — the sync heals itself after a reload of either
 * tab. The changes of the components are sent with a debounce of 300 ms; the
 * channel is closed on unmount.
 *
 * What identifies a page in the channel is the KEY OF THE ADDRESS rather than the
 * name: `/blog/post` and `/news/post` share a name, and the preview of the first
 * would take the schema of the second for its own.
 *
 * @param sessionToken - The session token: the opening of another page breaks the
 * sync off, otherwise its schema would travel out under the address of the former
 * one.
 */
export function usePreviewSync(sessionToken: IBuilderSessionToken) {
    const componentsStore = useComponentsStore();
    const publishStore = usePublishStore();

    let previewBroadcastChannel: BroadcastChannel | null = null;
    let previewSyncTimer: ReturnType<typeof setTimeout> | null = null;
    // The address key of the open preview tab; an empty string means there is no
    // sync
    let previewAddressKey = '';

    /**
     * Sends a snapshot of the content of the canvas into the open preview tab
     * through the BroadcastChannel. Alongside it updates localStorage (`storedAt`
     * included), so that a reload of the tab shows fresh data.
     *
     * The snapshot is the schema AND the device set: the set holds the thresholds of
     * the media queries and the widths of the container, so without it a preview
     * would show the new schema in the old layout.
     */
    function sendPreviewContentUpdate(): void {
        if (!previewBroadcastChannel || !previewAddressKey) {
            return;
        }

        const schema = componentsStore.exportSchema();
        // A copy rather than the value out of the form state: what lies there is a
        // reactive proxy, and a structured clone over a Proxy throws a
        // DataCloneError — postMessage used to fail whole, and the preview stopped
        // updating until the tab was reloaded. The write into localStorage goes
        // below and would go through, masking the refusal
        const viewportConfig = cloneDeviceSet(publishStore.currentFormState.viewportConfig);

        if (typeof window !== 'undefined') {
            try {
                const stored = window.localStorage.getItem('bricks-preview-page');
                if (stored) {
                    const parsed = JSON.parse(stored) as IPreviewStoredPage;
                    // The check is by the address: there is one slot per builder,
                    // and the snapshot of a neighboring same-named page would
                    // otherwise receive the schema of this one
                    if (
                        getPageAddressKey(toPageAddress(parsed.pagename, parsed.urlPrefix)) ===
                        previewAddressKey
                    ) {
                        parsed.schema = schema;
                        parsed.viewportConfig = viewportConfig;
                        parsed.storedAt = new Date().toISOString();
                        window.localStorage.setItem('bricks-preview-page', JSON.stringify(parsed));
                    }
                }
            } catch {
                // ignore storage errors
            }
        }

        previewBroadcastChannel.postMessage({
            type: 'content-update',
            address: previewAddressKey,
            schema,
            viewportConfig,
        });
    }

    /**
     * Creates the BroadcastChannel and subscribes to the `request-schema` of the
     * preview tab: when the address asked for is the one of the page open in the
     * builder, it restores the sync and answers with a fresh schema at once.
     */
    function ensurePreviewChannel(): void {
        if (!import.meta.client || previewBroadcastChannel) {
            return;
        }

        previewBroadcastChannel = new BroadcastChannel('bricks-preview-sync');

        previewBroadcastChannel.onmessage = (event: MessageEvent) => {
            const { type, address } = event.data ?? {};
            if (type !== 'request-schema' || typeof address !== 'string' || !address) {
                return;
            }

            const formAddressKey = getPageAddressKey(
                toPageAddress(
                    String(publishStore.currentFormState.pagename ?? ''),
                    publishStore.currentFormState.urlPrefix
                )
            );

            if (address !== formAddressKey && address !== previewAddressKey) {
                return;
            }

            previewAddressKey = address;
            sendPreviewContentUpdate();
        };
    }

    /**
     * Remembers the address of the open preview tab (called on a click of
     * "Preview").
     *
     * @param address - The address of the page opened in the preview.
     */
    function startPreviewSync(address: IBricksPageAddress): void {
        if (!import.meta.client) {
            return;
        }

        previewAddressKey = getPageAddressKey(address);
        ensurePreviewChannel();
    }

    // The channel is opened at once so that a preview tab can restore the sync
    // through a request-schema after a reload of the builder
    ensurePreviewChannel();

    /**
     * Schedules the sending of the schema into the preview with a debounce of 300 ms.
     */
    function schedulePreviewContentUpdate(): void {
        if (!previewBroadcastChannel || !previewAddressKey) {
            return;
        }

        if (previewSyncTimer) {
            clearTimeout(previewSyncTimer);
        }

        previewSyncTimer = setTimeout(() => {
            sendPreviewContentUpdate();
            previewSyncTimer = null;
        }, 300);
    }

    // The sync runs at the end of the mutating actions of the store instead of a
    // deep watch of the whole schema (a deep walk of every component per mutation
    // was expensive during a drag or the typing of text). The direct mutations
    // outside the actions (useDraggableComponent) end in a saveToHistory — covered.
    componentsStore.$onAction(({ name, after }) => {
        if (NON_SCHEMA_ACTIONS.has(name)) {
            return;
        }

        after(() => {
            schedulePreviewContentUpdate();
        });
    });

    // A trigger of its own on the device set: the subscription above catches the
    // actions of the components store only, while an edit of the set touches no
    // block — the preview would stay in the former layout until the next edit of the
    // schema
    watch(
        () => publishStore.currentFormState.viewportConfig,
        () => {
            schedulePreviewContentUpdate();
        },
        { deep: true }
    );

    // The opening of another page breaks the sync off. The channel and
    // `previewAddressKey` live longer than a session, so the schema of the new page
    // used to travel into localStorage and into the BroadcastChannel under the
    // address of the former one — the preview tab showed somebody else's content
    // under its own address. The tab simply stops updating: its `request-schema` is
    // cut off from then on by the comparison with the address of the form.
    // flush: 'sync' — the reset is obliged to happen at the moment the token is
    // invalidated, before `openBuilderSession` goes into an await and the schema on
    // the canvas changes
    watch(
        sessionToken.token,
        () => {
            previewAddressKey = '';

            if (previewSyncTimer) {
                clearTimeout(previewSyncTimer);
                previewSyncTimer = null;
            }
        },
        { flush: 'sync' }
    );

    onUnmounted(() => {
        if (previewSyncTimer) {
            clearTimeout(previewSyncTimer);
            previewSyncTimer = null;
        }
        previewBroadcastChannel?.close();
        previewBroadcastChannel = null;
    });

    return { startPreviewSync };
}
