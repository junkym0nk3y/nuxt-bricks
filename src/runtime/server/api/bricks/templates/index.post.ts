import { defineEventHandler } from 'h3';
import {
    useBricksPublishAdapter,
    useBricksStorageAdapter,
} from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    toTemplateHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import {
    BricksStorageWriteRejectedError,
    BricksTemplateNameConflictError,
} from '../../../../modules/persistence/server/utils/storageErrors';
import { validateCreateTemplatePayload } from '../../../../modules/persistence/server/utils/templatePayloadValidation';
import {
    copyThumbnailForTemplate,
    discardTemplateThumbnail,
} from '../../../../modules/persistence/server/utils/templateThumbnails';

/**
 * Whether the template write was refused FOR CERTAIN — only then may the copied
 * thumbnail file be deleted.
 *
 * A taken name means a violated unique constraint, that is, there is no row; the
 * adapter marks a write as refused where it knows the same about its own
 * operation. Everything else (a dropped connection, a timeout, a 5xx from the
 * external backend) is an unknown outcome: the response could have been lost
 * after the commit, and deleting the file would leave the created template with a
 * broken image.
 *
 * @param error - The write error that was caught.
 * @returns Whether the copied file may be removed.
 */
function isRejectedTemplateWrite(error: unknown): boolean {
    return (
        error instanceof BricksTemplateNameConflictError ||
        error instanceof BricksStorageWriteRejectedError
    );
}

/**
 * POST /api/bricks/templates — saves a page as a template.
 *
 * The body carries the content and the styling rather than a page identifier:
 * there are two entry points, and they bring different things. A row of the page
 * list sends the saved schema out of the database, the builder sends what is on
 * the canvas right now, unsaved edits included. A handler that read the page
 * itself could not serve the second scenario at all.
 *
 * The thumbnail is copied into a file OF THE TEMPLATE'S OWN
 * (`copyThumbnailForTemplate`), and the link to the page frame is not stored: the
 * frames of a page live by its keep list, and the very first save would leave the
 * template with a broken image. The copy is best-effort — a template without a
 * thumbnail is legitimate, and the card draws a placeholder.
 *
 * A taken name is a 409 `TEMPLATE_NAME_CONFLICT`: the form puts a hint under the
 * name field instead of showing the English status text.
 */
export default defineEventHandler(async (event) => {
    const publishAdapter = useBricksPublishAdapter();
    let thumbnailUrl: string | null = null;

    try {
        const payload = validateCreateTemplatePayload(
            await readNormalizedBody<Record<string, unknown>>(event)
        );

        thumbnailUrl = await copyThumbnailForTemplate(publishAdapter, payload.thumbnailSourceUrl);

        return await useBricksStorageAdapter().createTemplate({
            name: payload.name,
            description: payload.description,
            schema: payload.schema,
            pageMeta: payload.pageMeta,
            thumbnailUrl,
        });
    } catch (error: unknown) {
        // Awaiting the cleanup is mandatory (not fire-and-forget): the response
        // of the handler ends the request, and in a serverless environment the
        // process may end along with it — a deletion that had begun would never
        // reach the storage
        if (isRejectedTemplateWrite(error)) {
            await discardTemplateThumbnail(publishAdapter, thumbnailUrl, {
                repeatOnFailure: false,
            });
        } else if (thumbnailUrl) {
            console.warn(
                '[Templates] Template write outcome is unknown, keeping the copied thumbnail:',
                thumbnailUrl
            );
        }

        toTemplateHttpError(error, 'Failed to save template');
    }
});
