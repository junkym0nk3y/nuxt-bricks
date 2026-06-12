import type { BricksSchema } from '../../../common/types/brick';
import type { ICreatePagePayload, TPublishFormState } from '../../../common/types/bricks-api';
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
    schema: BricksSchema,
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
