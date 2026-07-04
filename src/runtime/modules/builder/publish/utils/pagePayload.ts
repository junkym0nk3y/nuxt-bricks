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
 * Собирает payload создания/обновления страницы из схемы и формы публикации.
 * Ключи — camelCase; в snake_case для API конвертирует `toSnakeCaseShallow` на месте вызова.
 *
 * @param schema - Схема лендинга.
 * @param formState - Данные формы публикации.
 * @returns Полный payload страницы.
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
        schema: preserveSchema(schema),
        published: formState.published,
    };
}

/**
 * Собирает частичный PATCH-payload meta-полей из значений формы панели деталей.
 * Схема, layout, backgroundColor и статус публикации не затрагиваются.
 *
 * @param values - Значения формы meta.
 * @returns Payload для `patchPage`.
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
    };
}
