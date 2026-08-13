import type { TPublishFormState } from '../../../common/types/bricks-api';
import type { IBuilderDraftSnapshot } from '../types/builderDrafts';

/**
 * Формирует объект для сравнения из настроек публикации.
 *
 * @param formState - Состояние формы.
 */
function pickComparableFormState(formState: TPublishFormState): Record<string, unknown> {
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
        // Без этого правка ширины устройства не считалась бы изменением: форма
        // помечалась бы чистой, и «Сохранить» уходило бы без набора
        viewportConfig: formState.viewportConfig ?? null,
    };
}

/**
 * Сравнивает только настройки публикации. Отдельно от снапшота целиком, потому
 * что схему для этого пришлось бы сериализовать — а форма меняется на каждый
 * символ в поле, и сравнивать по ней весь канвас незачем.
 *
 * @param a - Первое состояние формы.
 * @param b - Второе состояние формы.
 */
export function isFormStateEqual(a: TPublishFormState, b: TPublishFormState): boolean {
    return (
        JSON.stringify(pickComparableFormState(a)) === JSON.stringify(pickComparableFormState(b))
    );
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

    return isFormStateEqual(a.formState, b.formState);
}
