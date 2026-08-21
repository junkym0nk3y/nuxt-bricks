/**
 * The page address check on a PARTIAL update: the address is covered by the sum
 * `urlPrefix + pagename`, while the payload carries any one field of the pair.
 *
 * Kept apart from `pageUpdate.ts` deliberately: there the handler pulls in the
 * adapters' registry and runtimeConfig (Nitro), while here pure orchestration with DI
 * remains — and that is what the tests check.
 */
import { createError } from 'h3';
import { assertPageAddressAllowed } from './payloadValidation';
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';
import type { IUpdatePagePayload } from '../../../common/types/bricks-api';
import type { IPageAddressContext } from '../../types/pageAddress';
import type { IStorageAdapter } from '../../types/adapters';

/**
 * Supplements the update payload with the address check: takes the pair's other half
 * from the stored row when the payload has none.
 *
 * The revision it found goes into the precondition when the caller passed none of its
 * own: between the row's read and the write another writer can change its routing
 * field, and two individually safe changes would assemble a forbidden address. With
 * the precondition such a write fails into a 409 instead of quietly breaking the
 * address.
 *
 * @param adapter - The reading part of the storage adapter.
 * @param id - The page's id.
 * @param payload - The validated update payload.
 * @param context - The page address context.
 * @returns The payload (with the precondition added when needed).
 */
export async function withCheckedPagePath(
    adapter: Pick<IStorageAdapter, 'getPage'>,
    id: number,
    payload: IUpdatePagePayload,
    context: IPageAddressContext
): Promise<IUpdatePagePayload> {
    const { pagename, urlPrefix } = payload;

    if (pagename === undefined && urlPrefix === undefined) {
        return payload;
    }

    // Both fields arrived — the stored row is not needed, and there is no extra read
    if (pagename !== undefined && urlPrefix !== undefined) {
        assertPageAddressAllowed(context, toPageAddress(pagename, urlPrefix));

        return payload;
    }

    const current = await adapter.getPage(id);

    if (!current) {
        throw createError({
            statusCode: 404,
            statusMessage: 'Page not found',
        });
    }

    // The comparison is against undefined specifically: `urlPrefix: null` is a
    // deliberate clearing of the prefix, and substituting the stored value in its place
    // would check an address that will not exist after the write
    assertPageAddressAllowed(
        context,
        toPageAddress(
            pagename !== undefined ? pagename : current.pagename,
            urlPrefix !== undefined ? urlPrefix : current.urlPrefix
        )
    );

    return payload.expectedRevision === undefined
        ? { ...payload, expectedRevision: current.revision }
        : payload;
}
