import type { Composer } from 'vue-i18n';
import { useNuxtApp } from '#imports';
import type { TPublishFormState } from '../../../common/types/bricks-api';
import type { IPublishFormValidationResult, IRequiredTextRule } from '../types/validation';
import {
    DESCRIPTION_MAX_LENGTH,
    DESCRIPTION_MIN_LENGTH,
    KEYWORDS_MAX_LENGTH,
    PAGENAME_MAX_LENGTH,
    PAGENAME_MIN_LENGTH,
    TITLE_MAX_LENGTH,
    TITLE_MIN_LENGTH,
} from '../../../common/constants/publish';

/**
 * Переводит ключ через глобальный i18n (утилита вызывается вне setup-контекста).
 * `$i18n` резолвится лениво на каждый вызов — безопасно при любом порядке плагинов.
 */
function t(key: string): string {
    const i18n = useNuxtApp().$i18n as Composer | undefined;
    return i18n ? i18n.t(key) : key;
}

/**
 * Проверяет обязательное текстовое поле: непустота и границы длины.
 * Длина меряется по обрезанному значению — сервер сохраняет именно его.
 *
 * @param value - Значение поля.
 * @param rule - Границы длины и ключи сообщений.
 * @returns Текст ошибки либо пустая строка.
 */
function validateRequiredText(value: string | null | undefined, rule: IRequiredTextRule): string {
    const trimmed = value?.trim() || '';

    if (!trimmed) {
        return t(rule.requiredMessage);
    }

    if (trimmed.length < rule.minLength) {
        return t(rule.minMessage);
    }

    if (trimmed.length > rule.maxLength) {
        return t(rule.maxMessage);
    }

    return '';
}

/**
 * Проверяет pagename: непустота, формат, границы длины и занятость.
 *
 * @param pagename - Уже обрезанное значение.
 * @param isPagenameAvailable - Проверка, свободен ли pagename.
 * @returns Текст ошибки либо пустая строка.
 */
function validatePagename(
    pagename: string,
    isPagenameAvailable: (pagename: string) => boolean
): string {
    if (!pagename) {
        return t('bricks.publish.validation.pagenameRequired');
    }

    if (!/^[a-z0-9-]+$/.test(pagename)) {
        return t('bricks.publish.validation.pagenameFormat');
    }

    if (pagename.length < PAGENAME_MIN_LENGTH) {
        return t('bricks.publish.validation.pagenameMin');
    }

    if (pagename.length > PAGENAME_MAX_LENGTH) {
        return t('bricks.publish.validation.pagenameMax');
    }

    if (!isPagenameAvailable(pagename)) {
        return t('bricks.publish.validation.pagenameTaken');
    }

    return '';
}

/**
 * Валидирует опциональные поля маршрутизации (urlPrefix, subdomain).
 *
 * @param formState - Нормализованное состояние формы (уже trim'нутое).
 * @param errors - Аккумулятор ошибок (мутируется).
 */
function validateOptionalRoutingFields(
    formState: TPublishFormState,
    errors: Record<string, string>
): void {
    if (formState.urlPrefix && !/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(formState.urlPrefix)) {
        errors.urlPrefix = t('bricks.publish.validation.urlPrefixFormat');
    }

    if (formState.subdomain && !/^[a-z0-9-]+$/.test(formState.subdomain)) {
        errors.subdomain = t('bricks.publish.validation.subdomainFormat');
    }
}

/**
 * Валидирует настройки публикации перед превью или публикацией:
 * обязательные pagename/title/description, их длины, формат pagename и полей
 * маршрутизации, уникальность pagename.
 *
 * Границы длины — те же константы, что у yup-схемы формы и у серверной проверки
 * DTO. Без них сайдбар подсвечивал поле красным по схеме, а сохранение всё равно
 * проходило: две проверки жили каждая со своим набором правил.
 *
 * @param formState - Текущее состояние формы.
 * @param isPagenameAvailable - Проверка, свободен ли `pagename` (с учётом редактируемой страницы).
 * @returns Нормализованное состояние формы и ошибки по полям.
 */
export function validatePublishFormState(
    formState: TPublishFormState,
    isPagenameAvailable: (pagename: string) => boolean
): IPublishFormValidationResult {
    const trimmedPagename = formState.pagename.trim();
    const trimmedUrlPrefix = formState.urlPrefix?.trim() || null;
    const trimmedSubdomain = formState.subdomain?.trim() || null;

    const isChanged =
        trimmedPagename !== formState.pagename ||
        trimmedUrlPrefix !== formState.urlPrefix ||
        trimmedSubdomain !== formState.subdomain;

    const normalized: TPublishFormState = isChanged
        ? {
              ...formState,
              pagename: trimmedPagename,
              urlPrefix: trimmedUrlPrefix,
              subdomain: trimmedSubdomain,
          }
        : formState;

    const errors: Record<string, string> = {};

    const pagenameError = validatePagename(trimmedPagename, isPagenameAvailable);
    if (pagenameError) {
        errors.pagename = pagenameError;
    }

    const titleError = validateRequiredText(normalized.title, {
        minLength: TITLE_MIN_LENGTH,
        maxLength: TITLE_MAX_LENGTH,
        requiredMessage: 'bricks.publish.validation.titleRequired',
        minMessage: 'bricks.publish.validation.titleMin',
        maxMessage: 'bricks.publish.validation.titleMax',
    });
    if (titleError) {
        errors.title = titleError;
    }

    const descriptionError = validateRequiredText(normalized.description, {
        minLength: DESCRIPTION_MIN_LENGTH,
        maxLength: DESCRIPTION_MAX_LENGTH,
        requiredMessage: 'bricks.publish.validation.descriptionRequired',
        minMessage: 'bricks.publish.validation.descriptionMin',
        maxMessage: 'bricks.publish.validation.descriptionMax',
    });
    if (descriptionError) {
        errors.description = descriptionError;
    }

    if ((normalized.keywords?.trim() || '').length > KEYWORDS_MAX_LENGTH) {
        errors.keywords = t('bricks.publish.validation.keywordsMax');
    }

    validateOptionalRoutingFields(normalized, errors);

    return { formState: normalized, errors };
}
