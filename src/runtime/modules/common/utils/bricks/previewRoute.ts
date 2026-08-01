/**
 * Превью-роут `<previewPrefix>/:pagename`: параметр версии, ключ payload'а
 * страницы и page key рендера. Живут вместе, потому что версия входит во все
 * три: middleware и страница рендера обязаны сойтись на одном ключе payload'а,
 * иначе превью версии либо промахнётся мимо загруженных данных, либо подберёт
 * снапшот соседней версии.
 */
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { BRICKS_ROUTE_NAMES } from '../../constants/routes';

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
 * @param pagename - ЧПУ страницы.
 * @param isPreview - Превью-роут (иначе live-страница по ЧПУ).
 * @param previewVersionId - Id версии из query превью-роута (null — текущее состояние).
 * @returns Ключ payload'а.
 */
export function getBricksPageDataKey(
    pagename: string,
    isPreview: boolean,
    previewVersionId: number | null = null
): string {
    if (!isPreview) {
        return `bricks-page-${pagename}-live`;
    }

    return previewVersionId === null
        ? `bricks-page-${pagename}-preview`
        : `bricks-page-${pagename}-preview-version-${previewVersionId}`;
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
    if (route.name !== BRICKS_ROUTE_NAMES.preview) {
        return route.path;
    }

    return `${route.path}:${parsePreviewVersionId(route.query[PREVIEW_VERSION_QUERY_PARAM]) ?? ''}`;
}
