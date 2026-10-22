/**
 * The point lookup of a media record by URL at the external backend
 * (`GET {base}/media/by-url?url=<encoded>`).
 *
 * The endpoint is mandatory and has no fallback to the list: the media proxy resolves
 * every image of a page snapshot through it, and a walk of the whole library per file
 * would cost the whole library per snapshot. Hence the shape of the answer — an
 * `{ item }` envelope: an absent record has to differ both from an unimplemented
 * endpoint (a 404) and from a backend that ignored the parameter and handed back the
 * entire list.
 *
 * Under test is the media half of the adapter over a fake client: the subject here is
 * the path of the request and the parsing of the answer, while the assembling of the
 * full address and the transport are covered in `httpStorageAdapter.spec.ts`.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it } from 'vitest';

// Utils
import { createHttpMediaMethods } from '../../src/runtime/modules/persistence/server/http/httpMediaMethods';
import {
    BricksBackendRequestError,
    type IBackendHttpClient,
} from '../../src/runtime/modules/persistence/server/http/httpClient';

// Types
import type { TStorageMediaMethods } from '../../src/runtime/modules/persistence/types/adapters';
// #endregion

// #region Constants
const MEDIA_URL = 'https://s3.example.com/bricks-media/a b.webp?v=1#frag';
// #endregion

// #region Helpers
let requestedPaths: string[] = [];

/**
 * The media methods over a client answering with prepared bodies in order.
 *
 * @param answers - The answers to the requests; a function throws instead of answering.
 * @returns The media half of the storage contract.
 */
function createMedia(answers: (unknown | (() => never))[]): TStorageMediaMethods {
    let call = 0;
    const client: IBackendHttpClient = {
        request: (_method, path) => {
            requestedPaths.push(path);
            const answer = answers[call++];

            return typeof answer === 'function'
                ? Promise.reject((answer as () => never)())
                : Promise.resolve(answer);
        },
        probeHealth: () => Promise.resolve(),
    };

    return createHttpMediaMethods(client);
}
// #endregion

beforeEach(() => {
    requestedPaths = [];
});

describe('the point lookup of media: the path of the request', () => {
    it('asks for one record by url in the query rather than for the whole list', async () => {
        const media = await createMedia([{ item: { id: 7, url: MEDIA_URL } }]).getMediaByUrl(
            MEDIA_URL
        );

        expect(media?.id).toBe(7);
        expect(requestedPaths).toEqual([`media/by-url?url=${encodeURIComponent(MEDIA_URL)}`]);
    });

    // The separators inside the value are encoded: a bare `?` would start another
    // parameter and a bare `/` another segment of the path
    it('the url travels out encoded whole', async () => {
        await createMedia([{ item: null }]).getMediaByUrl(MEDIA_URL);

        expect(requestedPaths[0]).not.toContain('://');
        expect(requestedPaths[0]).toContain('%3F');
    });
});

describe('the point lookup of media: the parsing of the answer', () => {
    it('{ item: null } is the regular "there is no such record"', async () => {
        await expect(createMedia([{ item: null }]).getMediaByUrl(MEDIA_URL)).resolves.toBeNull();
    });

    // The absence of a record is what the body says, so a 404 stays a report that the
    // backend has no such mandatory endpoint: swallowed as "no such file", it would
    // make an incompatible backend look like an empty media library
    it('a 404 does not turn into null: the mandatory endpoint is not implemented', async () => {
        const methods = createMedia([
            () => {
                throw new BricksBackendRequestError(404, null, 'HTTP 404');
            },
        ]);

        await expect(methods.getMediaByUrl(MEDIA_URL)).rejects.toThrow('HTTP 404');
    });

    it.each([
        ['the whole list instead of an envelope', [{ id: 7, url: MEDIA_URL }]],
        ['a bare record with no item key', { id: 7, url: MEDIA_URL }],
        ['a body with no item key', {}],
        ['an empty answer', null],
    ])('%s is a format error rather than an absence', async (_name, body) => {
        await expect(createMedia([body]).getMediaByUrl(MEDIA_URL)).rejects.toThrow('{ item: … }');
    });

    // The answer is read by the media proxy and decides what it fetches: a substituted
    // record would turn the check "the URL is registered" into a check of another
    // address
    it('a record carrying another url is refused rather than handed to the proxy', async () => {
        const methods = createMedia([
            { item: { id: 7, url: 'https://s3.example.com/other.webp' } },
        ]);

        await expect(methods.getMediaByUrl(MEDIA_URL)).rejects.toThrow('another url');
    });
});

describe('the point lookup of media: resolving a conflict of registration', () => {
    const payload = {
        url: MEDIA_URL,
        filename: 'a b.webp',
        size: 10,
        mimeType: 'image/webp',
        category: null,
    };

    it('a 409 is resolved by the point lookup rather than by reading the list', async () => {
        const methods = createMedia([
            () => {
                throw new BricksBackendRequestError(409, null, 'HTTP 409');
            },
            { item: { id: 42, url: MEDIA_URL } },
        ]);

        const media = await methods.createMedia(payload);

        expect(media.id).toBe(42);
        expect(requestedPaths[1]).toBe(`media/by-url?url=${encodeURIComponent(MEDIA_URL)}`);
    });
});
