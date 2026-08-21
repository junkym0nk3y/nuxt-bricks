/**
 * Server-first validation of the page handlers' DTOs (/api/bricks —
 * create/update).
 *
 * The client-side yup is UX, not protection: an arbitrary request body arrives
 * here. Every validator rejects unknown keys (400), checks types and bounds and
 * returns a NEW object built only from the known normalized fields — nothing
 * extra reaches the adapters even should the whitelists further down the stack
 * drift. The shared primitives are in payloadPrimitives.ts, the media validators
 * in mediaPayloadValidation.ts.
 */
import type { IBricksSchema } from '../../../common/types/brick';
import type { ICreatePagePayload, IUpdatePagePayload } from '../../../common/types/bricks-api';
import type { TBricksPageDeviceSet } from '../../../common/types/devices';
import {
    DESCRIPTION_MAX_LENGTH,
    KEYWORDS_MAX_LENGTH,
    PAGENAME_MAX_LENGTH,
    PAGENAME_MIN_LENGTH,
    PAGENAME_PATTERN,
    SUBDOMAIN_MAX_LENGTH,
    SUBDOMAIN_PATTERN,
    TITLE_MAX_LENGTH,
    URL_PREFIX_MAX_LENGTH,
    URL_PREFIX_PATTERN,
} from '../../../common/constants/publish';
import {
    HTTP_URL_PATTERN,
    MAX_URL_LENGTH,
    assertKnownKeys,
    invalid,
    optionalBoolean,
    optionalNullableString,
    requirePositiveInteger,
    requireString,
} from './payloadPrimitives';
import { assertSchemaComplexity } from './schemaPayloadValidation';
import type { IPageAddressContext } from '../../types/pageAddress';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import { validateSchemaComponentGraph } from '../../../common/utils/bricks/schemaContract';
import { validateDeviceSet } from '../../../common/utils/bricks/devices';
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';
import {
    DEFAULT_BRICKS_ROUTE_PREFIXES,
    getBricksOwnStaticRoutes,
    getBuilderPagePath,
    getPublishedPagePath,
    isEditorAddressTaken,
    isPageAddressTaken,
    type IBricksRoutePrefixes,
} from '../../../common/utils/bricks/routePaths';

// #region Constants
/** The limit on the number of schema components. */
const MAX_SCHEMA_COMPONENTS = 5000;

const LAYOUT_MAX_LENGTH = 100;
const BACKGROUND_COLOR_MAX_LENGTH = 100;

const LAYOUT_PATTERN = /^[\w-]+$/;

const CREATE_PAGE_KEYS = new Set([
    'pagename',
    'title',
    'description',
    'keywords',
    'socialImage',
    'layout',
    'backgroundColor',
    'urlPrefix',
    'subdomain',
    'viewportConfig',
    'schema',
    'published',
]);

const UPDATE_PAGE_KEYS = new Set([...CREATE_PAGE_KEYS, 'thumbnailUrl', 'expectedRevision']);

/**
 * The address context for calls with no explicit argument: the handlers pass the
 * active one (`getConfiguredPageAddressContext`), while the default is needed by
 * direct calls outside Nitro, where runtimeConfig is unavailable.
 */
const DEFAULT_PAGE_ADDRESS_CONTEXT: IPageAddressContext = {
    prefixes: DEFAULT_BRICKS_ROUTE_PREFIXES,
    isLiveSurfaceEnabled: true,
};

/** Payload POST /api/bricks/:id/versions/:versionId/restore — precondition only. */
const RESTORE_VERSION_KEYS = new Set(['expectedRevision']);

// #endregion

// #region Field validators
/**
 * Validates the page's device set.
 *
 * Strict and non-repairing: the value goes both into the `<style>` generation and
 * into the schema's keys, so an "almost valid" set is more dangerous than a
 * refusal. Sorting, trimming the length and dropping duplicates are forbidden
 * here — they would silently change the page's layout into one the client never
 * ordered.
 *
 * @param value - The field's raw value.
 * @returns The device set, or `null` (inherit the project's set).
 */
function validateViewportConfig(value: unknown): TBricksPageDeviceSet | null {
    if (value === null) {
        return null;
    }

    const validation = validateDeviceSet(value);

    if (!validation.ok) {
        invalid(`Field "viewportConfig" is invalid: ${validation.errors.join('; ')}`);
    }

    return validation.value;
}

/**
 * The path owner resolver for the server: there is no live router here, so the
 * answer is given by the module's own routes. The server does not see the
 * consumer application's pages — their conflicts are caught by the client-side
 * check through the router.
 *
 * @param prefixes - The active route prefixes.
 * @returns A function of "path → the owning route's name".
 */
function createOwnRouteResolver(
    prefixes: IBricksRoutePrefixes
): (path: string) => string | undefined {
    const ownRoutes = getBricksOwnStaticRoutes(prefixes);

    return (path: string) => ownRoutes[path];
}

/**
 * Validates the pagename: the format and the length bounds.
 *
 * The availability of the editor address is NOT checked here, although it used to
 * be: the editor address is the pair `urlPrefix + pagename`, while a
 * PATCH carries any one field of that pair. A check by the name alone would
 * reject a legitimate `pagename: bricks-login` with a prefix (its editor lives at
 * the free `<builderPrefix>/blog/bricks-login`) and would let through a forbidden
 * address assembled out of the stored name and a new prefix. Both halves are
 * brought together by `assertPageAddressAllowed`.
 *
 * @param value - The raw value.
 * @returns The normalized pagename.
 */
function validatePagename(value: unknown): string {
    return requireString(value, 'pagename', {
        min: PAGENAME_MIN_LENGTH,
        max: PAGENAME_MAX_LENGTH,
        pattern: PAGENAME_PATTERN,
        patternHint: 'only lowercase letters, digits and hyphens are allowed',
    });
}

/**
 * Validates the page's schema: an object with a components array within the
 * allowed bounds. Depth, node count, value types and serialized size —
 * `assertSchemaComplexity` (an iterative walk ahead of `JSON.stringify`, see
 * schemaPayloadValidation.ts); the structural contract of the component graph
 * (a node's shape, id uniqueness/consistency, acyclicity, tree depth) —
 * `validateSchemaComponentGraph` (see
 * common/utils/bricks/schemaContract.ts).
 *
 * Exported: the template validator (`templatePayloadValidation.ts`) applies the
 * same rules — a template carries exactly the schema a page would accept, and a
 * second set of bounds would drift away from that at the first edit.
 *
 * @param value - The raw value of the schema field.
 * @returns The schema (its shape and component graph checked).
 * @throws 400 — the shape of schema/components is invalid, or the complexity
 * limits are exceeded, or the component graph violates the contract (see
 * schemaContract.ts).
 */
export function validatePageSchema(value: unknown): IBricksSchema {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        invalid('Field "schema" must be an object');
    }

    const components = (value as Record<string, unknown>).components;

    if (!Array.isArray(components)) {
        invalid('Field "schema.components" must be an array');
    }

    if (components.length > MAX_SCHEMA_COMPONENTS) {
        invalid(`Schema exceeds ${MAX_SCHEMA_COMPONENTS} components limit`);
    }

    assertSchemaComplexity(value);

    const contractErrors = validateSchemaComponentGraph(components);

    if (contractErrors.length > 0) {
        invalid(`Invalid schema: ${contractErrors.slice(0, 3).join('; ')}`);
    }

    return value as IBricksSchema;
}

/**
 * Validates the optimistic locking precondition: a positive safe integer.
 *
 * @param value - The raw value of the expectedRevision field.
 * @returns The expected revision.
 */
function validateExpectedRevision(value: unknown): number {
    return requirePositiveInteger(value, 'expectedRevision');
}

/**
 * Validates the page's shared meta fields (both create and update).
 *
 * @param body - The normalized request body.
 * @returns The normalized meta fields (only the ones passed).
 */
function validatePageMetaFields(body: Record<string, unknown>): Partial<IUpdatePagePayload> {
    const result: Partial<IUpdatePagePayload> = {};

    if (body.title !== undefined) {
        result.title = requireString(body.title, 'title', { max: TITLE_MAX_LENGTH });
    }

    if (body.description !== undefined) {
        result.description = requireString(body.description, 'description', {
            max: DESCRIPTION_MAX_LENGTH,
        });
    }

    if (body.keywords !== undefined) {
        result.keywords = requireString(body.keywords, 'keywords', {
            max: KEYWORDS_MAX_LENGTH,
        });
    }

    const socialImage = optionalNullableString(body.socialImage, 'socialImage', {
        max: MAX_URL_LENGTH,
        pattern: HTTP_URL_PATTERN,
        patternHint: 'must be an http(s) URL',
    });
    if (socialImage !== undefined) {
        result.socialImage = socialImage;
    }

    const layout = optionalNullableString(body.layout, 'layout', {
        max: LAYOUT_MAX_LENGTH,
        pattern: LAYOUT_PATTERN,
    });
    if (layout !== undefined) {
        result.layout = layout;
    }

    const backgroundColor = optionalNullableString(body.backgroundColor, 'backgroundColor', {
        max: BACKGROUND_COLOR_MAX_LENGTH,
    });
    if (backgroundColor !== undefined) {
        result.backgroundColor = backgroundColor;
    }

    if (body.viewportConfig !== undefined) {
        result.viewportConfig = validateViewportConfig(body.viewportConfig);
    }

    const urlPrefix = optionalNullableString(body.urlPrefix, 'urlPrefix', {
        max: URL_PREFIX_MAX_LENGTH,
        pattern: URL_PREFIX_PATTERN,
        patternHint: 'segments of lowercase letters, digits and hyphens separated by "/"',
    });
    if (urlPrefix !== undefined) {
        result.urlPrefix = urlPrefix;
    }

    const subdomain = optionalNullableString(body.subdomain, 'subdomain', {
        max: SUBDOMAIN_MAX_LENGTH,
        pattern: SUBDOMAIN_PATTERN,
        patternHint: 'only lowercase letters, digits and hyphens are allowed',
    });
    if (subdomain !== undefined) {
        result.subdomain = subdomain;
    }

    const published = optionalBoolean(body.published, 'published');
    if (published !== undefined) {
        result.published = published;
    }

    return result;
}
// #endregion

// #region Page payloads
/**
 * Checks that the page's address is not covered by the bricks surface — both the
 * editor address and the live address.
 *
 * A function of its own rather than something inside the field validators: the
 * address is the SUM of `urlPrefix + pagename`, while a PATCH carries any
 * one field of the pair — the update handler pulls the other half out of the
 * stored row and calls this check itself.
 *
 * The editor address is always checked, and the live address only when the live
 * render is on: without it a page has no URL of its own, while an editor it always
 * has. The client decides the same way, otherwise one and the same address would
 * pass the form and fail on the server.
 *
 * @param context - The page address context.
 * @param address - The page's address.
 */
export function assertPageAddressAllowed(
    context: IPageAddressContext,
    address: IBricksPageAddress
): void {
    const { prefixes, isLiveSurfaceEnabled } = context;
    const resolveOwnRoute = createOwnRouteResolver(prefixes);

    if (isEditorAddressTaken(prefixes, resolveOwnRoute, address)) {
        invalid(
            `Editor path "${getBuilderPagePath(prefixes, address)}" is reserved by a builder route`
        );
    }

    if (!isLiveSurfaceEnabled) {
        return;
    }

    if (isPageAddressTaken(prefixes, resolveOwnRoute, address)) {
        invalid(`Page path "${getPublishedPagePath(address)}" is reserved by the builder surface`);
    }
}

/**
 * Validates the payload of POST /api/bricks (creating a page).
 *
 * @param body - The normalized request body.
 * @param context - The address context (the default is for calls outside Nitro).
 * @returns A clean creation payload.
 */
export function validateCreatePagePayload(
    body: Record<string, unknown>,
    context: IPageAddressContext = DEFAULT_PAGE_ADDRESS_CONTEXT
): ICreatePagePayload {
    assertKnownKeys(body, CREATE_PAGE_KEYS);

    const payload: ICreatePagePayload = {
        ...validatePageMetaFields(body),
        pagename: validatePagename(body.pagename),
        schema: validatePageSchema(body.schema),
    };

    // Creation knows both fields of the pair at once, so it is checked right here
    assertPageAddressAllowed(context, toPageAddress(payload.pagename, payload.urlPrefix));

    return payload;
}

/**
 * Validates the payload of PUT/PATCH /api/bricks/:id (updating a page).
 * Every field is optional; requires at least one writable one (the
 * expectedRevision precondition does not count as a data field).
 *
 * The page's address is NOT checked here, which is why no address context is
 * needed either: half of the pair may stay in the stored row, and they are brought
 * together by the handler (`updatePageFromEvent`) through `withCheckedPagePath` →
 * `assertPageAddressAllowed`.
 *
 * @param body - The normalized request body.
 * @returns A clean update payload.
 */
export function validateUpdatePagePayload(body: Record<string, unknown>): IUpdatePagePayload {
    assertKnownKeys(body, UPDATE_PAGE_KEYS);

    const result: IUpdatePagePayload = validatePageMetaFields(body);

    if (body.pagename !== undefined) {
        result.pagename = validatePagename(body.pagename);
    }

    if (body.schema !== undefined) {
        result.schema = validatePageSchema(body.schema);
    }

    const thumbnailUrl = optionalNullableString(body.thumbnailUrl, 'thumbnailUrl', {
        max: MAX_URL_LENGTH,
        pattern: HTTP_URL_PATTERN,
        patternHint: 'must be an http(s) URL',
    });
    if (thumbnailUrl !== undefined) {
        result.thumbnailUrl = thumbnailUrl;
    }

    if (Object.values(result).every((value) => value === undefined)) {
        invalid('No fields to update');
    }

    if (body.expectedRevision !== undefined) {
        result.expectedRevision = validateExpectedRevision(body.expectedRevision);
    }

    return result;
}

/**
 * Validates the payload of POST /api/bricks/:id/versions/:versionId/restore.
 * Unlike PUT/PATCH, `expectedRevision` is mandatory here — restore does not
 * support last-write-wins (a revision mismatch → 409 REVISION_CONFLICT in
 * toPageHttpError, see the JSDoc of the restore.post.ts handler).
 *
 * @param body - The normalized request body.
 * @returns The rollback precondition.
 */
export function validateRestoreVersionPayload(body: Record<string, unknown>): {
    expectedRevision: number;
} {
    assertKnownKeys(body, RESTORE_VERSION_KEYS);

    return { expectedRevision: validateExpectedRevision(body.expectedRevision) };
}
// #endregion
