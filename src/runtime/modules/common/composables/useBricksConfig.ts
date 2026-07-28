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
 */
export function useBricksConfig(): IUseBricksConfigReturn {
    const appConfig = useAppConfig() as IAppConfig;

    return {
        defaultFont: appConfig.bricks?.defaultFont ?? 'Inter, sans-serif',
        fonts: appConfig.bricks?.fonts,
        backgroundColor: appConfig.bricks?.backgroundColor ?? '#FFFFFF',
        layouts: appConfig.bricks?.layouts ?? [],
        breakpoints: appConfig.device?.breakpoints ?? {
            mobile: 0,
            tablet: 768,
            laptop: 1024,
            desktop: 1600,
            ultra: 1921,
        },
        canvasBreakpoints: {
            mobile: appConfig.bricks?.breakpoints?.mobile ?? {
                width: 375,
                aside: '0.4rem',
            },
            tablet: appConfig.bricks?.breakpoints?.tablet ?? {
                width: 768,
                aside: '0.8rem',
            },
            desktop: appConfig.bricks?.breakpoints?.desktop ?? {
                width: 1600,
                aside: '2rem',
                maxWidth: '192rem',
            },
        },
    };
}
