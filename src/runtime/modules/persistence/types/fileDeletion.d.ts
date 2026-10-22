/**
 * Contracts of the best-effort deletion of a storage file.
 */

/** How a caller wants a failed deletion of a file treated */
export interface IFileDeleteOptions {
    /**
     * Whether a failure is worth another attempt.
     *
     * `true` — the record that pointed at the file is already gone and nobody will ask
     * about the file again: the variants of a deleted picture, the preview of a deleted
     * page or template, the avatar of a deleted account. A file left behind here goes
     * on opening by its old public address.
     *
     * `false` — the caller is holding an error it is about to return, and the person is
     * waiting behind it: the compensation of a refused upload, the cleanup after a name
     * conflict, the discard of a file uploaded under a session that turned out to be
     * revoked. Repeating would only push the answer further away, and the answer is
     * what the person came for.
     */
    repeatOnFailure: boolean;
}
