/**
 * Превью-роуты `<previewPrefix>/:pagename` и `<previewPrefix>/:urlPrefix+/:pagename`:
 * параметр версии, ключ payload'а страницы и page key рендера. Живут вместе,
 * потому что версия входит во все три: middleware и страница рендера обязаны
 * сойтись на одном ключе payload'а, иначе превью версии либо промахнётся мимо
 * загруженных данных, либо подберёт снапшот соседней версии.
 */
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import type { IBricksPageAddress } from '../../types/pageAddress';
import { getPageAddressKey } from './pageAddress';
import { BRICKS_PREVIEW_ROUTE_NAMES } from '../../constants/routes';

/**
 * Имя query-параметра версии в превью-роуте. Версия живёт в URL, а не в
 * localStorage: слот там один, и открытая рядом вкладка билдера (или второе
 * превью) перетирала бы снапшот. По URL превью версии переживает перезагрузку и
 * рендерится на SSR сразу нужным состоянием.
 */
export const PREVIEW_VERSION_QUERY_PARAM = 'version';

/**
 * Разбирает `?version=` превью-роута: id версии или `null` для превью текущего
 * состояния. Мусор (не число, ноль, отрицательное, массив повторов) трактуется
 * как отсутствие параметра — превью показывает страницу, а не отказ.
 *
 * @param value - Значение `route.query[PREVIEW_VERSION_QUERY_PARAM]`.
 * @returns Положительный целый id версии или null.
 */
export function parsePreviewVersionId(value: unknown): number | null {
    const raw = Array.isArray(value) ? value[0] : value;

    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
        return null;
    }

    const versionId = Number.parseInt(raw, 10);

    return versionId > 0 ? versionId : null;
}

/**
 * Ключ данных страницы в `nuxtApp.payload.data`: middleware пишет, страница
 * рендера читает через `useNuxtData`.
 *
 * Ключ строится от АДРЕСА, а не от одного имени, и той же функцией
 * (`getPageAddressKey`), что ключи черновиков: у `/blog/post` и `/news/post`
 * ключ по имени был один, и это не просто коллизия кеша — middleware при
 * payload-хите перепроверяет префикс и на несовпадении отдаёт 404, то есть
 * SPA-переход между одноимёнными страницами ломал живую страницу. Вторая
 * похожая сериализация адреса здесь тоже недопустима: разъехавшись с ключом
 * черновика, она положила бы состояние одной страницы под ключ другой.
 *
 * @param address - Адрес страницы.
 * @param isPreview - Превью-роут (иначе live-страница по адресу).
 * @param previewVersionId - Id версии из query превью-роута (null — текущее состояние).
 * @returns Ключ payload'а.
 */
export function getBricksPageDataKey(
    address: IBricksPageAddress,
    isPreview: boolean,
    previewVersionId: number | null = null
): string {
    const addressKey = getPageAddressKey(address);

    if (!isPreview) {
        return `bricks-page-${addressKey}-live`;
    }

    return previewVersionId === null
        ? `bricks-page-${addressKey}-preview`
        : `bricks-page-${addressKey}-preview-version-${previewVersionId}`;
}

/**
 * Page key страницы рендера (`definePageMeta`).
 *
 * Дефолтный ключ Nuxt — путь без query, поэтому переход между `?version=44` и
 * `?version=45` переиспользовал бы страницу: id версии, ключ payload и режим
 * синка снимаются один раз в setup, и вкладка осталась бы на прежней версии.
 * Версия входит в ключ только на превью-роуте: на live-странице параметр
 * ничего не значит для рендера и принадлежит потребителю — перемонтирование по
 * его смене сбрасывало бы состояние страницы и заново гоняло data sources.
 *
 * @param route - Текущий роут (нужны имя, путь и query).
 * @returns Ключ страницы для `<NuxtPage>`.
 */
export function getRenderPageKey(
    route: Pick<RouteLocationNormalizedLoaded, 'name' | 'path' | 'query'>
): string {
    if (typeof route.name !== 'string' || !BRICKS_PREVIEW_ROUTE_NAMES.includes(route.name)) {
        return route.path;
    }

    return `${route.path}:${parsePreviewVersionId(route.query[PREVIEW_VERSION_QUERY_PARAM]) ?? ''}`;
}
