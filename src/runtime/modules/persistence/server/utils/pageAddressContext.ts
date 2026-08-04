/**
 * Контекст проверки адреса страницы для серверной валидации DTO.
 *
 * Валидаторы payload остаются чистыми функциями (их зовут и в тестах, без
 * Nitro-контекста), поэтому runtimeConfig читается здесь, а ручка передаёт
 * готовый контекст аргументом.
 */
import { useRuntimeConfig } from 'nitropack/runtime';
import {
    DEFAULT_BRICKS_ROUTE_PREFIXES,
    type IBricksRoutePrefixes,
} from '../../../common/utils/bricks/routePaths';
import type { IPageAddressContext } from '../../types/pageAddress';

/**
 * Префиксы и состояние live-поверхности из `runtimeConfig.public`.
 *
 * @returns Контекст проверки адреса страницы.
 */
export function getConfiguredPageAddressContext(): IPageAddressContext {
    const config = useRuntimeConfig();

    return {
        prefixes:
            (config.public?.bricksRoutes as IBricksRoutePrefixes | undefined) ??
            DEFAULT_BRICKS_ROUTE_PREFIXES,
        isLiveSurfaceEnabled: config.public?.bricksPublishedPages !== false,
    };
}
