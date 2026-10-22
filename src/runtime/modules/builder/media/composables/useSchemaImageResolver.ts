/**
 * Composable of the image resolution that runs when a JSON schema is imported.
 * It shows a modal listing the images that were found and lets one choose: keep them
 * as they are, or swap them for the placeholder.
 */

// #region Imports
// Types
import type { IBricksSchema } from '../../../common/types/brick';
import type { IBricksPublicMediaConfig } from '../../../common/types/media';
import type {
    IExtractedImageUrl,
    IImageResolverResult,
    IImageResolverState,
    IResolverPromise,
    TImageResolveAction,
} from '../types/schemaImageResolver';

// Vue
import { reactive, ref } from 'vue';
import { useRuntimeConfig } from '#imports';

// Pinia
import { useMediaStore } from '../stores/media';

// Composables
import { useBricksAssetUrl } from '../../../common/composables/useBricksAssetUrl';

// Utils
import {
    extractSchemaImageUrls,
    getPlaceholderImageUrl,
    replaceSchemaImageUrls,
} from '../utils/schemaImageExtractor';
import { DEFAULT_SCHEMA_IMAGE_HOSTS } from '../utils/imageHosts';
// #endregion

/**
 * Orchestrates the image resolution of a schema import.
 */
export function useSchemaImageResolver() {
    // #region Data
    const mediaStore = useMediaStore();
    const { baseURL } = useBricksAssetUrl();

    // Hosts that serve the images of the installation (`bricks.media.imageHosts`): the
    // scan of an imported schema takes an extension-less URL for an image by the host, and
    // the bucket of an installation is not always at one of the default providers
    const mediaConfig = useRuntimeConfig().public?.bricksMedia as
        | IBricksPublicMediaConfig
        | undefined;
    const imageHosts = mediaConfig?.imageHosts ?? DEFAULT_SCHEMA_IMAGE_HOSTS;

    const isModalOpen = ref(false);
    const pendingSchema = ref<IBricksSchema | null>(null);
    const pendingPromise = ref<IResolverPromise | null>(null);

    const state = reactive<IImageResolverState>({
        newImages: [],
        actions: new Map(),
        globalAction: 'keep',
    });

    // The generation of a resolution. The operation begins before the modal — by
    // waiting for the list of the media library, and in that window there is nothing
    // to cancel yet: `pendingPromise` has not been created. `handleCancel` raises the
    // generation, and an answer that arrives later no longer opens the modal of the
    // former schema over the page the user has since picked. Canceling is the caller's
    // to do: a change of the import's target is seen by it, not by the resolver.
    let resolveGeneration = 0;
    // #endregion

    // #region Helpers
    /**
     * Resets the state of the resolver.
     */
    function resetState(): void {
        state.newImages = [];
        state.actions = new Map();
        state.globalAction = 'keep';
        pendingSchema.value = null;
    }

    /**
     * Keeps the images the media gallery does not hold.
     *
     * @param images - Every URL extracted out of the schema.
     * @returns Only the new URLs, the ones absent from the gallery.
     */
    function filterNewImages(images: IExtractedImageUrl[]): IExtractedImageUrl[] {
        const galleryUrls = new Set(mediaStore.items.map((item) => item.url));

        return images.filter((img) => !galleryUrls.has(img.url));
    }
    // #endregion

    // #region Public API
    /**
     * Starts the resolution of the images.
     * When there are no new images, the schema is returned with no modal.
     *
     * The modal of the choice is shown only after a trustworthy comparison against
     * the media library. While its contents are unknown, every URL of the schema
     * looks "new" — the ones the library does hold included — and the offer to "keep
     * or swap for the placeholder" would be working through an invented list. Such an
     * import goes through with no modal and with no change to the schema, and the
     * caller is told that the comparison did not happen.
     *
     * @param schema - The schema being imported.
     * @returns The schema (or `null` on a cancel) and whether the comparison was
     * skipped.
     */
    async function startResolving(schema: IBricksSchema): Promise<IImageResolverResult> {
        // A resolution already under way is displaced by the new import: otherwise
        // its promise would stay unresolved forever — `pendingPromise` is overwritten
        // and the caller waiting on it gets neither a schema nor a refusal
        handleCancel();

        const startedIn = resolveGeneration;
        const allImages = extractSchemaImageUrls(schema, imageHosts);

        // A schema with no images does not need the media library at all — asking
        // for it here would mean waiting on the network to compare an empty list
        if (allImages.length === 0) {
            return { schema, isComparisonSkipped: false };
        }

        if (!mediaStore.hasLoadedItemsSnapshot) {
            let isMediaUnavailable = false;

            try {
                await mediaStore.loadItems();
            } catch {
                isMediaUnavailable = true;
            }

            // The generation check is shared by both outcomes of the request, and it
            // stands before the refusal is taken apart. Otherwise a failed request of
            // a displaced import would return its own schema as "import without a
            // comparison", and that schema would be applied over the schema of the
            // newer import
            if (resolveGeneration !== startedIn) {
                return { schema: null, isComparisonSkipped: false };
            }

            // The snapshot is checked, not just the `catch`: a `loadItems` displaced
            // by a fresher request finishes with no error and without applying its
            // answer, so its "success" would mean a comparison against the former
            // list
            if (isMediaUnavailable || !mediaStore.hasLoadedItemsSnapshot) {
                return { schema, isComparisonSkipped: true };
            }
        }

        const newImages = filterNewImages(allImages);

        // No new images — returned as it is
        if (newImages.length === 0) {
            return { schema, isComparisonSkipped: false };
        }

        // Every URL starts out with an action of its own
        state.newImages = newImages;
        newImages.forEach((img) => {
            state.actions.set(img.url, 'keep');
        });

        pendingSchema.value = schema;
        isModalOpen.value = true;

        // The promise is settled by confirm/cancel/skip
        const resolvedSchema = await new Promise<IBricksSchema | null>((resolve) => {
            pendingPromise.value = { resolve };
        });

        return { schema: resolvedSchema, isComparisonSkipped: false };
    }

    /**
     * Sets the action for one particular image.
     *
     * @param url - URL of the image.
     * @param action - The action that was picked.
     */
    function setImageAction(url: string, action: TImageResolveAction): void {
        state.actions.set(url, action);
    }

    /**
     * Sets the one action that goes for every image.
     *
     * @param action - The action to apply to all of them.
     */
    function setGlobalAction(action: TImageResolveAction): void {
        state.globalAction = action;
        state.newImages.forEach((img) => {
            state.actions.set(img.url, action);
        });
    }

    /**
     * Confirms the actions that were picked and applies them to the images.
     */
    function handleConfirm(): void {
        if (!pendingSchema.value || !pendingPromise.value) {
            return;
        }

        const placeholder = getPlaceholderImageUrl(baseURL);
        const urlMap = new Map<string, string>();

        state.newImages.forEach((image) => {
            const action = state.actions.get(image.url) ?? 'keep';
            if (action === 'placeholder') {
                urlMap.set(image.url, placeholder);
            }
        });

        const resolvedSchema = replaceSchemaImageUrls(pendingSchema.value, urlMap);

        isModalOpen.value = false;
        const resolver = pendingPromise.value;
        pendingPromise.value = null;
        resetState();
        resolver.resolve(resolvedSchema);
    }

    /**
     * Cancels the import — nothing gets loaded.
     */
    function handleCancel(): void {
        // Cancels both a started wait for the media list and an opened modal
        resolveGeneration += 1;
        isModalOpen.value = false;
        const resolver = pendingPromise.value;
        pendingPromise.value = null;
        resetState();
        resolver?.resolve(null);
    }

    /**
     * Skips the handling — loads the schema as it is.
     */
    function handleSkip(): void {
        if (!pendingSchema.value) {
            handleCancel();
            return;
        }

        const schema = pendingSchema.value;
        isModalOpen.value = false;
        const resolver = pendingPromise.value;
        pendingPromise.value = null;
        resetState();
        resolver?.resolve(schema);
    }
    // #endregion

    return {
        isModalOpen,
        state,
        startResolving,
        setImageAction,
        setGlobalAction,
        handleConfirm,
        handleCancel,
        handleSkip,
    };
}
