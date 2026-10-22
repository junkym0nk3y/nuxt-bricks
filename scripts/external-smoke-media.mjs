#!/usr/bin/env node
/**
 * The media half of the external smoke lifecycle: the categories, the multipart upload,
 * the bucket import, the point lookup of the proxy and the deletion — plus the two
 * checks of the registration contract that have no browser-facing route at all.
 *
 * Split out of the main script for the plain reason of size, the way the fake backend
 * was: the page lifecycle and the media lifecycle no longer fit one file.
 */
import { Buffer } from 'node:buffer';
import { assertOk } from './smoke-shared.mjs';
import { BACKEND_BASE_PATH } from './external-smoke-backend.mjs';
import { MEMORY_STORAGE_BASE } from './external-smoke-consumer.mjs';

/** The label of the media category the smoke creates before uploading a file */
const CATEGORY_LABEL = 'Images';

/** The slug the server is expected to derive from that label */
const CATEGORY_SLUG = 'images';

// A valid 1x1 PNG: sharp inside the consumer has to decode and convert it
const PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * The media lifecycle against the started consumer server and the fake external backend.
 *
 * @param {object} context - The fake backend, the addresses and the authorized headers.
 * @param {ReturnType<
 *   typeof import('./external-smoke-backend.mjs').createFakeExternalBackend
 * >} context.backend - The fake external backend with its journal and storage.
 * @param {string} context.serverOrigin - Origin of the consumer server.
 * @param {string} context.backendUrl - Full base prefix of the fake backend.
 * @param {string} context.backendToken - Bearer token of the server-to-server transport.
 * @param {() => Record<string, string>} context.authHeaders - Headers of an authorized request.
 * @returns {Promise<void>} Resolves when the media contract is green.
 */
export async function runMediaLifecycle({
    backend,
    serverOrigin,
    backendUrl,
    backendToken,
    authHeaders,
}) {
    // A category is created before the file: the library of a fresh installation has
    // none at all, and an upload naming an unknown one is refused by the contract with
    // a 400. The creation goes through the app rather than straight into the backend —
    // it is the same route the interface takes
    const createdCategory = await fetch(`${serverOrigin}/api/bricks/media/categories`, {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ label: CATEGORY_LABEL }),
    });
    // The body is read once and parsed from that text: passing `await response.text()`
    // into the message of the assertion consumes the body even when the check passes
    const createdCategoryBody = await createdCategory.text();
    assertOk(
        createdCategory.ok,
        `category creation expected 2xx, got ${createdCategory.status} ${createdCategoryBody}`
    );
    const category = JSON.parse(createdCategoryBody);
    assertOk(
        category.slug === CATEGORY_SLUG,
        `the server must derive the slug from the label, got ${category.slug}`
    );

    // The refusal of an unknown category, by the exact contract code: without this the
    // smoke would only ever walk the happy path, and a backend accepting any string
    // would look just as correct as one enforcing its own list
    const unknownCategory = await fetch(`${serverOrigin}/api/bricks/media/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: (() => {
            const rejected = new FormData();
            rejected.append(
                'file',
                new Blob([Buffer.from(PNG_BASE64, 'base64')], { type: 'image/png' }),
                'rejected.png'
            );
            rejected.append('category', 'no-such-category');
            return rejected;
        })(),
    });
    assertOk(
        unknownCategory.status === 400,
        `an unknown category expected 400, got ${unknownCategory.status}`
    );

    // The multipart upload: sharp processes the file inside the consumer, the binary goes
    // into the in-memory publish adapter, and only the JSON metadata leaves for external
    const formData = new FormData();
    formData.append(
        'file',
        new Blob([Buffer.from(PNG_BASE64, 'base64')], { type: 'image/png' }),
        'smoke.png'
    );
    formData.append('category', CATEGORY_SLUG);
    const uploaded = await fetch(`${serverOrigin}/api/bricks/media/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
    });
    assertOk(uploaded.ok, `media upload expected 2xx, got ${uploaded.status}`);
    const media = await uploaded.json();
    assertOk(
        String(media.url).startsWith(MEMORY_STORAGE_BASE),
        `the media url must point into the memory of the consumer, got ${media.url}`
    );
    assertOk(media.mimeType === 'image/webp', `sharp must return webp: ${media.mimeType}`);
    // The dimensions travel to the backend and have to come back: the adapter reads a
    // missing key as null and switches progressive loading off without a word, so a
    // backend that drops them looks exactly like a file whose size is unknown
    assertOk(
        media.width === 1 && media.height === 1,
        `the registered metadata lost the dimensions of the raster: ${media.width}x${media.height}`
    );

    // The bucket import is the one path of the app that leans on the idempotency of the
    // registration by url: it re-registers EVERY object of the managed prefix without a
    // lookup of its own, so a backend that answers a repeat with a second row turns one
    // administrator click into a doubled media library
    const mediaCountBeforeImport = backend.state.media.size;
    const importedFrom = backend.requests.length;
    const imported = await fetch(`${serverOrigin}/api/bricks/media/import`, {
        method: 'POST',
        headers: authHeaders(),
    });
    const importedBody = await imported.text();
    assertOk(imported.ok, `media import expected 2xx, got ${imported.status} ${importedBody}`);
    assertOk(
        backend.requests
            .slice(importedFrom)
            .some(
                (item) =>
                    item.method === 'POST' &&
                    item.path === `${BACKEND_BASE_PATH}/media` &&
                    item.body?.url === media.url
            ),
        'the import did not re-register the uploaded file: the check would prove nothing about idempotency'
    );
    assertOk(
        backend.state.media.size === mediaCountBeforeImport,
        `the import created a duplicate row: ${mediaCountBeforeImport} -> ${backend.state.media.size}`
    );
    const importedItems = JSON.parse(importedBody).items.filter((item) => item.url === media.url);
    assertOk(
        importedItems.length === 1 && importedItems[0].id === media.id,
        `the library must keep the single row with its id after the import: ${JSON.stringify(importedItems)}`
    );

    // Deleting a category reports how many files were left without one: the number is
    // shown to a person, and a `204` or a bare flag would leave the adapter parsing an
    // empty body
    const deletedCategory = await fetch(
        `${serverOrigin}/api/bricks/media/categories/${CATEGORY_SLUG}`,
        { method: 'DELETE', headers: authHeaders() }
    );
    const deletedCategoryBody = await deletedCategory.text();
    assertOk(
        deletedCategory.ok,
        `category deletion expected 2xx, got ${deletedCategory.status} ${deletedCategoryBody}`
    );
    assertOk(
        JSON.parse(deletedCategoryBody).clearedCount === 1,
        `the deletion must report the one file it cleared, got ${deletedCategoryBody}`
    );

    // A repeat of the registration with a category that has just been deleted: the
    // contract puts the lookup by url BEFORE the check of the payload, and a double that
    // checks first answers UNKNOWN_MEDIA_CATEGORY to a retry whose row already exists.
    // The request goes straight to the backend on purpose — there is no browser-facing
    // way to register metadata, the import always sends `category: null`, and an upload
    // always generates a fresh url
    const staleCategoryRetry = await fetch(`${backendUrl}/media`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${backendToken}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            url: media.url,
            filename: media.filename,
            size: media.size,
            mimeType: media.mimeType,
            category: CATEGORY_SLUG,
        }),
    });
    const staleCategoryBody = await staleCategoryRetry.text();
    assertOk(
        staleCategoryRetry.status === 200,
        `a repeat by url expected 200, got ${staleCategoryRetry.status} ${staleCategoryBody}`
    );
    const staleCategoryRow = JSON.parse(staleCategoryBody);
    assertOk(
        staleCategoryRow.id === media.id && backend.state.media.size === mediaCountBeforeImport,
        `a repeat by url must return the existing row instead of creating one: ${staleCategoryBody}`
    );

    // Every nullable field of the contract row: `alt` and `uploadedAt` are not sent by an
    // upload at all, so only a registration of its own tells "the value was stored" from
    // "the double made one up". The category is null — the one used above is gone by now
    const contractPayload = {
        url: `${MEMORY_STORAGE_BASE}bricks-media/media-contract-fields.webp`,
        filename: 'contract-fields.webp',
        size: 4096,
        mimeType: 'image/webp',
        category: null,
        alt: 'Contract alt',
        uploadedAt: '2026-08-01T02:03:04.000Z',
        width: 17,
        height: 11,
        previewUrl: `${MEMORY_STORAGE_BASE}bricks-media/media-contract-fields-preview.webp`,
        mockUrl: `${MEMORY_STORAGE_BASE}bricks-media/media-contract-fields-mock.webp`,
    };
    const contractRegistration = await fetch(`${backendUrl}/media`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${backendToken}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify(contractPayload),
    });
    const contractBody = await contractRegistration.text();
    assertOk(
        contractRegistration.status === 201,
        `registering a new url expected 201, got ${contractRegistration.status} ${contractBody}`
    );
    const contractRow = JSON.parse(contractBody);
    for (const field of Object.keys(contractPayload)) {
        assertOk(
            contractRow[field] === contractPayload[field],
            `the registered row lost "${field}": ${JSON.stringify(contractRow[field])} instead of ${JSON.stringify(contractPayload[field])}`
        );
    }
    assertOk(
        contractRow.svgContent === null,
        `a row without inline markup must carry svgContent as null, got ${JSON.stringify(contractRow.svgContent)}`
    );

    const backendMedia = backend.requests.find(
        (item) => item.method === 'POST' && item.path === `${BACKEND_BASE_PATH}/media`
    );
    assertOk(Boolean(backendMedia), 'the fake backend got no POST {base}/media');
    assertOk(
        backendMedia.contentType === 'application/json',
        `the metadata must travel as JSON, got the content-type ${backendMedia.contentType}`
    );
    assertOk(
        typeof backendMedia.body?.url === 'string' &&
            backendMedia.body.url.startsWith(MEMORY_STORAGE_BASE),
        'the metadata on the backend carries no file url from the publish storage'
    );

    // The media proxy resolves an address through the contract's point lookup: the
    // canvas asks it for every image of a page snapshot, and a walk of the whole list
    // per picture is what the endpoint exists to remove. What is asserted is the
    // request that reached the backend and not the answer of the proxy — the object of
    // the memory storage is not served over HTTP, so the fetch of the file itself
    // cannot succeed here
    const proxyRequestsBefore = backend.requests.length;
    await fetch(`${serverOrigin}/api/bricks/media/s3-proxy`, {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ url: media.url }),
    });
    const proxyRequests = backend.requests.slice(proxyRequestsBefore);
    const lookup = proxyRequests.find(
        (item) => item.method === 'GET' && item.path === `${BACKEND_BASE_PATH}/media/by-url`
    );
    assertOk(Boolean(lookup), 'the media proxy did not ask GET {base}/media/by-url');
    assertOk(
        lookup.query.get('url') === media.url,
        `the point lookup carries the wrong url: ${lookup.query.get('url')}`
    );
    assertOk(
        !proxyRequests.some(
            (item) => item.method === 'GET' && item.path === `${BACKEND_BASE_PATH}/media`
        ),
        'the media proxy read the whole media list instead of the point lookup'
    );

    // Deleting media: the local orchestration is file-first, the backend gets metadata only
    const deleted = await fetch(`${serverOrigin}/api/bricks/media/${media.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });
    assertOk(deleted.ok, `media delete expected 2xx, got ${deleted.status}`);
    assertOk(
        backend.requests.some(
            (item) =>
                item.method === 'DELETE' && item.path === `${BACKEND_BASE_PATH}/media/${media.id}`
        ),
        'the fake backend got no DELETE {base}/media/:id'
    );
}
