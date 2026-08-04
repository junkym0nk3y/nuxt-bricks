// Types
import type { IPublishValidationSchemaOptions } from '../types/validation';
import type { TPublishFormState } from '../../../common/types/bricks-api';

// Utils
import { normalizeUrlPrefix, toPageAddress } from '../../../common/utils/bricks/pageAddress';

// Yup
import { object, string, type ValidationError } from 'yup';

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
    const { t, isPageAddressFree, isEditorAddressFree, isAddressAvailable, getExcludeId } = options;

    return object({
        pagename: string()
            .required(() => t('bricks.publish.validation.pagenameRequired'))
            .min(PAGENAME_MIN_LENGTH, () => t('bricks.publish.validation.pagenameMin'))
            .max(PAGENAME_MAX_LENGTH, () => t('bricks.publish.validation.pagenameMax'))
            .matches(/^[a-z0-9-]+$/, () => t('bricks.publish.validation.pagenameFormat'))
            // Адрес редактора теперь включает префикс, поэтому проверяется пара:
            // `bricks-login` без префикса действительно отбирает путь у страницы
            // логина, а `blog/bricks-login` живёт по свободному пути
            .test(
                'editorAddress',
                () => t('bricks.publish.validation.pagenameEditorTaken'),
                function (value): boolean {
                    const { urlPrefix } = this.parent as Pick<TPublishFormState, 'urlPrefix'>;

                    return !value || isEditorAddressFree(toPageAddress(value, urlPrefix));
                }
            )
            // Live-адрес — только когда префикса нет: с префиксом за адрес
            // отвечает поле urlPrefix, и краснеть должно оно
            .test(
                'liveAddress',
                () => t('bricks.publish.validation.pagenameAddressTaken'),
                function (value): boolean {
                    const { urlPrefix } = this.parent as Pick<TPublishFormState, 'urlPrefix'>;

                    return (
                        !value ||
                        normalizeUrlPrefix(urlPrefix) !== null ||
                        isPageAddressFree(toPageAddress(value, null))
                    );
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

                    return !value || !pagename || isPageAddressFree(toPageAddress(pagename, value));
                }
            ),
        subdomain: string()
            .nullable()
            .transform((value) => value?.trim() || null)
            .matches(/^[a-z0-9-]*$/, () => t('bricks.publish.validation.subdomainFormat'))
            .max(SUBDOMAIN_MAX_LENGTH, () => t('bricks.publish.validation.subdomainMax')),
    }).test('addressUnique', function (form): boolean | ValidationError {
        // Уникальность проверяется на уровне объекта, а не в тесте поля: занят
        // адрес целиком, и тест, висящий на одном поле, не пересчитывался бы при
        // правке второго — смена pagename оставляла бы ошибку от прежней пары.
        if (!form?.pagename) {
            return true;
        }

        const address = toPageAddress(form.pagename, form.urlPrefix);

        if (isAddressAvailable(address, getExcludeId())) {
            return true;
        }

        // Поле ошибки — то, которое пользователь и правит, чтобы разойтись с
        // занятым адресом: с префиксом это urlPrefix, без него — само имя. Та же
        // конвенция, что у адреса, занятого роутингом приложения.
        return this.createError({
            path: address.urlPrefix === null ? 'pagename' : 'urlPrefix',
            message: t('bricks.publish.validation.addressTaken'),
        });
    });
}
