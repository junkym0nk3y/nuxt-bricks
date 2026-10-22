// #region Imports
// Types
import type {
    IBricksMediaOptimization,
    IMediaItem,
    IMediaUpdateMetaRequest,
} from '../../../common/types/media';
import type {
    IUsePublishMediaSurfaceOptions,
    IUsePublishMediaSurfaceReturn,
} from '../types/composables';

// Utils
import { ALL_MEDIA_CATEGORIES_FILTER } from '../../../common/constants/mediaCategories';
import { DEFAULT_MEDIA_OPTIMIZATION } from '../../../common/constants/mediaOptimization';
import { getBricksErrorMessage } from '../../../common/utils/main';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useMediaStore } from '../../media/stores/media';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';
import { useMediaUpload } from '../../media/composables/useMediaUpload';
// #endregion

/**
 * The media library surface on the dashboard: the upload, the selected file and
 * the edits made to it.
 *
 * Lives in the dashboard host rather than in the section itself because the state
 * of the media library is torn between three places in the markup. The upload
 * button with the parameters popover stands in the header of the dashboard (where
 * "Create a page" stands for the pages), the body of the section draws the category
 * track and the grid, and the properties of the selected file travel into the
 * details panel — the same slot of the shell the page panel uses. A section keeping
 * this to itself would be able to hand the header neither the progress nor the
 * optimization parameters.
 *
 * There is deliberately no store for it: the optimization parameters and the
 * selected category belong to the session of working with the media library rather
 * than to the library itself — leaving the section is obliged to return them to the
 * defaults of the config (`resetSurface`).
 *
 * @param options - Showing the toasts about refusals.
 * @returns The state of the media library and the actions on a file.
 */
export function usePublishMediaSurface(
    options: IUsePublishMediaSurfaceOptions
): IUsePublishMediaSurfaceReturn {
    // #region Data
    const { t } = useI18n();
    const mediaStore = useMediaStore();
    const { canEdit, canDelete } = useBuilderPermissions();

    const categoryFilter = ref<string>(ALL_MEDIA_CATEGORIES_FILTER);
    const selectedItemId = ref<number | null>(null);
    const previewItem = ref<IMediaItem | null>(null);
    const isDeleteConfirmOpen = ref(false);
    const isDeleting = ref(false);

    /**
     * The upload parameters. Initialized with the shared defaults and covered with
     * the defaults of the config right after `useMediaUpload` — there is nowhere to
     * take the config from any earlier, and the ref cannot be declared any later:
     * the composable reads it inside a callback.
     */
    const uploadOptimization = ref<IBricksMediaOptimization>({ ...DEFAULT_MEDIA_OPTIMIZATION });

    /** The list read in flight; `null` — no read is running. See `ensureMedia` */
    let pendingLoad: Promise<void> | null = null;

    const { maxImageSizeMb, maxVideoSizeMb, defaultOptimization, uploadProgress, uploadFiles } =
        useMediaUpload({
            resolveCategory: resolveUploadCategory,
            resolveOptimization: () => uploadOptimization.value,
            onError: (message: string) => options.onNotify(message, 'error'),
        });

    uploadOptimization.value = { ...defaultOptimization };
    // #endregion

    // #region Computed
    /**
     * The selected file comes from the store rather than as a snapshot taken at the
     * moment of the click: the details panel is obliged to see the result of a PATCH
     * and the disappearance of the file after a deletion.
     */
    const selectedItem = computed<IMediaItem | null>(
        () => mediaStore.items.find((item) => item.id === selectedItemId.value) ?? null
    );

    /**
     * The counter of the rail. `null` until the first successful answer: the length
     * of the list says nothing about the contents of the media library on its own —
     * a file just uploaded lies in it before any GET at all.
     */
    const mediaCount = computed<number | null>(() =>
        mediaStore.hasLoadedItemsSnapshot ? mediaStore.items.length : null
    );

    // #endregion

    // #region Methods
    /**
     * The category of the files being uploaded — the active category of the track.
     * Under the "All" filter a file is saved with no category and is visible only
     * there.
     *
     * @returns The slug of the category, or null.
     */
    function resolveUploadCategory(): string | null {
        return categoryFilter.value !== ALL_MEDIA_CATEGORIES_FILTER ? categoryFilter.value : null;
    }

    /**
     * Reads the file list unless a trustworthy snapshot is in already.
     *
     * A refusal stays a toast and does not carry the section away: the media library
     * is not the section worth bringing the dashboard down for, and the retry
     * arrives with the next opening.
     */
    async function ensureMedia(): Promise<void> {
        if (mediaStore.hasLoadedItemsSnapshot) {
            return;
        }

        // A second entry into the section waits for the read already in flight
        // instead of starting one of its own. The store deliberately does not do
        // that: the list is latest-wins by the request number — the modal is obliged
        // to read anew on every opening. Here two parallel reads would give both an
        // extra GET and something worse: a late refusal would devalue a success
        // that had already arrived, and no snapshot would be left at all
        if (pendingLoad) {
            return pendingLoad;
        }

        pendingLoad = mediaStore
            .loadItems()
            .catch((error: unknown) => {
                options.onNotify(
                    getBricksErrorMessage(error, t('bricks.media.loadFailedCheckDb')),
                    'error'
                );
            })
            .finally(() => {
                pendingLoad = null;
            });

        return pendingLoad;
    }

    /**
     * Uploads a batch of files.
     *
     * The rights check is not a duplicate of the hidden button: the drop target
     * catches a drag over the whole grid of the section and would stay a working
     * entrance into the upload for a role the button has already been taken away
     * from.
     *
     * @param files - The files picked or dropped.
     */
    async function handleUploadFiles(files: File[]): Promise<void> {
        if (!canEdit.value) {
            return;
        }

        await uploadFiles(files);
    }

    /**
     * Takes the optimization parameters from the popover in the header.
     *
     * @param value - The new parameters.
     */
    function setOptimization(value: IBricksMediaOptimization): void {
        uploadOptimization.value = value;
    }

    /**
     * Opens the details panel of a file.
     *
     * @param item - The selected file.
     */
    function selectItem(item: IMediaItem): void {
        selectedItemId.value = item.id;
    }

    /**
     * Closes the details panel.
     */
    function closeDetails(): void {
        selectedItemId.value = null;
    }

    /**
     * Opens a file full screen.
     *
     * @param item - The file.
     */
    function openPreview(item: IMediaItem): void {
        previewItem.value = item;
    }

    /**
     * Closes the full-screen view.
     */
    function closePreview(): void {
        previewItem.value = null;
    }

    /**
     * Saves the edit of the name and the alt of the selected file; a refusal becomes
     * a toast.
     *
     * @param meta - The changed fields.
     */
    async function updateMeta(meta: IMediaUpdateMetaRequest): Promise<void> {
        const item = selectedItem.value;

        if (!item || !canEdit.value) {
            return;
        }

        try {
            await mediaStore.updateItemMeta(item.id, meta);
        } catch (error: unknown) {
            options.onNotify(
                getBricksErrorMessage(error, t('bricks.media.updateMetaFailed')),
                'error'
            );
        }
    }

    /**
     * Changes the category of the selected file; `null` drops the category.
     *
     * @param category - The new category, or null.
     */
    async function updateCategory(category: string | null): Promise<void> {
        const item = selectedItem.value;

        if (!item || !canEdit.value) {
            return;
        }

        try {
            await mediaStore.updateItemCategory(item.id, category);
        } catch (error: unknown) {
            options.onNotify(
                getBricksErrorMessage(error, t('bricks.media.updateCategoryFailed')),
                'error'
            );
        }
    }

    /**
     * Asks for the deletion of the selected file to be confirmed.
     */
    function requestDelete(): void {
        if (selectedItemId.value === null) {
            return;
        }

        isDeleteConfirmOpen.value = true;
    }

    /**
     * Closes the deletion confirmation.
     */
    function closeDeleteConfirm(): void {
        isDeleteConfirmOpen.value = false;
    }

    /**
     * Deletes the selected file.
     *
     * A settled refusal of the server leaves the confirmation open — the file is
     * where it was, and a retry is safe and at hand. An abort by the waiting ceiling
     * closes it: the outcome is unknown, the file may have been deleted, and a retry
     * would get a 404.
     */
    async function confirmDelete(): Promise<void> {
        const id = selectedItemId.value;

        if (id === null || !canDelete.value) {
            return;
        }

        isDeleting.value = true;

        try {
            await mediaStore.removeItem(id);
            selectedItemId.value = null;
            isDeleteConfirmOpen.value = false;
        } catch (error: unknown) {
            options.onNotify(getBricksErrorMessage(error, t('bricks.media.deleteFailed')), 'error');

            if (isRequestTimeoutError(error)) {
                isDeleteConfirmOpen.value = false;
            }
        } finally {
            isDeleting.value = false;
        }
    }

    /**
     * Resets the session of working with the media library: leaving the section is
     * obliged to return the filter, the selection and the upload parameters to their
     * initial values — otherwise the next opening would show the wrong category and
     * would upload files with the wrong settings.
     *
     * The deletion confirmation is put out right here: it is rendered in the host,
     * outside the section, and does not close on its own.
     */
    function resetSurface(): void {
        categoryFilter.value = ALL_MEDIA_CATEGORIES_FILTER;
        selectedItemId.value = null;
        previewItem.value = null;
        isDeleteConfirmOpen.value = false;
        uploadOptimization.value = { ...defaultOptimization };
    }
    // #endregion

    return {
        categoryFilter,
        maxImageSizeMb,
        maxVideoSizeMb,
        defaultOptimization,
        uploadOptimization,
        uploadProgress,
        selectedItemId,
        selectedItem,
        previewItem,
        mediaCount,
        isDeleteConfirmOpen,
        isDeleting,
        ensureMedia,
        uploadFiles: handleUploadFiles,
        setOptimization,
        selectItem,
        closeDetails,
        openPreview,
        closePreview,
        updateMeta,
        updateCategory,
        requestDelete,
        closeDeleteConfirm,
        confirmDelete,
        resetSurface,
    };
}
