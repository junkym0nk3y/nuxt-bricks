// #region Imports
// Types
import type { IMediaUpdateMetaRequest } from '../../../common/types/media';
import type { IMediaMetaDrafts, IMediaMetaDraftsOptions } from '../types/composables';

// Vue
import { ref, watch } from 'vue';
// #endregion

/**
 * Drafts of the name and the alt of the selected file: the typing, the commit of an
 * edit, and the protection from the updates coming from the server.
 *
 * One mechanism for two surfaces — the meta panel of the modal and the details panel
 * of the dashboard section. A second copy of this synchronization would drift away
 * from the first one silently: the whole of it is made of edge cases, and every
 * one of them has been a defect already.
 */
export function useMediaMetaDrafts(options: IMediaMetaDraftsOptions): IMediaMetaDrafts {
    // #region Data
    const filename = ref('');
    const alt = ref('');
    /**
     * The last accepted values of the server — by them "the field was not touched"
     * is told from "the field holds unsaved typing". There is deliberately no dirty
     * flag of its own: it would set up a second source of the same fact and would
     * drift away from the value itself.
     */
    const syncedItemId = ref<number | null>(null);
    const syncedFilename = ref('');
    const syncedAlt = ref('');
    // #endregion

    // #region Methods
    /**
     * Sends the changed fields when focus leaves the row of fields.
     *
     * The draft is brought to the form it would be sent in before any check at all,
     * and that is not cosmetics: a field whose draft has parted from its shadow value
     * is taken by the watcher below for a field with unsaved typing, and the updates
     * of the server stop reaching it. An emptied name is not sent (the server demands
     * at least one character), and typing with a trailing space matches what is saved
     * already once trimmed — in both cases, without a return to the value of the
     * server, the field would stick in that state forever, that is, an edit of the
     * name made elsewhere would no longer reach it.
     */
    function commit(): void {
        const item = options.item();

        if (!item) {
            return;
        }

        // An empty name is not allowed, and the only value it can be taken back to
        // is the one from the server: the field has no "previous" of its own
        const normalizedFilename = filename.value.trim() || item.filename;
        const normalizedAlt = alt.value.trim();

        filename.value = normalizedFilename;
        alt.value = normalizedAlt;

        const meta: IMediaUpdateMetaRequest = {};

        if (normalizedFilename !== item.filename) {
            meta.filename = normalizedFilename;
        }

        if (normalizedAlt !== item.alt) {
            meta.alt = normalizedAlt;
        }

        if (Object.keys(meta).length === 0) {
            return;
        }

        options.onCommit(meta);
    }
    // #endregion

    // #region Lifecycle
    /**
     * Syncs the drafts with the state of the server — field by field, not wholesale.
     *
     * Both of the extreme options fail. A watcher on the object fired on the PATCH's
     * OWN answer (the store puts a new object in place of the list item) and wiped
     * both fields: you edit the name, you Tab over into alt — which is what sends the
     * PATCH — you type, and what you typed disappears when the answer arrives. A
     * watcher on `id` alone lost the opposite case: the file was replaced under the
     * same id (a reread of the list after a break, an edit made on another surface),
     * the field kept its former value, and the next commit sent that value back — that
     * is, rolled somebody else's change back.
     *
     * Hence the decision per field: a field the user has not touched takes the value
     * of the server; a field with unsaved typing outlives it. "Has not touched" means
     * "the draft matches the last accepted value of the server", and that is what the
     * shadow refs are for.
     */
    watch(
        () => {
            const item = options.item();

            return [item?.id ?? null, item?.filename, item?.alt];
        },
        () => {
            const item = options.item();
            const nextId = item?.id ?? null;
            const nextFilename = item?.filename ?? '';
            const nextAlt = item?.alt ?? '';

            // A change of file resets everything: the draft of the previous file has
            // nothing to do with the new one, unsaved though it may be
            if (nextId !== syncedItemId.value) {
                syncedItemId.value = nextId;
                syncedFilename.value = nextFilename;
                syncedAlt.value = nextAlt;
                filename.value = nextFilename;
                alt.value = nextAlt;
                return;
            }

            if (filename.value === syncedFilename.value) {
                filename.value = nextFilename;
            }

            if (alt.value === syncedAlt.value) {
                alt.value = nextAlt;
            }

            syncedFilename.value = nextFilename;
            syncedAlt.value = nextAlt;
        },
        { immediate: true }
    );
    // #endregion

    return { filename, alt, commit };
}
