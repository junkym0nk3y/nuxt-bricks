// Types
import type { IPublishValidationSchemaOptions } from '../types/validation';
import type { TPublishFormState } from '../../../common/types/bricks-api';

// Yup
import { object, string } from 'yup';

// Constants
import {
    DESCRIPTION_MAX_LENGTH,
    DESCRIPTION_MIN_LENGTH,
    KEYWORDS_MAX_LENGTH,
    PAGENAME_MAX_LENGTH,
    PAGENAME_MIN_LENGTH,
    SUBDOMAIN_MAX_LENGTH,
    TITLE_MAX_LENGTH,
    TITLE_MIN_LENGTH,
    URL_PREFIX_MAX_LENGTH,
} from '../../../common/constants/publish';

/**
 * Собирает yup-схему валидации meta-полей страницы. Чистая фабрика без привязки
 * к store/i18n — контекст (переводчик, проверка уникальности, исключаемый id)
 * передаётся снаружи, поэтому схему переиспользуют и сайдбар билдера
 * (`usePublishValidationSchema`), и панель деталей дашборда (`usePublishPageForm`).
 *
 * @param options - Контекст валидации.
 * @returns Yup-схема формы публикации.
 */
export function createPublishValidationSchema(options: IPublishValidationSchemaOptions) {
    const { t, isPageAddressFree, isEditorAddressFree, isPagenameAvailable, getExcludeId } =
        options;

    return object({
        pagename: string()
            .required(() => t('bricks.publish.validation.pagenameRequired'))
            .min(PAGENAME_MIN_LENGTH, () => t('bricks.publish.validation.pagenameMin'))
            .max(PAGENAME_MAX_LENGTH, () => t('bricks.publish.validation.pagenameMax'))
            .matches(/^[a-z0-9-]+$/, () => t('bricks.publish.validation.pagenameFormat'))
            // Адрес редактора от urlPrefix не зависит, поэтому проверяется всегда:
            // занять его может статический сосед вроде страницы логина
            .test(
                'editorAddress',
                () => t('bricks.publish.validation.pagenameEditorTaken'),
                (value) => !value || isEditorAddressFree(value)
            )
            // Live-адрес — только когда префикса нет: с префиксом за адрес
            // отвечает поле urlPrefix, и краснеть должно оно
            .test(
                'liveAddress',
                () => t('bricks.publish.validation.pagenameAddressTaken'),
                function (value): boolean {
                    const { urlPrefix } = this.parent as Pick<TPublishFormState, 'urlPrefix'>;

                    return !value || Boolean(urlPrefix?.trim()) || isPageAddressFree(null, value);
                }
            )
            .test(
                'unique',
                () => t('bricks.publish.validation.pagenameTaken'),
                (value) => {
                    if (!value) {
                        return true;
                    }
                    return isPagenameAvailable(value, getExcludeId());
                }
            ),
        // trim: сервер меряет длину уже обрезанной строки и её же кладёт в базу —
        // без этого поле из одних пробелов проходило бы клиентскую проверку
        title: string()
            .trim()
            .required(() => t('bricks.publish.validation.titleRequired'))
            .min(TITLE_MIN_LENGTH, () => t('bricks.publish.validation.titleMin'))
            .max(TITLE_MAX_LENGTH, () => t('bricks.publish.validation.titleMax')),
        description: string()
            .trim()
            .required(() => t('bricks.publish.validation.descriptionRequired'))
            .min(DESCRIPTION_MIN_LENGTH, () => t('bricks.publish.validation.descriptionMin'))
            .max(DESCRIPTION_MAX_LENGTH, () => t('bricks.publish.validation.descriptionMax')),
        keywords: string()
            .trim()
            .max(KEYWORDS_MAX_LENGTH, () => t('bricks.publish.validation.keywordsMax')),
        socialImage: string()
            .url(() => t('bricks.publish.validation.socialImageUrl'))
            .nullable(),
        backgroundColor: string().nullable(),
        layout: string().required(() => t('bricks.publish.validation.layoutRequired')),
        urlPrefix: string()
            .nullable()
            .transform((value) => value?.trim() || null)
            .matches(/^[a-z0-9-]+(\/[a-z0-9-]+)*$/, () =>
                t('bricks.publish.validation.urlPrefixFormat')
            )
            .max(URL_PREFIX_MAX_LENGTH, () => t('bricks.publish.validation.urlPrefixMax'))
            // Проверяется пара с pagename, а не префикс сам по себе: адрес
            // страницы перекрывает их сумма. Ошибка садится на urlPrefix —
            // pagename в этот момент валиден сам по себе (без префикса адрес
            // страницы свободен), и краснеть должно поле, которое ломает адрес
            .test(
                'addressTaken',
                () => t('bricks.publish.validation.urlPrefixAddressTaken'),
                function (value): boolean {
                    const { pagename } = this.parent as Pick<TPublishFormState, 'pagename'>;

                    return !value || !pagename || isPageAddressFree(value, pagename);
                }
            ),
        subdomain: string()
            .nullable()
            .transform((value) => value?.trim() || null)
            .matches(/^[a-z0-9-]*$/, () => t('bricks.publish.validation.subdomainFormat'))
            .max(SUBDOMAIN_MAX_LENGTH, () => t('bricks.publish.validation.subdomainMax')),
    });
}
