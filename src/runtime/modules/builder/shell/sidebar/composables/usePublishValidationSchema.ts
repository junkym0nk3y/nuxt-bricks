// Vue
import { useI18n } from 'vue-i18n';

// Yup
import { object, string } from 'yup';

// Pinia
import { usePublishStore } from '../../../publish/stores/publish';

/**
 * Composable для получения validation schema формы публикации.
 * Сообщения — функции с `t()`: резолвятся в момент валидации,
 * поэтому реактивны к смене локали без пересоздания схемы.
 *
 * @param isEditing - режим редактирования (для проверки уникальности pagename).
 */
export function usePublishValidationSchema(isEditing: boolean) {
    const publishStore = usePublishStore();
    const { t } = useI18n();

    const validationSchema = object({
        pagename: string()
            .required(() => t('bricks.publish.validation.pagenameRequired'))
            .min(3, () => t('bricks.publish.validation.pagenameMin'))
            .max(80, () => t('bricks.publish.validation.pagenameMax'))
            .matches(/^[a-z0-9-]+$/, () => t('bricks.publish.validation.pagenameFormat'))
            .test(
                'unique',
                () => t('bricks.publish.validation.pagenameTaken'),
                function (value) {
                    if (!value) {
                        return true;
                    }
                    const editingPageId = isEditing
                        ? (publishStore.editingPageId ?? undefined)
                        : undefined;
                    return publishStore.isPagenameAvailable(value, editingPageId);
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

    return {
        validationSchema,
    };
}
