import type { TPublishFormState } from '../../../common/types/bricks-api';
import type { IBuilderDraftSnapshot } from '../types/builderDrafts';

/**
 * Проверяет валидность slug (pagename).
 *
 * @param value - ЧПУ страницы.
 */
export function isValidPagename(value: string): boolean {
    return Boolean(value) && /^[a-z0-9-]+$/.test(value);
}

/**
 * Формирует объект для сравнения из настроек публикации.
 *
 * @param formState - Состояние формы.
 */
export function pickComparableFormState(formState: TPublishFormState): Record<string, unknown> {
    return {
        pagename: (formState.pagename ?? '').trim(),
        title: (formState.title ?? '').trim(),
        description: (formState.description ?? '').trim(),
        keywords: (formState.keywords ?? '').trim(),
        published: Boolean(formState.published),
        layout: formState.layout ?? '',
        backgroundColor: formState.backgroundColor ?? '',
        socialImage: formState.socialImage ?? '',
        urlPrefix: formState.urlPrefix ?? '',
        subdomain: formState.subdomain ?? '',
    };
}

/**
 * Сравнивает два снапшота (schema + publish settings).
 *
 * @param a - Первый снапшот.
 * @param b - Второй снапшот.
 */
export function isSnapshotEqual(a: IBuilderDraftSnapshot, b: IBuilderDraftSnapshot): boolean {
    const schemaEqual = JSON.stringify(a.schema) === JSON.stringify(b.schema);
    if (!schemaEqual) {
        return false;
    }

    return (
        JSON.stringify(pickComparableFormState(a.formState)) ===
        JSON.stringify(pickComparableFormState(b.formState))
    );
}
