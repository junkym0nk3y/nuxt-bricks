/**
 * The HTTP implementation of IStorageAdapter over the user's backend
 * (`bricks.backend.mode = 'external'`): pages, versions, templates and media
 * metadata live on the external server, while the files (S3), sharp and the
 * browser-facing `/api/bricks/**` stay local.
 *
 * The contract of the external backend's endpoints mirrors the local
 * `/api/bricks/**` structure relative to `bricks.backend.url` (the full base
 * prefix, the `bricks` segment is not hardwired): see
 * docs/external-backend-contract.md.
 *
 * The format: dates are ISO 8601; the responses' top-level keys are normalized
 * snake_case → camelCase (toCamelCaseShallow — nested objects, `schema` included,
 * are left alone); a 409 is mapped onto the domain conflict errors by `data.code`;
 * a 404 is null/false by the IStorageAdapter contract.
 */
import { createBackendHttpClient, type IBackendHttpClient } from './httpClient';
import {
    isConflictError,
    isNotFoundError,
    normalizeRow,
    normalizeRows,
} from './httpAdapterHelpers';
import { createHttpMediaMethods } from './httpMediaMethods';
import { createHttpTemplateMethods } from './httpTemplateMethods';
import { getPageAddressKey } from '../../../common/utils/bricks/pageAddress';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import { PAGE_CONFLICT_CODES } from '../../../common/constants/publish';
import {
    BricksPageAddressConflictError,
    BricksRevisionConflictError,
} from '../utils/storageErrors';
import type { IStorageAdapter } from '../../types/adapters';
import type {
    IBricksPageRow,
    TBricksPageSummaryRow,
    ICreatePagePayload,
    IUpdatePagePayload,
    IPageVersionSummary,
    IPageVersion,
} from '../../../common/types/bricks-api';

// #region Types
export interface IHttpStorageAdapterOptions {
    /** Full base prefix of the external backend's bricks API (bricks.backend.url). */
    baseUrl: string;
    /** Bearer token of the server-to-server requests (NUXT_BRICKS_BACKEND_TOKEN). */
    token?: string;
    /** The external backend's readiness endpoint (NUXT_BRICKS_BACKEND_HEALTH_URL). */
    healthUrl?: string;
    /** One request's timeout in milliseconds (the default is httpClient's). */
    timeoutMs?: number;
}
// #endregion

/**
 * Creates the HTTP implementation of IStorageAdapter over an external backend.
 *
 * @param options - baseUrl/token/healthUrl/timeout (the registry takes them out of
 * runtimeConfig).
 * @returns The storage adapter for pages and media metadata.
 */
export function createHttpStorageAdapter(options: IHttpStorageAdapterOptions): IStorageAdapter {
    const client: IBackendHttpClient = createBackendHttpClient({
        baseUrl: options.baseUrl,
        token: options.token,
        timeoutMs: options.timeoutMs,
    });

    return {
        /**
         * The readiness check: a GET over the configured health URL, and without one
         * a cheap `GET {base}` probe (the contract's listPages). Readiness is a 2xx.
         */
        async checkHealth(): Promise<void> {
            await client.probeHealth(options.healthUrl || undefined);
        },

        /**
         * Summaries of every page without the `schema` (`GET {base}`).
         */
        async listPages(): Promise<TBricksPageSummaryRow[]> {
            const raw = await client.request('GET', '');

            return normalizeRows<TBricksPageSummaryRow>(raw, 'GET pages');
        },

        /**
         * The page's full row by id (`GET {base}/:id`); a 404 → null.
         */
        async getPage(id: number): Promise<IBricksPageRow | null> {
            try {
                const raw = await client.request('GET', String(id));

                return normalizeRow<IBricksPageRow>(raw, `GET page ${id}`);
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return null;
                }

                throw error;
            }
        },

        /**
         * The page by its address through the contract's public endpoint
         * (`GET {base}/public/pages/<urlPrefix>/<pagename>`) — the SSR hot path of
         * every visit to a published page; a list+find here would mean O(N pages)
         * HTTP calls per visit. A 404 (a draft, or no such page) → null.
         *
         * The address goes out as a path rather than a query parameter: it is the
         * resource's identity, and a path survives proxy normalization and CDN
         * caching equally well. Every segment is encoded separately — an
         * `encodeURIComponent` of the joined address would turn the `/` separator
         * into `%2F`, and the backend would get one segment instead of a prefix with
         * a name.
         *
         * ATTENTION: the public projection carries no `thumbnailUrl` and no
         * `revision` — the gap is closed by synthesis (`thumbnailUrl: null`,
         * `revision: 0`, `published: true`). The single caller (the address's public
         * endpoint) immediately applies toPublicPageProjection, which drops those
         * fields. Future editorial callers must never rely on the synthesized fields —
         * for an editorial read use getPage(id).
         */
        async getPageByAddress(address: IBricksPageAddress): Promise<IBricksPageRow | null> {
            const addressKey = getPageAddressKey(address);

            try {
                const encodedAddress = addressKey
                    .split('/')
                    .map((segment) => encodeURIComponent(segment))
                    .join('/');
                const raw = await client.request('GET', `public/pages/${encodedAddress}`);
                const row = normalizeRow<Partial<IBricksPageRow>>(
                    raw,
                    `GET public page ${addressKey}`
                );

                return {
                    ...row,
                    thumbnailUrl: row.thumbnailUrl ?? null,
                    revision: row.revision ?? 0,
                    published: row.published ?? true,
                } as IBricksPageRow;
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return null;
                }

                throw error;
            }
        },

        /**
         * Creates a page (`POST {base}`). Only the exact contract code is mapped onto
         * a domain error: a 409 `PAGENAME_CONFLICT` →
         * BricksPageAddressConflictError. A 409 with no code or with an unfamiliar
         * one is a generic error (otherwise any unrelated conflict of the backend's —
         * a quota, a state — would make the UI offer a rename).
         */
        async createPage(payload: ICreatePagePayload): Promise<IBricksPageRow> {
            try {
                const raw = await client.request('POST', '', payload);

                return normalizeRow<IBricksPageRow>(raw, 'POST page');
            } catch (error: unknown) {
                if (isConflictError(error) && error.errorCode === PAGE_CONFLICT_CODES.pagename) {
                    throw new BricksPageAddressConflictError();
                }

                throw error;
            }
        },

        /**
         * Partially updates a page (`PATCH {base}/:id`, PATCH only — the partial
         * semantics of IUpdatePagePayload; `expectedRevision` goes out as a
         * precondition field of the body). A 404 → null. Only the exact contract 409
         * codes are mapped onto domain errors: `PAGENAME_CONFLICT` →
         * BricksPageAddressConflictError, `REVISION_CONFLICT` →
         * BricksRevisionConflictError; a 409 with no code or with an unfamiliar one is
         * a generic error (an unrelated conflict of the backend's must not make the UI
         * offer a rename or a refetch-and-retry).
         *
         * The versioning invariant (a snapshot on a change of `schema` or
         * `viewportConfig` + a prune down to the limit) is the external server's duty
         * (the IStorageAdapter.updatePage contract).
         */
        async updatePage(id: number, payload: IUpdatePagePayload): Promise<IBricksPageRow | null> {
            try {
                const raw = await client.request('PATCH', String(id), payload);

                return normalizeRow<IBricksPageRow>(raw, `PATCH page ${id}`);
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return null;
                }

                if (isConflictError(error)) {
                    if (error.errorCode === PAGE_CONFLICT_CODES.pagename) {
                        throw new BricksPageAddressConflictError();
                    }

                    if (error.errorCode === PAGE_CONFLICT_CODES.revision) {
                        throw new BricksRevisionConflictError(id);
                    }
                }

                throw error;
            }
        },

        /**
         * Deletes a page (`DELETE {base}/:id`); a 404 → false.
         */
        async deletePage(id: number): Promise<boolean> {
            try {
                await client.request('DELETE', String(id));

                return true;
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return false;
                }

                throw error;
            }
        },

        /**
         * Summaries of the page's versions (`GET {base}/:id/versions`), newest first.
         */
        async listPageVersions(pageId: number): Promise<IPageVersionSummary[]> {
            const raw = await client.request('GET', `${pageId}/versions`);

            return normalizeRows<IPageVersionSummary>(raw, `GET page ${pageId} versions`);
        },

        /**
         * A version's full snapshot (`GET {base}/:id/versions/:versionId`); a 404 →
         * null.
         */
        async getPageVersion(pageId: number, versionId: number): Promise<IPageVersion | null> {
            try {
                const raw = await client.request('GET', `${pageId}/versions/${versionId}`);

                return normalizeRow<IPageVersion>(raw, `GET page ${pageId} version ${versionId}`);
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return null;
                }

                throw error;
            }
        },

        ...createHttpMediaMethods(client),
        ...createHttpTemplateMethods(client),
    };
}
