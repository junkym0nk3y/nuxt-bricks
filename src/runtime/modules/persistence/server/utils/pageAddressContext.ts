/**
 * The page address check's context for the server-side DTO validation.
 *
 * The payload validators stay pure functions (they are called in the tests too, with
 * no Nitro context), so runtimeConfig is read here and the handler passes the ready
 * context as an argument.
 */
import { useRuntimeConfig } from 'nitropack/runtime';
import {
    DEFAULT_BRICKS_ROUTE_PREFIXES,
    type IBricksRoutePrefixes,
} from '../../../common/utils/bricks/routePaths';
import type { IPageAddressContext } from '../../types/pageAddress';

/**
 * The prefixes and the live surface's state out of `runtimeConfig.public`.
 *
 * @returns The page address check's context.
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
