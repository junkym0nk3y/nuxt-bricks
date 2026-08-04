/**
 * Типы валидации формы публикации: контекст yup-фабрики и проверки перед записью.
 */

import type { TPublishFormState } from '../../../common/types/bricks-api';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';

export interface IPublishValidationSchemaOptions {
    /** Переводчик i18n-ключей (сообщения резолвятся в момент валидации). */
    t: (key: string) => string;
    /**
     * Свободен ли live-адрес страницы в роутинге приложения
     * (`useBricksPageAddress`) — ловит и поверхности билдера, и страницы
     * потребителя, перекрывающие published-адрес.
     */
    isPageAddressFree: (address: IBricksPageAddress) => boolean;
    /** Свободен ли адрес редактора страницы (`<builderPrefix>/<urlPrefix>/<pagename>`). */
    isEditorAddressFree: (address: IBricksPageAddress) => boolean;
    /** Свободен ли адрес у других страниц (обычно `publishStore.isAddressAvailable`). */
    isAddressAvailable: (address: IBricksPageAddress, excludeId?: string | number) => boolean;
    /** Возвращает id страницы, исключаемой из проверки уникальности адреса. */
    getExcludeId: () => string | number | undefined;
}

/**
 * Результат валидации формы публикации перед превью или записью.
 */
export interface IPublishFormValidationResult {
    /** Состояние формы с trim'нутыми pagename/urlPrefix/subdomain (та же ссылка, если ничего не изменилось). */
    formState: TPublishFormState;
    /** Ошибки валидации по полям (пусто — валидация пройдена). */
    errors: Record<string, string>;
}

/**
 * Правило обязательного текстового поля: границы длины и ключи сообщений.
 */
export interface IRequiredTextRule {
    minLength: number;
    maxLength: number;
    requiredMessage: string;
    minMessage: string;
    maxMessage: string;
}
