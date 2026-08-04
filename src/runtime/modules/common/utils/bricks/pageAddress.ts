/**
 * Адресная идентичность страницы: нормализация пары `urlPrefix + pagename`, её
 * канонический ключ и сравнение адресов.
 *
 * Единственный владелец сериализации адреса. Ключ отсюда используют и ключи
 * черновиков localStorage, и ключи SSR-payload и data sources: разъехавшись, две
 * похожие сериализации дали бы черновик под одним ключом, а payload — под другим.
 * Путь адреса (`/blog/post`) строит `getPublishedPagePath` в `routePaths.ts` —
 * он же выводится из этого ключа, чтобы логика сегментов жила в одном месте.
 */

import type {
    IBricksPageAddress,
    IBricksPageRouteLocation,
    IBricksPageRouteParams,
} from '../../types/pageAddress';
import { BRICKS_ROUTE_NAMES } from '../../constants/routes';
import {
    PAGENAME_MAX_LENGTH,
    PAGENAME_MIN_LENGTH,
    PAGENAME_PATTERN,
    URL_PREFIX_MAX_LENGTH,
    URL_PREFIX_PATTERN,
} from '../../constants/publish';

/**
 * Приводит `urlPrefix` к каноническому виду: пробельное и пустое значение —
 * это отсутствие префикса.
 *
 * Одно правило на весь проект: так же нормализует префикс серверный DTO (''→null)
 * и так же его трактовали прежние сверки URL. Иначе строка из одних пробелов,
 * созданная в обход валидации, считалась бы префиксом в одном месте и его
 * отсутствием в другом — то есть страница отвечала бы по двум разным адресам.
 *
 * @param value - Сырое значение префикса.
 * @returns Префикс без окружающих пробелов либо null.
 */
export function normalizeUrlPrefix(value: string | null | undefined): string | null {
    return value?.trim() || null;
}

/**
 * Собирает адрес из пары значений, нормализуя обе половины.
 *
 * @param pagename - ЧПУ страницы.
 * @param urlPrefix - Префикс адреса (может отсутствовать).
 * @returns Нормализованный адрес.
 */
export function toPageAddress(
    pagename: string,
    urlPrefix: string | null | undefined
): IBricksPageAddress {
    return {
        pagename: pagename.trim(),
        urlPrefix: normalizeUrlPrefix(urlPrefix),
    };
}

/**
 * Канонический ключ адреса: `blog/post` либо `post` у страницы без префикса.
 *
 * Без ведущего слэша намеренно: ключ подставляется внутрь составных ключей
 * хранилища и payload'а, где слэш в начале читался бы как разделитель их
 * собственных частей. Побочное следствие полезно — у страницы без префикса ключ
 * совпадает с прежним, построенным по одному имени, поэтому её черновики
 * localStorage переживают переход на адресную идентичность.
 *
 * Неоднозначности между префиксом и именем нет: и сегменты префикса, и pagename
 * ограничены `PAGE_ROUTE_SEGMENT`, то есть слэша не содержат.
 *
 * @param address - Адрес страницы.
 * @returns Ключ адреса.
 */
export function getPageAddressKey(address: IBricksPageAddress): string {
    const urlPrefix = normalizeUrlPrefix(address.urlPrefix);

    return urlPrefix === null ? address.pagename : `${urlPrefix}/${address.pagename}`;
}

/**
 * Один ли это адрес. Сравнение по каноническому ключу, а не по полям: `null`,
 * `''` и `'  '` в префиксе означают одно и то же, и сравнение полей объявило бы
 * такие адреса разными.
 *
 * @param first - Первый адрес.
 * @param second - Второй адрес.
 * @returns true — адреса совпадают.
 */
export function isSamePageAddress(first: IBricksPageAddress, second: IBricksPageAddress): boolean {
    return getPageAddressKey(first) === getPageAddressKey(second);
}

/**
 * Собирает запрошенный `urlPrefix` из параметра маршрута. У prefixed-маршрутов
 * (`bricks-page-prefixed`, `bricks-builder-pagename-prefixed`, `bricks-preview-prefixed`)
 * параметр repeatable — массив сегментов; у bare-маршрутов его нет вовсе.
 *
 * @param param - Значение `route.params.urlPrefix`.
 * @returns Префикс в виде `a/b/c` или пустая строка.
 */
export function resolveRequestedUrlPrefix(param: unknown): string {
    if (Array.isArray(param)) {
        return param.join('/');
    }

    return typeof param === 'string' ? param : '';
}

/**
 * Адрес страницы из параметров маршрута — источник истины URL для редактора,
 * превью и live-рендера.
 *
 * @param params - Параметры маршрута.
 * @returns Нормализованный адрес.
 */
export function resolvePageAddressFromRoute(params: IBricksPageRouteParams): IBricksPageAddress {
    return toPageAddress(
        typeof params.pagename === 'string' ? params.pagename : '',
        resolveRequestedUrlPrefix(params.urlPrefix)
    );
}

/**
 * Валиден ли адрес по формату — теми же константами, что серверный DTO и
 * yup-схема формы.
 *
 * Одна проверка на все поверхности: невалидный адрес не может принадлежать
 * существующей странице, поэтому и публичный lookup, и перенос сессии по форме
 * обязаны отвергать его одинаково. Разойдись они — lookup принимал бы адрес,
 * который запись никогда не создаст, а перенос сессии уводил бы URL редактора на
 * маршрут, который его не матчит (regex параметров), и открывал 404.
 *
 * @param address - Проверяемый адрес.
 * @returns Валиден ли адрес.
 */
export function isValidPageAddress(address: IBricksPageAddress): boolean {
    if (
        address.pagename.length < PAGENAME_MIN_LENGTH ||
        address.pagename.length > PAGENAME_MAX_LENGTH ||
        !PAGENAME_PATTERN.test(address.pagename)
    ) {
        return false;
    }

    const urlPrefix = normalizeUrlPrefix(address.urlPrefix);

    if (urlPrefix === null) {
        return true;
    }

    return urlPrefix.length <= URL_PREFIX_MAX_LENGTH && URL_PREFIX_PATTERN.test(urlPrefix);
}

/**
 * Обратное преобразование: named-локация адресного маршрута из адреса.
 *
 * Собрано здесь, рядом с разбором параметров: имя маршрута зависит от наличия
 * префикса, и call-site, выбирающий имя сам, легко забывал бы про
 * prefixed-вариант — переход тогда уходил бы на bare-маршрут и открывал чужую
 * одноимённую страницу.
 *
 * @param bareRouteName - Имя маршрута для адреса без префикса.
 * @param prefixedRouteName - Имя маршрута для адреса с префиксом.
 * @param address - Адрес страницы.
 * @returns Локация для `router.push`.
 */
function getPageRouteLocation(
    bareRouteName: string,
    prefixedRouteName: string,
    address: IBricksPageAddress
): IBricksPageRouteLocation {
    const urlPrefix = normalizeUrlPrefix(address.urlPrefix);

    if (urlPrefix === null) {
        return { name: bareRouteName, params: { pagename: address.pagename } };
    }

    return {
        name: prefixedRouteName,
        params: { pagename: address.pagename, urlPrefix: urlPrefix.split('/') },
    };
}

/**
 * Named-локация редактора страницы (`<builderPrefix>/<адрес>`).
 *
 * @param address - Адрес страницы.
 * @returns Локация для `router.push`.
 */
export function getBuilderPageRouteLocation(address: IBricksPageAddress): IBricksPageRouteLocation {
    return getPageRouteLocation(
        BRICKS_ROUTE_NAMES.builderPage,
        BRICKS_ROUTE_NAMES.builderPagePrefixed,
        address
    );
}
