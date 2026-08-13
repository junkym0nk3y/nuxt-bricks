// #region Imports
// Types
import type { IAppConfig } from '../types/config';
import type { IUseBricksConfigReturn } from '../types/composables';

// Nuxt
import { useAppConfig } from 'nuxt/app';
// #endregion

/**
 * Composable для конфигурации лендинга с дефолтными значениями.
 * Читает конфигурацию из app.config.ts и возвращает значения по умолчанию, если не указаны.
 *
 * Набор устройств сюда больше не входит: он фиксируется на сборке опцией модуля
 * `bricks.devices`, потому что теми же числами кормится SCSS-карта миксинов, а
 * рантайм-ручка в app.config до сборки не доезжает. За набором — `useBricksDevices`.
 */
export function useBricksConfig(): IUseBricksConfigReturn {
    const appConfig = useAppConfig() as IAppConfig;

    return {
        defaultFont: appConfig.bricks?.defaultFont ?? 'Inter, sans-serif',
        fonts: appConfig.bricks?.fonts,
        backgroundColor: appConfig.bricks?.backgroundColor ?? '#FFFFFF',
        layouts: appConfig.bricks?.layouts ?? [],
    };
}
