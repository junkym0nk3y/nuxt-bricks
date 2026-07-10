// Yup
import { object, string } from 'yup';

// Constants
import { RESERVED_PAGENAMES } from '../../../common/constants/publish';

interface IPublishValidationSchemaOptions {
    /** Переводчик i18n-ключей (сообщения резолвятся в момент валидации). */
    t: (key: string) => string;
    /** Проверка занятости pagename (обычно `publishStore.isPagenameAvailable`). */
    isPagenameAvailable: (pagename: string, excludeId?: string | number) => boolean;
    /** Возвращает id страницы, исключаемой из проверки уникальности pagename. */
    getExcludeId: () => string | number | undefined;
}

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
    const { t, isPagenameAvailable, getExcludeId } = options;

    return object({
        pagename: string()
            .required(() => t('bricks.publish.validation.pagenameRequired'))
            .min(3, () => t('bricks.publish.validation.pagenameMin'))
            .max(80, () => t('bricks.publish.validation.pagenameMax'))
            .matches(/^[a-z0-9-]+$/, () => t('bricks.publish.validation.pagenameFormat'))
            .test(
                'reserved',
                () => t('bricks.publish.validation.pagenameReserved'),
                (value) => !value || !RESERVED_PAGENAMES.includes(value)
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
        title: string()
            .required(() => t('bricks.publish.validation.titleRequired'))
            .min(3, () => t('bricks.publish.validation.titleMin'))
            .max(120, () => t('bricks.publish.validation.titleMax')),
        description: string()
            .required(() => t('bricks.publish.validation.descriptionRequired'))
            .min(10, () => t('bricks.publish.validation.descriptionMin'))
            .max(500, () => t('bricks.publish.validation.descriptionMax')),
        keywords: string().max(255, () => t('bricks.publish.validation.keywordsMax')),
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
            .max(100, () => t('bricks.publish.validation.urlPrefixMax')),
        subdomain: string()
            .nullable()
            .transform((value) => value?.trim() || null)
            .matches(/^[a-z0-9-]*$/, () => t('bricks.publish.validation.subdomainFormat'))
            .max(63, () => t('bricks.publish.validation.subdomainMax')),
    });
}
