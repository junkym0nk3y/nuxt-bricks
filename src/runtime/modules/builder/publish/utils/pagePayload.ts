import type { IBricksSchema } from '../../../common/types/brick';
import type {
    ICreatePagePayload,
    IUpdatePagePayload,
    TPublishFormState,
} from '../../../common/types/bricks-api';
import type { IPublishPageFormValues } from '../types/dashboard';
import {
    DEFAULT_BACKGROUND_COLOR,
    DEFAULT_LAYOUT,
    preserveSchema,
} from '../../../common/utils/bricks/publishedPage';

/**
 * Builds the create/update payload of a page out of the schema and the publish
 * form. The keys are camelCase; `toSnakeCaseShallow` converts them to snake_case
 * for the API at the call site.
 *
 * @param schema - Landing schema.
 * @param formState - Publish form data.
 * @returns Full page payload.
 */
export function buildPagePayload(
    schema: IBricksSchema,
    formState: TPublishFormState
): ICreatePagePayload {
    return {
        pagename: formState.pagename,
        title: formState.title,
        description: formState.description,
        keywords: formState.keywords,
        socialImage: formState.socialImage || null,
        backgroundColor: formState.backgroundColor || DEFAULT_BACKGROUND_COLOR,
        layout: formState.layout || DEFAULT_LAYOUT,
        urlPrefix: formState.urlPrefix || null,
        subdomain: formState.subdomain || null,
        viewportConfig: formState.viewportConfig ?? null,
        schema: preserveSchema(schema),
        published: formState.published,
        headCode: formState.headCode || null,
        bodyEndCode: formState.bodyEndCode || null,
        noindex: formState.noindex,
    };
}

/**
 * Builds the partial PATCH payload of the meta fields out of the values of the
 * details panel form. The schema, the layout, the background color and the
 * publication status are left alone.
 *
 * @param values - Meta form values.
 * @returns Payload for `patchPage`.
 */
export function buildMetaPatchPayload(values: IPublishPageFormValues): IUpdatePagePayload {
    return {
        pagename: values.pagename.trim(),
        title: values.title.trim(),
        description: values.description,
        keywords: values.keywords,
        socialImage: values.socialImage || null,
        urlPrefix: values.urlPrefix.trim() || null,
        subdomain: values.subdomain.trim() || null,
        headCode: values.headCode || null,
        bodyEndCode: values.bodyEndCode || null,
        noindex: values.noindex,
    };
}
