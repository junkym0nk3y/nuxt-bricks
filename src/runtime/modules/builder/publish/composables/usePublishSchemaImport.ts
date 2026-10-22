// #region Imports
// Types
import type { IBricksSchema } from '../../../common/types/brick';
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type {
    IParsedSchemaFile,
    IPublishSchemaImportTarget,
    IUsePublishSchemaImportOptions,
    IUsePublishSchemaImportReturn,
} from '../types/composables';

// Utils
import { requirePageRevision } from '../utils/requestErrors';
import { collectOrphanDeviceKeys } from '../utils/deviceImpact';

// Vue
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { usePublishStore } from '../stores/publish';

// Composables
import { useSchemaImageResolver } from '../../media/composables/useSchemaImageResolver';
import { useBricksDevices } from '../../../common/composables/useBricksDevices';
// #endregion

/**
 * The coordinator of a schema import on the dashboard: the replacement
 * confirmation, the resolving of the images and the write of the schema into the
 * page.
 *
 * Why a coordinator rather than a handler at every entry point. An import is an
 * operation made of several asynchronous stages (reading the file, the
 * confirmation, waiting for the media library, the resolver modal, the PATCH), and
 * all that time a person walks the page list freely. The resolver and the
 * confirmation are teleported into the body, so they outlive both a change of the
 * selected page and the closing of the details panel. Hence two invariants:
 *
 * 1. The target is taken **before** the first await and is never re-read after
 *    that. Otherwise a file picked for one page would land in another.
 * 2. Every stage checks itself against the generation of the operation. Comparing
 *    ids alone is not enough: leaving a page and coming back to it would leave the
 *    previous operation valid, and a confirmation given before the departure would
 *    apply to the state after it.
 *
 * There is one resolver for both entry points: two instances would open two modals
 * on top of each other and would edit one state of the media library in parallel.
 * The price is that a second import does not displace the first one but gets a
 * refusal until that one is finished.
 */
export function usePublishSchemaImport(
    options: IUsePublishSchemaImportOptions
): IUsePublishSchemaImportReturn {
    // #region Data
    const { t } = useI18n();
    const publishStore = usePublishStore();
    const imageResolver = useSchemaImageResolver();
    const { resolvePageDevices } = useBricksDevices();

    const pendingTarget = ref<IPublishSchemaImportTarget | null>(null);
    const pendingFile = ref<IParsedSchemaFile | null>(null);
    const confirmedTarget = ref<IPublishSchemaImportTarget | null>(null);
    const confirmedFile = ref<IParsedSchemaFile | null>(null);
    const isReplaceConfirmationOpen = ref(false);
    const isImporting = ref(false);
    const shouldMountResolver = ref(false);

    /**
     * The generation of the import operation. Grows on every start and on every
     * cancellation; the stages that started in a previous generation do not apply
     * their results.
     */
    let operationGeneration = 0;
    // #endregion

    // #region Computed
    const replaceConfirmationDescription = computed<string>(() => {
        const target = pendingTarget.value;
        const file = pendingFile.value;

        if (!target || !file) {
            return '';
        }

        return t('bricks.publish.dashboard.details.schema.replaceConfirm.description', {
            title: target.title,
            filename: file.filename,
        });
    });
    // #endregion

    // #region Methods
    /**
     * Whether the target page is selected. A host with no page list (a creation from
     * the editor) passes no check: an import into an existing page is unavailable
     * from there, and its only operation is resolving the schema of a new page.
     *
     * @param pageId - Identifier of the target page.
     * @returns Whether the target of the import is still current.
     */
    function isTargetSelected(pageId: string | number): boolean {
        return options.isTargetSelected?.(pageId) ?? true;
    }

    /**
     * Puts the import operation out: raises the generation, cancels the resolver and
     * takes the confirmation away. Called on a change of the selected page, on the
     * closing of the panel and on the unmounting of the dashboard.
     */
    function cancelImport(): void {
        operationGeneration += 1;
        pendingTarget.value = null;
        pendingFile.value = null;
        confirmedTarget.value = null;
        confirmedFile.value = null;
        isReplaceConfirmationOpen.value = false;
        imageResolver.handleCancel();
    }

    /**
     * Takes the picked file in and asks for the replacement of the content to be
     * confirmed.
     *
     * The confirmation is mandatory, unlike in the editor: there an import puts the
     * schema onto the canvas and waits for "Save", while here one miss of a button
     * overwrites the page on the server.
     *
     * The target is taken here — synchronously, before the confirmation and the
     * resolver: in that time a person has time to select another page in the list.
     *
     * @param page - The page the file was picked for.
     * @param file - The parsed schema file.
     */
    function requestPageImport(page: TPublishedPageSummary, file: IParsedSchemaFile): void {
        // The target is no longer selected: reading a file is asynchronous and
        // outlives a change of page, so a file picked for one page arrives here
        // after the departure to another. A replacement confirmation for that one
        // would be an offer to overwrite something other than what the person had
        // open. Silently: the pick concerned a page that is no longer on screen
        if (!isTargetSelected(page.id)) {
            return;
        }

        // Displacing an import in progress is not allowed: its resolver is already
        // waiting for an answer from the person, and a second `startResolving` would
        // leave the first promise unresolved
        if (isImporting.value) {
            options.onNotify(t('bricks.publish.dashboard.details.schema.busy'), 'error');
            return;
        }

        let target: IPublishSchemaImportTarget;

        try {
            target = {
                pageId: page.id,
                // A summary with no revision would mean a write with no
                // precondition, that is, a silent overwrite on top of somebody
                // else's changes
                expectedRevision: requirePageRevision(
                    page,
                    t('bricks.publish.dashboard.details.schema.importFailed')
                ),
                title: page.title || page.pagename,
            };
        } catch (error: unknown) {
            options.onNotify(
                error instanceof Error
                    ? error.message
                    : t('bricks.publish.dashboard.details.schema.importFailed'),
                'error'
            );
            return;
        }

        operationGeneration += 1;
        pendingTarget.value = target;
        pendingFile.value = file;
        isReplaceConfirmationOpen.value = true;
    }

    /**
     * Closes the confirmation and cancels the whole import.
     */
    function closeReplaceConfirmation(): void {
        if (isImporting.value) {
            return;
        }

        cancelImport();
    }

    /**
     * Takes the confirmation: closes the dialog, keeping the target and the file.
     *
     * The resolver is not started here — it waits for the dialog to leave the DOM
     * (`handleConfirmationAfterLeave`): `force-mount` holds the departing
     * confirmation until the animation ends, and a resolver modal opened
     * synchronously would end up under it with a second focus trap.
     */
    function confirmReplace(): void {
        if (!pendingTarget.value || !pendingFile.value) {
            return;
        }

        confirmedTarget.value = pendingTarget.value;
        confirmedFile.value = pendingFile.value;
        isReplaceConfirmationOpen.value = false;
    }

    /**
     * Waits for the confirmation to leave and applies the schema to the page.
     */
    async function handleConfirmationAfterLeave(): Promise<void> {
        const target = confirmedTarget.value;
        const file = confirmedFile.value;

        confirmedTarget.value = null;
        confirmedFile.value = null;

        // The dialog departs after a cancellation too — there is nothing left to
        // put out then
        if (!target || !file) {
            return;
        }

        await applySchemaToPage(target, file);
    }

    /**
     * Runs the schema through the resolver and writes it into the page.
     *
     * @param target - The snapshot of the import target.
     * @param file - The parsed transfer file.
     */
    async function applySchemaToPage(
        target: IPublishSchemaImportTarget,
        file: IParsedSchemaFile
    ): Promise<void> {
        const startedIn = operationGeneration;
        isImporting.value = true;

        try {
            const { schema: resolved, isComparisonSkipped } = await imageResolver.startResolving(
                file.schema
            );

            // Cancelling the resolver cancels the whole operation: the
            // confirmation has written nothing yet
            if (!resolved || !isOperationCurrent(startedIn, target)) {
                return;
            }

            // The schema and the device set travel in one PATCH: the keys of
            // `props.responsive` in the file refer to its own set, and writing them
            // apart would leave the page in a state where one of them is new
            // already while the other is still old. The condition is the presence of
            // a set rather than the `kind`: a file that says nothing about a set (a
            // legacy schema or an envelope with no field) must not strip the target
            // page of its set
            await publishStore.patchPage(target.pageId, {
                schema: resolved,
                ...(file.viewportConfig === undefined
                    ? {}
                    : { viewportConfig: file.viewportConfig }),
                expectedRevision: target.expectedRevision,
            });

            // One toast per outcome rather than two in a row: the toast is a
            // singleton, and the success message would immediately overwrite the
            // warning about the comparison with the media library being skipped.
            // Both are shown only after a successful write — otherwise a refusal of
            // the server would come with a promise that the schema was imported
            if (isComparisonSkipped) {
                options.onNotify(t('bricks.media.resolver.importedWithoutComparison'), 'error');
                return;
            }

            // The device keys absent from the set of the page stay in the schema,
            // but the CSS does not select them. Keeping quiet about that is not
            // allowed: the layout will part ways with the one the source had, and
            // that looks like a bug of the renderer.
            //
            // The set is computed AFTER the write: a file carrying a set of its own
            // is what dictated it, while a file that said nothing left the page its
            // own
            const effectiveConfig =
                file.viewportConfig === undefined
                    ? (publishStore.getPageById(target.pageId)?.viewportConfig ?? null)
                    : file.viewportConfig;

            const orphanKeys = collectOrphanDeviceKeys(
                resolved.components,
                resolvePageDevices(effectiveConfig).map((device) => device.key)
            );

            if (orphanKeys.length > 0) {
                options.onNotify(
                    t('bricks.schema.importedWithOrphanDevices', { keys: orphanKeys.join(', ') }),
                    'error'
                );
                return;
            }

            options.onNotify(t('bricks.publish.toasts.schemaImported'), 'success');
        } catch (error: unknown) {
            const message =
                error instanceof Error
                    ? error.message
                    : t('bricks.publish.dashboard.details.schema.importFailed');
            options.onNotify(message, 'error');
        } finally {
            isImporting.value = false;
            pendingTarget.value = null;
            pendingFile.value = null;
        }
    }

    /**
     * Whether the operation is still fit to write: the generation has not changed,
     * the page is still selected, lies in the list and was not overwritten after the
     * confirmation.
     *
     * @param startedIn - The generation at the moment the stage started.
     * @param target - The snapshot of the import target.
     * @returns Whether the schema may be written.
     */
    function isOperationCurrent(startedIn: number, target: IPublishSchemaImportTarget): boolean {
        if (startedIn !== operationGeneration) {
            return false;
        }

        if (!isTargetSelected(target.pageId)) {
            return false;
        }

        const current = publishStore.getPageById(target.pageId);

        // Both the presence of the record and its revision are checked: the page may
        // have been deleted, and a revision matching on another row means nothing
        return Boolean(current) && current?.revision === target.expectedRevision;
    }

    /**
     * Runs a schema through the image resolver for the creation of a new page. No
     * confirmation is needed here — there is nothing to replace, the page does not
     * exist yet.
     *
     * @param schema - The schema out of the picked file.
     * @returns The schema to write, or `null` when the import was canceled or
     * displaced.
     */
    async function resolveSchemaForCreate(schema: IBricksSchema): Promise<IBricksSchema | null> {
        if (isImporting.value) {
            options.onNotify(t('bricks.publish.dashboard.details.schema.busy'), 'error');
            return null;
        }

        operationGeneration += 1;
        const startedIn = operationGeneration;
        isImporting.value = true;

        try {
            const { schema: resolved, isComparisonSkipped } =
                await imageResolver.startResolving(schema);

            if (!resolved || startedIn !== operationGeneration) {
                return null;
            }

            // The warning about the skipped comparison goes out before the
            // creation: the POST will report its own outcome itself, and a person
            // needs to know about the unchecked URLs regardless of it
            if (isComparisonSkipped) {
                options.onNotify(t('bricks.media.resolver.importedWithoutComparison'), 'error');
            }

            return resolved;
        } finally {
            isImporting.value = false;
        }
    }
    // #endregion

    // #region Lifecycle
    // The mounting latch of the resolver modal: the modal itself is wired in
    // lazily, but without a condition in the template its chunk would travel out by
    // the first render of the dashboard, that is, it would be lazy on paper only.
    // The latch is never released — otherwise the component would be recreated and
    // would lose the leave animation.
    watch(imageResolver.isModalOpen, (isOpen) => {
        if (isOpen) {
            shouldMountResolver.value = true;
        }
    });

    onScopeDispose(() => {
        cancelImport();
    });
    // #endregion

    return {
        isResolverModalOpen: imageResolver.isModalOpen,
        shouldMountResolver,
        resolverState: imageResolver.state,
        isReplaceConfirmationOpen,
        replaceConfirmationDescription,
        isImporting,
        requestPageImport,
        closeReplaceConfirmation,
        confirmReplace,
        handleConfirmationAfterLeave,
        resolveSchemaForCreate,
        cancelImport,
        handleResolverConfirm: imageResolver.handleConfirm,
        handleResolverCancel: imageResolver.handleCancel,
        handleResolverSkip: imageResolver.handleSkip,
        handleSetImageAction: imageResolver.setImageAction,
        handleSetGlobalAction: imageResolver.setGlobalAction,
    };
}
