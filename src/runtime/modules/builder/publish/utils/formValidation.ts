import type { Composer } from 'vue-i18n';
import { useNuxtApp } from '#imports';
import type { TPublishFormState } from '../../../common/types/bricks-api';

/**
 * Результат валидации формы публикации.
 */
export interface IPublishFormValidationResult {
    /** Состояние формы с trim'нутыми pagename/urlPrefix/subdomain (та же ссылка, если ничего не изменилось). */
    formState: TPublishFormState;
    /** Ошибки валидации по полям (пусто — валидация пройдена). */
    errors: Record<string, string>;
}

/**
 * Переводит ключ через глобальный i18n (утилита вызывается вне setup-контекста).
 * `$i18n` резолвится лениво на каждый вызов — безопасно при любом порядке плагинов.
 */
function t(key: string): string {
    const i18n = useNuxtApp().$i18n as Composer | undefined;
    return i18n ? i18n.t(key) : key;
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
 * обязательные pagename/title/description, формат pagename и полей маршрутизации,
 * уникальность pagename.
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

    if (!trimmedPagename) {
        errors.pagename = t('bricks.publish.validation.pagenameRequired');
    } else if (!/^[a-z0-9-]+$/.test(trimmedPagename)) {
        errors.pagename = t('bricks.publish.validation.pagenameFormat');
    } else if (!isPagenameAvailable(trimmedPagename)) {
        errors.pagename = t('bricks.publish.validation.pagenameTaken');
    }

    if (!normalized.title?.trim()) {
        errors.title = t('bricks.publish.validation.titleRequired');
    }

    if (!normalized.description?.trim()) {
        errors.description = t('bricks.publish.validation.descriptionRequired');
    }

    validateOptionalRoutingFields(normalized, errors);

    return { formState: normalized, errors };
}
