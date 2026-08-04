/**
 * Типы серверной проверки адреса published-страницы.
 */

import type { IBricksRoutePrefixes } from '../../common/utils/bricks/routePaths';

export interface IPageAddressContext {
    /** Активные префиксы поверхностей bricks. */
    prefixes: IBricksRoutePrefixes;
    /**
     * Зарегистрирован ли live-рендер published-страниц (`features.publishedPages`).
     * С отключённым у страницы нет собственного URL — резервировать live-адрес
     * нечего, и проверка пропускается (клиент решает так же, иначе одно и то же
     * имя проходило бы форму и падало на сервере).
     */
    isLiveSurfaceEnabled: boolean;
}
