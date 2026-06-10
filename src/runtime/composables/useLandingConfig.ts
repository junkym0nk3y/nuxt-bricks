// #region Imports
// Types
import type { IAppConfig, ILandingBreakpoints, ILandingBreakpointConfig } from '../types/config';

// Nuxt
import { useAppConfig } from 'nuxt/app';
// #endregion

/**
 * Composable для конфигурации лендинга с дефолтными значениями.
 * Читает конфигурацию из app.config.ts и возвращает значения по умолчанию, если не указаны.
 */
export function useLandingConfig(): {
    defaultFont: string;
    fonts?: string[];
    backgroundColor: string;
    layouts: string[];
    breakpoints: ILandingBreakpoints;
    canvasBreakpoints: {
        mobile: ILandingBreakpointConfig;
        tablet: ILandingBreakpointConfig;
        desktop: ILandingBreakpointConfig;
    };
} {
    const appConfig = useAppConfig() as IAppConfig;

    return {
        defaultFont: appConfig.landing?.defaultFont ?? 'Inter, sans-serif',
        fonts: appConfig.landing?.fonts,
        backgroundColor: appConfig.landing?.backgroundColor ?? '#FFFFFF',
        layouts: appConfig.landing?.layouts ?? [],
        breakpoints: appConfig.device?.breakpoints ?? {
            mobile: 0,
            tablet: 768,
            laptop: 1024,
            desktop: 1600,
            ultra: 1921,
        },
        canvasBreakpoints: {
            mobile: appConfig.landing?.breakpoints?.mobile ?? {
                width: 375,
                aside: '0.4rem',
            },
            tablet: appConfig.landing?.breakpoints?.tablet ?? {
                width: 768,
                aside: '0.8rem',
            },
            desktop: appConfig.landing?.breakpoints?.desktop ?? {
                width: 1600,
                aside: '2rem',
                maxWidth: '192rem',
            },
        },
    };
}
