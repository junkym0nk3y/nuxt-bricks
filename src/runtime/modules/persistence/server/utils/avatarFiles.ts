/**
 * The lifecycle of the profile photo files in the publication storage.
 *
 * A namespace of its own (`avatar`) rather than the media library: were avatars to
 * land in the gallery, any editor would see them among the working files and could
 * delete somebody else's photo, and the bucket import would register them as media
 * records.
 *
 * The key is unique per upload (`user-<id>-<uuid>.webp`) rather than constant per
 * account. There are two reasons: overwriting one key would leave browsers and CDNs
 * with the former photo until the cache expires, and the compensation of an
 * unconfirmed write in `uploadFile` would wipe a live file (its contract requires a
 * NEW key). The price of uniqueness is that the former file has to be removed by us,
 * which is why the link to it is read by the same transaction that writes the new one
 * (`updateUserProfile`).
 *
 * The dependencies are passed as a parameter (narrow Pick contracts) — the logic is
 * unit-tested without a real S3 (the pageThumbnails.ts pattern).
 */
import { randomUUID } from 'node:crypto';
import type { IPublishAdapter } from '../../types/adapters';
import type { IFileDeleteOptions } from '../../types/fileDeletion';

// Utils
import { deleteFileBestEffort } from './bestEffortDelete';

/**
 * Builds the object key for a new profile photo file.
 *
 * @param publish - The publish adapter (the source of the namespace prefix).
 * @param userId - The account identifier.
 * @returns The full object key.
 */
export function buildAvatarKey(
    publish: Pick<IPublishAdapter, 'buildFileKey'>,
    userId: number
): string {
    return publish.buildFileKey('avatar', `user-${userId}-${randomUUID()}.webp`);
}

/**
 * Removes a photo file nobody references any more (a former avatar, the photo of a
 * deleted account, the object of an unconfirmed upload).
 *
 * Best-effort by construction: the link in the column has already been cleared or
 * replaced, that is, the state the user sees is correct even without the file being
 * deleted. A storage failure would turn a successful photo change into an error —
 * instead, invisible garbage stays behind, visible in the log.
 *
 * The URL is checked for belonging to its own managed namespace: the column can hold a
 * value set by a former version or by hand, while `deleteFile` throws over a foreign
 * URL — here that would give a noisy log entry instead of a quiet skip.
 *
 * The ownership check runs INSIDE the `try` along with the deletion, even though it
 * deletes nothing itself: the default adapter's `isOwnedUrl` resolves the storage
 * configuration and throws over an unconfigured bucket. Outside the `try` that failure
 * would reach the client as a 500 AFTER the edit had already been applied — the
 * account is deleted, the answer is "an error", and a retry answers 404.
 *
 * @param publish - The storage's publish adapter.
 * @param url - The link to the file; null/empty — there is nothing to remove.
 * @param options - Whether a failure is worth another attempt: it is when the record
 *   pointing at the file is gone, and it is not when the caller is about to answer
 *   the person with an error.
 */
export async function discardAvatarFile(
    publish: Pick<IPublishAdapter, 'deleteFile' | 'isOwnedUrl'>,
    url: string | null,
    options: IFileDeleteOptions
): Promise<void> {
    if (!url) {
        return;
    }

    try {
        if (!publish.isOwnedUrl(url)) {
            return;
        }
    } catch (error: unknown) {
        console.warn('[Avatars] Failed to read the address of an avatar file:', url, error);
        return;
    }

    await deleteFileBestEffort(publish, url, '[Avatars] Orphaned avatar.', options);
}
