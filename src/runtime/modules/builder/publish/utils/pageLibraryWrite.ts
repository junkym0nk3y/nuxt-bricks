/**
 * Writing pages outside an editor session: creating a draft from the dashboard
 * modal (with an empty canvas or straight from a JSON file) and duplicating an
 * arbitrary page. What they have in common is that `currentFormState` is left
 * alone: the form belongs to the page open in the editor, while these operations
 * work with the list.
 *
 * The store dependency is passed as a narrow contract — the logic is unit-tested
 * without Pinia (the pattern of `currentPageWrite.ts`).
 */
import type { IBricksSchema } from '../../../common/types/brick';
import type { TPublishFormState } from '../../../common/types/bricks-api';
import type { IPageLibraryWriteStoreDeps } from '../types/publishStore';
import { buildCopyFormState } from './formState';
import { fetchPageRequest } from './publishApi';
import { generateCopyPagename } from './slugify';
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';

/**
 * Creates a draft page with the given schema.
 *
 * The schema arrives as a parameter rather than being substituted empty here: a
 * page can be created both as a blank canvas and straight from a JSON file, and
 * the choice of the source is the caller's. A blank canvas passes
 * `{ components: [] }` explicitly.
 *
 * `published: false` is imposed here rather than left to the form: a page with no
 * content published right away goes into the public output empty at once.
 *
 * @param store - Narrow contract of the store.
 * @param schema - Schema of the new page.
 * @param formState - Meta fields of the new page.
 * @returns The id of the created page.
 */
export async function runCreatePage(
    store: IPageLibraryWriteStoreDeps,
    schema: IBricksSchema,
    formState: TPublishFormState
): Promise<number> {
    return await store.publishPage(schema, { ...formState, published: false });
}

/**
 * Duplicates a page by its identifier: clones the meta and the schema, creates a
 * draft with a unique `pagename` (the "-copy" suffix).
 *
 * @param store - Narrow contract of the store.
 * @param id - Identifier of the source page.
 * @param failedMessage - The message for the case of the page not being in the list.
 * @returns The id of the created copy.
 */
export async function runDuplicatePage(
    store: IPageLibraryWriteStoreDeps,
    id: string | number,
    failedMessage: string
): Promise<number> {
    const page = store.getPageById(id);
    if (!page) {
        console.error('[Publish Store] duplicatePage: page not found', id);
        throw new Error(failedMessage);
    }

    const copyPagename = generateCopyPagename(
        toPageAddress(page.pagename, page.urlPrefix),
        (candidate) => store.isAddressAvailable(candidate)
    );

    // A list summary carries no schema — the source schema is requested by a
    // point lookup
    const fullPage = await fetchPageRequest(page.id);

    return await store.publishPage(fullPage.schema, buildCopyFormState(page, copyPagename));
}
