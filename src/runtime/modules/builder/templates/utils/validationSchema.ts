/**
 * Yup-схема формы шаблона — общая для сохранения и переименования: поля те же
 * (имя и описание), и разъехавшись, формы обещали бы разное об одной записи.
 */
// #region Imports
// Constants
import {
    TEMPLATE_DESCRIPTION_MAX_LENGTH,
    TEMPLATE_NAME_MAX_LENGTH,
    TEMPLATE_NAME_MIN_LENGTH,
} from '../../../common/constants/templates';

// Yup
import { object, string } from 'yup';
// #endregion

/**
 * Собирает схему валидации формы шаблона.
 *
 * Границы берутся из общих констант, а не переписаны числами: клиентская схема,
 * разъехавшаяся с серверной, либо отклоняет имя, которое сервер принял бы, либо
 * гоняет через сеть заведомо отказной запрос.
 *
 * Занятость имени здесь не проверяется вовсе — это знает только сервер, и его
 * отказ встаёт под поле (см. `isTemplateNameTakenError`).
 *
 * @param options - Переводчик сообщений.
 * @returns Yup-схема формы шаблона.
 */
export function createTemplateValidationSchema(options: {
    t: (key: string, params?: Record<string, unknown>) => string;
}) {
    const { t } = options;

    return object({
        // `trim` до границ, а не после: формы отправляют обрезанные значения, и
        // серверный валидатор мерит уже обрезанную строку — без него «  a  »
        // проходил бы клиентский минимум и возвращался generic-отказом сервера
        // вместо подсказки под полем
        name: string()
            .trim()
            .required(() => t('bricks.templates.validation.nameRequired'))
            .min(TEMPLATE_NAME_MIN_LENGTH, () =>
                t('bricks.templates.validation.nameTooShort', { min: TEMPLATE_NAME_MIN_LENGTH })
            )
            .max(TEMPLATE_NAME_MAX_LENGTH, () =>
                t('bricks.templates.validation.nameTooLong', { max: TEMPLATE_NAME_MAX_LENGTH })
            ),
        description: string()
            .trim()
            .max(TEMPLATE_DESCRIPTION_MAX_LENGTH, () =>
                t('bricks.templates.validation.descriptionTooLong', {
                    max: TEMPLATE_DESCRIPTION_MAX_LENGTH,
                })
            ),
    });
}
