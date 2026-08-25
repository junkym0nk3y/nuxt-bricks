/**
 * The binary storage of the fixtures: the files stay in the memory of the process.
 *
 * Without it an upload has nowhere to put the file and the handler answers 500, so
 * the media library of the browser suite could only ever be checked empty — and an
 * empty grid says nothing about the tiles, their keyboard or their accessibility.
 * S3 is not an option here: a browser test may not depend on a bucket.
 *
 * Only what the upload path calls is implemented. `listFiles` returns nothing on
 * purpose: the walk over the storage is a separate scenario, and answering it with
 * a made-up list would let a test pass on a path this fixture does not model.
 */

// #region Imports
// Persistence registry
import { setBricksPublishAdapter } from '../../src/runtime/modules/persistence/server/registry';
// #endregion

/** Where the fake urls of the fixture point; nothing is ever fetched from there */
const STORAGE_BASE = 'https://e2e-memory-storage.invalid/bucket/';

const contents = new Map<string, Buffer>();

/**
 * Registers the in-memory storage. Called from the Nitro plugin of each fixture:
 * both of them upload files, and a second copy of this adapter would drift away
 * from the first one at the first change of the contract.
 */
export function registerMemoryPublishAdapter(): void {
    setBricksPublishAdapter({
        /**
         * @param kind - Kind of the file (media, avatar, thumbnail).
         * @param filename - Name of the file being uploaded.
         * @returns The key the file is stored under.
         */
        buildFileKey(kind: string, filename: string): string {
            return `bricks-media/${kind}-${filename}`;
        },

        /**
         * @param file - The buffer and the key of the upload.
         * @returns The url, the key and the size of what was stored.
         */
        async uploadFile({ buffer, key }: { buffer: Buffer; key: string }) {
            const url = `${STORAGE_BASE}${key}`;
            contents.set(url, buffer);

            return { url, key, size: buffer.length };
        },

        /**
         * @param url - The url of the file to remove.
         */
        async deleteFile(url: string): Promise<void> {
            if (!url.startsWith(STORAGE_BASE)) {
                throw new Error('URL outside managed storage');
            }

            contents.delete(url);
        },

        /**
         * The head of a stored object, for the signature checks of an import.
         *
         * A key outside the namespace is refused the way the contract demands: the
         * reader is a way out of the server, and a fixture that answers for foreign
         * keys would model a hole rather than a storage.
         *
         * @param key - The key of the object.
         * @param maxBytes - How much of it to read at most.
         * @returns The first bytes of the object.
         */
        async readFileHead(key: string, maxBytes: number): Promise<Buffer> {
            const stored = contents.get(`${STORAGE_BASE}${key}`);

            if (!stored) {
                throw new Error('Key outside managed storage');
            }

            return stored.subarray(0, maxBytes);
        },

        /** @returns Nothing: the walk over the storage is out of the scenario. */
        async listFiles() {
            return [];
        },

        /**
         * @param url - The url to judge.
         * @returns True when the file belongs to this storage.
         */
        isOwnedUrl(url: string): boolean {
            return url.startsWith(STORAGE_BASE);
        },
    });
}
