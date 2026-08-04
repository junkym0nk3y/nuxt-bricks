// #region Imports
// Types
import type { IUseBricksPageAddressReturn } from '../types/composables';
import type { IBricksPageAddress } from '../types/pageAddress';

// Utils
import {
    UNNAMED_ROUTE_OWNER,
    isEditorAddressTaken,
    isPageAddressTaken,
} from '../utils/bricks/routePaths';

// Composables
import { useBricksRoutePaths } from './useBricksRoutePaths';

// Nuxt
import { useRouter, useRuntimeConfig } from '#imports';
// #endregion

/**
 * Доступность адресов страницы по РЕАЛЬНОМУ роутингу приложения.
 *
 * Ответ даёт `router.resolve`, а не список зарезервированных имён: список
 * пришлось бы держать руками, и он всё равно не знал бы о страницах
 * приложения-потребителя. Спросив роутер, мы одинаково ловим и поверхности
 * билдера, и чужой `pages/about.vue`, который перекрыл бы published-адрес.
 *
 * Серверная валидация DTO этим воспользоваться не может (vue-router там нет) и
 * проверяет то же правило по собственным маршрутам модуля — то есть остаётся
 * страховкой, а не полным аналогом.
 */
export function useBricksPageAddress(): IUseBricksPageAddressReturn {
    const router = useRouter();
    const { prefixes } = useBricksRoutePaths();

    /**
     * Live-поверхность выключена (`features.publishedPages: false`) — у страницы
     * нет собственного URL, и занимать он не может ничего. Флаг публичный именно
     * поэтому: серверная валидация читает его же и принимает то же решение.
     */
    const isLiveSurfaceEnabled = useRuntimeConfig().public.bricksPublishedPages !== false;

    /**
     * Имя маршрута, выигрывающего путь. `undefined` — путь не матчится вовсе;
     * `UNNAMED_ROUTE_OWNER` — маршрут есть, но строкового имени у него нет.
     *
     * @param path - Логический путь без baseURL.
     */
    function resolveRouteName(path: string): string | undefined {
        const { matched } = router.resolve(path);

        if (matched.length === 0) {
            return undefined;
        }

        const owner = matched[matched.length - 1]?.name;

        return typeof owner === 'string' ? owner : UNNAMED_ROUTE_OWNER;
    }

    /**
     * Свободен ли live-адрес страницы (`/<urlPrefix>/<pagename>`).
     *
     * @param address - Адрес страницы.
     */
    function isPageAddressFree(address: IBricksPageAddress): boolean {
        if (!isLiveSurfaceEnabled) {
            return true;
        }

        return !isPageAddressTaken(prefixes, resolveRouteName, address);
    }

    /**
     * Свободен ли адрес редактора страницы
     * (`<builderPrefix>/<urlPrefix>/<pagename>`).
     *
     * @param address - Адрес страницы.
     */
    function isEditorAddressFree(address: IBricksPageAddress): boolean {
        return !isEditorAddressTaken(prefixes, resolveRouteName, address);
    }

    return { isPageAddressFree, isEditorAddressFree };
}
