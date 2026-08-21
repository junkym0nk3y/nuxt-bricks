/**
 * Server-first validation of the template handlers' DTOs
 * (`/api/bricks/templates/**`).
 *
 * As with pages: the client-side yup is UX rather than protection, so unknown keys
 * are rejected here (400), types and bounds are checked, and what it returns is a
 * NEW object built only from the known normalized fields.
 *
 * The schema and its complexity limits are reused in full (`validatePageSchema` out
 * of the pages' validator): a template carries exactly the schema a page would
 * accept, and a second set of bounds would drift away from the first at the very
 * first edit.
 */
import type {
    IBricksTemplatePageMeta,
    ICreateTemplatePayload,
    IUpdateTemplatePayload,
} from '../../../common/types/templates';
import type { TBricksPageDeviceSet } from '../../../common/types/devices';
import {
    TEMPLATE_DESCRIPTION_MAX_LENGTH,
    TEMPLATE_NAME_MAX_LENGTH,
    TEMPLATE_NAME_MIN_LENGTH,
} from '../../../common/constants/templates';
import {
    HTTP_URL_PATTERN,
    MAX_URL_LENGTH,
    assertKnownKeys,
    invalid,
    optionalNullableString,
    requireString,
} from './payloadPrimitives';
import { validatePageSchema } from './payloadValidation';
import { validateDeviceSet } from '../../../common/utils/bricks/devices';

// #region Constants
/** The bounds of the styling fields — the same as a page's (`bricks_pages`). */
const LAYOUT_MAX_LENGTH = 100;
const BACKGROUND_COLOR_MAX_LENGTH = 100;
const LAYOUT_PATTERN = /^[\w-]+$/;

/**
 * The keys of the template creation payload.
 *
 * `thumbnailSourceUrl` rather than `thumbnailUrl`: the client passes the PAGE's
 * frame, out of which the handler makes the template's own file. The field's name
 * says so outright — accepting a ready `thumbnailUrl` would mean letting the client
 * write an arbitrary picture onto a template and bypass the copying.
 */
const CREATE_TEMPLATE_KEYS = new Set([
    'name',
    'description',
    'schema',
    'pageMeta',
    'thumbnailSourceUrl',
]);

/** The keys of the payload editing a template's label. */
const UPDATE_TEMPLATE_KEYS = new Set(['name', 'description']);

/** The keys of the page styling object inside the payload. */
const PAGE_META_KEYS = new Set(['layout', 'backgroundColor', 'viewportConfig']);
// #endregion

// #region Types
/**
 * The template creation payload at the handler's level: carries the source page
 * frame instead of a ready preview URL (the copy is made by the handler).
 */
export interface ICreateTemplateRequest extends Omit<ICreateTemplatePayload, 'thumbnailUrl'> {
    /** The source page's frame, out of which the template's preview is copied. */
    thumbnailSourceUrl: string | null;
}
// #endregion

// #region Field validators
/**
 * Validates a template's name: a non-empty string within the bounds; uniqueness is
 * checked by the database's index (a pre-check does not catch the race of two
 * creators anyway).
 *
 * @param value - The field's raw value.
 * @returns The normalized name.
 */
function validateTemplateName(value: unknown): string {
    return requireString(value, 'name', {
        min: TEMPLATE_NAME_MIN_LENGTH,
        max: TEMPLATE_NAME_MAX_LENGTH,
    });
}

/**
 * Validates the page styling that goes into the template.
 *
 * A missing `pageMeta` is a legitimate "default styling": the template could have
 * been saved from a page with neither a layout nor a background set. The device set
 * is checked by the same strict validator as a page's: the value goes into the
 * schema's keys and into the `<style>` generation, so an "almost valid" set is more
 * dangerous than a refusal.
 *
 * @param value - The field's raw value.
 * @returns The normalized styling.
 */
function validateTemplatePageMeta(value: unknown): IBricksTemplatePageMeta {
    if (value === undefined || value === null) {
        return { layout: null, backgroundColor: null, viewportConfig: null };
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
        invalid('Field "pageMeta" must be an object');
    }

    const meta = value as Record<string, unknown>;
    assertKnownKeys(meta, PAGE_META_KEYS);

    return {
        layout:
            optionalNullableString(meta.layout, 'pageMeta.layout', {
                max: LAYOUT_MAX_LENGTH,
                pattern: LAYOUT_PATTERN,
            }) ?? null,
        backgroundColor:
            optionalNullableString(meta.backgroundColor, 'pageMeta.backgroundColor', {
                max: BACKGROUND_COLOR_MAX_LENGTH,
            }) ?? null,
        viewportConfig: validateTemplateViewportConfig(meta.viewportConfig),
    };
}

/**
 * Validates a template's device set; `null`/absence — inherit the project's set.
 *
 * @param value - The field's raw value.
 * @returns The device set, or null.
 */
function validateTemplateViewportConfig(value: unknown): TBricksPageDeviceSet | null {
    if (value === undefined || value === null) {
        return null;
    }

    const validation = validateDeviceSet(value);

    if (!validation.ok) {
        invalid(`Field "pageMeta.viewportConfig" is invalid: ${validation.errors.join('; ')}`);
    }

    return validation.value;
}

/**
 * Validates a template's description (an optional one).
 *
 * @param value - The field's raw value.
 * @returns The description, or null.
 */
function validateTemplateDescription(value: unknown): string | null {
    return (
        optionalNullableString(value, 'description', {
            max: TEMPLATE_DESCRIPTION_MAX_LENGTH,
        }) ?? null
    );
}
// #endregion

// #region Template payloads
/**
 * Validates the payload of `POST /api/bricks/templates`.
 *
 * @param body - The normalized request body.
 * @returns A clean creation payload (with the source page frame).
 */
export function validateCreateTemplatePayload(
    body: Record<string, unknown>
): ICreateTemplateRequest {
    assertKnownKeys(body, CREATE_TEMPLATE_KEYS);

    return {
        name: validateTemplateName(body.name),
        description: validateTemplateDescription(body.description),
        schema: validatePageSchema(body.schema),
        pageMeta: validateTemplatePageMeta(body.pageMeta),
        thumbnailSourceUrl:
            optionalNullableString(body.thumbnailSourceUrl, 'thumbnailSourceUrl', {
                max: MAX_URL_LENGTH,
                pattern: HTTP_URL_PATTERN,
                patternHint: 'must be an http(s) URL',
            }) ?? null,
    };
}

/**
 * Validates the payload of `PATCH /api/bricks/templates/:id`: both fields are
 * optional, but at least one must be passed — otherwise the request means
 * nothing and the adapter would assemble an `UPDATE ... SET` with no expressions.
 *
 * @param body - The normalized request body.
 * @returns A clean payload editing the label.
 */
export function validateUpdateTemplatePayload(
    body: Record<string, unknown>
): IUpdateTemplatePayload {
    assertKnownKeys(body, UPDATE_TEMPLATE_KEYS);

    const payload: IUpdateTemplatePayload = {};

    if (body.name !== undefined) {
        payload.name = validateTemplateName(body.name);
    }

    if (body.description !== undefined) {
        payload.description = validateTemplateDescription(body.description);
    }

    if (Object.keys(payload).length === 0) {
        invalid('No fields to update');
    }

    return payload;
}
// #endregion
